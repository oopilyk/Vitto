import { Platform, StyleSheet } from 'react-native';

export type ColorScheme = 'light' | 'dark';
/** What the user picked in Settings > Appearance. `system` follows the phone. */
export type AppearancePreference = 'system' | ColorScheme;

/** The palette lifted from the web build's stylesheet, in one place. */
const LIGHT = {
  paper: '#f5f2eb',
  card: '#fffdf8',
  cardSoft: '#faf9f5',
  ink: '#26312d',
  inkSoft: '#4e5b55',
  muted: '#78817a',
  faint: '#999f98',
  hairline: '#dedbd3',
  border: '#c7cdc5',
  coral: '#d85d45',
  coralDeep: '#c34b37',
  coralWash: '#f4d6ce',
  mint: '#d7e9dc',
  mintDeep: '#558461',
  sage: '#dae6d9',
  sageSoft: '#e7efe5',
  yellow: '#f4e9bb',
  yellowDeep: '#9a7b28',
  lilac: '#e3ddf0',
  lilacDeep: '#6b5b8f',
  slate: '#dfe1e4',
  /** Pale blue-grey. The aura palette is all light tones, so `sad` needs one too. */
  periwinkle: '#c9d0e0',
  slateDeep: '#6a7079',
  danger: '#b34e3e',
  petSkin: '#d87855',
  petShade: '#c8684d',
  petInk: '#643e36',
  /** Text and marks that sit ON coral (buttons, badges): white in both schemes. */
  onCoral: '#ffffff',
  /** The selected tint: a soft coral wash, and the edge that goes with it. */
  selectedFill: '#fbeee9',
  selectedBorder: '#efc9bd',
  /** The warm tile a sprite sits on (companion rows, avatars). */
  tile: '#efe7d8',
  /** A focused text field lifts to this. */
  inputFocus: '#ffffff',
  /** Progress tracks and empty bars. */
  track: '#e4e0d6',
  /** The danger zone's quiet surface, its edge, and a pressed danger button. */
  dangerWash: '#fbf5f3',
  dangerBorder: '#ecd2cc',
  dangerPressed: '#f6dcd6',
  /** Cautions that are not errors ("capped to stay safe"). */
  caution: '#9a6b5c',
  /** Soft row dividers inside lists. */
  divider: '#eee9e1',
  /** Shadows: dark in light mode, and still dark (just deeper) in dark mode. */
  shadow: '#26312d',
  /** A control raised off a track (the selected segment): lighter than what it sits on, in both schemes. */
  raised: '#fffdf8',
  /** A primary button that cannot be pressed yet: a solid neutral, not a faded coral, so its label stays readable. */
  disabledFill: '#e6e2d9',
  onDisabled: '#737a74',
};

export type Palette = { [K in keyof typeof LIGHT]: string };

/**
 * Dark: the same warm, green-leaning family at night rather than a cold
 * blue-black. Surfaces step UP in lightness (paper < card < cardSoft) so cards
 * still read as raised; text steps down from a warm off-white. The "deep"
 * accents, used as text on washes, flip to their light tints so they keep
 * contrast; the washes become dark tints of the same hue.
 */
const DARK: Palette = {
  paper: '#141816',
  card: '#1c211e',
  cardSoft: '#222824',
  ink: '#eef0ea',
  inkSoft: '#c9d0c9',
  muted: '#a2aaa3',
  faint: '#7f8881',
  hairline: '#2d3531',
  border: '#46504a',
  coral: '#e2694f',
  coralDeep: '#f39178',
  coralWash: '#4a2a22',
  mint: '#20362a',
  mintDeep: '#86c79a',
  sage: '#24322a',
  sageSoft: '#1d2a22',
  yellow: '#3a3220',
  yellowDeep: '#e3c46e',
  lilac: '#2c2840',
  lilacDeep: '#b9a9e6',
  slate: '#2a2f33',
  periwinkle: '#36405a',
  slateDeep: '#aab2bd',
  danger: '#f08470',
  petSkin: '#d87855',
  petShade: '#c8684d',
  petInk: '#643e36',
  onCoral: '#ffffff',
  selectedFill: '#3a241e',
  selectedBorder: '#6e3b2e',
  tile: '#2b2a24',
  inputFocus: '#252c28',
  track: '#2f3833',
  dangerWash: '#2a1b18',
  dangerBorder: '#5a2e26',
  dangerPressed: '#3b231e',
  caution: '#e0a48f',
  divider: '#29312d',
  shadow: '#000000',
  raised: '#3a443e',
  disabledFill: '#2c3430',
  onDisabled: '#8f9891',
};

const PALETTES: Record<ColorScheme, Palette> = { light: LIGHT, dark: DARK };

let activeScheme: ColorScheme = 'light';

/** The scheme every `colors` read and every `themedStyles` sheet answers with right now. */
export const getColorScheme = (): ColorScheme => activeScheme;

/**
 * Switches the scheme. Called by App before it renders, from the Appearance
 * preference (and the phone's setting, for `system`); the tree below then
 * re-mounts so every style is read again in the new scheme.
 */
export const setActiveColorScheme = (scheme: ColorScheme) => {
  activeScheme = scheme;
};

/**
 * The live palette. Every property is a getter on the active scheme, so a read
 * at render time is always the current colour. Read it at render (or inside
 * `themedStyles`), never into a module-level constant: that would freeze the
 * scheme it happened to load in.
 */
export const colors = Object.defineProperties(
  {},
  Object.fromEntries(
    (Object.keys(LIGHT) as (keyof Palette)[]).map((key) => [key, { enumerable: true, get: () => PALETTES[activeScheme][key] }]),
  ),
) as Readonly<Palette>;

/**
 * `StyleSheet.create`, per scheme. The factory runs once per scheme, the first
 * time a style is read in it, and is cached; reads go to the active scheme's
 * sheet. So a file's styles keep their usual shape (`styles.card`) and pick up
 * dark mode without the file knowing about it.
 */
export function themedStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: () => T & StyleSheet.NamedStyles<any>,
): T {
  const sheets: Partial<Record<ColorScheme, T>> = {};
  const current = (): T => (sheets[activeScheme] ??= StyleSheet.create(factory()));
  return new Proxy({} as T, {
    get: (_target, key) => (current() as Record<string | symbol, unknown>)[key],
    has: (_target, key) => key in (current() as object),
    ownKeys: () => Reflect.ownKeys(current() as object),
    getOwnPropertyDescriptor: (_target, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(current() as object, key);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  });
}

/**
 * The pet world's own palette — warm parchment surfaces, warm dark-brown
 * outlines, and accents pulled from the living-room art (muted coral, sage,
 * tan). Kept separate from `colors` (which the rest of the app uses) so the
 * HUD, level ring and hotbar can feel like they were painted into the scene
 * without touching every other screen. Night is the same language in deeper,
 * warmer tones with a cream highlight — not a bright daytime UI over a dark
 * room.
 */
export const world = {
  // Day
  surface: '#efe5d0', // warm cream / parchment — the primary light UI surface
  surfaceSoft: '#e4d7bd', // recessed / pressed
  ink: '#43372c', // warm dark-brown outline + primary text
  inkSoft: '#6f6252', // muted warm-brown secondary text
  accent: '#c56a4e', // muted coral — selected nav, today, progression, attention
  accentDeep: '#a9553c',
  accentWash: '#e7d0c4',
  positive: '#6f9163', // muted sage — a positive pet state

  // Night — deeper muted tones, warm cream highlights, restrained accents
  nightSurface: '#2b2420', // warm charcoal-brown (not a cold blue-black)
  nightSurfaceSoft: 'rgba(43,36,32,0.80)',
  nightInk: '#7d6d5e', // light enough that the outline never vanishes on a dark scene
  nightText: '#efe5d0', // the same warm cream as the day surface
  nightTextSoft: '#b3a690',
  nightAccent: '#d17f60',

  // The translucent hotbar strip, warmed
  barDay: 'rgba(46,38,30,0.30)',
  barNight: 'rgba(18,14,16,0.42)',
  barHairline: 'rgba(239,229,208,0.14)',
} as const;

/**
 * The web used Fraunces for display text and DM Mono for labels. Rather than ship
 * font files, native maps them to the platform's own serif and monospace faces,
 * which keeps the same typographic contrast without a font-loading step.
 */
export const fonts = {
  display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }) as string,
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
  body: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }) as string,
};

export const text = themedStyles(() => ({
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.3,
    color: colors.faint,
    textTransform: 'uppercase',
  },
  display: { fontFamily: fonts.display, fontSize: 34, color: colors.ink, letterSpacing: -1 },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.ink, letterSpacing: -0.6 },
  heading: { fontSize: 17, fontWeight: '600', color: colors.ink },
  body: { fontSize: 14, color: colors.inkSoft, lineHeight: 21 },
  small: { fontSize: 12, color: colors.muted },
  mono: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.6, color: colors.muted },
  stat: { fontSize: 18, fontWeight: '700', color: colors.ink },
  error: { color: colors.danger, fontSize: 13 },
}));

export const layout = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.paper },
  /**
   * An `<Image>` that should fill its parent box. The explicit `100%` sizing is
   * load-bearing, not redundant with the insets: react-native-web renders an
   * inset-only absolute image at the asset's intrinsic pixel size (e.g. a 380px
   * button glyph, an 834px room photo), which overflows the parent and makes
   * the whole page scrollable/zoomable. Native clips it anyway; web needs this.
   */
  fillImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  padded: { paddingHorizontal: 22 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 16,
    padding: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hairline: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  primaryButton: {
    backgroundColor: colors.coral,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  primaryLabel: { color: colors.onCoral, fontFamily: fonts.mono, fontSize: 12, letterSpacing: 0.8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
  },
}));
