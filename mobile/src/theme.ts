import { StyleSheet } from 'react-native';

export type ColorScheme = 'light' | 'dark';
/** What the user picked in Settings > Appearance. `system` follows the phone. */
export type AppearancePreference = 'system' | ColorScheme;

/** The palette lifted from the web build's stylesheet, in one place. */
const LIGHT = {
  paper: '#e9dfc9',
  card: '#f4ecdb',
  cardSoft: '#efe5d0',
  ink: '#43372c',
  inkSoft: '#5f5243',
  muted: '#7a6c5b',
  faint: '#968977',
  hairline: '#d4c5a6',
  border: '#a39377',
  coral: '#c56a4e',
  coralDeep: '#a9553c',
  coralWash: '#ecd3c5',
  mint: '#dfe6cf',
  mintDeep: '#5e7f53',
  sage: '#dde3c8',
  sageSoft: '#e8ebd8',
  yellow: '#f0e2b3',
  yellowDeep: '#8a6d27',
  lilac: '#e5dbe8',
  lilacDeep: '#6b5b8f',
  slate: '#e2dccf',
  /** Pale blue-grey. The aura palette is all light tones, so `sad` needs one too. */
  periwinkle: '#cfd2dc',
  slateDeep: '#6a665e',
  danger: '#a8473a',
  petSkin: '#d87855',
  petShade: '#c8684d',
  petInk: '#643e36',
  /** Text and marks that sit ON coral (buttons, badges): a warm white in both schemes. */
  onCoral: '#fff8ec',
  /** The selected tint: a soft coral wash, and the edge that goes with it. */
  selectedFill: '#f3e1d3',
  selectedBorder: '#d9b39d',
  /** The warm tile a sprite sits on (companion rows, avatars). */
  tile: '#e6d9bd',
  /** A focused text field lifts to this. */
  inputFocus: '#fbf5e8',
  /** Progress tracks and empty bars. */
  track: '#ddd0b4',
  /** The danger zone's quiet surface, its edge, and a pressed danger button. */
  dangerWash: '#f6ebe1',
  dangerBorder: '#e2c3b5',
  dangerPressed: '#efd5c8',
  /** Cautions that are not errors ("capped to stay safe"). */
  caution: '#93604f',
  /** Soft row dividers inside lists. */
  divider: '#e0d3b9',
  /** Shadows: the pet world's hard, warm-dark drop. */
  shadow: '#2a1f16',
  /** A control raised off a track (the selected segment): lighter than what it sits on, in both schemes. */
  raised: '#f8f1e3',
  /** A primary button that cannot be pressed yet: a solid neutral, not a faded coral, so its label stays readable. */
  disabledFill: '#ddd2bc',
  onDisabled: '#76695a',
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
  paper: '#1c1714',
  card: '#2b2420',
  cardSoft: '#332a25',
  ink: '#efe5d0',
  inkSoft: '#d6c9b1',
  muted: '#b3a690',
  faint: '#8f8370',
  hairline: '#3d342d',
  border: '#6b5c4e',
  coral: '#d17f60',
  coralDeep: '#eba082',
  coralWash: '#4a2c22',
  mint: '#26301f',
  mintDeep: '#9cc48a',
  sage: '#2a3224',
  sageSoft: '#232a1f',
  yellow: '#3b3220',
  yellowDeep: '#e3c46e',
  lilac: '#2f2838',
  lilacDeep: '#c2b0e6',
  slate: '#2e2a26',
  periwinkle: '#383d4e',
  slateDeep: '#b6ad9f',
  danger: '#f08470',
  petSkin: '#d87855',
  petShade: '#c8684d',
  petInk: '#643e36',
  onCoral: '#fff8ec',
  selectedFill: '#3d2820',
  selectedBorder: '#704030',
  tile: '#352d26',
  inputFocus: '#2f2823',
  track: '#3a312a',
  dangerWash: '#2d1d18',
  dangerBorder: '#5c3328',
  dangerPressed: '#3d241d',
  caution: '#e0a48f',
  divider: '#352c26',
  shadow: '#000000',
  raised: '#40362f',
  disabledFill: '#352d27',
  onDisabled: '#958977',
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
  // Every face is the pixel one now (see `pixel` below): the old names stay so
  // existing styles read on, and resolve to the matching pixel weight.
  display: 'Jersey10_400Regular',
  mono: 'Jersey10_400Regular',
  body: 'Jersey10_400Regular',
  /**
   * The pet world's pixel face (Jersey 10, loaded once in App): chunky and
   * game-like, and readable in paragraphs, so one face carries titles, buttons
   * and body text. It draws small for its size, so sizes run about a third
   * larger than a system font's. Until it has loaded the platform font stands in.
   */
  pixel: 'Jersey10_400Regular',
  // Jersey 10 has one weight: bold text uses the same face.
  pixelBold: 'Jersey10_400Regular',
};

export const text = themedStyles(() => ({
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 13,
    letterSpacing: 1.3,
    color: colors.faint,
    textTransform: 'uppercase',
  },
  display: { fontFamily: fonts.display, fontSize: 42, color: colors.ink, letterSpacing: 0.5 },
  title: { fontFamily: fonts.display, fontSize: 33, color: colors.ink, letterSpacing: 0.3 },
  heading: { fontFamily: fonts.pixelBold, fontSize: 22, fontWeight: '600', color: colors.ink },
  body: { fontFamily: fonts.pixel, fontSize: 20, color: colors.inkSoft, lineHeight: 27 },
  small: { fontFamily: fonts.pixel, fontSize: 17, color: colors.muted },
  mono: { fontFamily: fonts.mono, fontSize: 14, letterSpacing: 0.6, color: colors.muted },
  stat: { fontFamily: fonts.pixelBold, fontSize: 23, fontWeight: '700', color: colors.ink },
  error: { fontFamily: fonts.pixel, color: colors.danger, fontSize: 18 },
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
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 4,
    padding: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hairline: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  primaryButton: {
    backgroundColor: colors.coral,
    borderWidth: 3,
    borderColor: colors.shadow,
    borderRadius: 4,
    shadowColor: colors.shadow,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.9,
    shadowRadius: 0,
    elevation: 4,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  primaryLabel: { color: colors.onCoral, fontFamily: fonts.pixelBold, fontSize: 20, letterSpacing: 1 },
  input: {
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 4,
    fontFamily: fonts.pixel,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 20,
    color: colors.ink,
  },
}));
