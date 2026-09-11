import type { BrainTrainingMetadata, HealthEvent, HealthEventType, StepMetadata } from './health';

export interface StreakSummary {
  currentStreak: number;
  longestStreak: number;
  activeDateKeys: Set<string>;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/**
 * Which day an event counts toward. Defaults to its completion time, but a game whose
 * identity is fixed when it is opened -- WordPuzzle picks its puzzle date up front -- passes
 * its own `keyOf` so a session carried across midnight still credits the day it belongs to.
 */
export type EventDateKey = (event: HealthEvent) => string;

const occurredAtKey: EventDateKey = (event) => toDateKey(new Date(event.occurredAt));

export const getActiveDateKeys = (
  events: HealthEvent[],
  keyOf: EventDateKey = occurredAtKey,
): Set<string> => new Set(events.map(keyOf));

export const calculateStreaks = (
  events: HealthEvent[],
  today: Date = new Date(),
  keyOf: EventDateKey = occurredAtKey,
): StreakSummary => {
  const activeDateKeys = getActiveDateKeys(events, keyOf);
  const todayKey = toDateKey(today);

  const sortedKeys = Array.from(activeDateKeys).sort();
  let longestStreak = 0;
  let runLength = 0;
  let previousDay: Date | null = null;
  for (const key of sortedKeys) {
    const [year, month, day] = key.split('-').map(Number);
    const current = new Date(year, month - 1, day);
    runLength = previousDay && current.getTime() - previousDay.getTime() === ONE_DAY_MS ? runLength + 1 : 1;
    longestStreak = Math.max(longestStreak, runLength);
    previousDay = current;
  }

  let currentStreak = 0;
  const cursor = startOfDay(today);
  if (!activeDateKeys.has(todayKey)) cursor.setDate(cursor.getDate() - 1);
  while (activeDateKeys.has(toDateKey(cursor))) {
    currentStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { currentStreak, longestStreak, activeDateKeys };
};

export const getRecentDays = (count: number, today: Date = new Date()): Date[] =>
  Array.from({ length: count }, (_, index) => {
    const date = startOfDay(today);
    date.setDate(date.getDate() - (count - 1 - index));
    return date;
  });

// ---------------------------------------------------------------------------
// Qualifying activity — the streak's actual definition of "did something".
//
// `calculateStreaks` above is a general-purpose "consecutive days present in
// this event set" utility; it doesn't judge what counts. The pet-care streak
// needs a judgment, and it belongs in exactly one place: this section. Every
// display (the HUD, Profile, pet stats), the streak-milestone xp bonus, and
// the streak achievements all call through `calculateQualifyingStreaks` /
// `createsNewStreakDay` rather than deciding "is this a real day" themselves.
// ---------------------------------------------------------------------------

/**
 * Below this, a day's step reading is more likely incidental movement (walking
 * around the house) than a deliberate walk — too easy to clear passively for a
 * streak to mean anything. Deliberately below the pet engine's own 8,000-step
 * "explored somewhere new" milestone (`petHealthEngine.ts`): that one grades
 * how good a walk day was, this one only asks "did a walk happen at all".
 */
export const MIN_QUALIFYING_STEPS = 1000;

/**
 * The event types that count toward the pet-care streak today. A list, not a
 * scattered set of `if` checks — adding a fifth qualifying pillar later is a
 * one-line change here, not a hunt through every screen that shows a streak.
 *
 * SLEEP and SCREEN_TIME are real `HealthEventType`s but are deliberately
 * excluded: both can arrive with zero deliberate action (a wearable logs sleep
 * automatically overnight; screen time reads itself off the OS), which is
 * exactly the "the streak continues just because I opened the app" loophole
 * this list closes. HYDRATION and MANUAL_ACTIVITY are schema-reserved types
 * with no active logging flow in the app today, so there is nothing yet to
 * judge — add them here if that changes.
 */
const STREAK_QUALIFYING_TYPES: ReadonlySet<HealthEventType> = new Set<HealthEventType>([
  'WORKOUT',
  'STEP_ACTIVITY',
  'MEAL',
  'BRAIN_TRAINING',
]);

/** The one rule: does this single event count toward the pet-care streak? */
export const isQualifyingStreakEvent = (event: HealthEvent): boolean => {
  if (!STREAK_QUALIFYING_TYPES.has(event.type)) return false;
  if (event.type === 'STEP_ACTIVITY') {
    return ((event.metadata as StepMetadata).steps ?? 0) >= MIN_QUALIFYING_STEPS;
  }
  return true;
};

/**
 * Which day a qualifying event counts toward. Mirrors `dailyRecap.ts`'s own
 * mind-session day rule: the timed brain games stamp the moment they finish,
 * so their completion time is their day, but the daily word puzzle fixes its
 * day when the board opens (`puzzleDate`) — a puzzle started at 11:58pm and
 * finished at 12:02am must still credit the day it was that user's puzzle
 * *for*, not whichever side of midnight the last tap landed on.
 */
export const qualifyingEventDateKey: EventDateKey = (event) => {
  if (event.type === 'BRAIN_TRAINING') {
    const puzzleDate = (event.metadata as BrainTrainingMetadata).puzzleDate;
    if (puzzleDate) return puzzleDate;
  }
  return occurredAtKey(event);
};

export const qualifyingEventsForStreak = (events: HealthEvent[]): HealthEvent[] =>
  events.filter(isQualifyingStreakEvent);

/**
 * THE pet-care streak: consecutive local calendar days with at least one
 * qualifying activity. This is what every screen that shows "streak" should
 * call — never the generic `calculateStreaks` directly, which would let a
 * passive sleep sync or an idle app-open keep a streak alive.
 */
export const calculateQualifyingStreaks = (events: HealthEvent[], today: Date = new Date()): StreakSummary =>
  calculateStreaks(qualifyingEventsForStreak(events), today, qualifyingEventDateKey);

export interface StreakStatus extends StreakSummary {
  /**
   * Does today (the local calendar day) already have qualifying activity?
   * `currentStreak` alone can't tell a UI this — it already counts yesterday
   * when today hasn't happened yet (see `calculateStreaks`), which is correct
   * for "don't show 0 the moment the clock ticks over" but leaves "is today
   * still open, or already banked" to be inferred. This field is that answer,
   * so a screen can show an at-risk state (`currentStreak > 0 && !todayQualifies`)
   * without re-deriving it.
   */
  todayQualifies: boolean;
}

export const calculateStreakStatus = (events: HealthEvent[], today: Date = new Date()): StreakStatus => {
  const streaks = calculateQualifyingStreaks(events, today);
  return { ...streaks, todayQualifies: streaks.activeDateKeys.has(toDateKey(today)) };
};

/**
 * The other half of "qualifying activity" vs "new streak day" (see the
 * module doc): whether persisting `event` is the moment that turns its own
 * day into a NEW qualifying day — i.e. that day had no qualifying activity
 * yet, and this event is one. False for a second meal the same day, a
 * workout on a day that already qualified, or any non-qualifying event.
 *
 * `existingEvents` must be the events already on record *before* `event` is
 * added — the same before/after shape `detectLevelUp` uses for level-ups, so
 * the check fires on the real transition rather than on "a component
 * rendered a bigger number", and never replays on a refresh or navigation
 * (neither logs a new event).
 */
export const createsNewStreakDay = (existingEvents: HealthEvent[], event: HealthEvent): boolean => {
  if (!isQualifyingStreakEvent(event)) return false;
  const eventDayKey = qualifyingEventDateKey(event);
  const alreadyQualifiedThatDay = qualifyingEventsForStreak(existingEvents).some(
    (existing) => qualifyingEventDateKey(existing) === eventDayKey,
  );
  return !alreadyQualifiedThatDay;
};

export { toDateKey };
