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
