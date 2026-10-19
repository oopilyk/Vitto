import type { MealAnalysis } from './domain/health';
import { withEstimatedCalories } from './domain/macros';
import { getFdcApiKey, getSupabase } from './config';

export interface FoodMacros {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
  /** Only when the source reports them: a missing figure is not a zero. */
  sugarGrams?: number;
  saturatedFatGrams?: number;
  sodiumMg?: number;
}

/** The optional sub-macros, as a spread that leaves out whatever is unknown. */
const optionalSubMacros = (values: Pick<FoodMacros, 'sugarGrams' | 'saturatedFatGrams' | 'sodiumMg'>) =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => typeof value === 'number' && Number.isFinite(value))) as
    Pick<FoodMacros, 'sugarGrams' | 'saturatedFatGrams' | 'sodiumMg'>;

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
  /**
   * Set when the food came from FatSecret, whose terms require a "Powered by
   * fatsecret Platform API" link wherever its data is shown. Unset for USDA and
   * OpenFoodFacts.
   */
  source?: 'fatsecret';
}

interface FdcNutrient {
  nutrientName: string;
  unitName: string;
  value: number;
}

interface FdcFood {
  fdcId: number;
  description: string;
  dataType?: string;
  brandOwner?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients: FdcNutrient[];
}

const KJ_PER_KCAL = 4.184;
const REFERENCE_GRAMS = 100;
const GRAM_UNITS: ReadonlySet<string> = new Set(['g', 'gram', 'grams']);
/**
 * The USDA datasets to search.
 *
 * `Survey (FNDDS)` is deliberately NOT here. Asking for it makes USDA return a
 * bare nginx `400 Bad Request` for roughly half of otherwise identical requests
 * — measured at 7 failures in 8 with that value alone, and 0 in 14 without it,
 * across every encoding of the parentheses. It is their infrastructure, not the
 * request: nothing client-side makes it reliable, and while it was listed every
 * other search failed with "Food search failed. Try again in a moment."
 *
 * Losing it costs the generic "as consumed" entries, which is why results are
 * re-ranked below rather than left in USDA's own order.
 */
const FDC_DATA_TYPES = 'Foundation,SR Legacy,Branded';
const FDC_PAGE_SIZE = '25';

/**
 * Whole-food datasets first.
 *
 * The parameter above never did this — its order is a filter, not a ranking, and
 * USDA sorts purely by text relevance. So "chicken" came back as five identical
 * branded packets called CHICKEN before a single entry for the actual bird. The
 * sort is stable, so USDA's relevance ordering still decides within a dataset.
 */
const FDC_DATA_TYPE_RANK: Record<string, number> = { Foundation: 0, 'SR Legacy': 1, Branded: 2 };
const dataTypeRank = (food: FdcFood): number => FDC_DATA_TYPE_RANK[food.dataType ?? ''] ?? 1;

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
  // Sugar is named differently across FDC's datasets.
  ...optionalSubMacros({
    sugarGrams:
      findNutrient(food.foodNutrients, 'Sugars, total including NLEA') ??
      findNutrient(food.foodNutrients, 'Total Sugars') ??
      findNutrient(food.foodNutrients, 'Sugars, Total'),
    saturatedFatGrams: findNutrient(food.foodNutrients, 'Fatty acids, total saturated'),
    sodiumMg: findNutrient(food.foodNutrients, 'Sodium, Na', 'MG'),
  }),
});

const scaleMacros = (macros: FoodMacros, factor: number): FoodMacros => ({
  calories: Math.round(macros.calories * factor),
  proteinGrams: Math.round(macros.proteinGrams * factor),
  carbsGrams: Math.round(macros.carbsGrams * factor),
  fatGrams: Math.round(macros.fatGrams * factor),
  fiberGrams: Math.round(macros.fiberGrams * factor),
  ...optionalSubMacros({
    sugarGrams: macros.sugarGrams === undefined ? undefined : Math.round(macros.sugarGrams * factor),
    saturatedFatGrams: macros.saturatedFatGrams === undefined ? undefined : Math.round(macros.saturatedFatGrams * factor * 10) / 10,
    sodiumMg: macros.sodiumMg === undefined ? undefined : Math.round(macros.sodiumMg * factor),
  }),
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

interface FatSecretServing {
  serving_description?: string;
  metric_serving_amount?: string;
  metric_serving_unit?: string;
  is_default?: string;
  calories?: string;
  protein?: string;
  carbohydrate?: string;
  fat?: string;
  fiber?: string;
  sugar?: string;
  saturated_fat?: string;
  sodium?: string;
}

export interface FatSecretFood {
  food_id: string;
  food_name: string;
  brand_name?: string;
  servings?: { serving?: FatSecretServing | FatSecretServing[] };
}

/**
 * One FatSecret food as a search result, on its default serving ("1 medium",
 * "1 bar"), which is what people actually eat, rather than per 100 g. Null when
 * it carries no serving to log. Its figures are per that serving already, in
 * grams, milligrams of sodium and kcal.
 */
export const fatsecretFoodToResult = (food: FatSecretFood): FoodSearchResult | null => {
  const raw = food.servings?.serving;
  // A single serving comes back as an object, not a one-item list.
  const servings = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const serving = servings.find((entry) => entry.is_default === '1') ?? servings[0];
  if (!serving || !food.food_name) return null;

  const amount = toNumber(serving.metric_serving_amount);
  const grams = serving.metric_serving_unit === 'g' && amount !== undefined && amount > 0 ? amount : undefined;
  const label = serving.serving_description?.trim() || 'per serving';
  // "1 medium" says nothing about how much that is; the weight does.
  const servingDescription = grams && !/\d\s*g\b|gram/i.test(label) ? `${label} (${Math.round(grams)} g)` : label;
  const sodium = toNumber(serving.sodium);

  return {
    id: `fatsecret-${food.food_id}`,
    name: food.food_name,
    brand: food.brand_name || undefined,
    servingDescription,
    basisGrams: grams,
    isPer100g: grams === 100 && /^100\s?g$/i.test(label),
    macros: {
      calories: Math.round(toNumber(serving.calories) ?? 0),
      proteinGrams: Math.round(toNumber(serving.protein) ?? 0),
      carbsGrams: Math.round(toNumber(serving.carbohydrate) ?? 0),
      fatGrams: Math.round(toNumber(serving.fat) ?? 0),
      fiberGrams: Math.round(toNumber(serving.fiber) ?? 0),
      ...optionalSubMacros({
        sugarGrams: toNumber(serving.sugar),
        saturatedFatGrams: toNumber(serving.saturated_fat),
        sodiumMg: sodium === undefined ? undefined : Math.round(sodium),
      }),
    },
    source: 'fatsecret',
  };
};

/** How many FatSecret hits lead the list before USDA's. */
const FATSECRET_LEAD = 8;
const MERGED_RESULTS = 12;

/**
 * FatSecret's hits first, then USDA's. FatSecret ranks well and carries real
 * servings and the branded and restaurant foods USDA lacks; USDA's whole-food
 * entries still fill in behind, and a food both have appears once.
 */
export const mergeFoodResults = (fatsecret: readonly FatSecretFood[], usda: readonly FoodSearchResult[]): FoodSearchResult[] => {
  const fromFatsecret = fatsecret
    .map(fatsecretFoodToResult)
    .filter((result): result is FoodSearchResult => result !== null && hasMacros(result))
    .slice(0, FATSECRET_LEAD);
  return dedupeResults([...fromFatsecret, ...usda]).slice(0, MERGED_RESULTS);
};

/**
 * USDA's foods for a query, and FatSecret's, asked through our own server (the
 * `food-search` edge function) when there is one. Some networks' DNS cannot
 * resolve api.nal.usda.gov at all, so a phone asking USDA itself failed with
 * "hostname could not be found"; every phone that can use Vitto reaches
 * Supabase. FatSecret is only ever asked there: its keys live on the server.
 * Null when the server cannot answer (offline, not deployed yet), and the
 * phone asks USDA directly instead.
 */
const foodsViaServer = async (query: string, key: string): Promise<{ usda: FdcFood[]; fatsecret: FatSecretFood[] } | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke('food-search', { body: { query, key, sources: ['usda', 'fatsecret'] } });
    if (error || !data || !Array.isArray((data as { foods?: unknown }).foods)) return null;
    const reply = data as { foods: FdcFood[]; fatsecret?: unknown };
    return { usda: reply.foods, fatsecret: Array.isArray(reply.fatsecret) ? (reply.fatsecret as FatSecretFood[]) : [] };
  } catch {
    return null;
  }
};

const searchFdc = async (query: string): Promise<FoodSearchResult[]> => {
  const key = getFdcApiKey();
  const viaServer = await foodsViaServer(query, key);
  if (viaServer) return mergeFoodResults(viaServer.fatsecret, rankFdcFoods(viaServer.usda));

  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', key);
  url.searchParams.set('query', query);
  url.searchParams.set('pageSize', FDC_PAGE_SIZE);
  url.searchParams.set('dataType', FDC_DATA_TYPES);

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    // No answer at all: offline, or this network cannot look USDA's name up.
    throw new Error("Couldn't reach the food database. Check your connection and try again.");
  }
  if (response.status === 429) {
    throw new Error(
      key === DEMO_KEY
        ? 'The shared USDA food key is out of requests for now. Add a free FoodData Central key to search whole foods.'
        : 'The USDA food database is rate limiting us. Try again in a minute.',
    );
  }
  if (!response.ok) throw new Error('Food search failed. Try again in a moment.');
  const data = (await response.json()) as { foods?: FdcFood[] };
  return rankFdcFoods(data.foods ?? []);
};

/** Whole foods before branded ones, duplicates out, the top ten. */
const rankFdcFoods = (foods: FdcFood[]): FoodSearchResult[] => {
  const ranked = [...foods].sort((a, b) => dataTypeRank(a) - dataTypeRank(b));
  return dedupeResults(ranked.map(toSearchResult)).slice(0, 10);
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

  // Not from a browser. OpenFoodFacts' text search (`cgi/search.pl`) sends no
  // CORS headers, so a page can never read the response — the request fails
  // every time and leaves a CORS error in the console. Its alternatives do not
  // help: `search.openfoodfacts.org` returns hits without nutrients, and
  // `/api/v2/search` allows CORS but ignores free text. Native has no CORS and
  // keeps the fallback. (Checked against the live endpoints, 2026-09-13.)
  if (!isBrowser()) {
    try {
      const results = await searchOpenFoodFacts(trimmed);
      if (results.length > 0) return results;
    } catch {
      // Swallowed on purpose: if USDA also failed, its error names the actual
      // problem (a missing key), which is more useful than "OpenFoodFacts is down".
    }
  }

  if (usdaFailure) throw usdaFailure;
  return [];
};

/** A real browser page — react-native-web — as opposed to native or a test runner. */
const isBrowser = (): boolean =>
  typeof document !== 'undefined' && typeof (document as { createElement?: unknown }).createElement === 'function';

interface OpenFoodFactsProduct {
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string>;
}

/** Past this a "serving" is a whole tub or a typo, not something eaten at once. */
const MAX_SERVING_GRAMS = 1000;

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
  ...optionalSubMacros({
    sugarGrams: toNumber(nutriments[`sugars${basis}`]),
    saturatedFatGrams: toNumber(nutriments[`saturated-fat${basis}`]),
    // OpenFoodFacts gives sodium in grams.
    sodiumMg: ((value) => (value === undefined ? undefined : Math.round(value * 1000)))(toNumber(nutriments[`sodium${basis}`])),
  }),
});

/**
 * One OpenFoodFacts product as a search result. Shared by the barcode lookup and
 * the name search, so both report macros on the same basis: the package's own
 * serving (one bar, one bottle) whenever it says what that is, per 100 g only
 * when it does not. A scanned protein bar used to log 100 g of bar, which is
 * not one bar, at almost twice the calories on its label.
 */
const offProductToResult = (product: OpenFoodFactsProduct, id: string): FoodSearchResult => {
  const nutriments = product.nutriments ?? {};
  const name = product.product_name || 'Unknown product';
  const brand = product.brands;

  const has100g =
    offEnergyKcal(nutriments, '_100g') !== undefined ||
    toNumber(nutriments['proteins_100g']) !== undefined;
  const hasServing =
    offEnergyKcal(nutriments, '_serving') !== undefined ||
    toNumber(nutriments['proteins_serving']) !== undefined;
  const quantity = toNumber(product.serving_quantity);
  // A serving's weight, when it is a believable one in grams.
  const servingGrams = quantity !== undefined && quantity > 0 && quantity <= MAX_SERVING_GRAMS ? quantity : undefined;
  const servingLabel = product.serving_size?.trim() || (servingGrams ? `${servingGrams} g serving` : 'per serving');

  // The label's own per-serving figures, as printed.
  if (hasServing) {
    return {
      id,
      name,
      brand,
      servingDescription: servingLabel,
      basisGrams: servingGrams,
      isPer100g: false,
      macros: offMacros(nutriments, '_serving'),
    };
  }

  // Only per-100 g figures, but a known serving weight: worked out for one serving.
  if (has100g && servingGrams) {
    return {
      id,
      name,
      brand,
      servingDescription: servingLabel,
      basisGrams: servingGrams,
      isPer100g: false,
      macros: scaleMacros(offMacros(nutriments, '_100g'), servingGrams / REFERENCE_GRAMS),
    };
  }

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

/** FatSecret's food for a barcode, through our server. Null for no match or no server. */
const barcodeViaServer = async (barcode: string): Promise<FoodSearchResult | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke('food-search', { body: { barcode } });
    const food = (data as { food?: FatSecretFood | null } | null)?.food;
    if (error || !food) return null;
    const result = fatsecretFoodToResult(food);
    return result && hasMacros(result) ? result : null;
  } catch {
    return null;
  }
};

/**
 * A scanned barcode's food: FatSecret first, which knows US packaged foods
 * far better, then OpenFoodFacts, which needs no server and covers the rest
 * of the world.
 */
export const lookupBarcode = async (barcode: string): Promise<FoodSearchResult | null> => {
  const fromFatsecret = await barcodeViaServer(barcode);
  if (fromFatsecret) return fromFatsecret;
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
/**
 * What was eaten and how much, as the result card shows it: "Barebells Peanut
 * Butter · 55 g". The brand goes first so a flavour on its own ("Peanut
 * Butter") still says which product it was; the amount says what the numbers
 * under it are for.
 */
export const describePortion = (food: FoodSearchResult, servings: number): string => {
  const brand = food.brand?.split(',')[0]?.trim();
  const named = brand && !food.name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${food.name}` : food.name;
  const count = Math.round(servings * 100) / 100;
  const amount = food.isPer100g
    ? `${Math.round(servings * REFERENCE_GRAMS)} g`
    : count === 1
      ? food.servingDescription
      : `${count} × ${food.servingDescription}`;
  return `${named} · ${amount}`;
};

export const toMealAnalysis = (food: FoodSearchResult, servings: number): MealAnalysis => {
  const factor = Number.isFinite(servings) && servings > 0 ? servings : 1;
  return gradePlate([{ food, servings: factor }], scaleMacros(food.macros, factor), describePortion(food, factor), food.brand ? `${food.name} · ${food.brand}` : food.name);
};

/** One food picked for a plate, and how many of its servings. */
export interface PlateItem {
  food: FoodSearchResult;
  servings: number;
}

/**
 * Several foods logged as one meal ("chicken breast + rice + broccoli"): their
 * macros added up and the plate graded as a whole, so a vegetable on the side
 * lifts the grade of the meal it was eaten with. One food is exactly
 * `toMealAnalysis`. A sub-macro is only totalled when every food reports it: a
 * figure missing from one food is not a zero, and a total that silently left
 * it out would read low.
 */
export const toPlateAnalysis = (items: readonly PlateItem[]): MealAnalysis => {
  const plate = items
    .filter((item) => Number.isFinite(item.servings) && item.servings > 0)
    .map((item) => ({ ...item, macros: scaleMacros(item.food.macros, item.servings) }));
  if (plate.length === 0) throw new Error('A plate needs at least one food.');
  if (plate.length === 1) return toMealAnalysis(plate[0]!.food, plate[0]!.servings);

  const total = (key: keyof FoodMacros) => plate.reduce((sum, item) => sum + (item.macros[key] ?? 0), 0);
  const totalIfAll = (key: 'sugarGrams' | 'saturatedFatGrams' | 'sodiumMg') =>
    plate.every((item) => item.macros[key] !== undefined) ? total(key) : undefined;
  const macros: FoodMacros = {
    calories: total('calories'),
    proteinGrams: total('proteinGrams'),
    carbsGrams: total('carbsGrams'),
    fatGrams: total('fatGrams'),
    fiberGrams: total('fiberGrams'),
    ...optionalSubMacros({
      sugarGrams: totalIfAll('sugarGrams'),
      saturatedFatGrams: ((value) => (value === undefined ? undefined : Math.round(value * 10) / 10))(totalIfAll('saturatedFatGrams')),
      sodiumMg: totalIfAll('sodiumMg'),
    }),
  };
  return gradePlate(
    plate,
    macros,
    plate.map((item) => describePortion(item.food, item.servings)).join(' + '),
    plate.map((item) => item.food.name).join(', '),
  );
};

/** The grade, nutrient flags and analysis for a plate whose macros are already totalled. */
const gradePlate = (plate: readonly PlateItem[], scaled: FoodMacros, foodDescription: string, summary: string): MealAnalysis => {
  const names = plate.map((item) => item.food.name);
  const any = (pattern: RegExp) => names.some((name) => pattern.test(name));
  const macros = {
    calories: scaled.calories,
    proteinGrams: scaled.proteinGrams,
    carbsGrams: scaled.carbsGrams,
    fatGrams: scaled.fatGrams,
    // Kept as numbers now, not only as the yes/no fiber flag below.
    fiberGrams: scaled.fiberGrams,
    ...optionalSubMacros({ sugarGrams: scaled.sugarGrams, saturatedFatGrams: scaled.saturatedFatGrams, sodiumMg: scaled.sodiumMg }),
  };

  const nutrients = {
    protein: macros.proteinGrams >= PROTEIN_GRAMS_THRESHOLD,
    vegetables: any(VEGETABLE_PATTERN),
    fruit: any(FRUIT_PATTERN),
    wholeGrains: any(WHOLE_GRAIN_PATTERN),
    fiber: scaled.fiberGrams >= FIBER_GRAMS_THRESHOLD,
    treats: any(TREAT_PATTERN),
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
    foodDescription,
    summary,
    confidence: 1,
    detectedFoods: names,
    macros,
    nutrients,
  });
};
