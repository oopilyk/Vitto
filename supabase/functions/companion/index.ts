import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.126.0';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.126.0/helpers/zod';
import { z } from 'npm:zod@4.6.5';
import {
  MAX_TURNS, MEMORY_CATEGORIES, STABLE_SYSTEM_PROMPT, TONE_SIGNALS, DAY,
  accessFor, applyCompanionEvent, customVoice, applyDisclosure, applyToneSignals, buildPetContext, clamp01, dueImportantEvents,
  fillTraits, humanizeReply, initialTraits, levelIndex, limitsFor, sameBasis, mockExtract, mockProactive, mockReply, newCompanionState, observePatterns, pickProactiveTrigger,
  planMemoryWrites, renderDynamicSystemPrompt, renderExtractionPrompt, renderProactiveInstruction, sanitizeEventMetadata,
  rebaseTraits, sanitizeLifeContext, summarizeRelationship, tickMood, turnsFromContext, COMPANION_EVENT_TYPES,
  PERSONALITY_VOICE,
  type CompanionEvent, type CompanionEventInput, type CompanionMemory, type CompanionMessage, type CompanionState,
  type CompanionTier, type ExtractionResult, type LifeContext, type PersonalityDials, type PetContext, type TraitBasis,
} from '../_shared/companion/index.ts';

/**
 * The AI companion's one server endpoint.
 *
 * Everything that costs money or changes the character happens HERE and nowhere
 * else: the Claude calls, the usage caps, the entitlement check, and every write
 * to the companion tables (which have no client write policy at all). The phone
 * sends the person's message and a description of their day; it never sends a
 * prompt, never picks a model, and never sees the API key.
 *
 * Actions (POST JSON, authenticated):
 *   state      -> the character, recent messages, and what the account may do
 *   event      -> something happened in their life; shift the character
 *   chat       -> they said something; reply, then learn from it
 *   proactive  -> the app opened; speak first IF a rule says something is worth saying
 *
 * Secrets: ANTHROPIC_API_KEY. Without it the function still works, on a keyless
 * templated fallback, so the feature can be wired up and tested before the key
 * is set, and a Claude outage degrades to stock replies instead of an error.
 * Optional: COMPANION_CHAT_MODEL, COMPANION_EXTRACT_MODEL.
 */

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// The models the prototype was built and tuned on: a capable model for the voice
// people actually read, a cheap one for the background classification pass.
const CHAT_MODEL = Deno.env.get('COMPANION_CHAT_MODEL') ?? 'claude-sonnet-5';
const EXTRACT_MODEL = Deno.env.get('COMPANION_EXTRACT_MODEL') ?? 'claude-haiku-4-5';
const HISTORY_EVENTS = 500;
const HISTORY_WINDOW_MS = 35 * DAY;

const ExtractionSchema = z.object({
  memories: z.array(z.object({
    category: z.enum(MEMORY_CATEGORIES),
    content: z.string(),
    importance: z.number(),
    confidence: z.number(),
    eventDate: z.string().nullable(),
  })),
  toneSignals: z.array(z.enum(TONE_SIGNALS)),
  suggestedNickname: z.string().nullable(),
});

/**
 * Bounded on purpose. The SDK's defaults are a TEN-MINUTE timeout and two
 * retries — half an hour in the worst case — while this function lives for
 * about 150 seconds. Left at the defaults, one stalled or rate-limited call
 * pinned the person's message until the platform killed the request, and the
 * templated fallback below never got the chance to answer. A reply that is
 * going to take longer than this is not worth waiting for in a chat.
 */
const MODEL_TIMEOUT_MS = 20_000;
const anthropic = Deno.env.get('ANTHROPIC_API_KEY')
  ? new Anthropic({ timeout: MODEL_TIMEOUT_MS, maxRetries: 1 })
  : null;

/**
 * Who may use the `debug` and `reset` actions. Mirrors `devAccess.ts` in core,
 * copied rather than imported because this file's shared folder is a generated
 * copy with a closed import graph. An allowlist rather than an env flag, for the
 * same reason as there: a flag has to be turned back off before shipping.
 */
const DEV_EMAILS = new Set(['kyleyli2005@gmail.com']);
/** Stands in for "no cap" while staying a number every caller already handles. */
const DEV_UNCAPPED = 100_000;

// ---------------------------------------------------------------------------
// Rows <-> domain. The pure logic works in epoch ms; Postgres in timestamptz.
// ---------------------------------------------------------------------------
const ms = (value: string | null): number | null => (value ? Date.parse(value) : null);
const iso = (value: number | null): string | null => (value === null ? null : new Date(value).toISOString());

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

/**
 * What the traits grew from — the temperament and the dials — rides inside the
 * same jsonb, under keys no trait can have. It has to be recorded: drift
 * accumulates, and after enough of it the traits alone no longer say where
 * they started.
 */
const BASIS_KEY = '_temperament';
const DIALS_KEY = '_dials';
const traitsOf = (stored: Row): Partial<CompanionState['personalityTraits']> => {
  const { [BASIS_KEY]: _basis, [DIALS_KEY]: _dials, ...traits } = stored ?? {};
  return traits as Partial<CompanionState['personalityTraits']>;
};
const basisOf = (stored: Row): TraitBasis | null =>
  stored?.[BASIS_KEY] || stored?.[DIALS_KEY] ? { temperament: stored[BASIS_KEY] ?? null, dials: stored[DIALS_KEY] ?? null } : null;

const toState = (row: Row): CompanionState => ({
  // A row from before a trait existed lacks it; the caller fills it from the seed.
  personalityTraits: traitsOf(row.personality_traits) as CompanionState['personalityTraits'],
  mood: row.mood,
  moodIntensity: row.mood_intensity,
  moodReason: row.mood_reason,
  affection: row.affection,
  trust: row.trust,
  relationshipScore: row.relationship_score,
  relationshipLevel: row.relationship_level,
  relationshipSummary: row.relationship_summary,
  userNickname: row.user_nickname,
  createdAt: Date.parse(row.created_at),
  lastInteractionAt: Date.parse(row.last_interaction_at),
  lastProactiveAt: ms(row.last_proactive_at),
});
const fromState = (state: CompanionState): Row => ({
  personality_traits: state.personalityTraits,
  mood: state.mood,
  mood_intensity: state.moodIntensity,
  mood_reason: state.moodReason,
  affection: state.affection,
  trust: state.trust,
  relationship_score: state.relationshipScore,
  relationship_level: state.relationshipLevel,
  relationship_summary: state.relationshipSummary,
  user_nickname: state.userNickname,
  last_interaction_at: iso(state.lastInteractionAt),
  last_proactive_at: iso(state.lastProactiveAt),
  updated_at: new Date().toISOString(),
});
const toEvent = (row: Row): CompanionEvent => ({
  id: row.id, type: row.type, timestamp: Date.parse(row.occurred_at), metadata: row.metadata ?? {}, reactedAt: ms(row.reacted_at),
});
const toMemory = (row: Row): CompanionMemory => ({
  id: row.id, category: row.category, content: row.content, importance: row.importance, confidence: row.confidence,
  createdAt: Date.parse(row.created_at), lastReferencedAt: Date.parse(row.last_referenced_at), referenceCount: row.reference_count,
  expiresAt: ms(row.expires_at), eventDate: row.event_date, followedUpAt: ms(row.followed_up_at), source: row.source, active: row.active,
});
const toMessage = (row: Row): CompanionMessage => ({
  id: row.id, role: row.role, content: row.content, createdAt: Date.parse(row.created_at), source: row.source, triggerKey: row.trigger_key,
});

// ---------------------------------------------------------------------------
// One request's worth of access to one person's relationship with one pet.
// ---------------------------------------------------------------------------
class Companion {
  constructor(private db: SupabaseClient, private userId: string, private petId: string) {}
  private get owner() { return { user_id: this.userId, pet_id: this.petId }; }

  /**
   * `temperament` is the one the pet wears now. When it is not the one the
   * stored traits grew from (it was changed after adoption), the traits are
   * moved onto it, so the trait description and the voice never disagree.
   */
  async loadState(now: number, temperament?: string, dials?: PersonalityDials | null): Promise<CompanionState> {
    const seedKey = `${this.userId}:${this.petId}`;
    const { data } = await this.db.from('companion_state').select('*').match(this.owner).maybeSingle();
    if (data) {
      const recorded = basisOf(data.personality_traits);
      this.basis = recorded;
      const loaded = toState(data);
      // A trait added since this row was written takes its seed value, so it
      // reads as no drift rather than as a jump.
      const seed = initialTraits(seedKey, recorded?.temperament ?? temperament, recorded?.dials ?? dials);
      const filled = fillTraits(loaded.personalityTraits, seed);
      const state = { ...loaded, personalityTraits: filled };
      if (!temperament) return state;
      const to: TraitBasis = { temperament, dials: dials ?? null };
      const traits = rebaseTraits(filled, seedKey, to, recorded);
      this.basis = to;
      if (traits === filled && recorded && sameBasis(recorded, to) && Object.keys(loaded.personalityTraits).length === Object.keys(filled).length) return state;
      // Moved onto a new basis, a new trait filled in, or an older row getting its origin stamped.
      const rebased = { ...state, personalityTraits: traits };
      await this.saveState(rebased);
      return rebased;
    }
    // First contact. Seeded from the ids and the character picked at onboarding,
    // so a second device racing this insert arrives at the same individual.
    const { data: pet } = await this.db.from('pets').select('personality, personality_dials').eq('id', this.petId).maybeSingle();
    const basis: TraitBasis = { temperament: temperament ?? pet?.personality ?? null, dials: dials ?? pet?.personality_dials ?? null };
    const fresh = newCompanionState(seedKey, now, basis.temperament ?? undefined, basis.dials);
    this.basis = basis;
    const { error } = await this.db.from('companion_state')
      .upsert({ ...this.owner, ...this.row(fresh), created_at: iso(now) }, { onConflict: 'user_id,pet_id', ignoreDuplicates: true });
    if (error) throw error;
    return fresh;
  }

  /** What the stored traits grew from; known once the state has been loaded. */
  private basis: TraitBasis | null = null;
  private row(state: CompanionState): Row {
    const row = fromState(state);
    if (!this.basis) return row;
    return { ...row, personality_traits: { ...state.personalityTraits, [BASIS_KEY]: this.basis.temperament ?? null, [DIALS_KEY]: this.basis.dials ?? null } };
  }

  async saveState(state: CompanionState) {
    const { error } = await this.db.from('companion_state').update(this.row(state)).match(this.owner);
    if (error) throw error;
  }

  async events(now: number): Promise<CompanionEvent[]> {
    const { data, error } = await this.db.from('companion_events').select('*').match(this.owner)
      .gte('occurred_at', iso(now - HISTORY_WINDOW_MS)).order('occurred_at', { ascending: false }).limit(HISTORY_EVENTS);
    if (error) throw error;
    return (data ?? []).map(toEvent);
  }

  async memories(): Promise<CompanionMemory[]> {
    const { data, error } = await this.db.from('companion_memories').select('*').match(this.owner).eq('active', true).limit(400);
    if (error) throw error;
    return (data ?? []).map(toMemory);
  }

  /** Oldest first. */
  async messages(limit: number): Promise<CompanionMessage[]> {
    const { data, error } = await this.db.from('companion_messages').select('*').match(this.owner)
      .order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map(toMessage).reverse();
  }

  async appendMessage(message: { role: 'user' | 'pet'; content: string; source?: 'reply' | 'proactive'; triggerKey?: string | null; usage?: unknown }) {
    const { data, error } = await this.db.from('companion_messages').insert({
      ...this.owner, role: message.role, content: message.content.slice(0, 4000), source: message.source ?? 'reply',
      trigger_key: message.triggerKey ?? null, usage: message.usage ?? null,
    }).select('*').single();
    if (error) throw error;
    return toMessage(data);
  }

  /** Applies something that happened, and stores everything the reducer decided. */
  async record(state: CompanionState, input: CompanionEventInput, life: LifeContext | undefined, now: number, options: { silent?: boolean } = {}) {
    const history = await this.events(now);
    const outcome = applyCompanionEvent(state, input, history, life, now, options);
    const { error } = await this.db.from('companion_events').insert(outcome.events.map((event) => ({
      ...this.owner, type: event.type, metadata: event.metadata ?? {}, occurred_at: iso(event.timestamp), reacted_at: iso(event.reactedAt),
    })));
    if (error) throw error;
    if (outcome.memories.length) await this.writeMemories(outcome.memories, now, 'event');
    await this.saveState(outcome.state);
    return outcome.state;
  }

  async writeMemories(extracted: ExtractionResult['memories'], now: number, source: 'extraction' | 'event'): Promise<number[]> {
    const { writes, createdImportance } = planMemoryWrites(await this.memories(), extracted, now, source);
    for (const write of writes) {
      if (write.kind === 'insert') {
        const m = write.memory;
        await this.db.from('companion_memories').insert({
          ...this.owner, category: m.category, content: m.content, importance: m.importance, confidence: m.confidence,
          reference_count: 0, expires_at: iso(m.expiresAt), event_date: m.eventDate, source: m.source, active: true,
        });
      } else {
        const p = write.patch;
        await this.db.from('companion_memories').update({
          content: p.content, importance: p.importance, confidence: p.confidence, reference_count: p.referenceCount,
          last_referenced_at: iso(p.lastReferencedAt ?? now), expires_at: iso(p.expiresAt ?? null),
          event_date: p.eventDate ?? null, followed_up_at: iso(p.followedUpAt ?? null),
        }).eq('id', write.id).match(this.owner);
      }
    }
    return createdImportance;
  }

  async touchMemories(ids: string[], now: number) {
    if (!ids.length) return;
    // Referenced memories rank higher next time; a plain bump is enough.
    const { data } = await this.db.from('companion_memories').select('id, reference_count').in('id', ids).match(this.owner);
    for (const row of data ?? []) {
      await this.db.from('companion_memories').update({ reference_count: row.reference_count + 1, last_referenced_at: iso(now) }).eq('id', row.id);
    }
  }

  async markReacted(ids: string[], now: number) {
    if (ids.length) await this.db.from('companion_events').update({ reacted_at: iso(now) }).in('id', ids).match(this.owner);
  }
  async markFollowedUp(id: string, now: number) {
    await this.db.from('companion_memories').update({ followed_up_at: iso(now) }).eq('id', id).match(this.owner);
  }

  /** Usage over a ROLLING 24 hours: no time zone to get wrong, and nothing to game at midnight. */
  async usage(now: number) {
    const since = iso(now - DAY);
    const count = async (role: 'user' | 'pet', source?: 'proactive') => {
      let query = this.db.from('companion_messages').select('id', { count: 'exact', head: true })
        .eq('user_id', this.userId).eq('role', role).gte('created_at', since);
      if (source) query = query.eq('source', source);
      const { count: total } = await query;
      return total ?? 0;
    };
    return { sent: await count('user'), proactive: await count('pet', 'proactive') };
  }

  async tier(now: number): Promise<CompanionTier> {
    const { data } = await this.db.from('companion_entitlements').select('tier, expires_at').eq('user_id', this.userId).maybeSingle();
    if (!data || (data.expires_at && Date.parse(data.expires_at) < now)) return 'free';
    return data.tier === 'plus' ? 'plus' : 'free';
  }

  async stats() {
    const { count } = await this.db.from('companion_messages').select('id', { count: 'exact', head: true }).match(this.owner).eq('role', 'user');
    const { data } = await this.db.from('companion_messages').select('created_at').match(this.owner).eq('role', 'user')
      .order('created_at', { ascending: false }).limit(400);
    const daysActive = new Set((data ?? []).map((row) => String(row.created_at).slice(0, 10))).size;
    return { messageCount: count ?? 0, daysActive };
  }
}

// ---------------------------------------------------------------------------
// The model calls.
// ---------------------------------------------------------------------------
interface Generated { text: string; usage: unknown | null; degraded: boolean }

const generate = async (ctx: PetContext, turns: Anthropic.MessageParam[], fallback: () => string): Promise<Generated> => {
  if (!anthropic) return { text: fallback(), usage: null, degraded: true };
  try {
    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
      // Deliberately small: replies are one to four sentences, and this is also
      // the ceiling on what any single message can cost.
      max_tokens: 400,
      // Off on purpose. There is nothing here to reason about, and with thinking
      // on (the default on this model) the thinking is billed as output AND
      // counted against max_tokens, so a 400-token budget could be spent before
      // a word of the reply was written.
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      system: [
        // Byte-identical for every user, so one cache entry serves everybody.
        { type: 'text', text: STABLE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: renderDynamicSystemPrompt(ctx) },
      ],
      messages: turns,
    });
    const usage = { model: CHAT_MODEL, ...response.usage };
    if (response.stop_reason === 'refusal') return { text: "…okay I'm gonna not touch that one.", usage, degraded: false };
    const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim();
    return { text: humanizeReply(text) || '…', usage, degraded: false };
  } catch (error) {
    // A reply the person is waiting on must not become an error page. Log what
    // kind of failure it was, then answer from the templated fallback.
    if (error instanceof Anthropic.APIConnectionTimeoutError) console.error(`[companion] model timed out after ${MODEL_TIMEOUT_MS}ms`);
    else if (error instanceof Anthropic.RateLimitError) console.error('[companion] rate limited');
    else if (error instanceof Anthropic.AuthenticationError) console.error('[companion] ANTHROPIC_API_KEY rejected');
    else if (error instanceof Anthropic.APIError) console.error(`[companion] API error ${error.status}: ${error.message}`);
    else console.error('[companion] generation failed', error);
    return { text: fallback(), usage: null, degraded: true };
  }
};

const extract = async (ctx: PetContext, userText: string, replyText: string, existing: string[], askForNickname: boolean): Promise<ExtractionResult> => {
  if (!anthropic) return mockExtract(userText);
  try {
    const response = await anthropic.messages.parse({
      model: EXTRACT_MODEL,
      max_tokens: 1024,
      system: renderExtractionPrompt({ petName: ctx.life.pet.name, existingMemories: existing, askForNickname }),
      messages: [{
        role: 'user',
        content: `Today is ${ctx.life.now.weekday}, ${new Date().toISOString().slice(0, 10)}.\n\nConversation:\nUser: ${userText}\n${ctx.life.pet.name}: ${replyText}`,
      }],
      output_config: { format: zodOutputFormat(ExtractionSchema) },
    });
    const parsed = response.parsed_output;
    if (!parsed) return { memories: [], toneSignals: [] };
    return {
      memories: parsed.memories.map((m) => ({ ...m, importance: clamp01(m.importance), confidence: clamp01(m.confidence) })),
      toneSignals: parsed.toneSignals,
      suggestedNickname: parsed.suggestedNickname,
    };
  } catch (error) {
    // Best-effort background work; it must never break the chat.
    console.error('[companion] extraction failed', error instanceof Anthropic.APIError ? error.message : error);
    return { memories: [], toneSignals: [] };
  }
};

/** Memory extraction, personality drift and trust. Runs after the reply is sent. */
const learnFrom = async (companion: Companion, ctx: PetContext, userText: string, replyText: string, now: number) => {
  try {
    const state = await companion.loadState(now);
    const close = levelIndex(state.relationshipLevel) >= levelIndex('CLOSE_FRIEND');
    const known = (await companion.memories()).map((m) => m.content).slice(0, 60);
    const found = await extract(ctx, userText, replyText, known, close && !state.userNickname);

    const created = await companion.writeMemories(found.memories.slice(0, 6), now, 'extraction');
    let next = state;
    if (found.toneSignals.length) next = { ...next, personalityTraits: applyToneSignals(next.personalityTraits, found.toneSignals) };
    const disclosed = Math.max(0, ...created);
    if (disclosed >= 0.5) next = { ...next, ...applyDisclosure(next, disclosed) };
    if (close && !state.userNickname && found.suggestedNickname) next = { ...next, userNickname: found.suggestedNickname.slice(0, 24) };

    const stats = await companion.stats();
    const memoryCount = (await companion.memories()).length;
    next = { ...next, relationshipSummary: summarizeRelationship(next, { ...stats, memoryCount }, observePatterns(await companion.events(now), now), now) };
    await companion.saveState(next);
  } catch (error) {
    console.error('[companion] learning failed', error);
  }
};

/** Finish work after responding, where the runtime allows it; otherwise wait for it. */
const inBackground = async (work: Promise<unknown>) => {
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(work);
  else await work;
};

// ---------------------------------------------------------------------------
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authentication required.' }, 401);
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Authentication required.' }, 401);

    const body = await request.json().catch(() => null);
    const action = body?.action;
    const petId = body?.petId;
    if (typeof petId !== 'string' || !/^[0-9a-f-]{36}$/i.test(petId)) return json({ error: 'Invalid pet.' }, 400);

    // Being able to READ a pet is not enough: accepted friends can read each
    // other's pets. Only someone who actually cares for this pet may talk to it.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: isMember } = await asUser.rpc('is_active_pet_member', { p_pet_id: petId });
    if (isMember !== true) {
      const { data: owned } = await admin.from('pets').select('id').eq('id', petId).eq('user_id', user.id).maybeSingle();
      if (!owned) return json({ error: 'That pet is not yours to talk to.' }, 403);
    }

    const now = Date.now();
    const companion = new Companion(admin, user.id, petId);
    const life = body?.life ? sanitizeLifeContext(body.life) : undefined;
    // A dev account is treated as paid, and then some: it gets the `plus` tier
    // so everything a subscriber would see can be tested, and no daily ceiling,
    // because testing is exactly the use that burns through one. Decided here,
    // from the verified session's email — nothing the client sends can claim it.
    const isDev = DEV_EMAILS.has((user.email ?? '').trim().toLowerCase());
    const tier: CompanionTier = isDev ? 'plus' : await companion.tier(now);
    const limits = isDev ? { ...limitsFor('plus'), messagesPerDay: DEV_UNCAPPED, proactivePerDay: DEV_UNCAPPED } : limitsFor(tier);
    const access = async () => {
      const resolved = accessFor(tier, (await companion.usage(now)).sent);
      return isDev ? { ...resolved, messagesLeftToday: DEV_UNCAPPED, canChat: true } : resolved;
    };

    if (action === 'state') {
      const state = tickMood(await companion.loadState(now, life?.pet.temperament, life?.pet.dials), (await companion.events(now)).filter((e) => now - e.timestamp < 2 * DAY), life, now);
      await companion.saveState(state);
      return json({ state, messages: await companion.messages(50), access: await access() });
    }

    if (action === 'event') {
      const type = body?.event?.type;
      if (!(COMPANION_EVENT_TYPES as readonly string[]).includes(type)) return json({ error: 'Unknown event.' }, 400);
      // Clamped into the recent past, never restamped as "now": an old event from
      // a health backfill must not look fresh, or the pet would react to a workout
      // from Tuesday as though it had just happened.
      const claimed = typeof body.event.timestamp === 'number' && Number.isFinite(body.event.timestamp) ? body.event.timestamp : now;
      const timestamp = Math.min(now, Math.max(now - 2 * DAY, claimed));
      const state = await companion.record(await companion.loadState(now, life?.pet.temperament, life?.pet.dials), { type, timestamp, metadata: sanitizeEventMetadata(body.event.metadata) }, life, now);
      return json({ state });
    }

    if (action === 'chat') {
      if (!life) return json({ error: 'Missing context.' }, 400);
      const message = typeof body?.message === 'string' ? body.message.trim() : '';
      if (!message) return json({ error: 'Say something first.' }, 400);
      if (message.length > limits.maxMessageLength) return json({ error: `Keep it under ${limits.maxMessageLength} characters.` }, 400);
      const before = await access();
      if (!before.canChat) return json({ error: 'DAILY_LIMIT', access: before }, 429);

      // The event first, so the reply already reflects it (and any derived
      // "returned after absence"). Silent, because the reply IS the reaction.
      const state = await companion.record(await companion.loadState(now, life?.pet.temperament, life?.pet.dials), { type: 'USER_SENT_MESSAGE', metadata: { length: message.length } }, life, now, { silent: true });
      const userMessage = await companion.appendMessage({ role: 'user', content: message });

      const loadedAt = Date.now();
      const [events, memories, history] = await Promise.all([companion.events(now), companion.memories(), companion.messages(MAX_TURNS)]);
      const ctx = buildPetContext({ state, life, events, memories, messages: history, currentMessage: message, now });
      const turns = turnsFromContext(ctx);
      const askedAt = Date.now();
      const generated = await generate(ctx, turns, () => mockReply(ctx, message));
      console.log(`[companion] chat: reads ${askedAt - loadedAt}ms, model ${Date.now() - askedAt}ms, degraded=${generated.degraded}`);
      const reply = await companion.appendMessage({ role: 'pet', content: generated.text, usage: generated.usage });

      // Whatever the reply may have spoken about is now handled, including a due
      // event it had in mind, so the pet does not raise the same thing twice.
      await companion.markReacted(events.filter((e) => e.reactedAt === null).map((e) => e.id), now);
      const inMind = new Set(ctx.relevantMemories.map((m) => m.id));
      for (const due of dueImportantEvents(memories, now)) if (inMind.has(due.id)) await companion.markFollowedUp(due.id, now);
      await companion.touchMemories([...inMind], now);

      // A templated fallback reply teaches nothing worth a second model call.
      if (!generated.degraded) await inBackground(learnFrom(companion, ctx, message, generated.text, now));

      return json({ userMessage, reply, state, access: await access(), degraded: generated.degraded });
    }

    if (action === 'proactive') {
      if (!life) return json({ error: 'Missing context.' }, 400);
      const events = await companion.events(now);
      const state = tickMood(await companion.loadState(now, life?.pet.temperament, life?.pet.dials), events.filter((e) => now - e.timestamp < 2 * DAY), life, now);
      const [memories, recentMessages] = await Promise.all([companion.memories(), companion.messages(40)]);
      // The rules decide WHETHER to speak. No rule fires, no model is called.
      const fire = pickProactiveTrigger({ state, events, memories, recentMessages, life, now });
      if (!fire || (await companion.usage(now)).proactive >= limits.proactivePerDay) {
        await companion.saveState(state);
        return json({ message: null, trigger: null, state });
      }
      const ctx = buildPetContext({ state, life, events, memories, messages: recentMessages, currentMessage: fire.situation, now });
      const turns: Anthropic.MessageParam[] = [...turnsFromContext(ctx), { role: 'user', content: renderProactiveInstruction(fire.situation) }];
      const generated = await generate(ctx, turns, () => mockProactive(fire.situation));
      const message = await companion.appendMessage({ role: 'pet', content: generated.text, source: 'proactive', triggerKey: fire.key, usage: generated.usage });
      await companion.markReacted(fire.markEventsReacted, now);
      if (fire.markMemoryFollowedUp) await companion.markFollowedUp(fire.markMemoryFollowedUp, now);
      const next = { ...state, lastProactiveAt: now };
      await companion.saveState(next);
      return json({ message, trigger: fire.key, state: next });
    }

    /**
     * Everything the pet is about to be told, without telling it.
     *
     * No model call, so inspecting the prompt costs nothing and can be done as
     * often as you like — which is the point: the expensive way to debug a
     * prompt is to keep sending it. Gated to the dev allowlist because it
     * returns the system prompt verbatim.
     */
    if (action === 'debug') {
      if (!isDev) return json({ error: 'Not available.' }, 403);
      if (!life) return json({ error: 'Missing context.' }, 400);
      const events = await companion.events(now);
      const state = tickMood(await companion.loadState(now, life?.pet.temperament, life?.pet.dials), events.filter((e) => now - e.timestamp < 2 * DAY), life, now);
      const [memories, recentMessages] = await Promise.all([companion.memories(), companion.messages(40)]);
      const ctx = buildPetContext({ state, life, events, memories, messages: recentMessages, currentMessage: body?.message, now });
      const dynamic = renderDynamicSystemPrompt(ctx);
      const turns = turnsFromContext(ctx);
      const fire = pickProactiveTrigger({ state, events, memories, recentMessages, life, now });
      // Characters over four, which is close enough to plan a budget on and
      // needs no extra API round trip to work out.
      const estimate = (text: string) => Math.round(text.length / 4);
      const historyTokens = turns.reduce((total, turn) => total + estimate(turn.content) + 4, 0);
      return json({
        provider: anthropic ? CHAT_MODEL : 'mock (no ANTHROPIC_API_KEY set)',
        state,
        counts: { memories: memories.length, events: events.length, messages: recentMessages.length },
        usage: await companion.usage(now),
        access: await access(),
        trigger: fire ? { key: fire.key, situation: fire.situation, priority: fire.priority } : null,
        voice: life.pet.temperament === 'custom' ? (customVoice(life.pet.persona) ?? null) : life.pet.temperament ? (PERSONALITY_VOICE[life.pet.temperament] ?? null) : null,
        memories: memories.slice(0, 40),
        recentEvents: ctx.recentEvents,
        patterns: ctx.userPatterns,
        selected: ctx.relevantMemories,
        prompt: { stable: STABLE_SYSTEM_PROMPT, dynamic, turns },
        tokens: { stable: estimate(STABLE_SYSTEM_PROMPT), dynamic: estimate(dynamic), history: historyTokens },
      });
    }

    /** Forgets everything: a fresh stranger with the current temperament. */
    if (action === 'reset') {
      if (!isDev) return json({ error: 'Not available.' }, 403);
      for (const table of ['companion_messages', 'companion_memories', 'companion_events', 'companion_state']) {
        const { error } = await admin.from(table).delete().match({ user_id: user.id, pet_id: petId });
        if (error) throw error;
      }
      return json({ state: await companion.loadState(now, life?.pet.temperament, life?.pet.dials) });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    console.error('[companion] request failed', error);
    return json({ error: error instanceof Error ? error.message : 'The companion is unavailable.' }, 500);
  }
});
