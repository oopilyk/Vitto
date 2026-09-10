import type { HealthEvent, MealMetadata, StepMetadata } from './health';
import { calculateMacroTargets, type BodyProfile } from './macroTargets';
import { sumMealMacros } from './nutritionSummary';
import { toDateKey } from './streaks';

/**
 * Trophies: three gold ornaments that appear on the living-room shelf, one by
 * one, as long-run habits are kept. Each is a month of something, not a single
 * good day, so the shelf fills slowly and a full shelf means something.
 *
 * Derived from event history, never stored. That is what makes them permanent:
 * a trophy is "there was ever a qualifying month", so a streak that breaks later
 * cannot take it back, and there is no column to migrate or keep in sync.
 * Everything here is pure, so the rules are testable without a renderer.
 */

export type TrophyId = 'dumbbell' | 'shoe' | 'drumstick';

/** Shelf order, top plank first. Also the order they are likely to be earned in. */
export const TROPHY_IDS: readonly TrophyId[] = ['dumbbell', 'shoe', 'drumstick'];

export const TROPHY_LABEL: Record<TrophyId, string> = {
  dumbbell: 'Golden dumbbell',
  shoe: 'Golden shoe',
  drumstick: 'Golden drumstick',
};

/** How long a habit has to hold, in days. "A month", per the product owner. */
export const TROPHY_DAYS = 30;
/** The workout trophy is measured in weeks, because its target is a weekly one. */
export const WORKOUT_TROPHY_WEEKS = 4;
export const STEP_TROPHY_DAILY_STEPS = 10_000;
/** A day "hits its goals" when calories land within this band of the target... */
export const GOAL_CALORIE_TOLERANCE = 0.1;
/** ...and protein reaches at least this share of its target. */
export const GOAL_PROTEIN_FLOOR = 0.9;

/** What each trophy is for, in the user's terms — shown in the dev panel and anywhere a rule is explained. */
export const trophyRule = (id: TrophyId, profile: Pick<BodyProfile, 'trainingDaysPerWeek'>): string => {
  switch (id) {
    case 'dumbbell': {
      const perWeek = Math.max(1, Math.round(profile.trainingDaysPerWeek));
      return `${WORKOUT_TROPHY_WEEKS} weeks in a row of ${perWeek} workout${perWeek === 1 ? '' : 's'} a week`;
    }
    case 'shoe':
      return `${STEP_TROPHY_DAILY_STEPS.toLocaleString()} steps every day for ${TROPHY_DAYS} days`;
    case 'drumstick':
      return `Hitting your calorie and protein goals every day for ${TROPHY_DAYS} days`;
  }
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface DayRecord {
  workout: boolean;
  steps: number;
  hitGoals: boolean;
}

const emptyDay = (): DayRecord => ({ workout: false, steps: 0, hitGoals: false });

const parseKey = (key: string): Date => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/**
 * One record per calendar day that has any event, keyed like the streaks
 * module so a day is the same day everywhere in the app.
 *
 * Steps take the MAX of a day's step totals rather than the sum: a step sync
 * reports the day's running total, so two syncs are two readings of one number,
 * not two walks. Same rule `insights` uses.
 */
const buildDays = (events: HealthEvent[], profile: BodyProfile): Map<string, DayRecord> => {
  const days = new Map<string, DayRecord>();
  const mealsByDay = new Map<string, HealthEvent<MealMetadata>[]>();
  const record = (key: string) => {
    let day = days.get(key);
    if (!day) {
      day = emptyDay();
      days.set(key, day);
    }
    return day;
  };

  for (const event of events) {
    const key = toDateKey(new Date(event.occurredAt));
    switch (event.type) {
      case 'WORKOUT':
        record(key).workout = true;
        break;
      case 'STEP_ACTIVITY': {
        const steps = (event.metadata as StepMetadata | undefined)?.steps;
        if (typeof steps === 'number' && Number.isFinite(steps)) {
          const day = record(key);
          day.steps = Math.max(day.steps, steps);
        }
        break;
      }
      case 'MEAL': {
        record(key);
        const list = mealsByDay.get(key) ?? [];
        list.push(event as HealthEvent<MealMetadata>);
        mealsByDay.set(key, list);
        break;
      }
      default:
        break;
    }
  }

  const targets = calculateMacroTargets(profile);
  for (const [key, meals] of mealsByDay) {
    const totals = sumMealMacros(meals);
    const calorieBand = targets.calories * GOAL_CALORIE_TOLERANCE;
    const caloriesOnTarget = Math.abs(totals.calories - targets.calories) <= calorieBand;
    const proteinOnTarget = totals.proteinGrams >= targets.proteinGrams * GOAL_PROTEIN_FLOOR;
    // Goals cannot be hit on a day nothing was eaten, whatever the target says.
    record(key).hitGoals = meals.length > 0 && caloriesOnTarget && proteinOnTarget;
  }
  return days;
};

/**
 * True when `predicate` held on `length` consecutive calendar days somewhere in
 * the history up to `today`. Walks day by day rather than over the keys that
 * exist, so a day with no events at all breaks the run the way it should.
 */
const hadConsecutiveDays = (
  days: Map<string, DayRecord>,
  today: Date,
  length: number,
  predicate: (day: DayRecord) => boolean,
): boolean => {
  if (days.size === 0) return false;
  const keys = [...days.keys()].sort();
  const cursor = parseKey(keys[0]);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let run = 0;
  while (cursor.getTime() <= end.getTime()) {
    const day = days.get(toDateKey(cursor));
    run = day && predicate(day) ? run + 1 : 0;
    if (run >= length) return true;
    cursor.setTime(cursor.getTime() + ONE_DAY_MS);
    // Guard DST: normalise back to local midnight so the key stays a whole day.
    cursor.setHours(0, 0, 0, 0);
  }
  return false;
};

/**
 * True when, for `weeks` consecutive 7-day blocks ending on some day in the
 * history, each block had at least `perWeek` distinct workout days.
 *
 * Blocks are anchored to the candidate end day and counted back, so any 28-day
 * stretch qualifies — nobody's "week" has to line up with a calendar week.
 */
const hadConsecutiveWorkoutWeeks = (
  days: Map<string, DayRecord>,
  today: Date,
  weeks: number,
  perWeek: number,
): boolean => {
  if (days.size === 0) return false;
  const keys = [...days.keys()].sort();
  const start = parseKey(keys[0]);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const span = weeks * 7;

  // Workout flags as a flat day array from the first event to today.
  const flags: boolean[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    flags.push(Boolean(days.get(toDateKey(cursor))?.workout));
    cursor.setTime(cursor.getTime() + ONE_DAY_MS);
    cursor.setHours(0, 0, 0, 0);
  }
  if (flags.length < span) return false;

  for (let endIndex = span - 1; endIndex < flags.length; endIndex += 1) {
    let allWeeks = true;
    for (let week = 0; week < weeks && allWeeks; week += 1) {
      const to = endIndex - week * 7;
      let count = 0;
      for (let i = to - 6; i <= to; i += 1) if (flags[i]) count += 1;
      if (count < perWeek) allWeeks = false;
    }
    if (allWeeks) return true;
  }
  return false;
};

/**
 * Every trophy the history has earned, in shelf order.
 *
 * The workout target comes from the profile — "however many times a week you
 * set" — floored at one so a profile with 0 training days does not hand out the
 * dumbbell for doing nothing.
 */
export const earnedTrophies = (
  events: HealthEvent[],
  profile: BodyProfile,
  today: Date = new Date(),
): TrophyId[] => {
  const days = buildDays(events, profile);
  const perWeek = Math.max(1, Math.round(profile.trainingDaysPerWeek));
  const earned: TrophyId[] = [];
  if (hadConsecutiveWorkoutWeeks(days, today, WORKOUT_TROPHY_WEEKS, perWeek)) earned.push('dumbbell');
  if (hadConsecutiveDays(days, today, TROPHY_DAYS, (day) => day.steps >= STEP_TROPHY_DAILY_STEPS)) {
    earned.push('shoe');
  }
  if (hadConsecutiveDays(days, today, TROPHY_DAYS, (day) => day.hitGoals)) earned.push('drumstick');
  return earned;
};
