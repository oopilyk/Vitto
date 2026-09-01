import type { MealAnalysis } from '../domain/health';

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
  servingDescription: string;
  macros: FoodMacros;
}

const FDC_API_KEY = process.env.EXPO_PUBLIC_FDC_API_KEY || 'DEMO_KEY';

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

const findNutrient = (nutrients: FdcNutrient[], name: string): number =>
  nutrients.find((nutrient) => nutrient.nutrientName === name)?.value ?? 0;

const toMacrosFromFdc = (food: FdcFood): FoodMacros => ({
  calories: Math.round(findNutrient(food.foodNutrients, 'Energy')),
  proteinGrams: Math.round(findNutrient(food.foodNutrients, 'Protein')),
  carbsGrams: Math.round(findNutrient(food.foodNutrients, 'Carbohydrate, by difference')),
  fatGrams: Math.round(findNutrient(food.foodNutrients, 'Total lipid (fat)')),
  fiberGrams: Math.round(findNutrient(food.foodNutrients, 'Fiber, total dietary')),
});

export const searchFoodsByName = async (query: string): Promise<FoodSearchResult[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', FDC_API_KEY);
  url.searchParams.set('query', trimmed);
  url.searchParams.set('pageSize', '10');
  url.searchParams.set('dataType', 'Branded,Survey (FNDDS),Foundation');

  const response = await fetch(url);
  if (!response.ok) throw new Error('Food search failed. Try again in a moment.');
  const data = (await response.json()) as { foods?: FdcFood[] };

  return (data.foods ?? []).map((food) => ({
    id: String(food.fdcId),
    name: food.description,
    brand: food.brandOwner,
    servingDescription: food.servingSize
      ? `${food.servingSize}${food.servingSizeUnit ?? 'g'} serving`
      : 'per 100g',
    macros: toMacrosFromFdc(food),
  }));
};

interface OpenFoodFactsProduct {
  product_name?: string;
  brands?: string;
  serving_size?: string;
  nutriments?: Record<string, number>;
}

export const lookupBarcode = async (barcode: string): Promise<FoodSearchResult | null> => {
  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
  if (!response.ok) throw new Error('Barcode lookup failed. Try again.');
  const data = (await response.json()) as { status: number; product?: OpenFoodFactsProduct };
  if (data.status !== 1 || !data.product) return null;

  const product = data.product;
  const nutrients = product.nutriments ?? {};

  return {
    id: barcode,
    name: product.product_name || 'Unknown product',
    brand: product.brands,
    servingDescription: product.serving_size || 'per 100g',
    macros: {
      calories: Math.round(nutrients['energy-kcal_100g'] ?? 0),
      proteinGrams: Math.round(nutrients['proteins_100g'] ?? 0),
      carbsGrams: Math.round(nutrients['carbohydrates_100g'] ?? 0),
      fatGrams: Math.round(nutrients['fat_100g'] ?? 0),
      fiberGrams: Math.round(nutrients['fiber_100g'] ?? 0),
    },
  };
};

const VEGETABLE_PATTERN = /vegetable|broccoli|spinach|kale|carrot|pepper|salad|greens|cucumber|tomato/i;
const FRUIT_PATTERN = /fruit|apple|banana|berry|berries|orange|mango|grape|melon|pineapple/i;
const WHOLE_GRAIN_PATTERN = /whole grain|whole wheat|brown rice|oat|quinoa|barley/i;
const TREAT_PATTERN = /candy|cookie|cake|soda|chips|fries|dessert|ice cream|chocolate|donut/i;
const PROTEIN_GRAMS_THRESHOLD = 10;
const FIBER_GRAMS_THRESHOLD = 3;

export const toMealAnalysis = (food: FoodSearchResult, servings: number): MealAnalysis => {
  const macros = {
    calories: Math.round(food.macros.calories * servings),
    proteinGrams: Math.round(food.macros.proteinGrams * servings),
    carbsGrams: Math.round(food.macros.carbsGrams * servings),
    fatGrams: Math.round(food.macros.fatGrams * servings),
  };
  const fiberGrams = food.macros.fiberGrams * servings;

  const nutrients = {
    protein: macros.proteinGrams >= PROTEIN_GRAMS_THRESHOLD,
    vegetables: VEGETABLE_PATTERN.test(food.name),
    fruit: FRUIT_PATTERN.test(food.name),
    wholeGrains: WHOLE_GRAIN_PATTERN.test(food.name),
    fiber: fiberGrams >= FIBER_GRAMS_THRESHOLD,
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

  return {
    grade,
    summary: food.brand ? `${food.name} · ${food.brand}` : food.name,
    confidence: 1,
    detectedFoods: [food.name],
    macros,
    nutrients,
  };
};
