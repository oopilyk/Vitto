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

const item = (said: string, query: string, more: Record<string, unknown> = {}) => ({ said, query, branded: false, count: 0, unit: '', statedGrams: 0, estimatedGrams: 0, ...more });
const zero = { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0, fiberGrams: 0 };

Deno.test('step 1 is bounded before anything is searched', () => {
  const items = readItems({
    items: [
      { said: ' 2  eggs ', query: 'egg', count: 2, unit: ' Egg ', statedGrams: 0, estimatedGrams: 100 },
      { said: '', query: 'x'.repeat(200), branded: true, count: 3, statedGrams: -5, estimatedGrams: 1e9 },
      { said: 'nothing', query: '   ' },
      'junk',
      ...Array.from({ length: 20 }, () => item('rice', 'rice', { statedGrams: 150, estimatedGrams: 150 })),
    ],
  });
  assertEquals(items.length, 8);
  assertEquals(items[0], { said: '2 eggs', query: 'egg', branded: false, count: 2, unit: 'egg', statedGrams: 0, estimatedGrams: 100 });
  assertEquals(items[1]!.query.length, 60);
  assertEquals(items[1]!.said, items[1]!.query);
  assertEquals([items[1]!.statedGrams, items[1]!.estimatedGrams, items[1]!.branded], [0, 5000, true]);
  // A count of nothing in particular cannot be matched to a serving: it is dropped.
  assertEquals([items[1]!.count, items[1]!.unit], [0, '']);
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

Deno.test('candidates are listed in the order they should be preferred', () => {
  const serving = { serving: { serving_description: '1 serving', calories: '100' } };
  const plain = (name: string) => ({ food_name: name, food_type: 'Generic', servings: serving });
  const brand = (name: string) => ({ food_name: name, food_type: 'Brand', brand_name: 'Acme', servings: serving });
  // As FatSecret ranks them: brands in among the plain foods.
  const fatsecret = [brand('Eggs'), plain('Scrambled Egg'), brand('Egg Bites'), plain('Egg'), ...Array.from({ length: 10 }, (_, index) => plain(`Egg dish ${index}`)), brand('Egg Cup'), brand('Egg Wrap')];
  const names = (branded: boolean) => candidatesFor(0, fatsecret, [rice, rice, rice, rice, rice], branded).map((entry) => entry.name);

  // Ordinary food: the plain entries, then USDA's, then a few brands.
  const ordinary = names(false);
  assertEquals(ordinary.slice(0, 2), ['Scrambled Egg', 'Egg']);
  assertEquals(ordinary.slice(7), [...Array.from({ length: 4 }, () => 'Rice, white, cooked'), 'Acme Eggs', 'Acme Egg Bites', 'Acme Egg Cup']);
  // A brand's product: the brands first.
  assertEquals(names(true).slice(0, 5), ['Acme Eggs', 'Acme Egg Bites', 'Acme Egg Cup', 'Acme Egg Wrap', 'Scrambled Egg']);
  assertEquals(candidatesFor(2, fatsecret, []).map((entry) => entry.id).slice(0, 3), ['3a', '3b', '3c']);
});

Deno.test('the model is shown each food with ids of its own', () => {
  const items = readItems({ items: [item('2 eggs', 'egg', { count: 2, unit: 'egg', estimatedGrams: 100 }), item('150g rice', 'white rice', { statedGrams: 150, estimatedGrams: 150 }), item('grandma stew', 'stew')] });
  const candidates = [candidatesFor(0, [egg], []), candidatesFor(1, [], [rice]), candidatesFor(2, [], [])];
  const text = picksUserText(items, candidates);
  assertStringIncludes(text, '1. "2 eggs" (count: 2 egg, about 100 g)\n   1a | Egg | 1 large (50 g) | 74 kcal');
  assertStringIncludes(text, '2. "150g rice" (they said 150 g)\n   2a | Rice, white, cooked | 100 g | 130 kcal');
  assertStringIncludes(text, '3. "grandma stew" (amount unknown)\n   (no database entries found)');
});

Deno.test('picks are checked against what was shown', () => {
  const items = readItems({ items: [
    item('2 eggs', 'egg', { count: 2, unit: 'egg', estimatedGrams: 100 }),
    item('150g rice', 'white rice', { count: 1, unit: 'bowl', statedGrams: 150, estimatedGrams: 150 }),
    item('grandma stew', 'stew', { estimatedGrams: 300 }),
    item('mystery', 'mystery'),
  ] });
  const candidates = [candidatesFor(0, [egg], []), candidatesFor(1, [], [rice]), candidatesFor(2, [], []), candidatesFor(3, [], [])];
  const { items: described, missed } = resolvePicks(items, candidates, { picks: [
    { item: 1, candidate: '1A', sameUnit: true, estimate: zero },
    // A stated weight is divided out here, whatever the model said.
    { item: 2, candidate: '2a', sameUnit: true, estimate: zero },
    // Another item's id is not a candidate of this one: its estimate is used.
    { item: 3, candidate: '1a', sameUnit: false, estimate: { calories: 420.4, proteinGrams: 30.26, carbsGrams: 25, fatGrams: 20, fiberGrams: 4 } },
    { item: 4, candidate: 'none', sameUnit: false, estimate: zero },
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
  assertEquals(missed, ['mystery']);
  // A reply that is not one logs nothing rather than something made up.
  assertEquals(resolvePicks(items, candidates, null), { items: [], missed: items.map((entry) => entry.said) });
});

Deno.test('the amount is worked out here, never by the model', () => {
  const fatsecret = (name: string, serving: string, grams?: number, unit = 'g') => ({
    food_name: name,
    servings: { serving: { serving_description: serving, calories: '100', ...(grams ? { metric_serving_amount: String(grams), metric_serving_unit: unit } : {}) } },
  });
  const servingsOf = (said: Record<string, unknown>, food: unknown, sameUnit: boolean, usda = false) => {
    const items = readItems({ items: [item('it', 'it', said)] });
    const result = resolvePicks(items, [usda ? candidatesFor(0, [], [food]) : candidatesFor(0, [food], [])], { picks: [{ item: 1, candidate: '1a', sameUnit, estimate: zero }] });
    return [result.items[0]!.servings, result.items[0]!.byWeight];
  };

  // What was counted, over what the serving counts: "2 eggs" against "2 eggs (94 g)" is one of it.
  assertEquals(servingsOf({ count: 2, unit: 'egg', estimatedGrams: 100 }, fatsecret('Scrambled Egg', '2 eggs', 94), true), [1, false]);
  assertEquals(servingsOf({ count: 1, unit: 'cup', estimatedGrams: 120 }, fatsecret('Granola', '1/4 cup', 30), true), [4, false]);
  assertEquals(servingsOf({ count: 0.5, unit: 'bagel', estimatedGrams: 50 }, fatsecret('Bagel', '1 regular', 105), true), [0.5, false]);
  // One sandwich is one sandwich, however heavy it was guessed to be.
  assertEquals(servingsOf({ count: 1, unit: 'sandwich', estimatedGrams: 220 }, fatsecret('Turkey Sandwich', '1 sandwich', 143), true), [1, false]);
  // A serving with no weight still takes a count: a can is a can.
  assertEquals(servingsOf({ count: 2, unit: 'can', estimatedGrams: 710 }, fatsecret('Cola', '1 can', 12, 'oz'), true), [2, false]);

  // Not the same thing: the estimate's grams over the serving's, logged in grams.
  assertEquals(servingsOf({ estimatedGrams: 380 }, rice, false, true), [3.8, true]);
  assertEquals(servingsOf({ count: 2, unit: 'egg', estimatedGrams: 100 }, rice, false, true), [1, true]);
  // A count the model matched to the wrong serving ("a handful" to one almond) is out of scale: the weight is used.
  assertEquals(servingsOf({ count: 1, unit: 'handful', estimatedGrams: 30 }, fatsecret('Almonds', '1 almond', 1), true), [30, true]);
  // Nothing to count and nothing to weigh: one of it, never a made-up number.
  assertEquals(servingsOf({ estimatedGrams: 355 }, fatsecret('Cola', '1 can', 12, 'oz'), false), [1, false]);
  // Kept within reason.
  assertEquals(servingsOf({ count: 30, unit: 'egg' }, fatsecret('Egg', '1 large'), true), [30, false]);
  assertEquals(servingsOf({ estimatedGrams: 5000 }, fatsecret('Almonds', '1 almond', 1), false), [30, true]);
});
