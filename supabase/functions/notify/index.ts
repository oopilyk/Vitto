import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type Anthropic from 'npm:@anthropic-ai/sdk@0.126.0';
import {
  DAY,
  buildPetContext,
  inQuietHours,
  limitsFor,
  localDayStart,
  mockProactive,
  pickProactiveTrigger,
  renderProactiveInstruction,
  tickMood,
  turnsFromContext,
  type CompanionEvent,
  type CompanionMemory,
  type CompanionMessage,
  type CompanionState,
  type CompanionTier,
  type LifeContext,
} from '../_shared/companion/index.ts';
import { generate } from '../_shared/model.ts';
import { sendPush, type PushMessage } from '../_shared/push.ts';

/**
 * The pet, speaking to a closed app.
 *
 * Nothing here decides WHAT is worth saying — `pickProactiveTrigger` in
 * packages/core already does that, and is unit-tested there. This is the
 * delivery half: find the people whose pet has something to say, respect the
 * hour where THEY are, generate it, and hand it to Expo.
 *
 * Run by cron, not by users (see README.md for the schedule). It authenticates
 * on a shared secret rather than a user session, because there is no user.
 *
 * THE STALENESS PROBLEM. Every trigger needs a `LifeContext` — pet stats,
 * today's totals, the local clock — that the PHONE builds from the app's own
 * screens. This job has no phone to ask, so it reads the last one the app
 * cached (`companion_state.last_life`) and works around the gap three ways:
 *   * triggers whose meaning survives a stale snapshot are allowed through
 *     (absence, a remembered event, a workout habit read from the event log);
 *   * `streak_at_risk` is re-checked against today's REAL events before it can
 *     fire, so nobody gets nudged about a streak they already kept;
 *   * the model is told how old the day's figures are, so it does not recite
 *     numbers as though it just looked at them.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const iso = (ms: number) => new Date(ms).toISOString();

/** One run's ceiling. Keeps a cron tick well inside an edge function's life. */
const MAX_DEVICES = 500;
/** How many candidates are worked on at once. Politeness to Postgres, not a limit on scale. */
const CONCURRENCY = 5;
/** Older than this and the app has plainly not picked the event up itself. */
const IN_APP_GRACE_MS = 6 * 60 * 60 * 1000;
/** Past this, the day's figures are described as remembered rather than current. */
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;
const HISTORY_WINDOW_MS = 3 * DAY;

interface Device {
  token: string;
  userId: string;
  utcOffsetMinutes: number;
  quietStart: number;
  quietEnd: number;
}

/**
 * Quiet hours and the day boundary come from the companion module, where they
 * are unit-tested. Checked BEFORE anything is generated, so no model call is
 * ever spent on a message that cannot be sent.
 */
const sleeping = (device: Device, now: number): boolean =>
  inQuietHours(now, device.utcOffsetMinutes, device.quietStart, device.quietEnd);

/** Types that mean the person did something today, for the streak re-check. */
const LOGGING_EVENTS = new Set([
  'MEAL_LOGGED', 'HEALTHY_MEAL_LOGGED', 'WORKOUT_COMPLETED', 'STEPS_LOGGED',
  'STEP_GOAL_REACHED', 'BRAIN_GAME_PLAYED', 'SLEEP_GOAL_REACHED', 'POOR_SLEEP', 'LEVEL_UP',
]);

// deno-lint-ignore no-explicit-any
type Row = any;
const toEvent = (row: Row): CompanionEvent => ({
  id: row.id, type: row.type, metadata: row.metadata ?? {},
  timestamp: Date.parse(row.occurred_at), reactedAt: row.reacted_at ? Date.parse(row.reacted_at) : null,
});
const toMemory = (row: Row): CompanionMemory => ({
  id: row.id, category: row.category, content: row.content, importance: row.importance, confidence: row.confidence,
  createdAt: Date.parse(row.created_at), lastReferencedAt: Date.parse(row.last_referenced_at), referenceCount: row.reference_count,
  expiresAt: row.expires_at ? Date.parse(row.expires_at) : null, eventDate: row.event_date,
  followedUpAt: row.followed_up_at ? Date.parse(row.followed_up_at) : null, source: row.source, active: row.active,
});
const toMessage = (row: Row): CompanionMessage => ({
  id: row.id, role: row.role, content: row.content, createdAt: Date.parse(row.created_at),
  source: row.source, triggerKey: row.trigger_key,
});
const toState = (row: Row): CompanionState => {
  const { _temperament, _dials, ...traits } = row.personality_traits ?? {};
  return {
    personalityTraits: traits as CompanionState['personalityTraits'],
    mood: row.mood, moodIntensity: row.mood_intensity, moodReason: row.mood_reason,
    affection: row.affection, trust: row.trust,
    relationshipScore: row.relationship_score, relationshipLevel: row.relationship_level,
    relationshipSummary: row.relationship_summary, userNickname: row.user_nickname,
    createdAt: Date.parse(row.created_at), lastInteractionAt: Date.parse(row.last_interaction_at),
    lastProactiveAt: row.last_proactive_at ? Date.parse(row.last_proactive_at) : null,
  };
};

interface Candidate {
  userId: string;
  petId: string;
  state: CompanionState;
  life: LifeContext;
  lifeAgeMs: number;
  devices: Device[];
  tier: CompanionTier;
}

/** One person's pet, considered. Returns the push to send, or null for silence. */
const consider = async (db: SupabaseClient, candidate: Candidate, now: number): Promise<PushMessage[]> => {
  const { userId, petId, devices } = candidate;
  const owner = { user_id: userId, pet_id: petId };
  const primary = devices[0]!;

  const [eventRows, memoryRows, messageRows, proactiveToday] = await Promise.all([
    db.from('companion_events').select('*').match(owner)
      .gte('occurred_at', iso(now - HISTORY_WINDOW_MS)).order('occurred_at', { ascending: false }).limit(40),
    db.from('companion_memories').select('*').match(owner).eq('active', true).limit(200),
    db.from('companion_messages').select('*').match(owner).order('created_at', { ascending: false }).limit(40),
    db.from('companion_messages').select('id', { count: 'exact', head: true }).match(owner)
      .eq('source', 'proactive').gte('created_at', iso(now - DAY)),
  ]);

  if ((proactiveToday.count ?? 0) >= limitsFor(candidate.tier).proactivePerDay) return [];

  const events = (eventRows.data ?? []).map(toEvent);
  const memories = (memoryRows.data ?? []).map(toMemory);
  const recentMessages = (messageRows.data ?? []).map(toMessage).reverse();

  const state = tickMood(candidate.state, events.filter((e) => now - e.timestamp < 2 * DAY), candidate.life, now);
  const fire = pickProactiveTrigger({ state, events, memories, recentMessages, life: candidate.life, now });
  if (!fire) return [];

  // An unreacted event the app has not yet spoken about. While it is fresh the
  // person is probably still in the app, which handles it far better than a
  // notification would; once it is stale they clearly are not, so it may go.
  if (fire.key === 'event_reaction') {
    const newest = events.find((event) => event.reactedAt === null);
    if (newest && now - newest.timestamp < IN_APP_GRACE_MS) return [];
  }

  // The streak trigger is the one that reads today's totals out of the cached
  // snapshot, so it is the one that can be wrong. The event log is current.
  if (fire.key === 'streak_at_risk') {
    const dayStart = localDayStart(now, primary.utcOffsetMinutes);
    if (events.some((event) => event.timestamp >= dayStart && LOGGING_EVENTS.has(event.type))) return [];
  }

  const stale = candidate.lifeAgeMs > STALE_AFTER_MS;
  const situation = stale
    ? `${fire.situation}\n\n[The figures about their day are from ${Math.round(candidate.lifeAgeMs / 3_600_000)} hours ago and may have moved on. Speak from how you feel and what you remember, and do not state any number about their day as though you just checked.]`
    : fire.situation;

  const ctx = buildPetContext({ state, life: candidate.life, events, memories, messages: recentMessages, currentMessage: situation, now });
  const turns: Anthropic.MessageParam[] = [...turnsFromContext(ctx), { role: 'user', content: renderProactiveInstruction(situation) }];
  const generated = await generate(ctx, turns, () => mockProactive(fire.situation), 'notify');

  // Stored before it is sent, so the message is in the conversation when the
  // notification is tapped, and so a failed send cannot produce it twice.
  const { data: saved, error } = await db.from('companion_messages').insert({
    ...owner, role: 'pet', content: generated.text, source: 'proactive', trigger_key: fire.key, usage: generated.usage,
  }).select('id').single();
  if (error) throw error;

  if (fire.markEventsReacted.length) {
    await db.from('companion_events').update({ reacted_at: iso(now) }).in('id', fire.markEventsReacted);
  }
  if (fire.markMemoryFollowedUp) {
    await db.from('companion_memories').update({ followed_up_at: iso(now) }).eq('id', fire.markMemoryFollowedUp);
  }
  await db.from('companion_state').update({
    mood: state.mood, mood_intensity: state.moodIntensity, mood_reason: state.moodReason,
    last_proactive_at: iso(now), updated_at: iso(now),
  }).match(owner);
  await db.from('push_devices').update({ last_push_at: iso(now) }).in('token', devices.map((d) => d.token));

  return devices.map((device) => ({
    to: device.token,
    title: candidate.life.pet.name,
    body: generated.text,
    data: { screen: 'companion', petId, messageId: saved.id, trigger: fire.key },
  }));
};

/** Runs `work` over `items`, at most `limit` at a time. */
const pool = async <T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> => {
  const results: R[] = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]!;
      try { results.push(await work(item)); } catch (error) { console.error('[notify] candidate failed', error); }
    }
  });
  await Promise.all(runners);
  return results;
};

Deno.serve(async (request) => {
  // No user session here — this is called by the scheduler. The secret is the
  // whole of the authentication, so a missing one fails closed rather than open.
  const secret = Deno.env.get('NOTIFY_SECRET');
  if (!secret) {
    console.error('[notify] NOTIFY_SECRET is not set; refusing to run');
    return json({ error: 'Not configured.' }, 503);
  }
  if (request.headers.get('x-notify-secret') !== secret) return json({ error: 'Not authorised.' }, 401);

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const now = Date.now();

    const { data: deviceRows, error: deviceError } = await db.from('push_devices')
      .select('token, user_id, utc_offset_minutes, quiet_start, quiet_end')
      .eq('enabled', true).limit(MAX_DEVICES);
    if (deviceError) throw deviceError;

    const byUser = new Map<string, Device[]>();
    for (const row of deviceRows ?? []) {
      const device: Device = {
        token: row.token, userId: row.user_id, utcOffsetMinutes: row.utc_offset_minutes,
        quietStart: row.quiet_start, quietEnd: row.quiet_end,
      };
      if (sleeping(device, now)) continue;
      const list = byUser.get(device.userId) ?? [];
      list.push(device);
      byUser.set(device.userId, list);
    }
    if (byUser.size === 0) return json({ considered: 0, sent: 0, reason: 'nobody awake' });

    const userIds = [...byUser.keys()];
    const [{ data: stateRows, error: stateError }, { data: tierRows }] = await Promise.all([
      db.from('companion_state').select('*').in('user_id', userIds).not('last_life', 'is', null),
      db.from('companion_entitlements').select('user_id, tier, expires_at').in('user_id', userIds),
    ]);
    if (stateError) throw stateError;

    const tiers = new Map<string, CompanionTier>();
    for (const row of tierRows ?? []) {
      const lapsed = row.expires_at && Date.parse(row.expires_at) < now;
      tiers.set(row.user_id, !lapsed && row.tier === 'plus' ? 'plus' : 'free');
    }

    const candidates: Candidate[] = (stateRows ?? []).map((row: Row) => ({
      userId: row.user_id,
      petId: row.pet_id,
      state: toState(row),
      life: row.last_life as LifeContext,
      lifeAgeMs: row.last_life_at ? now - Date.parse(row.last_life_at) : Number.POSITIVE_INFINITY,
      devices: byUser.get(row.user_id)!,
      tier: tiers.get(row.user_id) ?? 'free',
    }));

    const batches = await pool(candidates, CONCURRENCY, (candidate) => consider(db, candidate, now));
    const messages = batches.flat();
    const outcome = await sendPush(messages);

    // A token Expo has rejected will never work again; leaving it costs a slot
    // on every future run.
    if (outcome.invalidTokens.length) {
      await db.from('push_devices').delete().in('token', outcome.invalidTokens);
    }

    console.log(`[notify] considered ${candidates.length}, sent ${outcome.sent}, failed ${outcome.failed}, pruned ${outcome.invalidTokens.length}`);
    return json({ considered: candidates.length, ...outcome });
  } catch (error) {
    console.error('[notify] run failed', error);
    return json({ error: 'Run failed.' }, 500);
  }
});
