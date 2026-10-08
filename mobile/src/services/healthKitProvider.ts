import { Platform } from 'react-native';
import {
  getRequestStatusForAuthorization,
  isHealthDataAvailableAsync,
  queryCategorySamples,
  queryQuantitySamples,
  queryStatisticsForQuantity,
  queryWorkoutSamples,
  requestAuthorization,
  WorkoutActivityType,
} from '@kingstinct/react-native-healthkit';
import type { HealthEvent, MealMetadata, ScreenTimeMetadata, SleepMetadata, StepMetadata, WorkoutMetadata } from '@vitto/core';
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
const ACTIVE_ENERGY_BURNED = 'HKQuantityTypeIdentifierActiveEnergyBurned' as const;
const DIETARY_ENERGY = 'HKQuantityTypeIdentifierDietaryEnergyConsumed' as const;
const DIETARY_PROTEIN = 'HKQuantityTypeIdentifierDietaryProtein' as const;
const DIETARY_CARBS = 'HKQuantityTypeIdentifierDietaryCarbohydrates' as const;
const DIETARY_FAT = 'HKQuantityTypeIdentifierDietaryFatTotal' as const;
const DIETARY_FIBER = 'HKQuantityTypeIdentifierDietaryFiber' as const;
const DIETARY_SUGAR = 'HKQuantityTypeIdentifierDietarySugar' as const;
const DIETARY_SATURATED_FAT = 'HKQuantityTypeIdentifierDietaryFatSaturated' as const;
const DIETARY_SODIUM = 'HKQuantityTypeIdentifierDietarySodium' as const;
const SLEEP_ANALYSIS = 'HKCategoryTypeIdentifierSleepAnalysis' as const;

const byOccurredAtAscending = (a: HealthEvent<unknown>, b: HealthEvent<unknown>) =>
  a.occurredAt.localeCompare(b.occurredAt);

/** WorkoutActivityType is a numeric enum; this recovers its readable name for mapWorkoutSample. */
const workoutActivityName = (activityType: WorkoutActivityType): string =>
  WorkoutActivityType[activityType] ?? 'other';

/** Everything Vitto reads from Apple Health. Asked for once, all together. */
const READ_TYPES = [
  STEP_COUNT,
  ACTIVE_ENERGY_BURNED,
  'HKWorkoutTypeIdentifier',
  DIETARY_ENERGY,
  DIETARY_PROTEIN,
  DIETARY_CARBS,
  DIETARY_FAT,
  DIETARY_FIBER,
  DIETARY_SUGAR,
  DIETARY_SATURATED_FAT,
  DIETARY_SODIUM,
  SLEEP_ANALYSIS,
] as const;

export class HealthKitProvider implements HealthDataProvider {
  private authorized = false;

  async isAvailable(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    return isHealthDataAvailableAsync();
  }

  /**
   * Picks up a connection made on an earlier launch, without ever asking.
   * iOS never says whether READ access was granted, only whether the person
   * has already been asked (`unnecessary`, 2); once they have, re-requesting
   * shows nothing and simply re-arms this provider. A person who has never
   * been asked is left alone: that sheet only appears when they tap Connect.
   */
  async restoreAuthorization(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    try {
      const status = await getRequestStatusForAuthorization({ toRead: READ_TYPES });
      if (Number(status) !== 2) return false;
      return await this.requestAuthorization();
    } catch {
      return false;
    }
  }

  async requestAuthorization(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    try {
      const granted = await requestAuthorization({ toRead: READ_TYPES });
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
    const filter = { date: { startDate: startOfToday, endDate: now } };
    // HealthKit's own cumulative sum, the number the Health app shows: it
    // merges the iPhone's and the Watch's overlapping counts. Adding up the raw
    // samples counted the same walk once per device.
    // Active energy is best-effort: some devices/permission states report none,
    // and a missing calorie figure should never block steps.
    const [steps, energy] = await Promise.all([
      queryStatisticsForQuantity(STEP_COUNT, ['cumulativeSum'], { filter, unit: 'count' }),
      queryStatisticsForQuantity(ACTIVE_ENERGY_BURNED, ['cumulativeSum'], { filter, unit: 'kcal' }).catch(() => null),
    ]);
    const calories = energy?.sumQuantity?.quantity;
    return mapStepSample(userId, {
      quantity: Math.round(steps.sumQuantity?.quantity ?? 0),
      startDate: startOfToday,
      ...(typeof calories === 'number' && calories > 0 ? { caloriesBurned: Math.round(calories) } : {}),
    });
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
          ...(sample.totalDistance ? { totalDistance: { quantity: sample.totalDistance.quantity, unit: sample.totalDistance.unit } } : {}),
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
    // The sub-macros are best-effort: a phone that never granted them (they
    // were added to the request later) still imports the meal.
    const optional = <T,>(query: Promise<readonly T[]>) => query.catch((): readonly T[] => []);
    const [energy, protein, carbohydrates, fat, fiber, sugar, saturatedFat, sodium] = await Promise.all([
      queryQuantitySamples(DIETARY_ENERGY, { filter, limit: 0, unit: 'kcal' }),
      queryQuantitySamples(DIETARY_PROTEIN, { filter, limit: 0, unit: 'g' }),
      queryQuantitySamples(DIETARY_CARBS, { filter, limit: 0, unit: 'g' }),
      queryQuantitySamples(DIETARY_FAT, { filter, limit: 0, unit: 'g' }),
      queryQuantitySamples(DIETARY_FIBER, { filter, limit: 0, unit: 'g' }),
      optional(queryQuantitySamples(DIETARY_SUGAR, { filter, limit: 0, unit: 'g' })),
      optional(queryQuantitySamples(DIETARY_SATURATED_FAT, { filter, limit: 0, unit: 'g' })),
      optional(queryQuantitySamples(DIETARY_SODIUM, { filter, limit: 0, unit: 'mg' })),
    ]);
    const freshEnergy = excludeKnownExternalIds(energy, knownExternalIds);
    return reconstructMealsFromNutrientSamples(userId, {
      energy: freshEnergy,
      protein,
      carbohydrates,
      fat,
      fiber,
      sugar,
      saturatedFat,
      sodium,
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

  /**
   * Always null on iOS, and not because of a missing library. Apple's Screen
   * Time stack (FamilyControls / DeviceActivity / ManagedSettings) is designed
   * so the host app never sees the numbers: usage only renders inside a
   * sandboxed DeviceActivityReport extension, and even that needs the
   * request-and-approve `com.apple.developer.family-controls` entitlement.
   * HealthKit itself has no screen-time type. The user reads the total off
   * Settings → Screen Time and types it in instead; see mobile/SCREENTIME.md.
   */
  async getTodayScreenTime(): Promise<HealthEvent<ScreenTimeMetadata> | null> {
    return null;
  }
}
