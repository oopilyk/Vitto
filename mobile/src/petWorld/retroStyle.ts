import { StyleSheet } from 'react-native';
import { fonts, world } from '../theme';

/**
 * The pet-world's pixel-UI design language, in one place. Warm parchment
 * surfaces, warm dark-brown outlines, one hard shadow. Two panel weights so the
 * HUD has a real primary / secondary hierarchy instead of a wall of equal
 * boxes:
 *
 *   panel       — the hero. warm-ink outline + a hard, un-blurred offset shadow
 *                 (the blocky drop a pixel-art interface uses instead of a glow).
 *   panelQuiet  — everything secondary. thinner outline, no shadow: present, but
 *                 it sits back.
 *
 * Night is the same language in deeper warm tones with a cream highlight — see
 * `world` in `theme.ts`.
 */
export const RETRO_BORDER_WIDTH = 3;
export const RETRO_RADIUS = 4;

/** The one hard drop shadow. Never re-declared inline — import this. */
export const retroShadow = {
  shadowColor: '#2a1f16',
  shadowOffset: { width: 3, height: 3 },
  shadowOpacity: 0.9,
  shadowRadius: 0,
  elevation: 4,
} as const;

export const retro = StyleSheet.create({
  panel: {
    backgroundColor: world.surface,
    borderWidth: RETRO_BORDER_WIDTH,
    borderColor: world.ink,
    borderRadius: RETRO_RADIUS,
    ...retroShadow,
  },
  panelNight: {
    backgroundColor: world.nightSurface,
    borderColor: world.nightInk,
  },
  /** Secondary chrome: thinner outline, no shadow — it recedes under `panel`. */
  panelQuiet: {
    backgroundColor: world.surface,
    borderWidth: 2,
    borderColor: world.ink,
    borderRadius: RETRO_RADIUS,
  },
  panelQuietNight: {
    backgroundColor: world.nightSurfaceSoft,
    borderColor: world.nightInk,
  },

  // Type scale — mono throughout, 10px floor so nothing is a squint.
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: world.inkSoft,
    textTransform: 'uppercase',
  },
  kickerNight: { color: world.nightTextSoft },
  label: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: world.ink,
    textTransform: 'uppercase',
  },
  labelNight: { color: world.nightText },
  caption: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.6,
    color: world.inkSoft,
  },
  captionNight: { color: world.nightTextSoft },
  /** Retained name for callers not yet migrated to `caption`. */
  subtle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    color: world.inkSoft,
  },
  subtleNight: { color: world.nightTextSoft },
});

/** The "button depresses into its own shadow" press move — identical across
 *  every retro control. */
export const retroPressed = {
  opacity: 0.82,
  transform: [{ translateX: 2 }, { translateY: 2 }],
} as const;
