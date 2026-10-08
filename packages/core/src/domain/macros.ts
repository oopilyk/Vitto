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

/**
 * The sub-macros as one quiet line ("Fiber 6g · Sugar 12g · Sat. fat 3.5g ·
 * Sodium 640mg"), leaving out any the source never reported. Plain totals,
 * deliberately with no targets or verdicts beside them (fiber's target lives
 * on its own bar): what was eaten, not whether it was too much.
 */
export const describeSubMacros = (
  macros: { fiberGrams?: number; sugarGrams?: number; saturatedFatGrams?: number; sodiumMg?: number },
  { includeFiber = true }: { includeFiber?: boolean } = {},
): string | null => {
  const known = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
  const parts = [
    includeFiber && known(macros.fiberGrams) ? `Fiber ${Math.round(macros.fiberGrams)}g` : null,
    known(macros.sugarGrams) ? `Sugar ${Math.round(macros.sugarGrams)}g` : null,
    known(macros.saturatedFatGrams) ? `Sat. fat ${Math.round(macros.saturatedFatGrams * 10) / 10}g` : null,
    known(macros.sodiumMg) ? `Sodium ${Math.round(macros.sodiumMg).toLocaleString('en-US')}mg` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
};
