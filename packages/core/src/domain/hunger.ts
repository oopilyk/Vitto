import { DECAY_PERIOD_MS } from './decayClock';
import type { PetState } from './pet';

/** Under this the pet is hungry. Here, not in the engine, so this module imports nothing that imports it. */
export const HUNGRY_NUTRITION_THRESHOLD = 25;

/**
 * Hunger is what was eaten lately, not a timer.
 *
 * The bar is the calories logged in the last 24 hours as a share of the
 * logger's maintenance (what their body burns in a day), capped at 100: eat
 * your maintenance and the pet is full, eat nothing for a day and it is empty.
 * Each meal wears off a day after it was eaten, so the bar steps down on its
 * own and never jumps at midnight.
 *
 * Each meal is kept on the pet already converted to points (its share of
 * maintenance), so hunger can be worked out from the pet alone: decay needs no
 * profile, and on a shared pet each partner's meals count against their own
 * maintenance.
 */

export interface RecentMeal {
  /** When it was eaten (ISO). */
  at: string;
  /** Its share of the logger's maintenance, in bar points (100 = a full day's maintenance). */
  points: number;
}

/** How long a meal keeps feeding the pet: one day (the compressed QA day, under the fast clock). */
export const hungerWindowMs = () => DECAY_PERIOD_MS;
/** A meal logged without a calorie count: about a quarter of a day's eating. */
export const MEAL_POINTS_DEFAULT = 25;
/** Whose maintenance is unknown: a middling adult's. */
const FALLBACK_MAINTENANCE = 2000;
/** Plenty for a day of meals and snacks; anything past it is a bad row, not a meal. */
const MAX_RECENT_MEALS = 60;

/** A meal's points: its calories as a share of maintenance. */
export const mealPoints = (calories: number | undefined, maintenance: number | undefined): number => {
  if (typeof calories !== 'number' || !Number.isFinite(calories) || calories <= 0) return MEAL_POINTS_DEFAULT;
  const burn = typeof maintenance === 'number' && Number.isFinite(maintenance) && maintenance > 0 ? maintenance : FALLBACK_MAINTENANCE;
  return Math.min(100, Math.round((calories / burn) * 1000) / 10);
};

const timeOf = (meal: RecentMeal) => Date.parse(meal.at);

/**
 * The pet's recent meals. A pet from before this has none recorded, so what
 * it had is read as one meal at its last care: it wears off a day later like
 * any other, rather than every existing pet waking up starving.
 */
export const mealsOf = (pet: Pick<PetState, 'recentMeals' | 'nutrition' | 'lastEventAt' | 'adoptedAt'>): RecentMeal[] =>
  pet.recentMeals ?? [{ at: pet.lastEventAt ?? pet.adoptedAt, points: pet.nutrition }];

/** Only well-formed entries, from storage that anyone holding the pet could write. */
export const sanitizeMeals = (value: unknown): RecentMeal[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter(
      (meal): meal is RecentMeal =>
        Boolean(meal) &&
        typeof meal.at === 'string' &&
        Number.isFinite(Date.parse(meal.at)) &&
        typeof meal.points === 'number' &&
        Number.isFinite(meal.points),
    )
    .map((meal) => ({ at: meal.at, points: Math.max(0, Math.min(100, meal.points)) }))
    .slice(-MAX_RECENT_MEALS);
};

/** The bar at a moment: the meals still feeding the pet then, capped at 100. */
export const hungerAt = (meals: readonly RecentMeal[], atMs: number): number => {
  const window = hungerWindowMs();
  const total = meals
    .filter((meal) => timeOf(meal) <= atMs && atMs - timeOf(meal) < window)
    .reduce((sum, meal) => sum + meal.points, 0);
  return Math.round(Math.min(100, total));
};

/** Just the meals still feeding the pet at `atMs`, oldest first: what is worth keeping. */
export const mealsStillFeeding = (meals: readonly RecentMeal[], atMs: number): RecentMeal[] =>
  meals
    .filter((meal) => atMs - timeOf(meal) < hungerWindowMs())
    .sort((a, b) => timeOf(a) - timeOf(b))
    .slice(-MAX_RECENT_MEALS);

/**
 * Each moment in (fromMs, toMs] that a meal wears off, with the bar after it,
 * oldest first. Between them the bar holds still.
 */
export const hungerSteps = (meals: readonly RecentMeal[], fromMs: number, toMs: number): { atMs: number; value: number }[] => {
  const window = hungerWindowMs();
  const ends = [...new Set(meals.map((meal) => timeOf(meal) + window))]
    .filter((at) => at > fromMs && at <= toMs)
    .sort((a, b) => a - b);
  return ends.map((atMs) => ({ atMs, value: hungerAt(meals, atMs) }));
};

/**
 * When the pet next turns hungry if nothing else is eaten, or null when it
 * already is (or nothing it ate is left to wear off).
 */
export const nextHungryAt = (pet: Pick<PetState, 'recentMeals' | 'nutrition' | 'lastEventAt' | 'adoptedAt'>, nowMs: number): number | null => {
  const meals = mealsOf(pet);
  if (hungerAt(meals, nowMs) < HUNGRY_NUTRITION_THRESHOLD) return null;
  return hungerSteps(meals, nowMs, nowMs + hungerWindowMs()).find((step) => step.value < HUNGRY_NUTRITION_THRESHOLD)?.atMs ?? null;
};
