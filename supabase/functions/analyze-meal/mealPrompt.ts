/**
 * The meal-photo prompt and response shape, kept apart from the request
 * handling so anything else that needs to send the same request (a model
 * comparison, say) can import it. No runtime imports: zod is passed in.
 *
 * The model itemises, the code adds up. It names each food, weighs it in grams
 * and gives that food's standard nutrition per 100 g, the way a food database
 * would; `totalMeal` multiplies and sums. A small model knows that cooked rice
 * is about 130 kcal per 100 g far more reliably than it can add up a plate in
 * its head, so the arithmetic is taken off it entirely.
 */

type Z = typeof import('npm:zod@4.6.5').z;

/** What the model returns. Field order is the order it thinks in: scale, items, then judgement. */
export const mealAnalysisSchema = (z: Z) =>
  z.object({
    noFoodDetected: z.boolean(),
    scaleReference: z.string(),
    items: z.array(
      z.object({
        name: z.string(),
        portion: z.string(),
        grams: z.number(),
        per100g: z.object({
          calories: z.number(),
          proteinGrams: z.number(),
          carbsGrams: z.number(),
          fatGrams: z.number(),
          fiberGrams: z.number(),
          sugarGrams: z.number(),
          saturatedFatGrams: z.number(),
          sodiumMg: z.number(),
        }),
      }),
    ),
    summary: z.string(),
    grade: z.enum(['A', 'B', 'C', 'D']),
    confidence: z.number(),
    nutrients: z.object({
      protein: z.boolean(),
      vegetables: z.boolean(),
      fruit: z.boolean(),
      wholeGrains: z.boolean(),
      fiber: z.boolean(),
      treats: z.boolean(),
    }),
    petReaction: z.string(),
  });

export const MEAL_SYSTEM_PROMPT = `You estimate the nutrition of a meal from one photo, the way a careful dietitian logging it in a food database would. Broad estimates, never medical certainty.

1. Is there food? If the photo shows nothing edible (an empty plate, a person, a pet, a room, a screenshot, a blurry or dark frame, packaging with no food visible), set noFoodDetected to true, items to [], grade to "D", confidence to how sure you are there is no food, summary to one sentence saying no meal was visible, petReaction to "". Do not invent a meal. Otherwise noFoodDetected is false.

2. Find the scale. Before weighing anything, decide what sets the size in this photo and write it in scaleReference: a dinner plate is about 26 to 28 cm across, a side plate about 20 cm, a cereal bowl about 15 cm, a fork about 19 cm, a teaspoon 15 cm, a standard can 355 mL, a hand about 18 cm long. Packaging with a printed size is the best reference of all.

3. List every item separately in items, one entry per food: each meat, side, sauce, drink and topping. Count discrete pieces (nuggets, slices, dumplings, eggs) and name the count in portion, e.g. "6 nuggets" or "1 cup" or "2 slices".
   - Add what you cannot see but know is there as its own item: cooking oil or butter on anything fried, sautéed, roasted or glossy (usually 5 to 15 g), dressing on a dressed salad, mayonnaise or sauce in a sandwich or burger, sugar in a sweetened drink.
   - Weigh each item in grams as it is served. Estimate what is actually on the plate; restaurant and takeaway portions are usually bigger than a textbook serving, so do not shrink them. Only fall back to a typical single serving when there is truly nothing to judge size by.

4. For each item, give its standard nutrition per 100 g as served (USDA FoodData Central style): calories, protein, carbs, fat, fiber, sugar, saturated fat in grams and sodium in milligrams. Use the cooked or prepared food's values for cooked food (cooked white rice is about 130 kcal per 100 g, not the 360 of dry rice; cooked pasta about 158; grilled chicken breast about 165; a slice of cheese pizza about 266). Per 100 g, calories should come close to 4 x protein + 4 x carbs + 9 x fat. Fiber and sugar are part of carbs and no more than carbs; saturated fat is part of fat and no more than fat. If a nutrition label is readable in the photo, use its numbers.

Do NOT add anything up yourself; give per-item values only.

5. summary: one short paragraph on the meal's nutritional quality, what it is rich in or lacking. grade A to D for general balance. confidence 0 to 1 for how sure you are of the portions. nutrients: true for each of protein, vegetables, fruit, wholeGrains, fiber and treats the meal actually contains.

6. petReaction: if the user message describes a pet, write ONE sentence of at most 90 characters, in the first person AS THAT PET, reacting to how nourishing this plate is: delighted by a balanced plate ("Yum, that was nourishing!"), gently let down by junk ("Ugh, greasy…"). Match the pet's personality and mood: energetic is excitable, chill is laid back, competitive wants more, supportive is warm. If the pet is dying or exhausted it sounds weak and brief; if foggy it sounds muddled. Never mention calories, weight, diets or health outcomes, and never shame the person. If no pet is described, or there is no food, petReaction is "".`;

export interface MealPetContext {
  name: string;
  personality: string;
  mood: string;
  ailments: string[];
}

/** The text that goes with the photo; with a pet, the model also writes its reaction. */
export const mealUserText = (pet: MealPetContext | null): string =>
  'Identify, weigh and grade this meal.' +
  (pet
    ? ` The pet about to eat it is ${pet.name}, a ${pet.personality} pet who is currently ${pet.mood}` +
      (pet.ailments.length > 0 ? ` and ${pet.ailments.join(', ')}` : '') + '.'
    : '');

const NUTRIENT_KEYS = [
  'calories', 'proteinGrams', 'carbsGrams', 'fatGrams', 'fiberGrams', 'sugarGrams', 'saturatedFatGrams', 'sodiumMg',
] as const;
type Nutrients = Record<(typeof NUTRIENT_KEYS)[number], number>;

/** What the model said about one food on the plate. */
export interface MealItem {
  name: string;
  portion: string;
  grams: number;
  per100g: Nutrients;
}

/**
 * The most any one item, or 100 g of anything, can plausibly hold. Pure fat is
 * 900 kcal per 100 g; nothing on a plate weighs 3 kg. A number past these is a
 * misread, and clamping it keeps one bad item from wrecking the day's total.
 */
const MAX_ITEM_GRAMS = 3000;
const MAX_PER_100G: Nutrients = {
  calories: 900, proteinGrams: 100, carbsGrams: 100, fatGrams: 100,
  fiberGrams: 100, sugarGrams: 100, saturatedFatGrams: 100, sodiumMg: 40_000,
};

const bounded = (value: number, max: number): number => (Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0);

/**
 * One item's per-100 g values made sane: each in range, the parts no bigger
 * than their whole, and calories taken from the macros when the stated figure
 * disagrees with them by more than a third (or is missing).
 */
const sanePer100g = (raw: Nutrients): Nutrients => {
  const v = Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, bounded(raw[key], MAX_PER_100G[key])])) as Nutrients;
  v.fiberGrams = Math.min(v.fiberGrams, v.carbsGrams);
  v.sugarGrams = Math.min(v.sugarGrams, v.carbsGrams);
  v.saturatedFatGrams = Math.min(v.saturatedFatGrams, v.fatGrams);
  const fromMacros = 4 * v.proteinGrams + 4 * v.carbsGrams + 9 * v.fatGrams;
  // Black coffee, tea, diet soda: near zero either way, so the stated figure stands.
  if (fromMacros >= 20 && (v.calories === 0 || Math.abs(v.calories - fromMacros) / fromMacros > 1 / 3)) {
    v.calories = Math.min(MAX_PER_100G.calories, fromMacros);
  }
  return v;
};

const round = (value: number): number => Math.round(value);

/**
 * The meal's totals, done in code from the model's per-item weights and
 * per-100 g values, plus the description and food list the app shows, built
 * from the same items so the words and the numbers always agree.
 */
export const totalMeal = (items: readonly MealItem[]) => {
  const kept = items
    .map((item) => ({ ...item, name: item.name.trim(), grams: bounded(item.grams, MAX_ITEM_GRAMS), per100g: sanePer100g(item.per100g) }))
    .filter((item) => item.name && item.grams > 0);
  const sum = Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, 0])) as Nutrients;
  for (const item of kept) {
    for (const key of NUTRIENT_KEYS) sum[key] += (item.per100g[key] * item.grams) / 100;
  }
  const macros = Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, round(sum[key])])) as Nutrients;
  return {
    macros,
    detectedFoods: kept.map((item) => item.name),
    foodDescription: kept
      .map((item) => `${item.name} (${item.portion.trim() ? `${item.portion.trim()}, ` : ''}~${round(item.grams)} g)`)
      .join(', '),
  };
};
