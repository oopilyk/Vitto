/**
 * The meal-photo prompt and response shape, kept apart from the request
 * handling so anything else that needs to send the same request (a model
 * comparison, say) can import it. No runtime imports: zod is passed in.
 */

type Z = typeof import('npm:zod@4.6.5').z;

/** What the model must return; the app's parseMealAnalysisResponse reads exactly this. */
export const mealAnalysisSchema = (z: Z) =>
  z.object({
    noFoodDetected: z.boolean(),
    petReaction: z.string(),
    foodDescription: z.string(),
    grade: z.enum(['A', 'B', 'C', 'D']),
    summary: z.string(),
    confidence: z.number(),
    detectedFoods: z.array(z.string()),
    macros: z.object({
      calories: z.number(),
      proteinGrams: z.number(),
      carbsGrams: z.number(),
      fatGrams: z.number(),
      fiberGrams: z.number(),
      sugarGrams: z.number(),
      saturatedFatGrams: z.number(),
      sodiumMg: z.number(),
    }),
    nutrients: z.object({
      protein: z.boolean(),
      vegetables: z.boolean(),
      fruit: z.boolean(),
      wholeGrains: z.boolean(),
      fiber: z.boolean(),
      treats: z.boolean(),
    }),
  });

export const MEAL_SYSTEM_PROMPT =
  'Analyze meal photos for broad nutrition signals only. Never claim medical certainty. ' +
  'First decide whether the image actually shows food or drink meant to be eaten. ' +
  'If it shows no edible food (an empty plate, a person, a pet, a room, a screenshot, a blurry or dark frame, packaging with nothing to eat visible), ' +
  'set noFoodDetected to true, detectedFoods to [], every macros value to 0, grade to "D", confidence to your certainty that there is no food, ' +
  'foodDescription to "" and summary to a one-sentence note that no meal was visible. Do not invent a meal. ' +
  'Otherwise set noFoodDetected to false and describe the meal. ' +
  'foodDescription must start immediately with a concise, quantified list of every food item you see and its estimated portion, ' +
  'with no introductory words — for example "80g of mac and cheese, 1 chocolate chip cookie (~10g), 2 chicken tenders (~10g each)". ' +
  'Estimate portions from visual cues: compare items to the plate/bowl rim, standard utensils and known package sizes; ' +
  'prefer typical single-serving portions when scale is ambiguous rather than extreme values. ' +
  'summary is a separate short paragraph judging the nutritional quality of the meal (what it is rich in or lacking). ' +
  'When noFoodDetected is false, macros.calories must be a realistic non-zero estimate for the portions described in foodDescription — ' +
  'derive it from the estimated grams of protein, carbs and fat (4/4/9 kcal per gram) and sanity-check it against the portions. ' +
  'Also return proteinGrams, carbsGrams, fatGrams as non-negative numbers, and the sub-macros fiberGrams, sugarGrams and saturatedFatGrams (grams, each part of the carbs or fat) and sodiumMg (milligrams), estimated the same way from the foods and portions you see, ' +
  'with fiberGrams and sugarGrams no more than carbsGrams and saturatedFatGrams no more than fatGrams, detectedFoods (string[]), grade (A-D), confidence (0-1), ' +
  'and nutrients booleans: protein, vegetables, fruit, wholeGrains, fiber, treats. ' +
  'petReaction: if the user message describes a pet, write ONE sentence of at most 90 characters, in the first person AS THAT PET, ' +
  'reacting to how nourishing this plate is — delighted by a balanced plate ("Yum, that was nourishing!"), gently let down by junk ("Ugh, greasy…"). ' +
  'Match the pet\'s personality and mood: energetic is excitable, chill is laid back, competitive wants more, supportive is warm. ' +
  'If the pet is listed as dying or exhausted it sounds weak and brief; if foggy it sounds muddled. ' +
  'Never mention calories, weight, diets or health outcomes, and never shame the person. ' +
  'If no pet is described, or no food was detected, set petReaction to "".';

export interface MealPetContext {
  name: string;
  personality: string;
  mood: string;
  ailments: string[];
}

/** The text that goes with the photo; with a pet, the model also writes its reaction. */
export const mealUserText = (pet: MealPetContext | null): string =>
  'Identify and grade this meal for general balanced nutrition.' +
  (pet
    ? ` The pet about to eat it is ${pet.name}, a ${pet.personality} pet who is currently ${pet.mood}` +
      (pet.ailments.length > 0 ? ` and ${pet.ailments.join(', ')}` : '') + '.'
    : '');
