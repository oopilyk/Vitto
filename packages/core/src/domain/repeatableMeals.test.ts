import { describe, expect, it } from 'vitest';
import type { HealthEvent, MealAnalysis, MealMetadata } from './health';
import { forSlot, repeatableMeals, repeatMeal } from './repeatableMeals';

const analysis = (name: string, calories = 400): MealAnalysis => ({
  foodDescription: name,
  grade: 'B',
  summary: name,
  confidence: 0.9,
  detectedFoods: [name],
  macros: { calories, proteinGrams: 30, carbsGrams: 40, fatGrams: 10, fiberGrams: 5, saturatedFatGrams: 2.5 },
  nutrients: { protein: true, vegetables: false, fruit: false, wholeGrains: true, fiber: true, treats: false },
  petReaction: 'Yum!',
});

let id = 0;
const meal = (name: string, at: Date, loggedVia: MealMetadata['loggedVia'] = 'manual'): HealthEvent<MealMetadata> => ({
  id: `m${(id += 1)}`,
  userId: 'u',
  occurredAt: at.toISOString(),
  type: 'MEAL',
  source: 'manual',
  metadata: { ...analysis(name).nutrients, analysis: analysis(name), loggedVia },
});

const now = new Date(2026, 10, 6, 8, 30);
const at = (daysAgo: number, hour: number) => new Date(2026, 10, 6 - daysAgo, hour, 0);

describe('repeatableMeals', () => {
  it('lists each meal once, newest first', () => {
    const list = repeatableMeals([meal('Oats', at(3, 8)), meal('Burrito', at(0, 7)), meal('oats', at(2, 13))], now);
    expect(list.map((item) => item.name)).toEqual(['Burrito', 'oats']);
  });

  it("puts yesterday's meal from about this time first", () => {
    const list = repeatableMeals([meal('Oats', at(1, 8)), meal('Salad', at(1, 13)), meal('Burrito', at(0, 7))], now);
    expect(list[0]).toMatchObject({ name: 'Oats', sameTimeYesterday: true });
    expect(list.filter((item) => item.sameTimeYesterday)).toHaveLength(1);
  });

  it('flags nothing when yesterday had nothing near this time', () => {
    const list = repeatableMeals([meal('Salad', at(1, 13))], now);
    expect(list[0]!.sameTimeYesterday).toBe(false);
  });

  it('skips Apple Health imports and other kinds of event', () => {
    const step: HealthEvent = { id: 's', userId: 'u', occurredAt: at(0, 7).toISOString(), type: 'STEP_ACTIVITY', source: 'manual', metadata: {} };
    expect(repeatableMeals([meal('Imported', at(0, 7), 'healthkit'), step], now)).toEqual([]);
  });

  it('keeps to the limit', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name, index) => meal(name, at(index, 7)));
    expect(repeatableMeals(many, now)).toHaveLength(5);
  });
});

describe('forSlot', () => {
  it('leads with the meals last eaten as that slot, each group in its order', () => {
    const list = repeatableMeals(
      [meal('Oats', at(1, 7)), meal('Chicken bowl', at(1, 19)), meal('Sushi', at(2, 20)), meal('Toast', at(3, 8))],
      now,
      20,
    );
    expect(list.find((item) => item.name === 'Sushi')?.slot).toBe('dinner');
    expect(forSlot(list, 'dinner').map((item) => item.name).slice(0, 2)).toEqual(['Chicken bowl', 'Sushi']);
    expect(forSlot(list, 'breakfast').slice(0, 2).every((item) => item.slot === 'breakfast')).toBe(true);
  });
});

describe('repeatMeal', () => {
  it('scales the numbers and keeps the grade, dropping the old reaction', () => {
    const half = repeatMeal(analysis('Oats', 401), 0.5);
    expect(half.macros).toEqual({ calories: 201, proteinGrams: 15, carbsGrams: 20, fatGrams: 5, fiberGrams: 3, saturatedFatGrams: 1.3 });
    expect(half.grade).toBe('B');
    expect(half.petReaction).toBeUndefined();
  });

  it('treats a nonsense serving count as one', () => {
    expect(repeatMeal(analysis('Oats'), Number.NaN).macros.calories).toBe(400);
  });
});
