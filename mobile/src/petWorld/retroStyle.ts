import { StyleSheet } from 'react-native';
import { colors, fonts } from '../theme';

/**
 * The pet-world's pixel-UI design language, in one place. Two panel weights and
 * one shadow, so the HUD can have a real primary / secondary hierarchy instead
 * of a dozen equally-loud boxes:
 *
 *   panel       — the hero. 3px ink outline + a hard, un-blurred offset shadow
 *                 (the blocky drop a pixel-art interface uses instead of a glow).
 *   panelQuiet  — everything secondary. 2px outline, no shadow: present, but it
 *                 sits back.
 *
 * iOS honours `shadowRadius: 0`; Android falls back to `elevation`.
 */
export const RETRO_BORDER_WIDTH = 3;
export const RETRO_RADIUS = 4;

/** The one hard drop shadow. Never re-declared inline — import this. */
export const retroShadow = {
  shadowColor: '#1b1830',
  shadowOffset: { width: 3, height: 3 },
  shadowOpacity: 1,
  shadowRadius: 0,
  elevation: 4,
} as const;

/** Night ink — the dark panel fill and its lighter outline/text, shared. */
export const NIGHT_PANEL_BG = '#141226';
export const NIGHT_PANEL_BORDER = '#4b4870';
export const NIGHT_TEXT = '#f4f2ff';
export const NIGHT_TEXT_SOFT = '#c8c3e8';

export const retro = StyleSheet.create({
  panel: {
    backgroundColor: colors.card,
    borderWidth: RETRO_BORDER_WIDTH,
    borderColor: colors.ink,
    borderRadius: RETRO_RADIUS,
    ...retroShadow,
  },
  panelNight: {
    backgroundColor: NIGHT_PANEL_BG,
    borderColor: NIGHT_PANEL_BORDER,
  },
  /** Secondary chrome: thinner outline, no shadow — it recedes under `panel`. */
  panelQuiet: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: RETRO_RADIUS,
  },
  panelQuietNight: {
    backgroundColor: 'rgba(20,18,38,0.72)',
    borderColor: NIGHT_PANEL_BORDER,
  },

  // Type scale — mono throughout, 10px floor so nothing is a squint.
  /** All-caps kicker above a value or plate. */
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  kickerNight: { color: NIGHT_TEXT_SOFT },
  /** A plate / button label. */
  label: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  labelNight: { color: NIGHT_TEXT },
  /** A quiet supporting line — day counts, "raised with", etc. */
  caption: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.muted,
  },
  captionNight: { color: NIGHT_TEXT_SOFT },
  /** Retained name for callers not yet migrated to `caption`. */
  subtle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.inkSoft,
  },
  subtleNight: { color: NIGHT_TEXT_SOFT },
});

/** The "button depresses into its own shadow" press move — used everywhere a
 *  retro control is pressed, so feedback is identical across the HUD. */
export const retroPressed = {
  opacity: 0.82,
  transform: [{ translateX: 2 }, { translateY: 2 }],
} as const;
