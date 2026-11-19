import { Platform, StyleSheet } from 'react-native';

export type ColorScheme = 'light' | 'dark';
/** What the user picked in Settings > Appearance. `system` follows the phone. */
export type AppearancePreference = 'system' | ColorScheme;

/**
 * The light palette: Clean coral. A neutral near-white page with pure white
 * cards, near-black text and cool greys, so the pixel rooms and the pets are
 * the warmth on screen. Coral stays the one accent, for actions and progress.
 * Even the faintest grey clears 4.5:1 on the page.
 */
const LIGHT = {
  paper: '#f6f6f7',
  card: '#ffffff',
  cardSoft: '#efeff1',
  ink: '#17171a',
  inkSoft: '#3a3a40',
  muted: '#5e5e66',
  faint: '#6b6b73',
  hairline: '#e6e6ea',
  border: '#c7c7cd',
  coral: '#c25a3e',
  coralDeep: '#a3472f',
  coralWash: '#fbe7df',
  mint: '#e3f1e6',
  mintDeep: '#2f7a4a',
  sage: '#e6efe3',
  sageSoft: '#f1f5ef',
  yellow: '#fbf0cc',
  yellowDeep: '#85651a',
  lilac: '#ece8f4',
  lilacDeep: '#5f4f8f',
  slate: '#ececef',
  /** Pale blue-grey. The aura palette is all light tones, so `sad` needs one too. */
  periwinkle: '#dcdfe8',
  slateDeep: '#5f5f66',
  danger: '#b3261e',
  petSkin: '#d87855',
  petShade: '#c8684d',
  petInk: '#643e36',
  /** Text and marks that sit ON coral (buttons, badges): white in both schemes. */
  onCoral: '#ffffff',
  /** The selected tint: a soft coral wash, and the edge that goes with it. */
  selectedFill: '#fbebe5',
  selectedBorder: '#eac2b3',
  /** The tile a sprite sits on (companion rows, avatars). */
  tile: '#f0f0f2',
  /** A focused text field lifts to this. */
  inputFocus: '#ffffff',
  /** Progress tracks and empty bars. */
  track: '#e7e7eb',
  /** The danger zone's quiet surface, its edge, and a pressed danger button. */
  dangerWash: '#fdf0ee',
  dangerBorder: '#f1c9c4',
  dangerPressed: '#fadcd7',
  /** Cautions that are not errors ("capped to stay safe"). */
  caution: '#8f5a3c',
  /** Soft row dividers inside lists. */
  divider: '#ececef',
  /** Shadows. */
  shadow: '#0b0b0d',
  /** A control raised off a track (the selected segment): lighter than what it sits on, in both schemes. */
  raised: '#ffffff',
  /** A primary button that cannot be pressed yet: a solid neutral, not a faded coral, so its label stays readable. */
  disabledFill: '#e7e7eb',
  onDisabled: '#6b6b73',
};

export type Palette = { [K in keyof typeof LIGHT]: string };

/**
 * Dark: Clean coral at night. A near-black neutral, not a warm brown.
 * Surfaces step UP in lightness (paper < card < cardSoft) so cards still read
 * as raised; text steps down from an off-white. The "deep" accents, used as
 * text on washes, flip to their light tints so they keep contrast; the washes
 * become dark tints of the same hue.
 */
const DARK: Palette = {
  paper: '#111113',
  card: '#1c1c1f',
  cardSoft: '#242428',
  ink: '#f4f4f5',
  inkSoft: '#d4d4d8',
  muted: '#a1a1aa',
  faint: '#85858e',
  hairline: '#2a2a2f',
  border: '#4a4a52',
  coral: '#d8775a',
  coralDeep: '#ec9479',
  coralWash: '#3a1d14',
  mint: '#1b2a20',
  mintDeep: '#8fd0a4',
  sage: '#1f2a1f',
  sageSoft: '#1a211a',
  yellow: '#33291a',
  yellowDeep: '#e8c46a',
  lilac: '#26222f',
  lilacDeep: '#c2b4ec',
  slate: '#232327',
  periwinkle: '#30343f',
  slateDeep: '#b0b0b8',
  danger: '#f2826f',
  petSkin: '#d87855',
  petShade: '#c8684d',
  petInk: '#643e36',
  onCoral: '#ffffff',
  selectedFill: '#33201a',
  selectedBorder: '#6e3a2a',
  tile: '#26262a',
  inputFocus: '#26262a',
  track: '#2c2c31',
  dangerWash: '#2a1714',
  dangerBorder: '#5c2c25',
  dangerPressed: '#3a1e1a',
  caution: '#e8a58c',
  divider: '#26262a',
  shadow: '#000000',
  raised: '#36363c',
  disabledFill: '#2a2a2f',
  onDisabled: '#8d8d96',
};

const PALETTES: Record<ColorScheme, Palette> = { light: LIGHT, dark: DARK };

let activeScheme: ColorScheme = 'light';

/** The scheme every `colors` read and every `themedStyles` sheet answers with right now. */
export const getColorScheme = (): ColorScheme => activeScheme;

/** One scheme's palette whatever the active one: for a page that follows the room's light, not the phone's (Today goes dark at night). */
export const paletteOf = (scheme: ColorScheme): Palette => PALETTES[scheme];

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
 * Two typographic worlds: the pet's room (the main page, the pet, its
 * celebrations) is set in the pixel face; every other page is set in the
 * system's own, San Francisco on iOS (`ui`).
 */
export const fonts = {
  // The pet world's names, all the pixel face: the old names stay so its
  // styles read on, and resolve to the matching pixel weight.
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
  /**
   * The pet world's own HUD keeps the platform's faces it was designed in: the
   * clean monospace sits better over the pixel-art rooms than the pixel font.
   */
  /**
   * Everything outside the pet's world: San Francisco on iOS, the platform
   * sans elsewhere. Sizes are a system font's (17 body, 34 large title), and
   * weight comes from `fontWeight`.
   */
  ui: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }) as string,
  /** A serif for letters that must read alone, like a word game's capital I (SF draws it as a bare stroke). */
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }) as string,
  systemMono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
  system: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }) as string,
};

/**
 * Apple's type scale, in San Francisco: large title 34, title 28, headline
 * 17 semibold, body 17, subhead 15, footnote 13. Tracking stays at the face's
 * own; only the small uppercase eyebrow is opened up.
 */
export const text = themedStyles(() => ({
  kicker: {
    fontFamily: fonts.ui,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: colors.faint,
    textTransform: 'uppercase',
  },
  display: { fontFamily: fonts.ui, fontSize: 34, fontWeight: '700', color: colors.ink },
  /**
   * A log or game page's title, in the pet world's pixel face: the sheets that
   * open over the rooms used to be set entirely in the system font, and moving
   * between the two read as switching apps. The face draws small, hence 38.
   */
  title: { fontFamily: fonts.pixel, fontSize: 38, lineHeight: 40, letterSpacing: 0.3, color: colors.ink },
  heading: { fontFamily: fonts.ui, fontSize: 17, fontWeight: '600', color: colors.ink },
  body: { fontFamily: fonts.ui, fontSize: 17, color: colors.inkSoft, lineHeight: 24 },
  small: { fontFamily: fonts.ui, fontSize: 15, color: colors.muted, lineHeight: 20 },
  mono: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, fontVariant: ['tabular-nums'] },
  stat: { fontFamily: fonts.ui, fontSize: 20, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  error: { fontFamily: fonts.ui, color: colors.danger, fontSize: 15, lineHeight: 20 },
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
  // Surfaces lift off the page by tone and a soft shadow, not an outline.
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 16,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hairline: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  primaryButton: {
    backgroundColor: colors.coral,
    borderRadius: 14,
    borderCurve: 'continuous',
    // The pet world's hard, unblurred drop (see retroStyle), softened: the main
    // button reads as the game's own chunky button rather than a flat web one.
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.32,
    shadowRadius: 0,
    elevation: 3,
    minHeight: 52,
    paddingVertical: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryLabel: { color: colors.onCoral, fontFamily: fonts.ui, fontSize: 17, fontWeight: '600' },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderCurve: 'continuous',
    fontFamily: fonts.ui,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 17,
    color: colors.ink,
  },
}));
