import { describe, expect, it } from 'vitest';
import { calorieEstimate, describeSubMacros } from './macros';
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

describe('describeSubMacros', () => {
  it('lists what was reported, plainly, and nothing when none was', () => {
    expect(describeSubMacros({ fiberGrams: 6, sugarGrams: 12.4, saturatedFatGrams: 3.46, sodiumMg: 1240 })).toBe(
      'Fiber 6g · Sugar 12g · Sat. fat 3.5g · Sodium 1,240mg',
    );
    expect(describeSubMacros({ fiberGrams: 6, sugarGrams: 12 }, { includeFiber: false })).toBe('Sugar 12g');
    expect(describeSubMacros({})).toBeNull();
  });
});

describe('sub-macros in the day\'s totals', () => {
  it('adds up what each meal reported, counting a meal without them as nothing', () => {
    const meal = (macros: object) => ({ id: 'm', userId: 'u', occurredAt: new Date().toISOString(), type: 'MEAL' as const, source: 'manual' as const,
      metadata: { protein: false, vegetables: false, fruit: false, wholeGrains: false, fiber: false, treats: false,
        analysis: { grade: 'B' as const, summary: '', confidence: 1, detectedFoods: [], nutrients: { protein: false, vegetables: false, fruit: false, wholeGrains: false, fiber: false, treats: false },
          macros: { calories: 400, proteinGrams: 20, carbsGrams: 40, fatGrams: 10, ...macros } } } });
    const total = sumMealMacros([meal({ fiberGrams: 6, sugarGrams: 10, sodiumMg: 500 }), meal({ fiberGrams: 4 }), meal({})]);
    expect(total).toMatchObject({ fiberGrams: 10, sugarGrams: 10, saturatedFatGrams: 0, sodiumMg: 500 });
  });
});
