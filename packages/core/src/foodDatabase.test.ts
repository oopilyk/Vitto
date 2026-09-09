import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupBarcode, searchFoodsByName, toMealAnalysis } from './foodDatabase';

const mockFetchOnce = (body: unknown): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => body,
    })) as unknown as typeof fetch,
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const energyRows = (kcal: number, kilojoules: number) => [
  { nutrientName: 'Energy', unitName: 'KCAL', value: kcal },
  { nutrientName: 'Energy', unitName: 'kJ', value: kilojoules },
];

/** Routes by URL so a test can make USDA fail while OpenFoodFacts answers. */
const mockFetchByHost = (handlers: {
  usda?: () => { ok: boolean; status?: number; body?: unknown };
  off?: () => { ok: boolean; status?: number; body?: unknown };
}): ReturnType<typeof vi.fn> => {
  const calls = vi.fn(async (input: unknown) => {
    const url = String(input);
    const handler = url.includes('api.nal.usda.gov') ? handlers.usda : handlers.off;
    if (!handler) throw new Error(`unexpected request to ${url}`);
    const { ok, status = ok ? 200 : 500, body } = handler();
    return { ok, status, json: async () => body };
  });
  vi.stubGlobal('fetch', calls as unknown as typeof fetch);
  return calls;
};

const offProduct = (name: string, kcal: number) => ({
  code: `off-${name}`,
  product_name: name,
  brands: 'Acme',
  nutriments: { 'energy-kcal_100g': kcal, proteins_100g: 9 },
});

describe('searchFoodsByName — falling back to OpenFoodFacts', () => {
  it('answers from OpenFoodFacts when the USDA key is rate limited', async () => {
    // The reported bug: with no key configured the app uses USDA's shared
    // DEMO_KEY, whose hourly quota is usually already spent, so every search
    // 429d and the feature looked broken.
    mockFetchByHost({
      usda: () => ({ ok: false, status: 429 }),
      off: () => ({ ok: true, body: { products: [offProduct('Pizza', 266)] } }),
    });

    const results = await searchFoodsByName('pizza');

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Pizza');
    expect(results[0].macros.calories).toBe(266);
  });

  it('falls back when USDA simply has no match, not only when it errors', async () => {
    mockFetchByHost({
      usda: () => ({ ok: true, body: { foods: [] } }),
      off: () => ({ ok: true, body: { products: [offProduct('Obscure Snack', 410)] } }),
    });

    const results = await searchFoodsByName('obscure snack');

    expect(results.map((r) => r.name)).toEqual(['Obscure Snack']);
  });

  it('does not call OpenFoodFacts when USDA answers', async () => {
    const calls = mockFetchByHost({
      usda: () => ({
        ok: true,
        body: {
          foods: [
            { fdcId: 1, description: 'Banana, raw', foodNutrients: [...energyRows(89, 372)] },
          ],
        },
      }),
    });

    const results = await searchFoodsByName('banana');

    expect(results[0].name).toBe('Banana, raw');
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it('drops OpenFoodFacts products with no usable macros', async () => {
    mockFetchByHost({
      usda: () => ({ ok: false, status: 429 }),
      off: () => ({
        ok: true,
        body: {
          products: [
            { code: '1', product_name: 'Empty record', nutriments: {} },
            offProduct('Real Food', 120),
          ],
        },
      }),
    });

    const results = await searchFoodsByName('thing');

    expect(results.map((r) => r.name)).toEqual(['Real Food']);
  });

  it('reports the USDA problem, not the fallback\'s, when both fail', async () => {
    mockFetchByHost({
      usda: () => ({ ok: false, status: 429 }),
      off: () => ({ ok: false, status: 500 }),
    });

    // The rate-limit message names the actual fix; "OpenFoodFacts is down" would
    // send someone looking in the wrong place.
    await expect(searchFoodsByName('pizza')).rejects.toThrow(/out of requests/i);
  });
});

describe('searchFoodsByName — Energy unit selection', () => {
  it('reads the kcal Energy row and ignores the kJ row', async () => {
    mockFetchOnce({
      foods: [
        {
          fdcId: 1,
          description: 'Oats, rolled',
          foodNutrients: [
            ...energyRows(389, 1628),
            { nutrientName: 'Protein', unitName: 'G', value: 16.9 },
          ],
        },
      ],
    });

    const [result] = await searchFoodsByName('oats');

    expect(result.macros.calories).toBe(389);
    expect(result.isPer100g).toBe(true);
    expect(result.basisGrams).toBe(100);
  });

  it('converts the kJ row when no kcal row is present', async () => {
    mockFetchOnce({
      foods: [
        {
          fdcId: 2,
          description: 'Mystery bar',
          foodNutrients: [{ nutrientName: 'Energy', unitName: 'kJ', value: 1000 }],
        },
      ],
    });

    const [result] = await searchFoodsByName('bar');

    expect(result.macros.calories).toBe(Math.round(1000 / 4.184));
  });
});

describe('searchFoodsByName — per-serving vs per-100g basis', () => {
  it('scales per-100g nutrients down to a gram serving size', async () => {
    mockFetchOnce({
      foods: [
        {
          fdcId: 3,
          description: 'Protein powder',
          brandOwner: 'BrandCo',
          servingSize: 30,
          servingSizeUnit: 'g',
          foodNutrients: [
            ...energyRows(400, 1674),
            { nutrientName: 'Protein', unitName: 'G', value: 80 },
          ],
        },
      ],
    });

    const [result] = await searchFoodsByName('protein powder');

    expect(result.isPer100g).toBe(false);
    expect(result.basisGrams).toBe(30);
    expect(result.servingDescription).toBe('30 g serving');
    expect(result.macros.calories).toBe(120); // 400 * 30/100
    expect(result.macros.proteinGrams).toBe(24); // 80 * 30/100
  });

  it('keeps a 100g basis when the serving size is not in grams', async () => {
    mockFetchOnce({
      foods: [
        {
          fdcId: 4,
          description: 'Soda',
          servingSize: 1,
          servingSizeUnit: 'cup',
          foodNutrients: [...energyRows(40, 167)],
        },
      ],
    });

    const [result] = await searchFoodsByName('soda');

    expect(result.isPer100g).toBe(true);
    expect(result.servingDescription).toBe('per 100 g');
    expect(result.macros.calories).toBe(40);
  });

  it('drops duplicate name/brand hits', async () => {
    mockFetchOnce({
      foods: [
        { fdcId: 5, description: 'Banana, raw', foodNutrients: [...energyRows(89, 372)] },
        { fdcId: 6, description: 'Banana, raw', foodNutrients: [...energyRows(89, 372)] },
      ],
    });

    const results = await searchFoodsByName('banana');

    expect(results).toHaveLength(1);
  });
});

describe('lookupBarcode — kcal fallback', () => {
  it('converts kJ when energy-kcal_100g is missing', async () => {
    mockFetchOnce({
      status: 1,
      product: {
        product_name: 'Test cereal',
        brands: 'ACME',
        nutriments: {
          'energy_100g': 1500,
          'proteins_100g': 9,
          'carbohydrates_100g': 70,
          'fat_100g': 5,
        },
      },
    });

    const result = await lookupBarcode('0001');

    expect(result?.isPer100g).toBe(true);
    expect(result?.macros.calories).toBe(Math.round(1500 / 4.184));
    expect(result?.macros.proteinGrams).toBe(9);
  });

  it('falls back to the serving basis when no per-100g data exists', async () => {
    mockFetchOnce({
      status: 1,
      product: {
        product_name: 'Snack pack',
        serving_size: '25 g',
        serving_quantity: 25,
        nutriments: {
          'energy-kcal_serving': 130,
          'proteins_serving': 3,
        },
      },
    });

    const result = await lookupBarcode('0002');

    expect(result?.isPer100g).toBe(false);
    expect(result?.basisGrams).toBe(25);
    expect(result?.servingDescription).toBe('25 g');
    expect(result?.macros.calories).toBe(130);
  });

  it('returns null for an unknown barcode', async () => {
    mockFetchOnce({ status: 0 });
    expect(await lookupBarcode('9999')).toBeNull();
  });
});

describe('toMealAnalysis', () => {
  it('scales macros by the serving count and keeps calories consistent', () => {
    const analysis = toMealAnalysis(
      {
        id: '1',
        name: 'Grilled chicken breast',
        servingDescription: '100 g serving',
        basisGrams: 100,
        isPer100g: false,
        macros: { calories: 165, proteinGrams: 31, carbsGrams: 0, fatGrams: 4, fiberGrams: 0 },
      },
      2,
    );

    expect(analysis.macros.calories).toBe(330);
    expect(analysis.macros.proteinGrams).toBe(62);
    expect(analysis.nutrients.protein).toBe(true);
  });

  it('derives calories from macros when the source reports none', () => {
    const analysis = toMealAnalysis(
      {
        id: '2',
        name: 'Mixed plate',
        servingDescription: 'per 100 g',
        macros: { calories: 0, proteinGrams: 10, carbsGrams: 20, fatGrams: 5, fiberGrams: 1 },
      },
      1,
    );

    expect(analysis.macros.calories).toBe(10 * 4 + 20 * 4 + 5 * 9);
  });
});
