import { Platform } from 'react-native';
import AppleHealthKit, {
  type HealthInputOptions,
  type HealthKitPermissions,
  type HealthValue,
  type HKWorkoutQueriedSampleType,
} from 'react-native-health';
import type { HealthEvent, MealMetadata, StepMetadata, WorkoutMetadata } from '@vitto/core';
import type { HealthDataProvider } from './healthDataProvider';
import { excludeKnownExternalIds, mapStepSample, mapWorkoutSample, reconstructMealsFromNutrientSamples } from './healthKitMapping';

/**
 * The real, iOS-only `HealthDataProvider`. See mobile/HEALTHKIT.md for the
 * full design writeup, the manual setup this needs on a real device, and its
 * known limitations. Everything here is a thin wrapper around
 * `react-native-health`'s callback API — the actual data transformation lives
 * in `healthKitMapping.ts`, which is unit-tested; this file cannot be, since
 * it only does anything on a real device with Apple Health data in it.
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

const PERMISSIONS: HealthKitPermissions = {
  permissions: {
    read: [
      AppleHealthKit.Constants.Permissions.StepCount,
      AppleHealthKit.Constants.Permissions.Workout,
      AppleHealthKit.Constants.Permissions.EnergyConsumed,
      AppleHealthKit.Constants.Permissions.Protein,
      AppleHealthKit.Constants.Permissions.Carbohydrates,
      AppleHealthKit.Constants.Permissions.FatTotal,
      AppleHealthKit.Constants.Permissions.Fiber,
    ],
    write: [],
  },
};

const checkAvailability = (): Promise<boolean> =>
  new Promise((resolve) => {
    AppleHealthKit.isAvailable((_error, available) => resolve(Boolean(available)));
  });

const initHealthKit = (): Promise<void> =>
  new Promise((resolve, reject) => {
    AppleHealthKit.initHealthKit(PERMISSIONS, (error) => {
      if (error) reject(new Error(error));
      else resolve();
    });
  });

const fetchStepCount = (options: HealthInputOptions): Promise<HealthValue> =>
  new Promise((resolve, reject) => {
    AppleHealthKit.getStepCount(options, (error, result) => {
      if (error) reject(new Error(error));
      else resolve(result);
    });
  });

const fetchAnchoredWorkouts = (options: HealthInputOptions): Promise<HKWorkoutQueriedSampleType[]> =>
  new Promise((resolve, reject) => {
    AppleHealthKit.getAnchoredWorkouts(options, (error, result) => {
      if (error) reject(new Error(error.message ?? 'Could not read workouts from Apple Health.'));
      else resolve(result.data);
    });
  });

const fetchEnergyConsumedSamples = (options: HealthInputOptions): Promise<HealthValue[]> =>
  new Promise((resolve, reject) => {
    AppleHealthKit.getEnergyConsumedSamples(options, (error, results) => {
      if (error) reject(new Error(error));
      else resolve(results);
    });
  });

const fetchProteinSamples = (options: HealthInputOptions): Promise<HealthValue[]> =>
  new Promise((resolve, reject) => {
    AppleHealthKit.getProteinSamples(options, (error, results) => {
      if (error) reject(new Error(error));
      else resolve(results);
    });
  });

const fetchCarbohydrateSamples = (options: HealthInputOptions): Promise<HealthValue[]> =>
  new Promise((resolve, reject) => {
    AppleHealthKit.getCarbohydratesSamples(options, (error, results) => {
      if (error) reject(new Error(error));
      else resolve(results);
    });
  });

const fetchTotalFatSamples = (options: HealthInputOptions): Promise<HealthValue[]> =>
  new Promise((resolve, reject) => {
    AppleHealthKit.getTotalFatSamples(options, (error, results) => {
      if (error) reject(new Error(error));
      else resolve(results);
    });
  });

const fetchFiberSamples = (options: HealthInputOptions): Promise<HealthValue[]> =>
  new Promise((resolve, reject) => {
    AppleHealthKit.getFiberSamples(options, (error, results) => {
      if (error) reject(new Error(error));
      else resolve(results);
    });
  });

const byOccurredAtAscending = (a: HealthEvent<unknown>, b: HealthEvent<unknown>) =>
  a.occurredAt.localeCompare(b.occurredAt);

export class HealthKitProvider implements HealthDataProvider {
  private authorized = false;

  async isAvailable(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    return checkAvailability();
  }

  async requestAuthorization(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    try {
      await initHealthKit();
      this.authorized = true;
      return true;
    } catch {
      this.authorized = false;
      return false;
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
    const result = await fetchStepCount({ date: now.toISOString() });
    return mapStepSample(userId, { value: result.value, startDate: startOfToday.toISOString() });
  }

  async getNewWorkouts(
    userId: string,
    since: Date,
    knownExternalIds: ReadonlySet<string>,
  ): Promise<HealthEvent<WorkoutMetadata>[]> {
    this.assertAuthorized();
    const samples = await fetchAnchoredWorkouts({ startDate: since.toISOString() });
    return excludeKnownExternalIds(samples, knownExternalIds)
      .map((sample) => mapWorkoutSample(userId, sample))
      .sort(byOccurredAtAscending);
  }

  async getNewMeals(
    userId: string,
    since: Date,
    knownExternalIds: ReadonlySet<string>,
  ): Promise<HealthEvent<MealMetadata>[]> {
    this.assertAuthorized();
    const options: HealthInputOptions = { startDate: since.toISOString() };
    const [energy, protein, carbohydrates, fat, fiber] = await Promise.all([
      fetchEnergyConsumedSamples(options),
      fetchProteinSamples(options),
      fetchCarbohydrateSamples(options),
      fetchTotalFatSamples(options),
      fetchFiberSamples(options),
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
}
