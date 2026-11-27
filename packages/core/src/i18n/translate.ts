import es from './es.json';
import zhHans from './zh-Hans.json';

/**
 * The app's languages. English is the source: every string is written in
 * English where it is used, wrapped in `t()`, and the other languages are
 * catalogs keyed by that English (es.json, zh-Hans.json). A string with no
 * translation yet shows in English rather than as a key or a blank.
 *
 * The language is decided once, before any screen is built, and never changes
 * while the app runs: iOS restarts an app when its language is changed in
 * Settings. That is what lets a string be translated wherever it is written,
 * a module-level table included. See README.md in this folder for the rules.
 */
export type Locale = 'en' | 'es' | 'zh-Hans';
export const LOCALES: readonly Locale[] = ['en', 'es', 'zh-Hans'];

const CATALOGS: Record<Exclude<Locale, 'en'>, Record<string, string>> = { es, 'zh-Hans': zhHans };

/**
 * A language tag as a device writes it ("es-MX", "es_419", "zh-Hans-CN",
 * "zh_CN") as one of ours, or null when it is not one we carry. Traditional
 * Chinese (zh-Hant, Taiwan, Hong Kong, Macau) is not Simplified: null.
 */
export const localeFor = (tag: string | null | undefined): Locale | null => {
  if (typeof tag !== 'string') return null;
  const parts = tag.trim().toLowerCase().split(/[-_]/);
  const language = parts[0];
  if (language === 'en') return 'en';
  if (language === 'es') return 'es';
  if (language === 'zh') {
    if (parts.includes('hant') || (!parts.includes('hans') && parts.some((part) => part === 'tw' || part === 'hk' || part === 'mo'))) return null;
    return 'zh-Hans';
  }
  return null;
};

/** The first of a person's languages, in their order of preference, that the app carries; English when none is. */
export const pickLocale = (preferred: readonly (string | null | undefined)[]): Locale => {
  for (const tag of preferred) {
    const locale = localeFor(tag);
    if (locale) return locale;
  }
  return 'en';
};

interface LocaleGlobals {
  /** Set by each app's entry file before anything else is imported (mobile: src/i18n/boot.ts). */
  __VITTO_LOCALE__?: unknown;
  /** The device's own tag for it ("es-MX"), for dates and numbers. */
  __VITTO_LOCALE_TAG__?: unknown;
  /** True when the app is in English only because the phone's languages are none of ours. */
  __VITTO_LOCALE_FALLBACK__?: unknown;
}

let active: Locale | null = null;

/** The language the app is in. Read from the entry file's global the first time it is asked. */
export const getLocale = (): Locale => {
  if (active === null) {
    const set = (globalThis as LocaleGlobals).__VITTO_LOCALE__;
    active = typeof set === 'string' ? pickLocale([set]) : 'en';
  }
  return active;
};

/**
 * For tests and tools. Strings already translated (anything built at module
 * level) keep the language they were built in, which is why the app itself
 * never calls this after start.
 */
export const setLocale = (locale: Locale): void => {
  active = locale;
};

/**
 * The locale to hand `toLocaleDateString` and friends, so dates and numbers
 * are written the way the app's language writes them. Undefined in English:
 * the device's own English conventions (en-GB's day before month) then apply,
 * as they did before there were other languages. The exception is a phone in
 * a language the app does not carry: its own conventions would put French
 * month names in an English screen, so it gets plain US English.
 */
export const formatLocale = (): string | undefined => {
  const locale = getLocale();
  if (locale === 'en') return (globalThis as LocaleGlobals).__VITTO_LOCALE_FALLBACK__ === true ? 'en-US' : undefined;
  const tag = (globalThis as LocaleGlobals).__VITTO_LOCALE_TAG__;
  if (typeof tag === 'string' && localeFor(tag) === locale) {
    try {
      return Intl.getCanonicalLocales(tag.replace(/_/g, '-'))[0];
    } catch {
      // Not a tag Intl accepts: the plain language below.
    }
  }
  return locale === 'zh-Hans' ? 'zh-Hans-CN' : locale;
};

export type Params = Record<string, string | number>;

const fill = (text: string, params?: Params): string =>
  params ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole)) : text;

const CONTEXT = '||';

const lookup = (key: string): string | undefined => {
  const locale = getLocale();
  return locale === 'en' ? undefined : CATALOGS[locale][key];
};

/**
 * A string in the app's language. `source` is the English, written in place;
 * values go in as `{name}` placeholders: `t('{count} coins', { count })`.
 */
export const t = (source: string, params?: Params): string => fill(lookup(source) ?? source, params);

/**
 * `t` for an English string that means two things: `tx('workout set', 'Set')`
 * and `tx('to set a value', 'Set')` are translated separately. The context is
 * for the translator and is never shown.
 */
export const tx = (context: string, source: string, params?: Params): string =>
  fill(lookup(`${source}${CONTEXT}${context}`) ?? source, params);

/**
 * A counted string: `tn(count, '{count} coin', '{count} coins')`. `count` is
 * filled in as `{count}`. English and Spanish use the first form for exactly
 * one; Chinese has one form, and translates both the same.
 */
export const tn = (count: number, one: string, other: string, params?: Params): string =>
  t(count === 1 ? one : other, { count, ...params });

/**
 * Marks an English string for translation without translating it: for a value
 * that is stored, compared or sent as it is (an exercise's name, a label kept
 * in a saved record) and only translated where it is shown, with `t(value)`.
 */
export const msg = <T extends string>(source: T): T => source;

/**
 * The pieces of a translated string around its `{placeholders}`, in the
 * translation's own order, for a sentence with something other than text in
 * it (a bold price, a link): each piece is either `{ text }` or `{ slot }`.
 */
export const tParts = (source: string, params?: Params): ({ text: string } | { slot: string })[] => {
  const template = lookup(source) ?? source;
  const parts: ({ text: string } | { slot: string })[] = [];
  let last = 0;
  for (const match of template.matchAll(/\{(\w+)\}/g)) {
    const name = match[1]!;
    if (params && name in params) continue;
    if (match.index > last) parts.push({ text: fill(template.slice(last, match.index), params) });
    parts.push({ slot: name });
    last = match.index + match[0].length;
  }
  if (last < template.length) parts.push({ text: fill(template.slice(last), params) });
  return parts;
};

/** Whether the app's language is written without spaces between words (Chinese): for layout that counts characters. */
export const isCjk = (): boolean => getLocale() === 'zh-Hans';

/**
 * The daily word puzzle is five-letter English words, so it is only offered in
 * English: every way into it (the Mind hub, Today's goals, its stats and
 * reminders) asks this first.
 */
export const wordPuzzleAvailable = (): boolean => getLocale() === 'en';

/**
 * The pet's spoken voice has English voices only, and reads other languages
 * wrongly: where this is false the pet does not speak aloud, and nothing
 * offers that it will (Settings, the Plus comparison).
 */
export const petSpeechAvailable = (): boolean => getLocale() === 'en';

/** The language to ask speech recognition (dictation, the mic) to listen for. */
export const dictationLanguage = (): string => {
  const locale = getLocale();
  if (locale === 'en') return 'en-US';
  const tag = formatLocale();
  if (tag && /-[A-Z]{2}$/.test(tag)) return locale === 'zh-Hans' ? `zh-${tag.slice(-2)}` : tag;
  return locale === 'zh-Hans' ? 'zh-CN' : 'es-ES';
};
