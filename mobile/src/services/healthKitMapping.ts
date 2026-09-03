import {
  type HealthEvent,
  type MealAnalysis,
  type MealMetadata,
  newId,
  type SleepMetadata,
  type StepMetadata,
  toDateKey,
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
/**
 * One row of HKCategoryTypeIdentifierSleepAnalysis. HealthKit reports a night as
 * many short consecutive segments, not one record, which is why nothing here
 * maps a sample straight to an event the way steps and workouts do.
 */
export interface RawSleepSample {
  uuid?: string;
  startDate: Date;
  endDate: Date;
  /** HKCategoryValueSleepAnalysis: 0 inBed, 1 asleepUnspecified, 2 awake, 3 core, 4 deep, 5 REM. */
  value: number;
}

/**
 * The category values that mean "actually asleep" — unspecified plus the three
 * staged ones. `inBed` (0) and `awake` (2) are deliberately excluded: an hour
 * spent lying awake should not restore the pet's energy.
 */
const ASLEEP_VALUES: ReadonlySet<number> = new Set([1, 3, 4, 5]);

/**
 * A break at least this long ends the night. Long enough to swallow the ordinary
 * wake-ups inside one night (which arrive as `awake` gaps between asleep
 * segments), short enough that an evening nap and the following night's sleep do
 * not merge into a single implausible twelve-hour record.
 */
export const SLEEP_NIGHT_GAP_MS = 3 * 60 * 60 * 1000;

/** One night, stitched together from its segments. */
export interface SleepNight {
  asleepMinutes: number;
  /** When the last segment ended — the night is attributed to the day it woke into. */
  endedAt: Date;
  externalId?: string;
}

/**
 * Stitches raw sleep segments into whole nights.
 *
 * Two things make this more than a sum. Segments **overlap**: a phone and a
 * watch both writing sleep produce duplicate ranges for the same minutes, so the
 * asleep time is the union of the intervals, never the sum of their durations —
 * summing double-counts every night recorded by two devices. And segments must
 * be **grouped**, since a night is many rows; consecutive asleep stretches are
 * one night until a gap of `SLEEP_NIGHT_GAP_MS` breaks it.
 */
export const groupSleepSegmentsIntoNights = (
  samples: readonly RawSleepSample[],
): SleepNight[] => {
  const asleep = samples
    .filter((sample) => ASLEEP_VALUES.has(sample.value))
    .filter((sample) => sample.endDate.getTime() > sample.startDate.getTime())
    .slice()
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  const nights: SleepNight[] = [];
  // Flat locals rather than a nullable "current night" object: `flush` closes
  // over them, and TypeScript cannot follow a closure's assignments well enough
  // to keep an object's narrowing honest across iterations.
  let open = false;
  let asleepMs = 0;
  // The furthest end seen, which is not always the last segment's end — a short
  // segment can sit entirely inside a longer one. This is what makes the merge a
  // union rather than a sum.
  let coveredUntil = 0;
  let externalId: string | undefined;

  const flush = () => {
    if (open) {
      nights.push({
        asleepMinutes: Math.round(asleepMs / 60_000),
        endedAt: new Date(coveredUntil),
        externalId,
      });
    }
    open = false;
    asleepMs = 0;
    coveredUntil = 0;
    externalId = undefined;
  };

  for (const sample of asleep) {
    const start = sample.startDate.getTime();
    const end = sample.endDate.getTime();
    if (open && start - coveredUntil >= SLEEP_NIGHT_GAP_MS) flush();

    // Only the part of this segment not already covered by an earlier one.
    const uncoveredFrom = open ? Math.max(start, coveredUntil) : start;
    if (end > uncoveredFrom) asleepMs += end - uncoveredFrom;
    coveredUntil = Math.max(coveredUntil, end);
    if (sample.uuid) externalId = sample.uuid;
    open = true;
  }
  flush();

  return nights.filter((night) => night.asleepMinutes > 0);
};

export const mapSleepNight = (userId: string, night: SleepNight): HealthEvent<SleepMetadata> => ({
  id: newId(),
  userId,
  occurredAt: night.endedAt.toISOString(),
  type: 'SLEEP',
  source: 'healthkit',
  metadata: {
    asleepMinutes: night.asleepMinutes,
    night: toDateKey(night.endedAt),
    externalId: night.externalId,
  },
});

export const getKnownHealthKitExternalIds = (events: HealthEvent[]): Set<string> => {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type === 'WORKOUT') {
      const workoutId = (event.metadata as WorkoutMetadata).workoutId;
      if (workoutId) ids.add(workoutId);
    } else if (event.type === 'MEAL') {
      const externalId = (event.metadata as MealMetadata).externalId;
      if (externalId) ids.add(externalId);
    } else if (event.type === 'SLEEP') {
      const externalId = (event.metadata as SleepMetadata).externalId;
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
