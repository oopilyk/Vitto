import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/**
 * Thin JS wrapper over the local `VittoScreenTime` Expo module (Android only —
 * see android/ beside this file). Every export degrades gracefully when the
 * native module is absent: iOS, web, jest, and an Android build made before
 * `expo prebuild` picked the module up all get `false` / `null` rather than a
 * crash. The `expo` package re-exports expo-modules-core, so no new dependency.
 *
 * UNVERIFIED ON-DEVICE: the Kotlin side has not been built here (no Android
 * SDK). The JS contract below is what it was written to.
 */
interface ScreenTimeNativeModule {
  hasUsageAccess(): boolean;
  openUsageAccessSettings(): void;
  getForegroundMillisToday(): Promise<number>;
}

const native: ScreenTimeNativeModule | null =
  Platform.OS === 'android' ? requireOptionalNativeModule<ScreenTimeNativeModule>('VittoScreenTime') : null;

export const isScreenTimeModuleAvailable = (): boolean => native !== null;

/** Whether "usage access" has been granted in Settings. `false` wherever the module is absent. */
export const hasUsageAccess = (): boolean => {
  try {
    return native?.hasUsageAccess() ?? false;
  } catch {
    return false;
  }
};

/** Opens Settings → Usage access. Returns whether it could (false = module absent). */
export const openUsageAccessSettings = (): boolean => {
  if (!native) return false;
  native.openUsageAccessSettings();
  return true;
};

/**
 * Today's summed foreground milliseconds, or `null` when the module is absent
 * or usage access has not been granted. Only a total ever crosses the bridge.
 */
export const getForegroundMillisToday = async (): Promise<number | null> => {
  if (!native || !hasUsageAccess()) return null;
  const millis = await native.getForegroundMillisToday();
  return Number.isFinite(millis) ? millis : null;
};
