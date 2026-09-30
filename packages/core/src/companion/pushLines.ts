import type { CompanionEvent, CompanionTier, LifeContext } from './types';

/**
 * Push notifications, without a model call per push.
 *
 * A push used to be generated fresh every time, which made the cheapest message
 * the pet sends (a nudge to a closed app, one line, often ignored) cost as much
 * as a chat reply. Now the model writes a bank of lines ONCE per pet, in the
 * pet's own voice, a few for every kind of push; the notification job then
 * picks one, fills in its `{placeholders}` and sends it. The bank is rewritten
 * only when the voice changes (see `pushVoiceKey`) or it gets old.
 *
 * What a stock line cannot do is talk about specifics -- the actual meal, the
 * exam it remembered. Those lines stay general ("wasn't today the thing?") and
 * the push opens the chat, where the full model picks the conversation up.
 */

/** Reaction events a push can be about, from triggers.ts's EVENT_PRIORITY. */
const EVENT_KINDS = [
  'LEVEL_UP',
  'USER_RETURNED_AFTER_ABSENCE',
  'WORKOUT_COMPLETED',
  'PERSONAL_RECORD',
  'STEP_GOAL_REACHED',
  'SLEEP_GOAL_REACHED',
  'POOR_SLEEP',
  'BRAIN_GAME_PLAYED',
  'HEALTHY_MEAL_LOGGED',
  'MEAL_LOGGED',
] as const;

export type PushLineKind =
  | 'absence'
  | 'absence_again'
  | 'habit_deviation'
  | 'streak_at_risk'
  | 'important_event'
  | 'thinking_of_you'
  | `event:${(typeof EVENT_KINDS)[number]}`;

/** What each set of lines is for, as the model is told it, and what it may fill in. */
export const PUSH_LINE_SPECS: Record<PushLineKind, { brief: string; placeholders?: string[] }> = {
  absence: {
    brief: "They haven't opened the app for {days} days. Reach out; you've been on your own.",
    placeholders: ['days'],
  },
  absence_again: {
    brief: "Still gone after you already reached out once and heard nothing. A second, different nudge.",
  },
  habit_deviation: {
    brief: "They usually work out on {weekday}s, it's {weekday} evening and nothing yet. Poke them, playfully, no guilt.",
    placeholders: ['weekday'],
  },
  streak_at_risk: {
    brief: "You're on a {streak}-day streak of them logging something, it's evening and nothing today. Mention it lightly; a meal, a walk or a quick mind game counts.",
    placeholders: ['streak'],
  },
  important_event: {
    brief: "Something they told you about was today or yesterday (you won't know what in this line). Ask how it went, like a friend who's been thinking about it.",
  },
  thinking_of_you: {
    brief: 'Nothing in particular. Just saying hi, thinking about them.',
  },
  'event:LEVEL_UP': { brief: 'You just levelled up because of how they have been living. Be delighted, share the credit.' },
  'event:USER_RETURNED_AFTER_ABSENCE': { brief: "They're back after days away. Show you noticed." },
  'event:WORKOUT_COMPLETED': { brief: 'They just finished a workout. React like a friend, not a fitness app.' },
  'event:PERSONAL_RECORD': { brief: 'They just set a new personal best in the gym. Make a fuss.' },
  'event:STEP_GOAL_REACHED': { brief: 'They hit their step goal. Wonder where they went.' },
  'event:SLEEP_GOAL_REACHED': { brief: 'They slept a full night. Be pleased for them.' },
  'event:POOR_SLEEP': { brief: 'They slept badly. Show you noticed and care, keep it light.' },
  'event:BRAIN_GAME_PLAYED': { brief: 'They just played a mind game with you. React like you were playing along.' },
  'event:HEALTHY_MEAL_LOGGED': { brief: "They logged a good meal, so you ate too. You don't know what the food was." },
  'event:MEAL_LOGGED': { brief: "They logged a meal, so you ate too. You don't know what it was. Never lecture." },
};

export const PUSH_LINE_KINDS = Object.keys(PUSH_LINE_SPECS) as PushLineKind[];

/** Lines written per kind: enough that a person rarely sees the same one twice in a row. */
export const PUSH_LINES_PER_KIND = 4;

/** A bank older than this is rewritten, so the pet's pushes do not calcify. */
export const PUSH_LINES_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Longest line kept; a push is read in a notification banner. */
const MAX_LINE_LENGTH = 160;

export type PushLineBank = Partial<Record<PushLineKind, string[]>>;

/** The line set an event reaction speaks from. */
export const eventLineKind = (event: Pick<CompanionEvent, 'type' | 'metadata'>): PushLineKind => {
  const records = (event.metadata ?? {}).personalRecords;
  if (event.type === 'WORKOUT_COMPLETED' && Array.isArray(records) && records.length > 0) return 'event:PERSONAL_RECORD';
  const kind = `event:${event.type}` as PushLineKind;
  return kind in PUSH_LINE_SPECS ? kind : 'thinking_of_you';
};

/**
 * Everything the bank depends on. When it differs from the one the stored bank
 * was written under, the bank is rewritten: a new name, temperament, persona,
 * set of dials or tier is a different voice.
 */
export const pushVoiceKey = (life: Pick<LifeContext, 'pet'>, tier: CompanionTier): string =>
  JSON.stringify({
    v: 1,
    tier,
    name: life.pet.name,
    temperament: life.pet.temperament ?? null,
    persona: life.pet.persona ?? null,
    dials: life.pet.dials ?? null,
  });

/** The instruction, sent as the user turn after the pet's usual system prompt. */
export const renderPushLinesInstruction = (): string => {
  const kinds = PUSH_LINE_KINDS.map((kind) => `- "${kind}": ${PUSH_LINE_SPECS[kind].brief}`).join('\n');
  return [
    `[Not a conversation. You are writing the push notifications you will send them when the app is closed, ahead of time, in your own voice.]`,
    ``,
    `Write ${PUSH_LINES_PER_KIND} different lines for each situation below. Each line is one short message you would send, under ${MAX_LINE_LENGTH - 40} characters, in first person, as you. Vary them: different openings, different angles, not the same joke four ways.`,
    ``,
    `Where a situation mentions {days}, {weekday} or {streak}, you may use that placeholder exactly as written and it will be filled in. Use no other placeholders, and state no other numbers or specifics about their day: these lines are reused.`,
    ``,
    kinds,
    ``,
    `Reply with only a JSON object mapping each situation name to an array of ${PUSH_LINES_PER_KIND} strings. No other text.`,
  ].join('\n');
};

/** The model's reply, validated. Null when too little of it is usable to be worth storing. */
export const parsePushLines = (text: string): PushLineBank | null => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const bank: PushLineBank = {};
  for (const kind of PUSH_LINE_KINDS) {
    const lines = (raw as Record<string, unknown>)[kind];
    if (!Array.isArray(lines)) continue;
    const allowed = new Set(PUSH_LINE_SPECS[kind].placeholders ?? []);
    const kept = lines
      .filter((line): line is string => typeof line === 'string')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.length <= MAX_LINE_LENGTH)
      // A placeholder this kind cannot fill would be sent as literal braces.
      .filter((line) => [...line.matchAll(/\{(\w+)\}/g)].every((match) => allowed.has(match[1]!)));
    if (kept.length) bank[kind] = kept.slice(0, PUSH_LINES_PER_KIND * 2);
  }
  return Object.keys(bank).length >= Math.ceil(PUSH_LINE_KINDS.length / 2) ? bank : null;
};

/** Fills `{placeholders}` from `vars`. */
export const fillPushLine = (line: string, vars: Record<string, string | number> = {}): string =>
  line.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));

/**
 * The line to send: from the kind's own set (or the general one if the bank has
 * none), avoiding anything sent recently, filled in. Null only when the bank has
 * nothing usable, which the caller answers with its templated fallback.
 */
export const pickPushLine = (
  bank: PushLineBank | null | undefined,
  kind: PushLineKind,
  vars: Record<string, string | number> | undefined,
  recentlySent: readonly string[],
  seed: number,
): string | null => {
  const pool = (bank?.[kind]?.length ? bank[kind] : bank?.thinking_of_you) ?? [];
  const filled = pool.map((line) => fillPushLine(line, vars)).filter((line) => !/\{\w+\}/.test(line));
  if (!filled.length) return null;
  const recent = new Set(recentlySent);
  const fresh = filled.filter((line) => !recent.has(line));
  const choices = fresh.length ? fresh : filled;
  return choices[Math.abs(Math.floor(seed)) % choices.length]!;
};
