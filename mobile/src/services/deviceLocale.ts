import { NativeModules, Platform, Settings } from 'react-native';
import { measurementSystemForLocale, type MeasurementSystem } from '@vitto/core';

/**
 * The device's locale, for defaulting the measurement system at sign-up.
 *
 * Read from whatever the platform happens to expose rather than by adding
 * `expo-localization`: this is one string used once, for a default the user can
 * change on the same screen, which does not justify a native dependency and a
 * rebuild.
 *
 * Every source is feature-detected and the whole thing is wrapped, because a
 * missing `Intl` or a renamed native constant must not take the app down on the
 * very first screen — the fallback is imperial (see deviceMeasurementSystem).
 */
export const deviceLocale = (): string | undefined => {
  try {
    if (Platform.OS === 'ios') {
      // `Settings` first: under the New Architecture (the only one from RN 0.82)
      // `NativeModules.SettingsManager.settings` is undefined, so the region was
      // never read there and the default came from the JS engine's guess.
      let fromSettings: unknown;
      try {
        fromSettings = Settings.get('AppleLocale') ?? Settings.get('AppleLanguages')?.[0];
      } catch {
        // No settings module: the sources below.
      }
      if (typeof fromSettings === 'string' && fromSettings) return fromSettings;
      const settings = NativeModules?.SettingsManager?.settings;
      const ios = settings?.AppleLocale ?? settings?.AppleLanguages?.[0];
      if (typeof ios === 'string' && ios) return ios;
    }
    if (Platform.OS === 'android') {
      const android = NativeModules?.I18nManager?.localeIdentifier;
      if (typeof android === 'string' && android) return android;
    }
    // Hermes ships Intl, and it is the only source on web. Last because the
    // native constants above are the device setting, where this can be the
    // JS engine's idea of it.
    if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
      const resolved = Intl.DateTimeFormat().resolvedOptions().locale;
      if (typeof resolved === 'string' && resolved) return resolved;
    }
  } catch {
    // Fall through to undefined: deviceMeasurementSystem answers imperial.
  }
  return undefined;
};

/**
 * What a fresh install should start on. A default, not a lock. Imperial unless
 * the phone says it is somewhere metric: when the region cannot be read at all,
 * an American phone flipping to kilograms is the worse mistake.
 */
export const deviceMeasurementSystem = (): MeasurementSystem => {
  const locale = deviceLocale();
  return locale ? measurementSystemForLocale(locale) : 'imperial';
};
