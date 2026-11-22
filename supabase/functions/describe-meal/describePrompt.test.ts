import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { candidatesFor, fatsecretCandidate, picksUserText, readItems, resolvePicks, usdaCandidate } from './describePrompt.ts';

const egg = {
  food_id: '1',
  food_name: 'Egg',
  servings: { serving: [
    { serving_description: '100 g', metric_serving_amount: '100.000', metric_serving_unit: 'g', calories: '147' },
    { serving_description: '1 large', metric_serving_amount: '50.000', metric_serving_unit: 'g', calories: '74', is_default: '1' },
  ] },
};
const rice = {
  fdcId: 2,
  description: 'Rice, white, cooked',
  foodNutrients: [
    { nutrientName: 'Energy', unitName: 'kJ', value: 544 },
    { nutrientName: 'Energy', unitName: 'KCAL', value: 130 },
  ],
};

Deno.test('step 1 is bounded before anything is searched', () => {
  const items = readItems({
    items: [
      { said: ' 2  eggs ', query: 'egg', statedGrams: 0, estimatedGrams: 100 },
      { said: '', query: 'x'.repeat(200), statedGrams: -5, estimatedGrams: 1e9 },
      { said: 'nothing', query: '   ' },
      'junk',
      ...Array.from({ length: 20 }, () => ({ said: 'rice', query: 'rice', statedGrams: 150, estimatedGrams: 150 })),
    ],
  });
  assertEquals(items.length, 8);
  assertEquals(items[0], { said: '2 eggs', query: 'egg', statedGrams: 0, estimatedGrams: 100 });
  assertEquals(items[1]!.query.length, 60);
  assertEquals(items[1]!.said, items[1]!.query);
  assertEquals([items[1]!.statedGrams, items[1]!.estimatedGrams], [0, 5000]);
  assertEquals(readItems(null), []);
});

Deno.test('a candidate describes the serving the app will log', () => {
  // FatSecret: the default serving, with its weight.
  const fromFatsecret = fatsecretCandidate(egg)!;
  assertEquals([fromFatsecret.name, fromFatsecret.serving, fromFatsecret.basisGrams, fromFatsecret.calories], ['Egg', '1 large (50 g)', 50, 74]);
  assertEquals(fatsecretCandidate({ food_name: 'No servings' }), null);
  // USDA: per 100 g, kcal not kJ.
  const fromUsda = usdaCandidate(rice)!;
  assertEquals([fromUsda.serving, fromUsda.basisGrams, fromUsda.calories], ['100 g', 100, 130]);
  // ...unless it carries a serving size in grams.
  assertEquals(usdaCandidate({ ...rice, servingSize: 50, servingSizeUnit: 'g' })!.calories, 65);
});

Deno.test('the model is shown each food with ids of its own', () => {
  const items = readItems({ items: [{ said: '2 eggs', query: 'egg', statedGrams: 0, estimatedGrams: 100 }, { said: '150g rice', query: 'white rice', statedGrams: 150, estimatedGrams: 150 }, { said: 'grandma stew', query: 'stew', statedGrams: 0, estimatedGrams: 0 }] });
  const candidates = [candidatesFor(0, [egg], []), candidatesFor(1, [], [rice]), candidatesFor(2, [], [])];
  const text = picksUserText(items, candidates);
  assertStringIncludes(text, '1. "2 eggs" (about 100 g)\n   1a | Egg | 1 large (50 g) | 74 kcal');
  assertStringIncludes(text, '2. "150g rice" (they said 150 g)\n   2a | Rice, white, cooked | 100 g | 130 kcal');
  assertStringIncludes(text, '3. "grandma stew" (amount unknown)\n   (no database entries found)');
});

Deno.test('picks are checked against what was shown', () => {
  const items = readItems({ items: [
    { said: '2 eggs', query: 'egg', statedGrams: 0, estimatedGrams: 100 },
    { said: '150g rice', query: 'white rice', statedGrams: 150, estimatedGrams: 150 },
    { said: 'grandma stew', query: 'stew', statedGrams: 0, estimatedGrams: 300 },
    { said: 'mystery', query: 'mystery', statedGrams: 0, estimatedGrams: 0 },
    { said: 'a lot of eggs', query: 'egg', statedGrams: 0, estimatedGrams: 0 },
  ] });
  const candidates = [candidatesFor(0, [egg], []), candidatesFor(1, [], [rice]), candidatesFor(2, [], []), candidatesFor(3, [], []), candidatesFor(4, [egg], [])];
  const zero = { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0, fiberGrams: 0 };
  const { items: described, missed } = resolvePicks(items, candidates, { picks: [
    { item: 1, candidate: '1A', measure: 'count', count: 2, estimate: zero },
    // A stated weight is divided out here, whatever the model said.
    { item: 2, candidate: '2a', measure: 'count', count: 9, estimate: zero },
    // Another item's id is not a candidate of this one: its estimate is used.
    { item: 3, candidate: '1a', measure: 'count', count: 1, estimate: { calories: 420.4, proteinGrams: 30.26, carbsGrams: 25, fatGrams: 20, fiberGrams: 4 } },
    { item: 4, candidate: 'none', measure: 'weight', count: 0, estimate: zero },
    { item: 5, candidate: '5a', measure: 'count', count: 4000, estimate: zero },
  ] });
  assertEquals(described[0], { said: '2 eggs', source: 'fatsecret', food: egg, servings: 2, byWeight: false });
  assertEquals(described[1], { said: '150g rice', source: 'usda', food: rice, servings: 1.5, byWeight: true });
  assertEquals(described[2], {
    said: 'grandma stew',
    source: 'estimate',
    food: { name: 'Stew', grams: 300, calories: 420, proteinGrams: 30.3, carbsGrams: 25, fatGrams: 20, fiberGrams: 4 },
    servings: 1,
    byWeight: false,
  });
  assertEquals(described[3]!.servings, 30);
  assertEquals(missed, ['mystery']);

  // Eaten by weight: the estimate's grams over the serving's, worked out here, and logged in grams.
  const bowl = readItems({ items: [{ said: 'a big bowl of rice', query: 'white rice', statedGrams: 0, estimatedGrams: 380 }, { said: 'a can of coke', query: 'coca cola', statedGrams: 0, estimatedGrams: 355 }] });
  const can = { food_id: '9', food_name: 'Cola', servings: { serving: { serving_description: '1 can', metric_serving_amount: '12.000', metric_serving_unit: 'oz', calories: '140' } } };
  const poured = resolvePicks(bowl, [candidatesFor(0, [], [rice]), candidatesFor(1, [can], [])], { picks: [
    { item: 1, candidate: '1a', measure: 'weight', count: 0, estimate: zero },
    // No weight for the serving to divide by, and no count: one of it, never a made-up number.
    { item: 2, candidate: '2a', measure: 'weight', count: 0, estimate: zero },
  ] });
  assertEquals(poured.items.map((entry) => [entry.servings, entry.byWeight]), [[3.8, true], [1, false]]);

  // A reply that is not one logs nothing rather than something made up.
  assertEquals(resolvePicks(items, candidates, null), { items: [], missed: items.map((item) => item.said) });
});
