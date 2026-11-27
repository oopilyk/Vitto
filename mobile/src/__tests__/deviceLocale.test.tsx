import { NativeModules, Platform } from 'react-native';
import { deviceLocale, deviceMeasurementSystem } from '../services/deviceLocale';

/**
 * The locale is read from whatever the platform exposes, so the thing worth
 * testing is that every source is optional: a missing native constant or a
 * missing `Intl` must fall back rather than throw on the very first screen.
 */
describe('deviceLocale', () => {
  const settings = NativeModules.SettingsManager?.settings;
  const i18n = NativeModules.I18nManager;
  const realIntl = global.Intl;

  afterEach(() => {
    Platform.OS = 'ios';
    if (settings) NativeModules.SettingsManager.settings = settings;
    if (i18n) NativeModules.I18nManager = i18n;
    global.Intl = realIntl;
  });

  it('reads the iOS locale constant when it is there', () => {
    Platform.OS = 'ios';
    NativeModules.SettingsManager = { settings: { AppleLocale: 'en_US' } };
    expect(deviceLocale()).toBe('en_US');
    expect(deviceMeasurementSystem()).toBe('imperial');
  });

  it('falls back to the language list when AppleLocale is absent', () => {
    Platform.OS = 'ios';
    NativeModules.SettingsManager = { settings: { AppleLanguages: ['fr-FR'] } };
    expect(deviceLocale()).toBe('fr-FR');
    expect(deviceMeasurementSystem()).toBe('metric');
  });

  it('reads the Android locale constant', () => {
    Platform.OS = 'android';
    NativeModules.SettingsManager = undefined;
    NativeModules.I18nManager = { localeIdentifier: 'en_US' };
    expect(deviceMeasurementSystem()).toBe('imperial');
  });

  it('falls back to Intl when no native constant is exposed', () => {
    Platform.OS = 'ios';
    NativeModules.SettingsManager = undefined;
    global.Intl = {
      DateTimeFormat: () => ({ resolvedOptions: () => ({ locale: 'en-US' }) }),
    } as unknown as typeof Intl;
    expect(deviceLocale()).toBe('en-US');
  });

  it('reads the iOS region through Settings, which the New Architecture keeps', () => {
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'ios' },
        NativeModules: {},
        Settings: { get: (key: string) => (key === 'AppleLocale' ? 'en_US' : undefined) },
      }));
      const fresh = require('../services/deviceLocale') as typeof import('../services/deviceLocale');
      expect(fresh.deviceLocale()).toBe('en_US');
      expect(fresh.deviceMeasurementSystem()).toBe('imperial');
    });
    jest.dontMock('react-native');
  });

  it('answers imperial rather than throwing when nothing is available', () => {
    Platform.OS = 'ios';
    NativeModules.SettingsManager = undefined;
    NativeModules.I18nManager = undefined;
    // Deleting Intl is the shape of a JS engine built without it.
    global.Intl = undefined as unknown as typeof Intl;
    expect(deviceLocale()).toBeUndefined();
    expect(deviceMeasurementSystem()).toBe('imperial');
  });
})
