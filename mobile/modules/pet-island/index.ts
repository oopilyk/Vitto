import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/**
 * Thin JS wrapper over the local `VittoPetIsland` Expo module (iOS only — see
 * ios/ beside this file). Every export degrades gracefully when the native
 * module is absent: Android, web, jest, and an iOS build made before
 * `expo prebuild` picked the module up all get `false` / a resolved promise
 * rather than a crash. The `expo` package re-exports expo-modules-core, so no
 * new dependency.
 */

/** Mirrors `IslandState` in ios/PetIslandModule.swift. Times are epoch seconds. */
export interface IslandState {
  petId: string;
  name: string;
  sprite: string;
  headline: string;
  mood: string;
  health: number;
  asOf: number;
  nutritionFullAt: number;
  nutritionEmptyAt: number;
  energyFullAt: number;
  energyEmptyAt: number;
  happinessFullAt: number;
  happinessEmptyAt: number;
  nextNeedAt?: number;
  nextNeed?: string;
}

interface PetIslandNativeModule {
  isAvailable(): boolean;
  sync(state: IslandState): Promise<void>;
  end(): Promise<void>;
}

const native: PetIslandNativeModule | null =
  Platform.OS === 'ios' ? requireOptionalNativeModule<PetIslandNativeModule>('VittoPetIsland') : null;

/** Whether this device can show the pet in the Island at all. */
export const isIslandAvailable = (): boolean => {
  try {
    return native?.isAvailable() ?? false;
  } catch {
    return false;
  }
};

/** Starts or refreshes the activity. Resolves either way; a failure is logged, not thrown. */
export const syncIsland = async (state: IslandState): Promise<void> => {
  if (!native) return;
  try {
    await native.sync(state);
  } catch (error) {
    console.warn('[island] sync failed', error);
  }
};

export const endIsland = async (): Promise<void> => {
  if (!native) return;
  try {
    await native.end();
  } catch {
    // Nothing to take down, or nothing that can be. Either way, done.
  }
};
