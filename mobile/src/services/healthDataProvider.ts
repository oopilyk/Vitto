import { type HealthEvent, type MealMetadata, newId, type SleepMetadata, type StepMetadata, type WorkoutMetadata } from '@vitto/core';

/**
 * A source of real-world activity data — steps, workouts, meals — that can feed
 * the pet simulation. `MockHealthDataProvider` is the fallback for platforms or
 * builds without a native health integration; `HealthKitProvider` (iOS) is the
 * real one. Both must satisfy this same contract so `App.tsx` never has to know
 * which one it's holding.
 */
export interface HealthDataProvider {
  /** Whether this provider can be used at all on the current device/build. */
  isAvailable(): Promise<boolean>;
  /** Prompts the user for read permission. Resolves to whether it was granted. */
  requestAuthorization(): Promise<boolean>;
  getTodaySteps(userId: string): Promise<HealthEvent<StepMetadata>>;
  /**
   * Workouts logged in a source app (e.g. Strong) since `since`, excluding any
   * whose external id is already in `knownExternalIds`. Returned oldest-first,
   * so callers can replay them through the pet simulation in the order they
   * actually happened.
   */
  getNewWorkouts(
    userId: string,
    since: Date,
    knownExternalIds: ReadonlySet<string>,
  ): Promise<HealthEvent<WorkoutMetadata>[]>;
  /** Same idea as `getNewWorkouts`, for meals logged in a source app (e.g. MyFitnessPal). */
  getNewMeals(
    userId: string,
    since: Date,
    knownExternalIds: ReadonlySet<string>,
  ): Promise<HealthEvent<MealMetadata>[]>;
  /**
   * Same idea again, for nights of sleep. One event per night rather than per
   * sample: the platforms report sleep as many short segments, and stitching
   * them together is the provider's job, not the caller's.
   */
  getNewSleep(
    userId: string,
    since: Date,
    knownExternalIds: ReadonlySet<string>,
  ): Promise<HealthEvent<SleepMetadata>[]>;
}

/**
 * Still a mock, exactly as on the web. Used whenever there's no real health
 * integration available — Android today, or an iOS build without HealthKit
 * authorized. See mobile/HEALTHKIT.md for the real iOS provider.
 */
export class MockHealthDataProvider implements HealthDataProvider {
  async isAvailable(): Promise<boolean> {
    return true;
  }

  async requestAuthorization(): Promise<boolean> {
    return true;
  }

  async getTodaySteps(userId: string): Promise<HealthEvent<StepMetadata>> {
    return {
      id: newId(),
      userId,
      occurredAt: new Date().toISOString(),
      type: 'STEP_ACTIVITY',
      source: 'mock',
      metadata: { steps: 6840 },
    };
  }

  async getNewWorkouts(): Promise<HealthEvent<WorkoutMetadata>[]> {
    return [];
  }

  async getNewMeals(): Promise<HealthEvent<MealMetadata>[]> {
    return [];
  }

  async getNewSleep(): Promise<HealthEvent<SleepMetadata>[]> {
    return [];
  }
}
