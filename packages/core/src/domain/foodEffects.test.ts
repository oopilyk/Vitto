import { describe, expect, it } from 'vitest';
import type { HealthEvent, MealMetadata } from './health';
import { activeFoodEffects, detectFoodEffects, foodEffectsDelta } from './foodEffects';

const meal = (description: string, extra: Partial<MealMetadata> = {}, macros = { calories: 400, proteinGrams: 15, carbsGrams: 40, fatGrams: 12 }): MealMetadata => ({
  protein: false, vegetables: false, fruit: false, wholeGrains: false, fiber: false, treats: false,
  analysis: { foodDescription: description, grade: 'B', summary: description, confidence: 1, detectedFoods: [], macros, nutrients: { protein: false, vegetables: false, fruit: false, wholeGrains: false, fiber: false, treats: false } },
  ...extra,
});
const ids = (m: MealMetadata) => detectFoodEffects(m).map((e) => e.id);

describe('detectFoodEffects', () => {
  it('reads spicy off the name', () => {
    expect(ids(meal('Jalapeño chicken tacos'))).toContain('spicy');
    expect(ids(meal('Hot wings'))).toContain('spicy');
    expect(detectFoodEffects(meal('Extra hot vindaloo'))[0].reaction).toBe('That was hot!');
  });

  it('is not fooled by "hot" in a hot dog, or "pepper" on a bell pepper', () => {
    expect(ids(meal('Hot dog with mustard'))).not.toContain('spicy');
    expect(ids(meal('Hot chocolate'))).not.toContain('spicy');
    expect(ids(meal('Bell pepper salad'))).not.toContain('spicy');
  });

  it('matches whole words only', () => {
    // "shot" is not "hot", "eggplant" is not "egg", "donuts" is not "nuts".
    expect(ids(meal('Espresso shot'))).toContain('caffeinated');
    expect(ids(meal('Roasted eggplant'))).not.toContain('brain_food');
    expect(ids(meal('Glazed donuts'))).toContain('sugar_rush');
    expect(ids(meal('Glazed donuts'))).not.toContain('brain_food');
    expect(ids(meal('Scrambled eggs'))).toContain('brain_food');
  });

  it('treats a stem as a prefix so berries of every kind count as fresh', () => {
    expect(ids(meal('Strawberries and cream'))).toContain('fresh');
    expect(ids(meal('Blueberry oats'))).toEqual(expect.arrayContaining(['fresh', 'brain_food']));
  });

  it('reads amounts off the macros, not the name', () => {
    expect(ids(meal('Grilled chicken', {}, { calories: 500, proteinGrams: 42, carbsGrams: 5, fatGrams: 10 }))).toContain('protein_packed');
    expect(ids(meal('Big plate', {}, { calories: 1200, proteinGrams: 30, carbsGrams: 90, fatGrams: 40 }))).toEqual(
      expect.arrayContaining(['feast', 'carb_loaded']),
    );
  });

  it('never fires off the nutrient flags alone — those are the meal engine\'s, and already paid for', () => {
    expect(ids(meal('Lunch', { treats: true, vegetables: true, fruit: true }))).toEqual([]);
  });

  it('finds nothing on a plain plate, and caps a busy one at three', () => {
    expect(ids(meal('Plain rice'))).toEqual([]);
    const busy = meal('Spicy salmon salad with a brownie and a latte', { vegetables: true }, { calories: 950, proteinGrams: 35, carbsGrams: 85, fatGrams: 30 });
    expect(detectFoodEffects(busy)).toHaveLength(3);
    // Display order: the plate's loudest fact first.
    expect(ids(busy)[0]).toBe('spicy');
  });
});

describe('activeFoodEffects', () => {
  const at = (minutesAgo: number, description: string): HealthEvent => ({
    id: `m-${minutesAgo}`, userId: 'u', type: 'MEAL', source: 'manual',
    occurredAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
    metadata: meal(description),
  });
  const NOW = new Date('2026-09-13T18:00:00Z');

  it('keeps an effect for its own duration and no longer', () => {
    // Sugar rush lasts an hour; spicy two.
    const events = [at(90, 'Chocolate cake'), at(90, 'Chili con carne')];
    expect(activeFoodEffects(events, NOW).map((e) => e.id)).toEqual(['spicy']);
  });

  it('reports each effect once, from the most recent meal that carries it', () => {
    const events = [at(30, 'Spicy ramen'), at(60, 'Hot wings')];
    expect(activeFoodEffects(events, NOW).map((e) => e.id)).toEqual(['spicy', 'comfort']);
  });

  it('ignores meals from the future and non-meal events', () => {
    const later = { ...at(0, 'Sriracha eggs'), occurredAt: new Date(NOW.getTime() + 60_000).toISOString() };
    const workout = { ...at(10, 'x'), type: 'WORKOUT' as const, metadata: {} };
    expect(activeFoodEffects([later, workout], NOW)).toEqual([]);
  });
});

describe('foodEffectsDelta', () => {
  it('sums the small nudges', () => {
    const effects = detectFoodEffects(meal('Spicy coffee', {}, { calories: 100, proteinGrams: 0, carbsGrams: 5, fatGrams: 0 }));
    expect(foodEffectsDelta(effects)).toEqual({ energy: 5 });
  });
});
