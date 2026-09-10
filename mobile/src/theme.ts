import { Platform, StyleSheet } from 'react-native';

/** The palette lifted from the web build's stylesheet, in one place. */
export const colors = {
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
} as const;

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

export const text = StyleSheet.create({
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
});

export const layout = StyleSheet.create({
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
  primaryLabel: { color: '#fff', fontFamily: fonts.mono, fontSize: 12, letterSpacing: 0.8 },
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
});
