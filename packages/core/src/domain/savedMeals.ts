import { newId } from './ids';
import type { MealAnalysis } from './health';
import { t } from '../i18n';

/**
 * Saved meals, for meal preppers: the chicken-and-rice box eaten four days in a
 * row, set up once (from a search, a photo or a scan) and logged in one tap
 * from the Kitchen's Meals tab after that.
 *
 * A saved meal is the plate as it was read: its foods, macros and grade. It is
 * not tied to a day; logging one puts it in the slot the clock says it is.
 *
 * Device-local, like the workout routines started out: personal setup, not
 * history.
 */
export interface SavedMeal {
  id: string;
  name: string;
  analysis: MealAnalysis;
  updatedAt: string;
}

/** A week of prep with room for variants. */
export const MAX_SAVED_MEALS = 30;
export const MAX_SAVED_MEAL_NAME = 32;

export const normalizeSavedMealName = (name: string): string =>
  name.trim().replace(/\s+/g, ' ').slice(0, MAX_SAVED_MEAL_NAME);

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** Why this meal cannot be saved under this name, or null. */
export const savedMealError = (name: string, meals: readonly SavedMeal[]): string | null => {
  const clean = normalizeSavedMealName(name);
  if (!clean) return t('Give the meal a name.');
  const replacing = meals.some((meal) => sameName(meal.name, clean));
  if (!replacing && meals.length >= MAX_SAVED_MEALS) return t('You can keep up to {max} meals.', { max: MAX_SAVED_MEALS });
  return null;
};

export const savedMealFrom = (name: string, analysis: MealAnalysis, now: Date = new Date()): SavedMeal => {
  // The pet's line was about that plate on that day; it is not part of the meal.
  const { petReaction: _reaction, ...plate } = analysis;
  return { id: newId(), name: normalizeSavedMealName(name), analysis: plate, updatedAt: now.toISOString() };
};

/** Adds a meal, newest first; one of the same name (any case) is replaced. */
export const upsertSavedMeal = (meals: readonly SavedMeal[], meal: SavedMeal): SavedMeal[] =>
  [meal, ...meals.filter((candidate) => candidate.id !== meal.id && !sameName(candidate.name, meal.name))].slice(0, MAX_SAVED_MEALS);

export const removeSavedMeal = (meals: readonly SavedMeal[], id: string): SavedMeal[] =>
  meals.filter((meal) => meal.id !== id);

/** Only well-formed saved meals, from storage that may hold anything. */
export const parseSavedMeals = (value: unknown): SavedMeal[] =>
  Array.isArray(value)
    ? value.filter(
        (meal): meal is SavedMeal =>
          Boolean(meal) &&
          typeof meal === 'object' &&
          typeof (meal as SavedMeal).id === 'string' &&
          typeof (meal as SavedMeal).name === 'string' &&
          Boolean((meal as SavedMeal).analysis?.macros),
      ).slice(0, MAX_SAVED_MEALS)
    : [];
