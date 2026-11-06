import { StyleSheet } from 'react-native';
import { fonts, world, themedStyles } from '../theme';

/**
 * The room's day/night palette in the app's Apple-like language, for the pages
 * outside the room that follow the room's light (Today, the mind games): the
 * same names and shape as petWorld/retroStyle, so a page moves over by its
 * import, but soft cards and San Francisco in place of hard outlines, offset
 * shadows and the mono labels.
 */
export const SURFACE_BORDER_WIDTH = 1;
export const SURFACE_RADIUS = 14;

/** A soft lift, not a drop: the card sits just off the page. */
export const surfaceShadow = {
  shadowColor: '#2a1f16',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 14,
  elevation: 2,
} as const;

export const surface = themedStyles(() => ({
  panel: {
    backgroundColor: world.surface,
    borderRadius: 18,
    borderCurve: 'continuous',
    ...surfaceShadow,
  },
  // A step up from the night page (world.nightSurface), so the card still reads as raised.
  panelNight: {
    backgroundColor: '#382f29',
    shadowColor: '#000000',
    shadowOpacity: 0.3,
  },
  /** Secondary: a hairline instead of the lift, so it sits back. */
  panelQuiet: {
    backgroundColor: world.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(67,55,44,0.16)',
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  panelQuietNight: {
    backgroundColor: '#332a25',
    borderColor: 'rgba(239,229,208,0.14)',
  },

  kicker: {
    fontFamily: fonts.ui,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: world.inkSoft,
    textTransform: 'uppercase',
  },
  kickerNight: { color: world.nightTextSoft },
  label: {
    fontFamily: fonts.ui,
    fontSize: 15,
    fontWeight: '600',
    color: world.ink,
  },
  labelNight: { color: world.nightText },
  caption: {
    fontFamily: fonts.ui,
    fontSize: 13,
    color: world.inkSoft,
  },
  captionNight: { color: world.nightTextSoft },
}));

/** Pressed: it gives a little under the finger, rather than dropping into a shadow. */
export const surfacePressed = {
  opacity: 0.85,
  transform: [{ scale: 0.97 }],
} as const;
