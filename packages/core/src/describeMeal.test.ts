import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureCore } from './config';
import { describeMeal } from './describeMeal';
import type { FoodSearchResult } from './foodDatabase';

const macros = { calories: 74, proteinGrams: 6, carbsGrams: 0.4, fatGrams: 5, fiberGrams: 0 };
const egg: FoodSearchResult = { id: 'fatsecret-1', name: 'Egg', servingDescription: '1 large (50 g)', macros, source: 'fatsecret' };
const rice: FoodSearchResult = { id: '2', name: 'White Rice', servingDescription: 'per 100 g', basisGrams: 100, isPer100g: true, macros };

const withServer = (invoke: (name: string, options: unknown) => Promise<unknown>) => configureCore({ supabase: { functions: { invoke } } as never });

describe('describeMeal', () => {
  afterEach(() => configureCore({ supabase: null }));

  it('reads a plain sentence with no model at all', async () => {
    const invoke = vi.fn();
    withServer(invoke);
    const search = vi.fn(async (query: string) => (query === 'eggs' ? [egg] : [rice]));

    const meal = await describeMeal('2 eggs and 150g white rice', { search });
    expect(meal.via).toBe('parser');
    expect(meal.items).toEqual([
      { food: egg, servings: 2, unit: 'serving', said: 'eggs' },
      { food: rice, servings: 1.5, unit: 'g', said: 'white rice' },
    ]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('asks the model when the sentence needs judgment, and maps what it picked', async () => {
    const fatsecretEgg = { food_id: '1', food_name: 'Egg', servings: { serving: { serving_description: '1 large', metric_serving_amount: '50', metric_serving_unit: 'g', calories: '74', protein: '6', is_default: '1' } } };
    const usdaRice = { fdcId: 2, description: 'Rice, white, cooked', foodNutrients: [{ nutrientName: 'Energy', unitName: 'KCAL', value: 130 }] };
    const invoke = vi.fn(async () => ({
      data: {
        items: [
          { said: '2 scrambled eggs', source: 'fatsecret', food: fatsecretEgg, servings: 2, byWeight: false },
          { said: 'a big bowl of rice', source: 'usda', food: usdaRice, servings: 2.5, byWeight: false },
          { said: "mum's stew", source: 'estimate', food: { name: 'Stew', grams: 300, calories: 420, proteinGrams: 30, carbsGrams: 25, fatGrams: 20, fiberGrams: 4 }, servings: 1, byWeight: false },
          { said: 'nonsense', source: 'somewhere', food: {}, servings: 1 },
          { said: 'broken', source: 'usda', food: { description: 'no id' }, servings: 1 },
        ],
        missed: ['the mystery sauce', 7],
      },
      error: null,
    }));
    withServer(invoke);
    const search = vi.fn(async () => []);

    const meal = await describeMeal("2 scrambled eggs, a big bowl of rice and mum's stew", { search });
    expect(invoke).toHaveBeenCalledWith('describe-meal', { body: { text: "2 scrambled eggs, a big bowl of rice and mum's stew", key: expect.any(String), locale: 'en' } });
    // Judgment words mean the sentence is never searched from the phone.
    expect(search).not.toHaveBeenCalled();
    expect(meal.via).toBe('ai');
    expect(meal.missed).toEqual(['the mystery sauce']);
    expect(meal.items.map((item) => [item.food.name, item.servings, item.unit, item.food.source])).toEqual([
      ['Egg', 2, 'serving', 'fatsecret'],
      ['Rice, white, cooked', 2.5, 'g', undefined],
      ['Stew', 1, 'serving', 'estimate'],
    ]);
    expect(meal.items[2]!.food.servingDescription).toBe('about 300 g');
    expect(meal.items[2]!.food.macros.calories).toBe(420);
  });

  it('asks the model when a plain sentence names a food the search cannot pin down', async () => {
    const invoke = vi.fn(async () => ({ data: { notFood: true }, error: null }));
    withServer(invoke);
    // The search works, but has no food called exactly "eggs".
    await expect(describeMeal('2 eggs', { search: async () => [{ ...egg, name: 'Egg, whole, raw' }] })).rejects.toThrow('did not sound like food');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('logs a weight in grams when that is how it was said', async () => {
    const fatsecretEgg = { food_id: '1', food_name: 'Egg', servings: { serving: { serving_description: '1 large', metric_serving_amount: '50', metric_serving_unit: 'g', calories: '74', is_default: '1' } } };
    withServer(async () => ({ data: { items: [{ said: '120g of eggs', source: 'fatsecret', food: fatsecretEgg, servings: 2.4, byWeight: true }] }, error: null }));
    const meal = await describeMeal('about 120g of eggs');
    expect(meal.items[0]).toMatchObject({ servings: 2.4, unit: 'g' });
  });

  it("passes on the server's reason for refusing, and has one of its own for the rest", async () => {
    withServer(async () => ({ data: null, error: { context: { text: async () => JSON.stringify({ error: "That's today's 5 described meals." }) } } }));
    await expect(describeMeal('a big bowl of curry')).rejects.toThrow("That's today's 5 described meals.");

    withServer(async () => ({ data: null, error: { name: 'FunctionsFetchError' } }));
    await expect(describeMeal('a big bowl of curry')).rejects.toThrow('Check your connection');

    // A browser that knows it is online: the fault is at our end, so the connection is not blamed.
    vi.stubGlobal('navigator', { onLine: true });
    await expect(describeMeal('a big bowl of curry')).rejects.toThrow('Vitto could not read that just now');
    vi.stubGlobal('navigator', { onLine: false });
    await expect(describeMeal('a big bowl of curry')).rejects.toThrow('Check your connection');
    vi.unstubAllGlobals();

    // Not deployed yet: a gateway's own JSON, with no reason of ours in it.
    withServer(async () => ({ data: null, error: { context: { text: async () => '{"code":"NOT_FOUND"}' } } }));
    await expect(describeMeal('a big bowl of curry')).rejects.toThrow('Could not read that meal');

    withServer(async () => ({ data: { items: [] }, error: null }));
    await expect(describeMeal('a big bowl of curry')).rejects.toThrow('Could not read that meal');
  });

  it('says what it needs when there is nothing to read or no server to ask', async () => {
    await expect(describeMeal('   ')).rejects.toThrow('Say or type what you ate.');
    await expect(describeMeal('a big bowl of curry')).rejects.toThrow('List each food with an amount');
  });
});
