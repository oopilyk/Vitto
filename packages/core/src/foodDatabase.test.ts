import { afterEach, describe, expect, it, vi } from 'vitest';
import { describePortion, fatsecretFoodToResult, lookupBarcode, searchFoodsByName, toMealAnalysis, toPlateAnalysis } from './foodDatabase';
import { configureCore } from './config';

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

  it('does not try OpenFoodFacts from a browser, where CORS makes it fail every time', async () => {
    const calls = mockFetchByHost({
      usda: () => ({ ok: false, status: 429 }),
      off: () => ({ ok: true, body: { products: [offProduct('Never asked', 100)] } }),
    });
    // The shape react-native-web runs in: a document with createElement.
    vi.stubGlobal('document', { createElement: () => ({}) });
    try {
      await expect(searchFoodsByName('pizza')).rejects.toThrow(/out of requests/i);
      // One request: USDA. OpenFoodFacts was never contacted.
      expect(calls).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
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

describe('searchFoodsByName — the USDA request', () => {
  const fdcFood = (fdcId: number, description: string, dataType: string) => ({
    fdcId, description, dataType, foodNutrients: energyRows(100, 418),
  });

  it('never asks for Survey (FNDDS), which USDA 400s on about half the time', async () => {
    // Measured: 7 failures in 8 requests with that value, 0 in 14 without it,
    // across every encoding of its parentheses. While it was listed, every other
    // search died with "Food search failed. Try again in a moment."
    const calls = mockFetchByHost({ usda: () => ({ ok: true, body: { foods: [] } }) });
    await searchFoodsByName('chicken');
    // `+` for the space, which is how URLSearchParams encodes it.
    const url = decodeURIComponent(String(calls.mock.calls[0]![0])).replace(/\+/g, ' ');
    expect(url).not.toContain('FNDDS');
    expect(url).toContain('dataType=Foundation,SR Legacy,Branded');
  });

  it('puts whole foods above branded packets, whatever order USDA returns them in', async () => {
    // USDA ranks on text relevance alone, so "chicken" came back as a wall of
    // identical branded packets called CHICKEN before the actual bird.
    mockFetchByHost({
      usda: () => ({
        ok: true,
        body: {
          foods: [
            fdcFood(1, 'CHICKEN', 'Branded'),
            fdcFood(2, 'Chicken, broilers, breast, roasted', 'SR Legacy'),
            fdcFood(3, 'CHICKEN BITES', 'Branded'),
            fdcFood(4, 'Chicken, breast, raw', 'Foundation'),
          ],
        },
      }),
    });

    const results = await searchFoodsByName('chicken');
    expect(results.map((result) => result.name)).toEqual([
      'Chicken, breast, raw',
      'Chicken, broilers, breast, roasted',
      'CHICKEN',
      'CHICKEN BITES',
    ]);
  });

  it('keeps USDA\'s own relevance order within one dataset', async () => {
    mockFetchByHost({
      usda: () => ({
        ok: true,
        body: {
          foods: [
            fdcFood(1, 'Chicken, first', 'SR Legacy'),
            fdcFood(2, 'Chicken, second', 'SR Legacy'),
            fdcFood(3, 'Chicken, third', 'SR Legacy'),
          ],
        },
      }),
    });
    expect((await searchFoodsByName('chicken')).map((r) => r.name)).toEqual([
      'Chicken, first', 'Chicken, second', 'Chicken, third',
    ]);
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

describe('sub-macros', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads fiber, sugar, saturated fat and sodium from USDA, and keeps them on the meal', async () => {
    mockFetchOnce({
      foods: [
        {
          fdcId: 9,
          description: 'Granola bar',
          foodNutrients: [
            ...energyRows(450, 1883),
            { nutrientName: 'Carbohydrate, by difference', unitName: 'G', value: 64 },
            { nutrientName: 'Total lipid (fat)', unitName: 'G', value: 18 },
            { nutrientName: 'Fiber, total dietary', unitName: 'G', value: 5 },
            { nutrientName: 'Sugars, total including NLEA', unitName: 'G', value: 28 },
            { nutrientName: 'Fatty acids, total saturated', unitName: 'G', value: 2.4 },
            { nutrientName: 'Sodium, Na', unitName: 'MG', value: 300 },
          ],
        },
      ],
    });
    const [bar] = await searchFoodsByName('granola');
    expect(bar.macros).toMatchObject({ fiberGrams: 5, sugarGrams: 28, saturatedFatGrams: 2.4, sodiumMg: 300 });
    // Saved as numbers now, not only as the yes/no fiber flag; two servings, doubled.
    expect(toMealAnalysis(bar, 2).macros).toMatchObject({ fiberGrams: 10, sugarGrams: 56, saturatedFatGrams: 4.8, sodiumMg: 600 });
  });

  it('reads them from OpenFoodFacts, with sodium turned from grams into mg', async () => {
    mockFetchOnce({
      status: 1,
      product: {
        product_name: 'Crackers',
        nutriments: {
          'energy-kcal_100g': 420, 'proteins_100g': 9, 'carbohydrates_100g': 70, 'fat_100g': 11,
          'fiber_100g': 3, 'sugars_100g': 4, 'saturated-fat_100g': 1.5, 'sodium_100g': 0.8,
        },
      },
    });
    const crackers = await lookupBarcode('0002');
    expect(crackers?.macros).toMatchObject({ fiberGrams: 3, sugarGrams: 4, saturatedFatGrams: 1.5, sodiumMg: 800 });
  });

  it('leaves out a sub-macro the source never reported, rather than calling it zero', async () => {
    mockFetchOnce({
      foods: [{ fdcId: 2, description: 'Apple', foodNutrients: [...energyRows(52, 218)] }],
    });
    const [apple] = await searchFoodsByName('apple');
    expect(apple.macros.sugarGrams).toBeUndefined();
    expect(toMealAnalysis(apple, 1).macros).not.toHaveProperty('sodiumMg');
  });
});

describe('searchFoodsByName — through our own server', () => {
  const usdaFood = {
    fdcId: 1,
    description: 'Chicken breast, roasted',
    dataType: 'SR Legacy',
    foodNutrients: [{ nutrientName: 'Energy', unitName: 'KCAL', value: 165 }],
  };
  const withServer = (invoke: (name: string, options: unknown) => Promise<unknown>) =>
    configureCore({ supabase: { functions: { invoke } } as never });
  afterEach(() => configureCore({ supabase: null }));

  it('asks the food-search function, and never USDA from the phone, when it answers', async () => {
    const invoke = vi.fn(async () => ({ data: { foods: [usdaFood] }, error: null }));
    withServer(invoke);
    const direct = vi.fn();
    vi.stubGlobal('fetch', direct as unknown as typeof fetch);

    const results = await searchFoodsByName('chicken breast');
    expect(invoke).toHaveBeenCalledWith('food-search', { body: { query: 'chicken breast', key: expect.any(String), sources: ['usda', 'fatsecret'] } });
    expect(direct).not.toHaveBeenCalled();
    expect(results[0]?.name).toContain('Chicken breast');
  });

  it('asks USDA directly when the server cannot answer', async () => {
    withServer(async () => ({ data: null, error: new Error('not deployed') }));
    const direct = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ foods: [usdaFood] }) }));
    vi.stubGlobal('fetch', direct as unknown as typeof fetch);

    const results = await searchFoodsByName('chicken breast');
    expect(direct).toHaveBeenCalled();
    expect(results[0]?.name).toContain('Chicken breast');
  });

  it("leads with FatSecret's hits on their own serving, then USDA's, tagged for attribution", async () => {
    const fatsecret = [{
      food_id: '35755', food_name: 'Banana',
      servings: { serving: [
        { serving_description: '100 g', metric_serving_amount: '100.000', metric_serving_unit: 'g', calories: '89', protein: '1.09', carbohydrate: '22.84', fat: '0.33', fiber: '2.6', sugar: '12.23', sodium: '1' },
        { serving_description: '1 medium', metric_serving_amount: '118.000', metric_serving_unit: 'g', is_default: '1', calories: '105', protein: '1.29', carbohydrate: '26.95', fat: '0.39', fiber: '3.1', sugar: '14.43', sodium: '1' },
      ] },
    }];
    withServer(vi.fn(async () => ({ data: { foods: [usdaFood], fatsecret }, error: null })));
    vi.stubGlobal('fetch', vi.fn() as unknown as typeof fetch);

    const results = await searchFoodsByName('banana');
    expect(results[0]).toMatchObject({
      id: 'fatsecret-35755', name: 'Banana', servingDescription: '1 medium (118 g)', basisGrams: 118, isPer100g: false,
      macros: { calories: 105, proteinGrams: 1, carbsGrams: 27, sugarGrams: 14.43, sodiumMg: 1 }, source: 'fatsecret',
    });
    expect(results[1]?.name).toContain('Chicken breast');
    expect(results[1]?.source).toBeUndefined();
  });

  it('reads a lone FatSecret serving sent as an object, and drops a food with none', () => {
    expect(fatsecretFoodToResult({ food_id: '1', food_name: 'Bar', brand_name: 'Acme',
      servings: { serving: { serving_description: '1 bar', calories: '200', protein: '20' } } }))
      .toMatchObject({ name: 'Bar', brand: 'Acme', servingDescription: '1 bar', macros: { calories: 200, proteinGrams: 20 } });
    expect(fatsecretFoodToResult({ food_id: '2', food_name: 'Empty' })).toBeNull();
  });

  it('looks a barcode up on FatSecret first, and falls back to OpenFoodFacts', async () => {
    const invoke = vi.fn(async () => ({ data: { food: { food_id: '9', food_name: 'Protein Bar',
      servings: { serving: { serving_description: '1 bar', metric_serving_amount: '55', metric_serving_unit: 'g', calories: '210', protein: '20' } } } }, error: null }));
    withServer(invoke);
    const off = vi.fn();
    vi.stubGlobal('fetch', off as unknown as typeof fetch);
    expect(await lookupBarcode('012345678905')).toMatchObject({ name: 'Protein Bar', source: 'fatsecret', macros: { calories: 210 } });
    expect(invoke).toHaveBeenCalledWith('food-search', { body: { barcode: '012345678905' } });
    expect(off).not.toHaveBeenCalled();

    withServer(vi.fn(async () => ({ data: { food: null }, error: null })));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 1, product: { product_name: 'Oat Bar', nutriments: { 'energy-kcal_100g': 400 } } }) })) as unknown as typeof fetch);
    expect(await lookupBarcode('012345678905')).toMatchObject({ name: 'Oat Bar' });
  });

  it('says to check the connection, in words, when nothing can be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed: A server with the specified hostname could not be found.');
    }) as unknown as typeof fetch);
    await expect(searchFoodsByName('popeyes chicken')).rejects.toThrow("Couldn't reach the food database");
  });
});

describe('lookupBarcode — one serving, the way the package counts it', () => {
  const scan = (product: Record<string, unknown>) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 1, product }) })) as unknown as typeof fetch);
    return lookupBarcode('0123456789012');
  };

  it("uses the label's per-serving figures over per-100 g (a bar, not 100 g of bar)", async () => {
    const result = await scan({
      product_name: 'Peanut Butter',
      brands: 'Barebells,Barebells Functional Foods',
      serving_size: '1 bar (55 g)',
      serving_quantity: 55,
      nutriments: { 'energy-kcal_100g': 382, proteins_100g: 36, 'energy-kcal_serving': 210, proteins_serving: 20 },
    });
    expect(result?.servingDescription).toBe('1 bar (55 g)');
    expect(result?.isPer100g).toBe(false);
    expect(result?.macros.calories).toBe(210);
    expect(result?.macros.proteinGrams).toBe(20);
  });

  it('works out one serving from per-100 g figures when only the serving weight is given', async () => {
    const result = await scan({
      product_name: 'Peanut Butter',
      serving_quantity: '55',
      nutriments: { 'energy-kcal_100g': 382, proteins_100g: 36 },
    });
    expect(result?.servingDescription).toBe('55 g serving');
    expect(result?.macros.calories).toBe(Math.round(382 * 0.55));
  });

  it('stays per 100 g when the package gives no serving', async () => {
    const result = await scan({ product_name: 'Peanut Butter', nutriments: { 'energy-kcal_100g': 382, proteins_100g: 36 } });
    expect(result?.servingDescription).toBe('per 100 g');
    expect(result?.isPer100g).toBe(true);
  });

  it('ignores a serving weight no one eats at once', async () => {
    const result = await scan({ product_name: 'Peanut Butter', serving_quantity: 5000, nutriments: { 'energy-kcal_100g': 382, proteins_100g: 36 } });
    expect(result?.isPer100g).toBe(true);
  });
});

describe('describePortion', () => {
  const bar = { id: '1', name: 'Peanut Butter', brand: 'Barebells,Other', servingDescription: '1 bar (55 g)', isPer100g: false, macros: { calories: 210, proteinGrams: 20, carbsGrams: 18, fatGrams: 8, fiberGrams: 2 } };
  it('names the brand first and the amount the numbers are for', () => {
    expect(describePortion(bar, 1)).toBe('Barebells Peanut Butter · 1 bar (55 g)');
    expect(describePortion(bar, 2)).toBe('Barebells Peanut Butter · 2 × 1 bar (55 g)');
    expect(describePortion({ ...bar, brand: undefined, isPer100g: true, servingDescription: 'per 100 g' }, 1.5)).toBe('Peanut Butter · 150 g');
  });
  it('does not repeat a brand already in the name', () => {
    expect(describePortion({ ...bar, name: 'Barebells Peanut Butter Bar' }, 1)).toBe('Barebells Peanut Butter Bar · 1 bar (55 g)');
  });
});

describe('toPlateAnalysis — several foods as one meal', () => {
  const chicken = { id: 'c', name: 'Chicken Breast', servingDescription: '4 oz (112 g)', basisGrams: 112,
    macros: { calories: 120, proteinGrams: 26, carbsGrams: 0, fatGrams: 2, fiberGrams: 0, sodiumMg: 60 } };
  const broccoli = { id: 'b', name: 'Broccoli', servingDescription: '1 cup (91 g)', basisGrams: 91,
    macros: { calories: 31, proteinGrams: 3, carbsGrams: 6, fatGrams: 0, fiberGrams: 2, sodiumMg: 30 } };
  const rice = { id: 'r', name: 'Brown Rice', servingDescription: '1 cup (195 g)', basisGrams: 195,
    macros: { calories: 216, proteinGrams: 5, carbsGrams: 45, fatGrams: 2, fiberGrams: 4 } };

  it('adds the macros up, servings included, and grades the plate as a whole', () => {
    const plate = toPlateAnalysis([{ food: chicken, servings: 2 }, { food: broccoli, servings: 1 }, { food: rice, servings: 1 }]);
    expect(plate.macros).toMatchObject({ calories: 487, proteinGrams: 60, carbsGrams: 51, fatGrams: 6, fiberGrams: 6 });
    // Rice has no sodium figure, so there is no total to claim.
    expect(plate.macros.sodiumMg).toBeUndefined();
    expect(plate.detectedFoods).toEqual(['Chicken Breast', 'Broccoli', 'Brown Rice']);
    expect(plate.foodDescription).toBe('Chicken Breast · 2 × 4 oz (112 g) + Broccoli · 1 cup (91 g) + Brown Rice · 1 cup (195 g)');
    // Protein, a vegetable, a whole grain and fiber: the side dishes lift the meal.
    expect(plate.grade).toBe('A');
    expect(toMealAnalysis(chicken, 2).grade).toBe('C');
  });

  it('is exactly toMealAnalysis for one food, and refuses an empty plate', () => {
    expect(toPlateAnalysis([{ food: chicken, servings: 1.5 }])).toEqual(toMealAnalysis(chicken, 1.5));
    expect(() => toPlateAnalysis([])).toThrow();
  });
});
