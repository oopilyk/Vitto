import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { JEOPARDY_PICKS_PER_ROUND, type JeopardyGame } from '@vitto/core';
import { PrimaryButton } from '../components/ui';
import { EnvironmentBackdrop } from '../petWorld/EnvironmentBackdrop';
import { retro, retroPressed } from '../petWorld/retroStyle';
import { fonts, world } from '../theme';

/**
 * The frame every Pet Jeopardy stage sits in: the scene behind it, the bar
 * across the top, and the one panel shown when there is no board to deal.
 *
 * Split out from the screen so that file is only the game loop — the chrome does
 * not change between the board, a question, the wager and the results, and none
 * of it touches the game state.
 */

/**
 * The study, borrowed. Pet Jeopardy is a quiz and the study is where this pet
 * already goes to train its mind, so the game reads as happening somewhere in
 * the world rather than in a menu — the same move Four Corners makes with its
 * own scene. No new art was drawn for this game: both files already ship.
 */
const STUDY_BG_DAY = require('../../assets/environments/study-day.png');
const STUDY_BG_NIGHT = require('../../assets/environments/study-night.png');

/** The art's own top-edge tone, as `StudyEnvironment` declares it — see
 *  `EnvironmentBackdrop`. Painted behind the art so the sliver it cannot cover
 *  on the tallest phones reads as the room continuing, not as a gap. */
const DAY_TINT = '#8b6f56';
const NIGHT_TINT = '#513b42';

interface FrameProps {
  night: boolean;
  /** The unavailable panel centres itself; every play stage fills the frame. */
  centred?: boolean;
  children: ReactNode;
}

export function JeopardyFrame({ night, centred, children }: FrameProps) {
  return (
    <View style={[styles.screen, night && styles.screenNight, centred && styles.centred]}>
      <EnvironmentBackdrop source={night ? STUDY_BG_NIGHT : STUDY_BG_DAY} />
      {children}
    </View>
  );
}

/** What the header says about where the session is, in one short line. */
export const progressLine = (game: JeopardyGame): string => {
  if (game.status === 'wager') return 'Final Jeopardy · set your stake';
  if (game.status === 'final' || game.status === 'finalRevealing') return 'Final Jeopardy';
  const played = game.cells.filter((cell) => cell.played).length;
  return `${played} / ${JEOPARDY_PICKS_PER_ROUND} picks · ${game.boardPoints} XP`;
};

interface HeaderProps {
  night: boolean;
  progress: string;
  onClose: () => void;
  closeDisabled: boolean;
}

export function JeopardyHeader({ night, progress, onClose, closeDisabled }: HeaderProps) {
  return (
    <View style={[styles.header, { backgroundColor: night ? world.barNight : world.barDay }]}>
      <View style={styles.headerText}>
        <Text style={styles.title}>Pet Jeopardy</Text>
        <Text style={styles.progress} numberOfLines={1}>
          {progress}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close Pet Jeopardy"
        accessibilityState={{ disabled: closeDisabled }}
        disabled={closeDisabled}
        onPress={onClose}
        hitSlop={10}
        style={({ pressed }) => [styles.close, pressed && retroPressed]}
      >
        <Text style={styles.closeMark}>✕</Text>
      </Pressable>
    </View>
  );
}

/** Shown instead of a board when the question pool cannot deal one. */
export function JeopardyUnavailable({
  night,
  message,
  onClose,
}: {
  night: boolean;
  message: string;
  onClose: () => void;
}) {
  return (
    <View style={[styles.errorPanel, retro.panel, night && retro.panelNight]}>
      <Text style={[retro.label, night && retro.labelNight]}>Pet Jeopardy</Text>
      <Text style={[retro.caption, night && retro.captionNight, styles.errorLine]}>{message}</Text>
      <View style={styles.errorAction}>
        <PrimaryButton label="Back to Mind" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DAY_TINT, paddingTop: 56 },
  screenNight: { backgroundColor: NIGHT_TINT },
  centred: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  errorPanel: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 22, maxWidth: 320 },
  errorLine: { marginTop: 10, textAlign: 'center', lineHeight: 16 },
  errorAction: { marginTop: 22, alignSelf: 'stretch' },

  // The same translucent "room visible through the bar" strip the pet world's
  // hotbar uses, pinned to the top edge. Always the dark scrim regardless of
  // day/night (`barDay` and `barNight` are both dark-on-art tints), so the title
  // stays cream rather than switching to ink over bright art.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: world.barHairline,
  },
  headerText: { flexShrink: 1 },
  title: {
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: world.nightText,
    marginBottom: 3,
  },
  progress: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.6, color: world.nightTextSoft },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: world.nightSurfaceSoft,
    borderWidth: 1,
    borderColor: world.barHairline,
  },
  closeMark: { fontFamily: fonts.mono, fontSize: 15, fontWeight: '700', color: world.nightText },
});
