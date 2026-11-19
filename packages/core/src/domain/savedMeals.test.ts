import { describe, expect, it } from 'vitest';
import type { MealAnalysis } from './health';
import { MAX_SAVED_MEALS, parseSavedMeals, removeSavedMeal, savedMealError, savedMealFrom, upsertSavedMeal } from './savedMeals';

const plate = (calories: number): MealAnalysis =>
  ({
    grade: 'B',
    summary: 'Chicken and rice',
    confidence: 0.9,
    detectedFoods: ['Chicken', 'Rice'],
    macros: { calories, proteinGrams: 40, carbsGrams: 50, fatGrams: 10 },
    nutrients: { protein: true, vegetables: false, fruit: false },
    petReaction: 'Yum, that again?',
  }) as unknown as MealAnalysis;

describe('saved meals', () => {
  it('keeps the plate without the pet line, under a tidied name', () => {
    const meal = savedMealFrom('  Prep   box ', plate(500));
    expect(meal.name).toBe('Prep box');
    expect(meal.analysis.macros.calories).toBe(500);
    expect(meal.analysis.petReaction).toBeUndefined();
  });

  it('puts the newest first and replaces one of the same name', () => {
    const a = savedMealFrom('Prep box', plate(500));
    const b = savedMealFrom('Oats', plate(300));
    const again = savedMealFrom('prep BOX', plate(550));
    const list = upsertSavedMeal(upsertSavedMeal(upsertSavedMeal([], a), b), again);
    expect(list.map((meal) => meal.name)).toEqual(['prep BOX', 'Oats']);
    expect(removeSavedMeal(list, b.id).map((meal) => meal.name)).toEqual(['prep BOX']);
  });

  it('asks for a name, and stops at the most it keeps unless replacing', () => {
    expect(savedMealError('  ', [])).toBe('Give the meal a name.');
    const full = Array.from({ length: MAX_SAVED_MEALS }, (_, index) => savedMealFrom(`Meal ${index}`, plate(400)));
    expect(savedMealError('Another', full)).toContain(String(MAX_SAVED_MEALS));
    expect(savedMealError('meal 3', full)).toBeNull();
  });

  it('reads only well-formed meals from storage', () => {
    const good = savedMealFrom('Oats', plate(300));
    expect(parseSavedMeals([good, { id: 'x' }, null, 'meal'])).toEqual([good]);
    expect(parseSavedMeals('nope')).toEqual([]);
  });
});
