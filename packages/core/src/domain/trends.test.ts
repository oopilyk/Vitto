import { describe, expect, it } from 'vitest';
import type { HealthEvent, MealMetadata } from './health';
import { PROFILE_SURVEY_DEFAULTS, type BodyProfile } from './macroTargets';
import { foodTrends, stepTrends } from './trends';

const profile = {
  age: 30, sex: 'other', heightCm: 173, weightKg: 73, heightUnit: 'cm', weightUnit: 'kg', activity: 'moderate', goal: 'maintain',
  ...PROFILE_SURVEY_DEFAULTS,
} as BodyProfile;
const today = new Date(2026, 10, 6, 15, 0); // a Friday
const at = (daysAgo: number, hour = 12) => new Date(2026, 10, 6 - daysAgo, hour).toISOString();

let n = 0;
const meal = (daysAgo: number, name: string, calories: number, protein: number, grade: 'A' | 'B' = 'A'): HealthEvent<MealMetadata> => ({
  id: `m${(n += 1)}`, userId: 'u', occurredAt: at(daysAgo), type: 'MEAL', source: 'manual',
  metadata: {
    protein: true, vegetables: false, fruit: false, wholeGrains: false, fiber: false, treats: false, loggedVia: 'manual',
    analysis: {
      foodDescription: name, grade, summary: name, confidence: 1, detectedFoods: [name],
      macros: { calories, proteinGrams: protein, carbsGrams: 50, fatGrams: 20 },
      nutrients: { protein: true, vegetables: false, fruit: false, wholeGrains: false, fiber: false, treats: false },
    },
  },
});
const steps = (daysAgo: number, count: number, source: HealthEvent['source'] = 'healthkit'): HealthEvent => ({
  id: `s${(n += 1)}`, userId: 'u', occurredAt: at(daysAgo, 20), type: 'STEP_ACTIVITY', source, metadata: { steps: count },
});

describe('foodTrends', () => {
  it('averages finished days that had meals, leaving out today and empty days', () => {
    const trends = foodTrends([meal(0, 'Toast', 5000, 0), meal(1, 'Oats', 2000, 100), meal(3, 'Oats', 1000, 50), meal(3, 'Eggs', 400, 30)], profile, 7, today);
    expect(trends.days).toHaveLength(7);
    expect(trends.days.at(-1)!.isToday).toBe(true);
    expect(trends.loggedDays).toBe(2);
    expect(trends.average).toMatchObject({ calories: 1700, proteinGrams: 90, meals: 1.5 });
    expect(trends.grades.A).toBe(4);
    expect(trends.favourites).toEqual([{ name: 'Oats', count: 2, calories: 2000 }]);
  });

  it('compares with the week before and counts days on target', () => {
    const target = foodTrends([], profile, 7, today).targets.calories;
    const trends = foodTrends([meal(1, 'A', target, 200), meal(9, 'B', target / 2, 10)], profile, 7, today);
    expect(trends.daysOnTarget).toBe(1);
    expect(trends.proteinDays).toBe(1);
    expect(trends.caloriesChange).toBe(100);
  });

  it('has no averages with nothing logged', () => {
    const trends = foodTrends([], profile, 30, today);
    expect(trends.average).toBeNull();
    expect(trends.split).toBeNull();
    expect(trends.days).toHaveLength(30);
  });
});

describe('stepTrends', () => {
  it('averages finished days with steps and finds the best day', () => {
    const trends = stepTrends([steps(0, 20000), steps(1, 9000), steps(2, 12000), steps(2, 11000)], 10000, 7, today);
    // Day 2: two Apple Health totals for one day count once (the later one).
    expect(trends.days.at(-3)!.steps).toBe(12000);
    expect(trends.average).toBe(10500);
    expect(trends.best!.steps).toBe(20000);
    expect(trends.goalDays).toBe(2);
    expect(trends.total).toBe(41000);
  });

  it('counts goal days in a row up to today', () => {
    expect(stepTrends([steps(1, 11000), steps(2, 12000), steps(3, 2000)], 10000, 7, today).streak).toBe(2);
    expect(stepTrends([steps(0, 10000), steps(1, 11000)], 10000, 7, today).streak).toBe(2);
    expect(stepTrends([steps(2, 11000)], 10000, 7, today).streak).toBe(0);
  });

  it('splits weekdays from weekends', () => {
    // 2026-11-01 is a Sunday (5 days before the 6th), the 2nd a Monday.
    const trends = stepTrends([steps(5, 4000), steps(4, 8000)], 10000, 7, today);
    expect(trends.weekendAverage).toBe(4000);
    expect(trends.weekdayAverage).toBe(8000);
  });
});
