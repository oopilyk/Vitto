import type { HealthEvent, ScreenTimeMetadata } from '@vitto/core';
import { getForegroundMillisToday, isScreenTimeModuleAvailable } from '../../modules/screen-time';
import { MockHealthDataProvider } from './healthDataProvider';
import { mapUsageStatsTotal } from './screenTimeMapping';

/**
 * The Android `HealthDataProvider`. Steps, workouts, meals and sleep are still
 * the mock — there is no Health Connect integration yet (see HEALTHKIT.md) —
 * but screen time is real: Android's UsageStatsManager exposes foreground time
 * once the user grants "usage access" in Settings, which is the one thing iOS
 * cannot offer. The native side lives in mobile/modules/screen-time and hands
 * back a single summed number, so nothing per-app ever reaches JS.
 *
 * UNVERIFIED ON-DEVICE: the Kotlin module has not been compiled or run here
 * (no Android SDK on this machine). Everything in JS degrades to `null` when
 * the native module is absent, so a build without it behaves like the mock.
 */
export class AndroidUsageStatsProvider extends MockHealthDataProvider {
  async getTodayScreenTime(
    userId: string,
    budgetMinutes?: number,
  ): Promise<HealthEvent<ScreenTimeMetadata> | null> {
    if (!isScreenTimeModuleAvailable()) return null;
    const foregroundMillis = await getForegroundMillisToday();
    if (foregroundMillis === null) return null;
    return mapUsageStatsTotal(userId, { foregroundMillis }, budgetMinutes);
  }
}
