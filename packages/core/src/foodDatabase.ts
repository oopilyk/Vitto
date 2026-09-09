import type { MealAnalysis } from './domain/health';
import { withEstimatedCalories } from './domain/macros';
import { getFdcApiKey } from './config';

export interface FoodMacros {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
}

export interface FoodSearchResult {
  id: string;
  name: string;
  brand?: string;
  /** Human-readable basis the `macros` values describe (e.g. "per 100 g", "30 g serving"). */
  servingDescription: string;
  /** Gram weight `macros` describes, when known. 100 for a per-100 g basis. */
  basisGrams?: number;
  /** True when `macros` are stated per 100 g rather than per labelled serving. */
  isPer100g?: boolean;
  macros: FoodMacros;
}

interface FdcNutrient {
  nutrientName: string;
  unitName: string;
  value: number;
}

interface FdcFood {
  fdcId: number;
  description: string;
  brandOwner?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients: FdcNutrient[];
}

const KJ_PER_KCAL = 4.184;
const REFERENCE_GRAMS = 100;
const GRAM_UNITS: ReadonlySet<string> = new Set(['g', 'gram', 'grams']);
/** Whole-food datasets first so a search for "apple" beats a branded apple drink. */
const FDC_DATA_TYPES = 'Foundation,SR Legacy,Survey (FNDDS),Branded';
const FDC_PAGE_SIZE = '15';

const findNutrient = (
  nutrients: FdcNutrient[],
  name: string,
  unitName?: string,
): number | undefined => {
  const match = nutrients.find(
    (nutrient) =>
      nutrient.nutrientName === name &&
      (unitName === undefined || nutrient.unitName?.toUpperCase() === unitName),
  );
  return typeof match?.value === 'number' && Number.isFinite(match.value) ? match.value : undefined;
};

const nutrientValue = (nutrients: FdcNutrient[], name: string): number =>
  findNutrient(nutrients, name) ?? 0;

/**
 * FDC returns an "Energy" row in BOTH kcal and kJ; reading the kJ row without
 * checking `unitName` inflates calories by ~4.2x. Prefer kcal, converting kJ only
 * when that is all the record carries.
 */
const energyKcalFromFdc = (nutrients: FdcNutrient[]): number => {
  const kcal =
    findNutrient(nutrients, 'Energy', 'KCAL') ??
    findNutrient(nutrients, 'Energy (Atwater General Factors)', 'KCAL') ??
    findNutrient(nutrients, 'Energy (Atwater Specific Factors)', 'KCAL');
  if (typeof kcal === 'number') return kcal;

  const kilojoules = findNutrient(nutrients, 'Energy', 'KJ');
  return typeof kilojoules === 'number' ? kilojoules / KJ_PER_KCAL : 0;
};

/** FDC search always reports `foodNutrients` per 100 g, across every data type. */
const per100gMacrosFromFdc = (food: FdcFood): FoodMacros => ({
  calories: energyKcalFromFdc(food.foodNutrients),
  proteinGrams: nutrientValue(food.foodNutrients, 'Protein'),
  carbsGrams: nutrientValue(food.foodNutrients, 'Carbohydrate, by difference'),
  fatGrams: nutrientValue(food.foodNutrients, 'Total lipid (fat)'),
  fiberGrams: nutrientValue(food.foodNutrients, 'Fiber, total dietary'),
});

const scaleMacros = (macros: FoodMacros, factor: number): FoodMacros => ({
  calories: Math.round(macros.calories * factor),
  proteinGrams: Math.round(macros.proteinGrams * factor),
  carbsGrams: Math.round(macros.carbsGrams * factor),
  fatGrams: Math.round(macros.fatGrams * factor),
  fiberGrams: Math.round(macros.fiberGrams * factor),
});

const gramServingSize = (food: FdcFood): number | undefined => {
  const unit = (food.servingSizeUnit ?? 'g').toLowerCase();
  return typeof food.servingSize === 'number' && food.servingSize > 0 && GRAM_UNITS.has(unit)
    ? food.servingSize
    : undefined;
};

const toSearchResult = (food: FdcFood): FoodSearchResult => {
  const per100g = per100gMacrosFromFdc(food);
  const servingGrams = gramServingSize(food);

  if (servingGrams) {
    return {
      id: String(food.fdcId),
      name: food.description,
      brand: food.brandOwner,
      servingDescription: `${servingGrams} g serving`,
      basisGrams: servingGrams,
      isPer100g: false,
      macros: scaleMacros(per100g, servingGrams / REFERENCE_GRAMS),
    };
  }

  return {
    id: String(food.fdcId),
    name: food.description,
    brand: food.brandOwner,
    servingDescription: 'per 100 g',
    basisGrams: REFERENCE_GRAMS,
    isPer100g: true,
    macros: scaleMacros(per100g, 1),
  };
};

const dedupeResults = (results: FoodSearchResult[]): FoodSearchResult[] => {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.name.toLowerCase()}|${result.brand?.toLowerCase() ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * USDA's shared demo key. It works without signing up, which is why it is the
 * default, but it is capped at roughly 30 requests an hour PER IP across every
 * app on the internet using it — so it is usually already exhausted, and a user
 * who has never searched before still gets a 429.
 */
const DEMO_KEY = 'DEMO_KEY';

const searchFdc = async (query: string): Promise<FoodSearchResult[]> => {
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  const key = getFdcApiKey();
  url.searchParams.set('api_key', key);
  url.searchParams.set('query', query);
  url.searchParams.set('pageSize', FDC_PAGE_SIZE);
  url.searchParams.set('dataType', FDC_DATA_TYPES);

  const response = await fetch(url);
  if (response.status === 429) {
    throw new Error(
      key === DEMO_KEY
        ? 'The shared USDA food key is out of requests for now. Add a free FoodData Central key to search whole foods.'
        : 'The USDA food database is rate limiting us. Try again in a minute.',
    );
  }
  if (!response.ok) throw new Error('Food search failed. Try again in a moment.');
  const data = (await response.json()) as { foods?: FdcFood[] };

  return dedupeResults((data.foods ?? []).map(toSearchResult)).slice(0, 10);
};

/**
 * Looks a food up by name, USDA first and OpenFoodFacts second.
 *
 * The fallback is what makes search work at all out of the box: USDA needs an
 * API key, and without one the app falls back to `DEMO_KEY`, whose shared hourly
 * quota is typically already spent — so every search 429s and the feature looks
 * broken. OpenFoodFacts needs no key and no signup, so it answers whenever USDA
 * cannot, and also when USDA simply has no match (it carries branded and
 * supermarket items USDA's whole-food datasets do not).
 *
 * USDA stays first because its Foundation and SR Legacy datasets have far better
 * data for unbranded whole foods — "chicken breast", "banana" — which is most of
 * what someone types in.
 */
export const searchFoodsByName = async (query: string): Promise<FoodSearchResult[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];

  let usdaFailure: unknown;
  try {
    const results = await searchFdc(trimmed);
    if (results.length > 0) return results;
  } catch (cause) {
    usdaFailure = cause;
  }

  try {
    const results = await searchOpenFoodFacts(trimmed);
    if (results.length > 0) return results;
  } catch {
    // Swallowed on purpose: if USDA also failed, its error names the actual
    // problem (a missing key), which is more useful than "OpenFoodFacts is down".
  }

  if (usdaFailure) throw usdaFailure;
  return [];
};

interface OpenFoodFactsProduct {
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string>;
}

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

/**
 * OpenFoodFacts frequently omits `energy-kcal_<basis>` while still carrying the
 * kJ figure, so fall back to converting kJ rather than reporting 0 calories.
 */
const offEnergyKcal = (
  nutriments: Record<string, number | string>,
  basis: '_100g' | '_serving' | '',
): number | undefined => {
  const kcal = toNumber(nutriments[`energy-kcal${basis}`]);
  if (typeof kcal === 'number') return kcal;

  const kilojoules =
    toNumber(nutriments[`energy-kj${basis}`]) ?? toNumber(nutriments[`energy${basis}`]);
  return typeof kilojoules === 'number' ? kilojoules / KJ_PER_KCAL : undefined;
};

const offMacros = (
  nutriments: Record<string, number | string>,
  basis: '_100g' | '_serving',
): FoodMacros => ({
  calories: Math.round(offEnergyKcal(nutriments, basis) ?? offEnergyKcal(nutriments, '') ?? 0),
  proteinGrams: Math.round(toNumber(nutriments[`proteins${basis}`]) ?? 0),
  carbsGrams: Math.round(toNumber(nutriments[`carbohydrates${basis}`]) ?? 0),
  fatGrams: Math.round(toNumber(nutriments[`fat${basis}`]) ?? 0),
  fiberGrams: Math.round(toNumber(nutriments[`fiber${basis}`]) ?? 0),
});

/**
 * One OpenFoodFacts product as a search result. Shared by the barcode lookup and
 * the name search, so both report macros on the same basis — a labelled serving
 * when the product has one, per 100 g otherwise.
 */
const offProductToResult = (product: OpenFoodFactsProduct, id: string): FoodSearchResult => {
  const nutriments = product.nutriments ?? {};
  const name = product.product_name || 'Unknown product';
  const brand = product.brands;

  const has100g =
    offEnergyKcal(nutriments, '_100g') !== undefined ||
    toNumber(nutriments['proteins_100g']) !== undefined;

  if (has100g) {
    return {
      id,
      name,
      brand,
      servingDescription: 'per 100 g',
      basisGrams: REFERENCE_GRAMS,
      isPer100g: true,
      macros: offMacros(nutriments, '_100g'),
    };
  }

  return {
    id,
    name,
    brand,
    servingDescription: product.serving_size || 'per serving',
    basisGrams: toNumber(product.serving_quantity),
    isPer100g: false,
    macros: offMacros(nutriments, '_serving'),
  };
};

/** Products with no usable energy figure at all — they would log as 0 calories. */
const hasMacros = (result: FoodSearchResult): boolean =>
  result.macros.calories > 0 || result.macros.proteinGrams > 0 || result.macros.carbsGrams > 0;

/**
 * OpenFoodFacts full-text search. No key and no signup, which is why this is the
 * fallback when USDA is unavailable.
 *
 * `fields` is set so the response carries only what `offProductToResult` reads:
 * the default payload is enormous (hundreds of fields per product), and on a
 * phone that is the difference between a search feeling instant and feeling
 * broken.
 */
const searchOpenFoodFacts = async (query: string): Promise<FoodSearchResult[]> => {
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  url.searchParams.set('search_terms', query);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '20');
  url.searchParams.set('fields', 'code,product_name,brands,serving_size,serving_quantity,nutriments');

  const response = await fetch(url);
  if (!response.ok) throw new Error('Food search failed. Try again in a moment.');
  const data = (await response.json()) as { products?: (OpenFoodFactsProduct & { code?: string })[] };

  const results = (data.products ?? [])
    .filter((product) => Boolean(product.product_name))
    .map((product, index) => offProductToResult(product, product.code ?? `off-${index}`))
    .filter(hasMacros);

  return dedupeResults(results).slice(0, 10);
};

export const lookupBarcode = async (barcode: string): Promise<FoodSearchResult | null> => {
  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
  if (!response.ok) throw new Error('Barcode lookup failed. Try again.');
  const data = (await response.json()) as { status: number; product?: OpenFoodFactsProduct };
  if (data.status !== 1 || !data.product) return null;

  return offProductToResult(data.product, barcode);
};

const VEGETABLE_PATTERN = /vegetable|broccoli|spinach|kale|carrot|pepper|salad|greens|cucumber|tomato/i;
const FRUIT_PATTERN = /fruit|apple|banana|berry|berries|orange|mango|grape|melon|pineapple/i;
const WHOLE_GRAIN_PATTERN = /whole grain|whole wheat|brown rice|oat|quinoa|barley/i;
const TREAT_PATTERN = /candy|cookie|cake|soda|chips|fries|dessert|ice cream|chocolate|donut/i;
const PROTEIN_GRAMS_THRESHOLD = 10;
const FIBER_GRAMS_THRESHOLD = 3;

/**
 * Turns one search/barcode hit into a `MealAnalysis` for `servings` of the
 * result's stated basis (a labelled serving, or a 100 g portion). Because every
 * `FoodSearchResult` now carries macros that match its `servingDescription`,
 * multiplying by the serving count is consistent across all three log paths.
 */
export const toMealAnalysis = (food: FoodSearchResult, servings: number): MealAnalysis => {
  const factor = Number.isFinite(servings) && servings > 0 ? servings : 1;
  const scaled = scaleMacros(food.macros, factor);
  const macros = {
    calories: scaled.calories,
    proteinGrams: scaled.proteinGrams,
    carbsGrams: scaled.carbsGrams,
    fatGrams: scaled.fatGrams,
  };

  const nutrients = {
    protein: macros.proteinGrams >= PROTEIN_GRAMS_THRESHOLD,
    vegetables: VEGETABLE_PATTERN.test(food.name),
    fruit: FRUIT_PATTERN.test(food.name),
    wholeGrains: WHOLE_GRAIN_PATTERN.test(food.name),
    fiber: scaled.fiberGrams >= FIBER_GRAMS_THRESHOLD,
    treats: TREAT_PATTERN.test(food.name),
  };

  const positiveCount = [
    nutrients.protein,
    nutrients.vegetables,
    nutrients.fruit,
    nutrients.wholeGrains,
    nutrients.fiber,
  ].filter(Boolean).length;

  const grade: MealAnalysis['grade'] =
    positiveCount >= 3 ? 'A' : positiveCount === 2 ? 'B' : positiveCount === 1 ? 'C' : 'D';

  return withEstimatedCalories({
    grade,
    summary: food.brand ? `${food.name} · ${food.brand}` : food.name,
    confidence: 1,
    detectedFoods: [food.name],
    macros,
    nutrients,
  });
};
