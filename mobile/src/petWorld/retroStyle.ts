import { StyleSheet } from 'react-native';
import { colors, fonts } from '../theme';

/**
 * Shared "retro / pixel-UI" chrome tokens for the pet world HUD. The look is a
 * warm paper panel with a solid ink outline and a hard, un-blurred drop shadow —
 * the blocky offset a pixel-art interface uses instead of a soft glow. iOS
 * honours `shadowRadius: 0`; Android falls back to `elevation`.
 */
export const RETRO_BORDER_WIDTH = 3;

export const retroShadow = {
  shadowColor: '#1b1830',
  shadowOffset: { width: 3, height: 3 },
  shadowOpacity: 1,
  shadowRadius: 0,
  elevation: 4,
} as const;

export const retro = StyleSheet.create({
  panel: {
    backgroundColor: colors.card,
    borderWidth: RETRO_BORDER_WIDTH,
    borderColor: colors.ink,
    borderRadius: 4,
    ...retroShadow,
  },
  panelNight: {
    backgroundColor: '#141226',
    borderColor: '#4b4870',
  },
  label: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: colors.ink,
    textTransform: 'uppercase',
  },
  labelNight: { color: '#f7f5ff' },
  subtle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.4,
    color: colors.inkSoft,
  },
  subtleNight: { color: '#c8c3e8' },
});
