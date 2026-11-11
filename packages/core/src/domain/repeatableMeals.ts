import type { HealthEvent, MacroNutrients, MealAnalysis, MealMetadata } from './health';
import { type MealSlot, mealSlotOf } from './mealSlots';

/**
 * Meals worth logging again in one tap: most people eat the same handful of
 * things, and searching for this morning's oats every morning is the chore
 * that makes people stop logging.
 *
 * Each is the saved analysis itself, so a photographed plate comes back with
 * its grade and nutrients as they were read, not re-guessed from its name.
 */
export interface RepeatableMeal {
  /** The name, lower-cased: one entry per meal however often it was eaten. */
  key: string;
  name: string;
  analysis: MealAnalysis;
  /** When it was last eaten. */
  lastAt: string;
  /** Eaten yesterday at about this time of day: the likeliest thing to be eating now. */
  sameTimeYesterday: boolean;
  /** The meal it was last logged as (breakfast, lunch…), so a list can lead with the slot being logged. */
  slot: MealSlot;
}

export const MAX_REPEATABLE_MEALS = 5;
/** How far from this time of day yesterday's meal can be and still be "the same time". */
const SAME_TIME_WINDOW_MS = 2.5 * 60 * 60 * 1000;

export const mealName = (analysis: MealAnalysis): string =>
  analysis.foodDescription?.trim() || analysis.detectedFoods.join(', ') || analysis.summary?.trim() || 'Meal';

const startOfDay = (at: Date): number => new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();

export const repeatableMeals = (
  events: readonly HealthEvent[],
  now: Date = new Date(),
  limit: number = MAX_REPEATABLE_MEALS,
): RepeatableMeal[] => {
  const meals = events
    .filter((event) => event.type === 'MEAL')
    .filter((event) => {
      const metadata = event.metadata as MealMetadata;
      // Apple Health imports are pieced together from nutrient samples and have
      // no real name to pick them by.
      return metadata.loggedVia !== 'healthkit' && Boolean(metadata.analysis?.macros);
    })
    .filter((event) => new Date(event.occurredAt).getTime() <= now.getTime())
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const seen = new Map<string, RepeatableMeal>();
  for (const event of meals) {
    const analysis = (event.metadata as MealMetadata).analysis!;
    const name = mealName(analysis);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.set(key, { key, name, analysis, lastAt: event.occurredAt, sameTimeYesterday: false, slot: mealSlotOf(event) });
  }

  // Yesterday's meal nearest this time of day, if one was near it.
  const today = startOfDay(now);
  const yesterday = startOfDay(new Date(today - 12 * 60 * 60 * 1000));
  const sameTimeYesterday = now.getTime() - (today - yesterday);
  let best: { key: string; gap: number } | null = null;
  for (const event of meals) {
    const at = new Date(event.occurredAt).getTime();
    if (at < yesterday || at >= today) continue;
    const gap = Math.abs(at - sameTimeYesterday);
    if (gap <= SAME_TIME_WINDOW_MS && (!best || gap < best.gap)) {
      best = { key: mealName((event.metadata as MealMetadata).analysis!).toLowerCase(), gap };
    }
  }

  const list = [...seen.values()];
  if (best) {
    const index = list.findIndex((meal) => meal.key === best!.key);
    const [meal] = list.splice(index, 1);
    list.unshift({ ...meal!, sameTimeYesterday: true });
  }
  return list.slice(0, limit);
};

/**
 * The same meals with the ones last eaten as `slot` first (each group keeps its
 * order), so picking Dinner leads with what is usually eaten for dinner.
 */
export const forSlot = (meals: readonly RepeatableMeal[], slot: MealSlot, limit: number = MAX_REPEATABLE_MEALS): RepeatableMeal[] =>
  [...meals.filter((meal) => meal.slot === slot), ...meals.filter((meal) => meal.slot !== slot)].slice(0, limit);

const scale = (value: number | undefined, factor: number, places = 0): number | undefined =>
  value === undefined ? undefined : Math.round(value * factor * 10 ** places) / 10 ** places;

/**
 * The meal again, at `servings` times what it was. The grade and nutrients
 * stand: half a plate of salad is still a salad. The pet's reaction does not
 * carry over, since that was about the first time.
 */
export const repeatMeal = (analysis: MealAnalysis, servings: number = 1): MealAnalysis => {
  const factor = Number.isFinite(servings) && servings > 0 ? servings : 1;
  const { petReaction: _reaction, ...rest } = analysis;
  const macros: MacroNutrients = {
    calories: scale(analysis.macros.calories, factor)!,
    proteinGrams: scale(analysis.macros.proteinGrams, factor)!,
    carbsGrams: scale(analysis.macros.carbsGrams, factor)!,
    fatGrams: scale(analysis.macros.fatGrams, factor)!,
  };
  const optional = {
    fiberGrams: scale(analysis.macros.fiberGrams, factor),
    sugarGrams: scale(analysis.macros.sugarGrams, factor),
    saturatedFatGrams: scale(analysis.macros.saturatedFatGrams, factor, 1),
    sodiumMg: scale(analysis.macros.sodiumMg, factor),
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) macros[key as keyof typeof optional] = value;
  }
  return { ...rest, macros };
};
