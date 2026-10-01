import { createContext, useContext, useEffect, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppearancePreference, ColorScheme } from './theme';

const STORAGE_KEY = 'vitto.appearance';

export interface AppearanceState {
  /** What the user picked: follow the phone, or always light / dark. */
  preference: AppearancePreference;
  /** What is showing now, after `system` is resolved against the phone. */
  scheme: ColorScheme;
  setPreference: (next: AppearancePreference) => void;
}

const isPreference = (value: unknown): value is AppearancePreference => value === 'system' || value === 'light' || value === 'dark';

/**
 * Tells the OS too, so native pieces (the keyboard, alerts, switches, the
 * share sheet) match the app rather than the phone. `unspecified` hands the
 * choice back to the phone. Not every platform implements the override (web).
 */
const applyNativeOverride = (preference: AppearancePreference) => {
  try {
    Appearance.setColorScheme?.(preference === 'system' ? 'unspecified' : preference);
  } catch {
    // The override is a nicety; the app's own colours already follow the preference.
  }
};

/**
 * The appearance preference: kept on this device (it is a property of the
 * phone you are holding, like text size, not of the account), loaded at
 * launch, and resolved against the phone's own setting for `system`.
 */
export function useAppearanceState(): AppearanceState {
  const [preference, setPreferenceState] = useState<AppearancePreference>('system');
  const phone = useColorScheme();

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled || !isPreference(stored)) return;
        setPreferenceState(stored);
        applyNativeOverride(stored);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = (next: AppearancePreference) => {
    setPreferenceState(next);
    applyNativeOverride(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const scheme: ColorScheme = preference === 'system' ? (phone === 'dark' ? 'dark' : 'light') : preference;
  return { preference, scheme, setPreference };
}

export const AppearanceContext = createContext<AppearanceState>({
  preference: 'system',
  scheme: 'light',
  setPreference: () => {},
});

export const useAppearance = () => useContext(AppearanceContext);
