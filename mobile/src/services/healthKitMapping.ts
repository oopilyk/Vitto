import {
  type HealthEvent,
  type MealAnalysis,
  type MealMetadata,
  newId,
  type StepMetadata,
  toMealAnalysis,
  type WorkoutMetadata,
} from '@vitto/core';

/**
 * Mapping from @kingstinct/react-native-healthkit's sample shapes into
 * Vitto's domain events. Pure — no native calls — so it's fully unit-tested
 * (mobile/src/__tests__/healthKitMapping.test.tsx) without a device.
 *
 * See mobile/HEALTHKIT.md for the product-level design.
 */

export interface RawStepSample {
  quantity: number;
  startDate: Date;
}

export const mapStepSample = (userId: string, sample: RawStepSample): HealthEvent<StepMetadata> => ({
  id: newId(),
  userId,
  occurredAt: sample.startDate.toISOString(),
  type: 'STEP_ACTIVITY',
  source: 'healthkit',
  metadata: { steps: Math.round(sample.quantity) },
});

/** Pre-resolved by the provider from the library's WorkoutActivityType enum and Quantity duration. */
export interface RawWorkoutSample {
  uuid: string;
  activityName: string;
  durationSeconds: number;
  startDate: Date;
  sourceName: string;
}

const STRENGTH_ACTIVITY_NAMES = new Set([
  'traditionalStrengthTraining',
  'functionalStrengthTraining',
  'coreTraining',
  'highIntensityIntervalTraining',
]);

const SECONDS_PER_MINUTE = 60;

export const mapWorkoutSample = (
  userId: string,
  sample: RawWorkoutSample,
): HealthEvent<WorkoutMetadata> => ({
  id: newId(),
  userId,
  occurredAt: sample.startDate.toISOString(),
  type: 'WORKOUT',
  source: 'healthkit',
  metadata: {
    workoutType: STRENGTH_ACTIVITY_NAMES.has(sample.activityName) ? 'strength' : 'cardio',
    durationMinutes: Math.max(1, Math.round(sample.durationSeconds / SECONDS_PER_MINUTE)),
    workoutId: sample.uuid,
    name: sample.activityName,
    notes: sample.sourceName ? `Imported from ${sample.sourceName}` : 'Imported from Apple Health',
  },
});

export interface RawNutrientSample {
  uuid?: string;
  quantity: number;
  startDate: Date;
}

export interface RawNutritionSamples {
  energy: readonly RawNutrientSample[];
  protein: readonly RawNutrientSample[];
  carbohydrates: readonly RawNutrientSample[];
  fat: readonly RawNutrientSample[];
  fiber: readonly RawNutrientSample[];
}

/**
 * HealthKit stores each nutrient as its own independent quantity sample —
 * apps that log one meal (MyFitnessPal included) write all of that meal's
 * nutrient samples with the same startDate, so grouping by exact timestamp
 * match is the best reconstruction available without a correlation query. A
 * meal missing some nutrients still surfaces, with those defaulting to zero.
 */
const groupByStartDate = (samples: readonly RawNutrientSample[]): Map<string, RawNutrientSample> => {
  const byStartDate = new Map<string, RawNutrientSample>();
  for (const sample of samples) byStartDate.set(sample.startDate.toISOString(), sample);
  return byStartDate;
};

const DEFAULT_SERVINGS = 1;

export const reconstructMealsFromNutrientSamples = (
  userId: string,
  samples: RawNutritionSamples,
): HealthEvent<MealMetadata>[] => {
  const protein = groupByStartDate(samples.protein);
  const carbs = groupByStartDate(samples.carbohydrates);
  const fat = groupByStartDate(samples.fat);
  const fiber = groupByStartDate(samples.fiber);

  return samples.energy.map((energySample) => {
    const key = energySample.startDate.toISOString();
    const macros = {
      calories: Math.round(energySample.quantity),
      proteinGrams: Math.round(protein.get(key)?.quantity ?? 0),
      carbsGrams: Math.round(carbs.get(key)?.quantity ?? 0),
      fatGrams: Math.round(fat.get(key)?.quantity ?? 0),
      fiberGrams: Math.round(fiber.get(key)?.quantity ?? 0),
    };

    const analysis: MealAnalysis = toMealAnalysis(
      {
        id: energySample.uuid ?? newId(),
        name: 'Meal from Apple Health',
        servingDescription: 'Imported entry',
        macros,
      },
      DEFAULT_SERVINGS,
    );

    return {
      id: newId(),
      userId,
      occurredAt: key,
      type: 'MEAL' as const,
      source: 'healthkit' as const,
      metadata: {
        ...analysis.nutrients,
        analysis,
        loggedVia: 'healthkit' as const,
        externalId: energySample.uuid ?? key,
      },
    };
  });
};

/**
 * Every workoutId / externalId already recorded, regardless of source — used
 * to dedup a HealthKit sync even against events logged another way, not just
 * against previous HealthKit syncs.
 */
export const getKnownHealthKitExternalIds = (events: HealthEvent[]): Set<string> => {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type === 'WORKOUT') {
      const workoutId = (event.metadata as WorkoutMetadata).workoutId;
      if (workoutId) ids.add(workoutId);
    } else if (event.type === 'MEAL') {
      const externalId = (event.metadata as MealMetadata).externalId;
      if (externalId) ids.add(externalId);
    }
  }
  return ids;
};

/** Filters out samples/events already recorded, keyed by their external id. */
export const excludeKnownExternalIds = <T extends { externalId?: string; uuid?: string }>(
  items: readonly T[],
  knownExternalIds: ReadonlySet<string>,
): T[] => items.filter((item) => {
  const key = item.externalId ?? item.uuid;
  return key === undefined || !knownExternalIds.has(key);
});
