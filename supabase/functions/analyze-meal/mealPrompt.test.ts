import { assertEquals } from 'jsr:@std/assert@1';
import { totalMeal, type MealItem } from './mealPrompt.ts';

const item = (name: string, grams: number, per100g: Partial<MealItem['per100g']>, portion = ''): MealItem => ({
  name,
  portion,
  grams,
  per100g: {
    calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0,
    fiberGrams: 0, sugarGrams: 0, saturatedFatGrams: 0, sodiumMg: 0,
    ...per100g,
  },
});

Deno.test('adds up the plate from grams and per-100 g values', () => {
  const meal = totalMeal([
    item('grilled chicken breast', 150, { calories: 165, proteinGrams: 31, fatGrams: 3.6, sodiumMg: 74 }, '1 breast'),
    item('white rice, cooked', 200, { calories: 130, proteinGrams: 2.7, carbsGrams: 28, fiberGrams: 0.4, fatGrams: 0.3 }, '1 cup'),
  ]);
  assertEquals(meal.macros.calories, 508); // 247.5 + 260
  assertEquals(meal.macros.proteinGrams, 52); // 46.5 + 5.4
  assertEquals(meal.macros.carbsGrams, 56);
  assertEquals(meal.detectedFoods, ['grilled chicken breast', 'white rice, cooked']);
  assertEquals(meal.foodDescription, 'grilled chicken breast (1 breast, ~150 g), white rice, cooked (1 cup, ~200 g)');
});

Deno.test('takes calories from the macros when the stated figure is far off or missing', () => {
  // 4*10 + 4*20 + 9*10 = 210 per 100 g; "50" is a misread.
  assertEquals(totalMeal([item('pasta bake', 100, { calories: 50, proteinGrams: 10, carbsGrams: 20, fatGrams: 10 })]).macros.calories, 210);
  assertEquals(totalMeal([item('pasta bake', 100, { proteinGrams: 10, carbsGrams: 20, fatGrams: 10 })]).macros.calories, 210);
  // Close enough: the stated figure stands (alcohol, rounding).
  assertEquals(totalMeal([item('pasta bake', 100, { calories: 230, proteinGrams: 10, carbsGrams: 20, fatGrams: 10 })]).macros.calories, 230);
});

Deno.test('keeps parts within their whole, and drops or clamps nonsense', () => {
  const meal = totalMeal([
    item('cookie', 100, { calories: 480, carbsGrams: 60, sugarGrams: 90, fatGrams: 24, saturatedFatGrams: 40, proteinGrams: 5 }),
    item('', 100, { calories: 300 }),
    item('air', 0, { calories: 300 }),
    item('mystery', 99_999, { calories: 5000 }),
  ]);
  assertEquals(meal.macros.sugarGrams, 60);
  assertEquals(meal.macros.saturatedFatGrams, 24);
  assertEquals(meal.detectedFoods, ['cookie', 'mystery']);
  // 3 kg at most, 900 kcal per 100 g at most.
  assertEquals(meal.macros.calories, 480 + 27_000);
});

Deno.test('lets a near-zero drink keep its own calories', () => {
  assertEquals(totalMeal([item('black coffee', 240, { calories: 1, proteinGrams: 0.1 })]).macros.calories, 2);
});
