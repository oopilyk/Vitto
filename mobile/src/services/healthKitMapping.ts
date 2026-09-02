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

/**
 * Mapping from `react-native-health`'s wire shapes into Vitto's domain events.
 * Kept separate from `healthKitProvider.ts` (which talks to the native module)
 * so all of this can be unit-tested with plain fixture objects — no device,
 * simulator, or native build required.
 *
 * See mobile/HEALTHKIT.md for the product-level design (why this only imports
 * a recent window, how meals are reconstructed from separate nutrient samples,
 * and the known limitations of that approach).
 */

/** Minimal shape of what `getStepCount` resolves to — just the fields we use. */
export interface RawStepSample {
  value: number;
  startDate: string;
}

export const mapStepSample = (userId: string, sample: RawStepSample): HealthEvent<StepMetadata> => ({
  id: newId(),
  userId,
  occurredAt: sample.startDate,
  type: 'STEP_ACTIVITY',
  source: 'healthkit',
  metadata: { steps: Math.round(sample.value) },
});

/** Minimal shape of one entry from `getAnchoredWorkouts`'s `data` array. */
export interface RawWorkoutSample {
  id: string;
  activityName: string;
  duration: number;
  start: string;
  sourceName: string;
}

const STRENGTH_ACTIVITY_NAMES = new Set([
  'TraditionalStrengthTraining',
  'FunctionalStrengthTraining',
  'CoreTraining',
  'HighIntensityIntervalTraining',
]);

const SECONDS_PER_MINUTE = 60;

export const mapWorkoutSample = (
  userId: string,
  sample: RawWorkoutSample,
): HealthEvent<WorkoutMetadata> => ({
  id: newId(),
  userId,
  occurredAt: sample.start,
  type: 'WORKOUT',
  source: 'healthkit',
  metadata: {
    workoutType: STRENGTH_ACTIVITY_NAMES.has(sample.activityName) ? 'strength' : 'cardio',
    durationMinutes: Math.max(1, Math.round(sample.duration / SECONDS_PER_MINUTE)),
    workoutId: sample.id,
    name: sample.activityName,
    notes: sample.sourceName ? `Imported from ${sample.sourceName}` : 'Imported from Apple Health',
  },
});

/** Minimal shape of one entry from any of the nutrient sample queries. */
export interface RawNutrientSample {
  id?: string;
  value: number;
  startDate: string;
}

export interface RawNutritionSamples {
  energy: RawNutrientSample[];
  protein: RawNutrientSample[];
  carbohydrates: RawNutrientSample[];
  fat: RawNutrientSample[];
  fiber: RawNutrientSample[];
}

/**
 * HealthKit stores each nutrient as its own independent quantity sample —
 * there's no single "this was one meal" record exposed by this library. Apps
 * that log one meal (MyFitnessPal included) write all of that meal's nutrient
 * samples with the same `startDate`, so grouping by exact timestamp match is
 * the best reconstruction available without a correlation-query API. A meal
 * logged with only some nutrients tracked will still surface with the others
 * defaulting to zero.
 */
const groupByStartDate = (samples: RawNutrientSample[]): Map<string, RawNutrientSample> => {
  const byStartDate = new Map<string, RawNutrientSample>();
  for (const sample of samples) byStartDate.set(sample.startDate, sample);
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
    const macros = {
      calories: Math.round(energySample.value),
      proteinGrams: Math.round(protein.get(energySample.startDate)?.value ?? 0),
      carbsGrams: Math.round(carbs.get(energySample.startDate)?.value ?? 0),
      fatGrams: Math.round(fat.get(energySample.startDate)?.value ?? 0),
      fiberGrams: Math.round(fiber.get(energySample.startDate)?.value ?? 0),
    };

    const analysis: MealAnalysis = toMealAnalysis(
      {
        id: energySample.id ?? newId(),
        name: 'Meal from Apple Health',
        servingDescription: 'Imported entry',
        macros,
      },
      DEFAULT_SERVINGS,
    );

    return {
      id: newId(),
      userId,
      occurredAt: energySample.startDate,
      type: 'MEAL' as const,
      source: 'healthkit' as const,
      metadata: {
        ...analysis.nutrients,
        analysis,
        loggedVia: 'healthkit' as const,
        externalId: energySample.id ?? energySample.startDate,
      },
    };
  });
};

/** Filters out samples/events already recorded, keyed by their external id. */
export const excludeKnownExternalIds = <T extends { externalId?: string; id?: string }>(
  items: T[],
  knownExternalIds: ReadonlySet<string>,
): T[] => items.filter((item) => {
  const key = item.externalId ?? item.id;
  return key === undefined || !knownExternalIds.has(key);
});
