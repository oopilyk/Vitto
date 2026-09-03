import { Platform } from 'react-native';
import {
  isHealthDataAvailableAsync,
  queryCategorySamples,
  queryQuantitySamples,
  queryWorkoutSamples,
  requestAuthorization,
  WorkoutActivityType,
} from '@kingstinct/react-native-healthkit';
import type { HealthEvent, MealMetadata, SleepMetadata, StepMetadata, WorkoutMetadata } from '@vitto/core';
import type { HealthDataProvider } from './healthDataProvider';
import {
  excludeKnownExternalIds,
  groupSleepSegmentsIntoNights,
  mapSleepNight,
  mapStepSample,
  mapWorkoutSample,
  reconstructMealsFromNutrientSamples,
} from './healthKitMapping';

/**
 * The real, iOS-only `HealthDataProvider`, backed by
 * @kingstinct/react-native-healthkit (a Nitro Modules library, built for
 * React Native's New Architecture). See mobile/HEALTHKIT.md for the full
 * design writeup, the manual setup this needs on a real device, and its
 * known limitations. Everything here is a thin wrapper around the library's
 * Promise-based query API — the actual data transformation lives in
 * `healthKitMapping.ts`, which is unit-tested; this file cannot be, since it
 * only does anything on a real device with Apple Health data in it.
 *
 * A previous implementation used `react-native-health`, a callback-based
 * library whose native methods never bridged to JS under the New
 * Architecture (`AppleHealthKit.initHealthKit` resolved to `undefined` at
 * runtime on-device, confirmed via diagnostic logging). This library was
 * swapped in to fix that; see HEALTHKIT.md for the full story.
 */

/**
 * Each sync only looks back this far, rather than importing a user's entire
 * HealthKit history. A large one-time backfill would need to be replayed
 * through the pet simulation in strict chronological order to avoid corrupting
 * streaks/decay/XP — a bigger, riskier feature. A rolling recent window avoids
 * that risk entirely while still keeping Strong/MyFitnessPal data flowing in
 * automatically, which is the actual goal.
 */
export const RECENT_SYNC_WINDOW_HOURS = 48;

const STEP_COUNT = 'HKQuantityTypeIdentifierStepCount' as const;
const DIETARY_ENERGY = 'HKQuantityTypeIdentifierDietaryEnergyConsumed' as const;
const DIETARY_PROTEIN = 'HKQuantityTypeIdentifierDietaryProtein' as const;
const DIETARY_CARBS = 'HKQuantityTypeIdentifierDietaryCarbohydrates' as const;
const DIETARY_FAT = 'HKQuantityTypeIdentifierDietaryFatTotal' as const;
const DIETARY_FIBER = 'HKQuantityTypeIdentifierDietaryFiber' as const;
const SLEEP_ANALYSIS = 'HKCategoryTypeIdentifierSleepAnalysis' as const;

const byOccurredAtAscending = (a: HealthEvent<unknown>, b: HealthEvent<unknown>) =>
  a.occurredAt.localeCompare(b.occurredAt);

/** WorkoutActivityType is a numeric enum; this recovers its readable name for mapWorkoutSample. */
const workoutActivityName = (activityType: WorkoutActivityType): string =>
  WorkoutActivityType[activityType] ?? 'other';

export class HealthKitProvider implements HealthDataProvider {
  private authorized = false;

  async isAvailable(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    return isHealthDataAvailableAsync();
  }

  async requestAuthorization(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    try {
      const granted = await requestAuthorization({
        toRead: [STEP_COUNT, 'HKWorkoutTypeIdentifier', DIETARY_ENERGY, DIETARY_PROTEIN, DIETARY_CARBS, DIETARY_FAT, DIETARY_FIBER, SLEEP_ANALYSIS],
      });
      this.authorized = granted;
      return granted;
    } catch (cause) {
      this.authorized = false;
      // Rethrow (rather than swallow) so the caller can surface the actual
      // native error instead of a generic "not granted" message.
      throw cause;
    }
  }

  private assertAuthorized(): void {
    if (!this.authorized) {
      throw new Error('Apple Health has not been connected yet.');
    }
  }

  async getTodaySteps(userId: string): Promise<HealthEvent<StepMetadata>> {
    this.assertAuthorized();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const samples = await queryQuantitySamples(STEP_COUNT, {
      filter: { date: { startDate: startOfToday } },
      limit: 0,
      unit: 'count',
    });
    const totalSteps = samples.reduce((sum, sample) => sum + sample.quantity, 0);
    return mapStepSample(userId, { quantity: totalSteps, startDate: startOfToday });
  }

  async getNewWorkouts(
    userId: string,
    since: Date,
    knownExternalIds: ReadonlySet<string>,
  ): Promise<HealthEvent<WorkoutMetadata>[]> {
    this.assertAuthorized();
    const samples = await queryWorkoutSamples({
      filter: { date: { startDate: since } },
      limit: 0,
      ascending: true,
    });
    return excludeKnownExternalIds(samples, knownExternalIds)
      .map((sample) =>
        mapWorkoutSample(userId, {
          uuid: sample.uuid,
          activityName: workoutActivityName(sample.workoutActivityType),
          durationSeconds: sample.duration.quantity,
          startDate: sample.startDate,
          sourceName: sample.sourceRevision.source.name,
        }),
      )
      .sort(byOccurredAtAscending);
  }

  async getNewMeals(
    userId: string,
    since: Date,
    knownExternalIds: ReadonlySet<string>,
  ): Promise<HealthEvent<MealMetadata>[]> {
    this.assertAuthorized();
    const filter = { date: { startDate: since } };
    const [energy, protein, carbohydrates, fat, fiber] = await Promise.all([
      queryQuantitySamples(DIETARY_ENERGY, { filter, limit: 0, unit: 'kcal' }),
      queryQuantitySamples(DIETARY_PROTEIN, { filter, limit: 0, unit: 'g' }),
      queryQuantitySamples(DIETARY_CARBS, { filter, limit: 0, unit: 'g' }),
      queryQuantitySamples(DIETARY_FAT, { filter, limit: 0, unit: 'g' }),
      queryQuantitySamples(DIETARY_FIBER, { filter, limit: 0, unit: 'g' }),
    ]);
    const freshEnergy = excludeKnownExternalIds(energy, knownExternalIds);
    return reconstructMealsFromNutrientSamples(userId, {
      energy: freshEnergy,
      protein,
      carbohydrates,
      fat,
      fiber,
    }).sort(byOccurredAtAscending);
  }

  async getNewSleep(
    userId: string,
    since: Date,
    knownExternalIds: ReadonlySet<string>,
  ): Promise<HealthEvent<SleepMetadata>[]> {
    this.assertAuthorized();
    const samples = await queryCategorySamples(SLEEP_ANALYSIS, {
      filter: { date: { startDate: since } },
      limit: 0,
      ascending: true,
    });
    // Filtered after grouping, not before: dedupe keys on the id of the night's
    // last segment, which only exists once the segments have been stitched. A
    // per-sample filter would also strip half a night and report the remainder
    // as a short one.
    const nights = groupSleepSegmentsIntoNights(
      samples.map((sample) => ({
        uuid: sample.uuid,
        startDate: sample.startDate,
        endDate: sample.endDate,
        value: sample.value as unknown as number,
      })),
    );
    return excludeKnownExternalIds(nights, knownExternalIds)
      .map((night) => mapSleepNight(userId, night))
      .sort(byOccurredAtAscending);
  }
}
