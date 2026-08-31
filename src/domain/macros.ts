import type { MacroNutrients, MealAnalysis } from './health';

const PROTEIN_KCAL_PER_GRAM = 4;
const CARB_KCAL_PER_GRAM = 4;
const FAT_KCAL_PER_GRAM = 9;

export const nonNegative = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

/**
 * Photo analyses occasionally come back with calories missing or zero even though
 * the grams are populated, so derive the figure from the macros when that happens.
 * Every surface that shows or totals calories goes through here, so the modal, the
 * diary row and the daily totals can never disagree.
 */
export const calorieEstimate = (macros: MacroNutrients | undefined): number => {
  if (!macros) return 0;
  return Math.round(
    nonNegative(macros.calories) ||
      nonNegative(macros.proteinGrams) * PROTEIN_KCAL_PER_GRAM +
        nonNegative(macros.carbsGrams) * CARB_KCAL_PER_GRAM +
        nonNegative(macros.fatGrams) * FAT_KCAL_PER_GRAM,
  );
};

/** Stamps the derived calorie figure onto an analysis before it is stored. */
export const withEstimatedCalories = (analysis: MealAnalysis): MealAnalysis => ({
  ...analysis,
  macros: { ...analysis.macros, calories: calorieEstimate(analysis.macros) },
});
