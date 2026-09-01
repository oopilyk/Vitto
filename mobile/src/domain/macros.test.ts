import { describe, expect, it } from 'vitest';
import { calorieEstimate } from './macros';
import { sumMealMacros } from './nutritionSummary';
import type { HealthEvent, MealAnalysis, MealMetadata } from './health';

const macros = { calories: 0, proteinGrams: 38, carbsGrams: 55, fatGrams: 10 };

describe('calorieEstimate', () => {
  it('keeps the analysed figure when one is present', () => {
    expect(calorieEstimate({ ...macros, calories: 462 })).toBe(462);
  });

  it('derives calories from the macros when the analysis reports none', () => {
    expect(calorieEstimate(macros)).toBe(38 * 4 + 55 * 4 + 10 * 9);
  });

  it('treats missing macros as zero', () => {
    expect(calorieEstimate(undefined)).toBe(0);
  });
});

describe('sumMealMacros', () => {
  it('totals the same calories the diary row shows for a zero-calorie analysis', () => {
    const event = {
      id: 'meal-1',
      userId: 'user-1',
      occurredAt: new Date().toISOString(),
      type: 'MEAL',
      source: 'manual',
      metadata: { analysis: { macros } as MealAnalysis },
    } as unknown as HealthEvent<MealMetadata>;
    expect(sumMealMacros([event]).calories).toBe(calorieEstimate(macros));
  });
});
