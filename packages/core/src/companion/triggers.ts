import { dueImportantEvents } from './memory';
import { expectedWorkoutMissing } from './patterns';
import { humanizeEvent } from './prompts';
import type { CompanionEvent, CompanionEventType, CompanionMemory, CompanionMessage, CompanionState, LifeContext } from './types';
import { DAY, HOUR, MINUTE, formatAgo } from './util';

/** Minimum gap between time-based proactive messages. Event reactions bypass it. */
export const PROACTIVE_COOLDOWN_MS = 2 * MINUTE;

export interface TriggerFire {
  key: string;
  /** Plain-language description of the situation, handed to the model. */
  situation: string;
  priority: number;
  bypassCooldown?: boolean;
  /** What to record once the message is stored, so the trigger does not fire again. */
  markEventsReacted: string[];
  markMemoryFollowedUp: string | null;
}

export interface TriggerInput {
  state: CompanionState;
  /** Newest first. */
  events: readonly CompanionEvent[];
  memories: readonly CompanionMemory[];
  /** Oldest first. */
  recentMessages: readonly CompanionMessage[];
  life: LifeContext;
  now: number;
}

/**
 * The user's own clock, not the machine's.
 *
 * These rules ask "is it evening?" and "has this already fired today?", and the
 * answers have to be about the person, not about where the code runs. In the
 * app those are the same thing; in the scheduled notification job the machine
 * is on UTC, which would fire an evening nudge at lunchtime in California. The
 * offset rides in the life context so both callers agree.
 */
const shift = (at: number, input: TriggerInput) => {
  const offset = input.life.now.utcOffsetMinutes;
  return offset === undefined ? null : new Date(at + offset * MINUTE);
};
const localHour = (at: number, input: TriggerInput): number =>
  shift(at, input)?.getUTCHours() ?? new Date(at).getHours();
/** Always YYYY-MM-DD: `importantEvent` compares it against a stored event date. */
const localDayKey = (at: number, input: TriggerInput): string => {
  const moved = shift(at, input);
  if (moved) return moved.toISOString().slice(0, 10);
  const here = new Date(at);
  return `${here.getFullYear()}-${String(here.getMonth() + 1).padStart(2, '0')}-${String(here.getDate()).padStart(2, '0')}`;
};
const firedToday = (input: TriggerInput, key: string) =>
  input.recentMessages.some(
    (message) => message.triggerKey === key && localDayKey(message.createdAt, input) === localDayKey(input.now, input),
  );

const EVENT_PRIORITY: Partial<Record<CompanionEventType, number>> = {
  LEVEL_UP: 8,
  USER_RETURNED_AFTER_ABSENCE: 7,
  WORKOUT_COMPLETED: 7,
  STEP_GOAL_REACHED: 6,
  SLEEP_GOAL_REACHED: 5,
  POOR_SLEEP: 5,
  BRAIN_GAME_PLAYED: 5,
  HEALTHY_MEAL_LOGGED: 4,
  MEAL_LOGGED: 4,
};

/** Events the pet may want to talk about unprompted. The rest only shift state. */
export const isReactionWorthy = (type: CompanionEventType): boolean => EVENT_PRIORITY[type] !== undefined;

const EVENT_HINT: Partial<Record<CompanionEventType, string>> = {
  WORKOUT_COMPLETED:
    'They just finished a workout. React like a friend, not a fitness app. If the details list personalRecords, that is a new best lift: make a fuss about that specifically.',
  STEP_GOAL_REACHED: 'They hit their step goal. Wonder where they went.',
  SLEEP_GOAL_REACHED: 'They slept a full night. Be pleased for them.',
  POOR_SLEEP: 'They slept badly. Show you noticed and care, keep it light.',
  HEALTHY_MEAL_LOGGED: 'They just logged a good meal, which means you ate too. React to the actual food, with your personality.',
  MEAL_LOGGED:
    'They just logged a meal, which means you ate too. React to the actual food. If it was a treat or junk, enjoy it with them; never lecture.',
  BRAIN_GAME_PLAYED:
    'They just finished a mind game with you. React to how it went (the score or result is in the details), like a friend who was playing along.',
  LEVEL_UP: "You just levelled up because of how they've been living. You feel it. Be delighted, share the credit.",
  USER_RETURNED_AFTER_ABSENCE: "They're back after being away for days. Show you noticed.",
};

const eventReaction = (input: TriggerInput): TriggerFire | null => {
  const pending = input.events
    .filter((event) => event.reactedAt === null && input.now - event.timestamp < 6 * HOUR && isReactionWorthy(event.type))
    .sort((a, b) => (EVENT_PRIORITY[b.type] ?? 0) - (EVENT_PRIORITY[a.type] ?? 0) || b.timestamp - a.timestamp);
  const [top, ...others] = pending;
  if (!top) return null;
  const meta = Object.keys(top.metadata).length ? ` Details: ${JSON.stringify(top.metadata)}.` : '';
  const also = others.length
    ? ` Also recently: ${others.map((e) => `${humanizeEvent(e.type)} (${formatAgo(e.timestamp, input.now)})`).join(', ')}; mention only if natural.`
    : '';
  return {
    key: 'event_reaction',
    situation: `${EVENT_HINT[top.type] ?? `Something happened: ${humanizeEvent(top.type)}.`}${meta}${also}`,
    priority: EVENT_PRIORITY[top.type] ?? 1,
    bypassCooldown: true,
    markEventsReacted: pending.map((event) => event.id),
    markMemoryFollowedUp: null,
  };
};

const importantEvent = (input: TriggerInput): TriggerFire | null => {
  const [due] = dueImportantEvents(input.memories, input.now);
  if (!due) return null;
  const todayKey = localDayKey(input.now, input);
  return {
    key: 'important_event',
    situation: `You remember: "${due.content}" and it was ${due.eventDate === todayKey ? 'today' : 'yesterday'}. Ask how it went, like a friend who's been thinking about it.`,
    priority: 6,
    markEventsReacted: [],
    markMemoryFollowedUp: due.id,
  };
};

const absence = (input: TriggerInput): TriggerFire | null => {
  const gap = input.now - input.state.lastInteractionAt;
  if (gap < 2 * DAY) return null;
  // One nudge per absence, escalating at most every two days.
  const lastNudge = [...input.recentMessages]
    .reverse()
    .find((message) => message.triggerKey === 'absence' && message.createdAt > input.state.lastInteractionAt);
  if (lastNudge && input.now - lastNudge.createdAt < 2 * DAY) return null;
  return {
    key: 'absence',
    situation: `The user has been absent for ${Math.floor(gap / DAY)} days and hasn't opened the app or talked to you. You've been on your own.${lastNudge ? ' You already reached out once and got nothing back.' : ''} Reach out.`,
    priority: 5,
    markEventsReacted: [],
    markMemoryFollowedUp: null,
  };
};

const habitDeviation = (input: TriggerInput): TriggerFire | null => {
  const { expected, weekday } = expectedWorkoutMissing(input.events, input.now);
  if (!expected || localHour(input.now, input) < 18) return null; // give them the day
  if (firedToday(input, 'habit_deviation')) return null;
  return {
    key: 'habit_deviation',
    situation: `The user usually works out on ${weekday}s, but it's ${weekday} evening and there's no workout yet. Poke them about it, playfully, no guilt.`,
    priority: 4,
    markEventsReacted: [],
    markMemoryFollowedUp: null,
  };
};

const streakAtRisk = (input: TriggerInput): TriggerFire | null => {
  if (localHour(input.now, input) < 19) return null;
  const { careStreakDays, loggedSomethingToday } = input.life.today;
  if (loggedSomethingToday || careStreakDays < 3 || firedToday(input, 'streak_at_risk')) return null;
  return {
    key: 'streak_at_risk',
    situation: `You two are on a ${careStreakDays}-day streak of them logging something every day, and today nothing's been logged yet and it's evening. Mention it lightly, as something you'd like to keep going together. A meal, a walk or one quick mind game would count. No pressure, no guilt.`,
    priority: 3,
    markEventsReacted: [],
    markMemoryFollowedUp: null,
  };
};

/**
 * Whether it is a rude hour to reach somebody, on THEIR clock.
 *
 * Lives here with the other "may the pet speak" rules rather than in the
 * notification function, because it is pure, it is the rule most likely to be
 * got wrong, and getting it wrong means waking someone at 3am. Wrapping past
 * midnight is the normal shape (22 to 8 is the default), and `from === to`
 * means no quiet hours at all rather than a silent day.
 *
 * @param utcOffsetMinutes Minutes east of UTC on the user's clock.
 */
export const inQuietHours = (
  now: number,
  utcOffsetMinutes: number,
  from: number,
  to: number,
): boolean => {
  if (from === to) return false;
  const hour = new Date(now + utcOffsetMinutes * MINUTE).getUTCHours();
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
};

/** Midnight on the user's clock, as a UTC timestamp. */
export const localDayStart = (now: number, utcOffsetMinutes: number): number => {
  const shifted = new Date(now + utcOffsetMinutes * MINUTE);
  shifted.setUTCHours(0, 0, 0, 0);
  return shifted.getTime() - utcOffsetMinutes * MINUTE;
};

const TRIGGERS = [eventReaction, importantEvent, absence, habitDeviation, streakAtRisk];

/**
 * Rule-based initiative. The rules decide WHETHER and WHY the pet speaks; the
 * model only decides what it says. That split is what keeps this affordable: no
 * model call is made unless a rule has already decided something is worth saying.
 */
export const pickProactiveTrigger = (input: TriggerInput): TriggerFire | null => {
  let best: TriggerFire | null = null;
  for (const trigger of TRIGGERS) {
    const fire = trigger(input);
    if (fire && (!best || fire.priority > best.priority)) best = fire;
  }
  if (!best) return null;
  const { lastProactiveAt } = input.state;
  const onCooldown = lastProactiveAt !== null && input.now - lastProactiveAt < PROACTIVE_COOLDOWN_MS;
  return onCooldown && !best.bypassCooldown ? null : best;
};
