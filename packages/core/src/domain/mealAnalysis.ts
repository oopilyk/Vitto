import type { MealAnalysis } from './health';
import { withEstimatedCalories } from './macros';

/** Shown by both apps when a photo has no recognisable food in it. */
export const NO_FOOD_DETECTED_MESSAGE =
  "Vitto couldn't find a meal in that photo. Try another shot with the food in frame, or log it from Search.";

const GENERIC_ANALYSIS_FAILURE = 'Meal analysis failed. Try again with a clearer photo.';

/**
 * Raised when the analyze-meal model reports it saw no food. Carries a friendly,
 * user-facing message so the existing `errorMessage(cause, ...)` catch paths in
 * both MealCapture surfaces render it without extra branching.
 */
export class NoFoodDetectedError extends Error {
  readonly code = 'NO_FOOD_DETECTED' as const;

  constructor(message: string = NO_FOOD_DETECTED_MESSAGE) {
    super(message);
    this.name = 'NoFoodDetectedError';
  }
}

const MEAL_GRADES: ReadonlySet<string> = new Set(['A', 'B', 'C', 'D']);
const NUTRIENT_KEYS = [
  'protein',
  'vegetables',
  'fruit',
  'wholeGrains',
  'fiber',
  'treats',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const positiveNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

const toMacros = (value: unknown): MealAnalysis['macros'] => {
  const record = isRecord(value) ? value : {};
  return {
    calories: positiveNumber(record.calories),
    proteinGrams: positiveNumber(record.proteinGrams),
    carbsGrams: positiveNumber(record.carbsGrams),
    fatGrams: positiveNumber(record.fatGrams),
  };
};

const toNutrients = (value: unknown): MealAnalysis['nutrients'] => {
  const record = isRecord(value) ? value : {};
  return NUTRIENT_KEYS.reduce(
    (accumulator, key) => ({ ...accumulator, [key]: record[key] === true }),
    {} as MealAnalysis['nutrients'],
  );
};

const hasNutritionSignal = (analysis: MealAnalysis): boolean =>
  analysis.detectedFoods.length > 0 ||
  analysis.macros.calories > 0 ||
  analysis.macros.proteinGrams > 0 ||
  analysis.macros.carbsGrams > 0 ||
  analysis.macros.fatGrams > 0;

interface AnalyzeMealResponse {
  analysis?: unknown;
  noFoodDetected?: unknown;
}

/**
 * Normalises the analyze-meal edge function payload into a `MealAnalysis`.
 *
 * Throws `NoFoodDetectedError` when the model flags the photo as foodless (or
 * returns nothing usable), so neither app fabricates a graded meal from a photo
 * of a desk, a pet or a blurry shot.
 */
export const parseMealAnalysisResponse = (payload: unknown): MealAnalysis => {
  if (!isRecord(payload)) throw new Error(GENERIC_ANALYSIS_FAILURE);
  const response = payload as AnalyzeMealResponse;
  const analysisRecord = isRecord(response.analysis) ? response.analysis : undefined;

  if (response.noFoodDetected === true || analysisRecord?.noFoodDetected === true) {
    throw new NoFoodDetectedError();
  }
  if (!analysisRecord) throw new Error(GENERIC_ANALYSIS_FAILURE);

  const grade =
    typeof analysisRecord.grade === 'string' && MEAL_GRADES.has(analysisRecord.grade)
      ? (analysisRecord.grade as MealAnalysis['grade'])
      : 'C';
  const detectedFoods = Array.isArray(analysisRecord.detectedFoods)
    ? analysisRecord.detectedFoods.filter((item): item is string => typeof item === 'string')
    : [];

  const analysis: MealAnalysis = {
    foodDescription:
      typeof analysisRecord.foodDescription === 'string' && analysisRecord.foodDescription.trim()
        ? analysisRecord.foodDescription
        : undefined,
    grade,
    summary: typeof analysisRecord.summary === 'string' ? analysisRecord.summary : '',
    confidence: typeof analysisRecord.confidence === 'number' ? analysisRecord.confidence : 0,
    detectedFoods,
    macros: toMacros(analysisRecord.macros),
    nutrients: toNutrients(analysisRecord.nutrients),
  };

  if (!hasNutritionSignal(analysis)) throw new NoFoodDetectedError();

  return withEstimatedCalories(analysis);
};
