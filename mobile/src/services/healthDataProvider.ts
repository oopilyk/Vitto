import { type HealthEvent, type MealMetadata, newId, type ScreenTimeMetadata, type SleepMetadata, type StepMetadata, type WorkoutMetadata } from '@vitto/core';

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
  /**
   * Today's total screen time as one SCREEN_TIME event, or `null` when the
   * platform cannot say. Only Android can (UsageStatsManager); iOS never
   * exposes the figure to apps, so the HealthKit provider always returns null
   * and the user types the number in instead. `budgetMinutes` is the user's
   * own budget, copied into the event so it scores against the budget they had
   * at the time. Callers still need to enforce one log per day — see
   * `findScreenTimeForDate` in screenTimeMapping.ts.
   */
  getTodayScreenTime(
    userId: string,
    budgetMinutes?: number,
  ): Promise<HealthEvent<ScreenTimeMetadata> | null>;
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

  // Full signature, unlike the list methods above, so a platform provider can
  // extend this class and override it with the real parameters.
  async getTodayScreenTime(_userId: string, _budgetMinutes?: number): Promise<HealthEvent<ScreenTimeMetadata> | null> {
    return null;
  }
}
