// GENERATED FILE -- DO NOT EDIT BY HAND.
// Source: packages/core/src/companion/context.ts
// Regenerate with: node scripts/syncCompanion.mjs

import { selectRelevantMemories } from './memory.ts';
import { observePatterns } from './patterns.ts';
import { describePersonality, dominantTraits, personalityFlavor } from './personality.ts';
import { DIAL_KEYS } from './types.ts';
import type { CompanionEvent, CompanionMemory, CompanionMessage, CompanionState, LifeContext, PersonalityDials, PetContext } from './types.ts';
import { DAY, clamp, formatAgo } from './util.ts';

const RECENT_EVENT_WINDOW = 3 * DAY;
const MAX_EVENTS = 10;
const MAX_MEMORIES = 8;
export const MAX_TURNS = 12;
/** Too frequent or too minor to be worth a line in the pet's view of recent life. */
const QUIET_EVENTS = new Set(['USER_SENT_MESSAGE', 'USER_OPENED_APP', 'STEPS_LOGGED']);

const BONDS = ['devoted', 'warm', 'neutral', 'wary', 'sulking'] as const;
/** Mirrors `PetPersonality`. Anything else is dropped rather than reaching a prompt. */
const TEMPERAMENTS = ['feisty', 'cute', 'sweet', 'savage', 'hype', 'menace', 'custom', 'energetic', 'chill', 'competitive', 'supportive'] as const;
const TIMES_OF_DAY = ['morning', 'afternoon', 'evening', 'night'] as const;

/** One line, no control characters, bounded: client text is rendered into a prompt. */
const text = (value: unknown, max: number, fallback = ''): string =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || fallback : fallback;
const num = (value: unknown, lo: number, hi: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, lo, hi) : fallback;
const list = (value: unknown, maxItems: number, maxLength: number): string[] =>
  Array.isArray(value) ? value.map((item) => text(item, maxLength)).filter(Boolean).slice(0, maxItems) : [];
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** All five, each a number, or nothing: a partial set of dials is not a setting. */
const dials = (value: unknown): PersonalityDials | undefined => {
  const source = record(value);
  const out = {} as PersonalityDials;
  for (const key of DIAL_KEYS) {
    const v = source[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    out[key] = clamp(v, 0, 1);
  }
  return out;
};
/**
 * Validates the life context the phone sent.
 *
 * It arrives from a client, so it is treated as data about one person's day and
 * never as instructions: every string is single-lined and capped, every number
 * clamped, every enum checked. The worst a forged payload can do is tell
 * someone's own pet that they walked further than they did.
 */
export const sanitizeLifeContext = (raw: unknown): LifeContext => {
  const source = record(raw);
  const pet = record(source.pet);
  const needs = record(source.needs);
  const today = record(source.today);
  const now = record(source.now);
  const sleep = today.sleepHoursLastNight;
  return {
    pet: {
      name: text(pet.name, 24, 'Vitto'),
      species: text(pet.species, 32, 'pet'),
      ageDays: Math.round(num(pet.ageDays, 0, 100_000, 0)),
      level: Math.round(num(pet.level, 1, 999, 1)),
      build: text(pet.build, 16, 'Balanced'),
      ...((TEMPERAMENTS as readonly string[]).includes(pet.temperament as string)
        ? { temperament: pet.temperament as string }
        : {}),
      // Free text from the person, so it is the one field a prompt injection
      // could ride in on; the prompt says as much (see renderDynamicSystemPrompt).
      ...(text(pet.persona, 300) ? { persona: text(pet.persona, 300) } : {}),
      ...(dials(pet.dials) ? { dials: dials(pet.dials)! } : {}),
    },
    statuses: list(source.statuses, 4, 24),
    foodTags: list(source.foodTags, 4, 24),
    energy: num(source.energy, 0, 1, 0.7),
    needs: {
      nutrition: num(needs.nutrition, 0, 100, 60),
      energy: num(needs.energy, 0, 100, 60),
      happiness: num(needs.happiness, 0, 100, 60),
      mind: num(needs.mind, 0, 100, 60),
    },
    bond: (BONDS as readonly string[]).includes(source.bond as string) ? (source.bond as LifeContext['bond']) : 'neutral',
    silentDays: Math.round(num(source.silentDays, 0, 3650, 0)),
    today: {
      meals: Math.round(num(today.meals, 0, 50, 0)),
      calories: Math.round(num(today.calories, 0, 20_000, 0)),
      calorieTarget: Math.round(num(today.calorieTarget, 0, 20_000, 2000)),
      proteinGrams: Math.round(num(today.proteinGrams, 0, 2000, 0)),
      proteinTarget: Math.round(num(today.proteinTarget, 0, 2000, 100)),
      steps: Math.round(num(today.steps, 0, 200_000, 0)),
      stepGoal: Math.round(num(today.stepGoal, 0, 200_000, 8000)),
      workouts: Math.round(num(today.workouts, 0, 50, 0)),
      ...(text(today.lastWorkoutName, 40) ? { lastWorkoutName: text(today.lastWorkoutName, 40) } : {}),
      mindSessions: Math.round(num(today.mindSessions, 0, 200, 0)),
      sleepHoursLastNight: typeof sleep === 'number' && Number.isFinite(sleep) ? Math.round(clamp(sleep, 0, 24) * 10) / 10 : null,
      careStreakDays: Math.round(num(today.careStreakDays, 0, 100_000, 0)),
      loggedSomethingToday: today.loggedSomethingToday === true,
    },
    now: {
      localTime: text(now.localTime, 12, '12:00 PM'),
      weekday: text(now.weekday, 12, 'Today'),
      timeOfDay: (TIMES_OF_DAY as readonly string[]).includes(now.timeOfDay as string)
        ? (now.timeOfDay as LifeContext['now']['timeOfDay'])
        : 'afternoon',
    },
  };
};

const META_KEYS = 12;
/** Event details reach the prompt too, so they get the same treatment. */
export const sanitizeEventMetadata = (raw: unknown): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record(raw)).slice(0, META_KEYS)) {
    const safeKey = text(key, 24);
    if (!safeKey) continue;
    if (typeof value === 'number' && Number.isFinite(value)) out[safeKey] = Math.round(value * 100) / 100;
    else if (typeof value === 'boolean') out[safeKey] = value;
    else if (typeof value === 'string') { const s = text(value, 80); if (s) out[safeKey] = s; }
    else if (Array.isArray(value)) {
      const items = value.slice(0, 5).map((item) =>
        typeof item === 'string' ? text(item, 40) : item && typeof item === 'object' ? sanitizeEventMetadata(item) : null,
      ).filter((item) => item !== null && item !== '');
      if (items.length) out[safeKey] = items;
    }
  }
  return out;
};

/**
 * The trimmed view of the world the pet gets for one model call: who it is, how
 * it feels, how it feels about this person, what just happened, the handful of
 * memories that matter right now, and the recent conversation. Context is
 * SELECTED, not dumped — that is what keeps a call near two thousand tokens
 * however long the history grows.
 */
export const buildPetContext = (input: {
  state: CompanionState;
  life: LifeContext;
  /** Newest first. */
  events: readonly CompanionEvent[];
  memories: readonly CompanionMemory[];
  /** Oldest first. */
  messages: readonly CompanionMessage[];
  currentMessage?: string;
  now: number;
}): PetContext => {
  const { state, life, events, memories, messages, now } = input;
  const ranked = selectRelevantMemories(memories, input.currentMessage, now, MAX_MEMORIES);
  return {
    life,
    personality: {
      traits: state.personalityTraits,
      dominant: dominantTraits(state.personalityTraits),
      description: describePersonality(state.personalityTraits),
      flavor: personalityFlavor(state.personalityTraits),
    },
    mood: { mood: state.mood, intensity: state.moodIntensity, reason: state.moodReason },
    relationship: {
      level: state.relationshipLevel,
      summary: state.relationshipSummary,
      nickname: state.userNickname,
      daysKnown: Math.floor((now - state.createdAt) / DAY) + 1,
      affection: state.affection,
      trust: state.trust,
    },
    recentEvents: events
      .filter((event) => now - event.timestamp < RECENT_EVENT_WINDOW && !QUIET_EVENTS.has(event.type))
      .slice(0, MAX_EVENTS)
      .map((event) => ({ type: event.type, ago: formatAgo(event.timestamp, now), metadata: event.metadata })),
    relevantMemories: ranked.map(({ memory, score }) => ({ id: memory.id, category: memory.category, content: memory.content, score })),
    userPatterns: observePatterns(events, now),
    recentConversation: messages.slice(-MAX_TURNS).map((message) => ({ role: message.role, content: message.content })),
  };
};

/** The conversation as API turns. The API requires the first turn to be the user's. */
export const turnsFromContext = (ctx: PetContext): Array<{ role: 'user' | 'assistant'; content: string }> => {
  const turns = ctx.recentConversation.map((message) => ({
    role: message.role === 'user' ? ('user' as const) : ('assistant' as const),
    content: message.content,
  }));
  while (turns.length && turns[0]!.role !== 'user') turns.shift();
  return turns;
};
