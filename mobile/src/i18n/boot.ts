/**
 * Decides the app's language before anything else is imported.
 *
 * Imported first by index.ts, and importing nothing of ours itself: strings
 * are translated where they are written, some of them in tables built as
 * their module loads, so the language has to be known before the first of
 * those modules is. It is left in a global that @vitto/core's `t` reads (see
 * packages/core/src/i18n).
 *
 * The language is the phone's: the first of the person's preferred languages
 * that Vitto carries. On iOS that list already has the app's own language
 * first when one is chosen in Settings > Vitto > Language, and iOS restarts
 * the app when it changes, so nothing here has to watch for a change.
 */
import { Platform, Settings } from 'react-native';

const preferred = (): string[] => {
  const found: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === 'string' && value) found.push(value);
  };
  try {
    if (Platform.OS === 'web') {
      const web = globalThis as { location?: { search?: string }; localStorage?: { getItem(key: string): string | null }; navigator?: { languages?: readonly string[]; language?: string } };
      // A way to see another language in a browser without changing the browser's own.
      add(new URLSearchParams(web.location?.search ?? '').get('lang'));
      add(web.localStorage?.getItem('vitto.lang'));
      (web.navigator?.languages ?? []).forEach(add);
      add(web.navigator?.language);
    } else if (Platform.OS === 'ios') {
      const languages: unknown = Settings.get('AppleLanguages');
      if (Array.isArray(languages)) languages.forEach(add);
      add(Settings.get('AppleLocale'));
    }
  } catch {
    // Whatever could not be read: the fallbacks below, then English.
  }
  try {
    add(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    // No Intl: English.
  }
  return found;
};

/** One of the app's languages for a device tag; mirrors `localeFor` in @vitto/core, which cannot be imported here. */
const carried = (tag: string): 'en' | 'es' | 'zh-Hans' | null => {
  const parts = tag.toLowerCase().split(/[-_]/);
  if (parts[0] === 'en') return 'en';
  if (parts[0] === 'es') return 'es';
  if (parts[0] === 'zh') {
    const traditional = parts.includes('hant') || (!parts.includes('hans') && parts.some((part) => part === 'tw' || part === 'hk' || part === 'mo'));
    return traditional ? null : 'zh-Hans';
  }
  return null;
};

const globals = globalThis as { __VITTO_LOCALE__?: string; __VITTO_LOCALE_TAG__?: string; __VITTO_LOCALE_FALLBACK__?: boolean };
// A test or a tool that has already chosen is left alone.
if (globals.__VITTO_LOCALE__ === undefined) {
  const tags = preferred();
  const tag = tags.find((candidate) => carried(candidate) !== null);
  globals.__VITTO_LOCALE__ = tag ? carried(tag)! : 'en';
  // English because nothing of theirs is carried, not because they chose it:
  // dates and numbers are then written in English too (see formatLocale).
  globals.__VITTO_LOCALE_FALLBACK__ = !tag && tags.length > 0;
  // For dates and numbers: the region the phone is set to, when it is in the same language.
  const region = tags.find((candidate) => carried(candidate) === globals.__VITTO_LOCALE__ && /[-_][A-Za-z]{2}$/.test(candidate));
  globals.__VITTO_LOCALE_TAG__ = (region ?? tag ?? 'en').replace(/_/g, '-');
}
