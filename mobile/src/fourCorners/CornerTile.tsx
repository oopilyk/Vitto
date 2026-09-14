import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { FourCorner } from '@vitto/core';
import { RETRO_BORDER_WIDTH, RETRO_RADIUS, retro, retroPressed, retroShadow } from '../petWorld/retroStyle';
import { fonts, world } from '../theme';
import { cornerLabel, isLeftCorner, isTopCorner } from './corners';

/**
 * `idle` — waiting on a tap. `correct` — this is the right answer (whether or
 * not it is the one tapped). `wrong` — the tapped tile, and the answer was not
 * here. `muted` — an untouched decoy during the reveal.
 */
export type CornerTileState = 'idle' | 'correct' | 'wrong' | 'muted';

interface CornerTileProps {
  corner: FourCorner;
  answer: string;
  state: CornerTileState;
  /**
   * The word printed on the tile during a reveal — "CORRECT" / "ANSWER" /
   * "YOUR PICK". Load-bearing rather than decorative: right and wrong must be
   * distinguishable without relying on the green/red difference.
   */
  mark: string | null;
  night: boolean;
  disabled: boolean;
  onPress: (corner: FourCorner) => void;
  /** Where this corner sits on the measured board — insets only, from the screen. */
  position: StyleProp<ViewStyle>;
}

/** A cream that stays legible on both the sage and the coral fills. */
const ON_FILL_TEXT = '#fdf6e7';

/**
 * One answer, pinned into one corner of the board. The outer corner of the tile
 * is square and the inner one rounded, so the four of them read as anchored
 * into the corners of a little game world rather than as a stack of buttons.
 */
export function CornerTile({
  corner,
  answer,
  state,
  mark,
  night,
  disabled,
  onPress,
  position,
}: CornerTileProps) {
  const filled = state === 'correct' || state === 'wrong';
  const fill =
    state === 'correct' ? world.positive : state === 'wrong' ? world.accentDeep : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cornerLabel(corner, answer)}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => onPress(corner)}
      style={({ pressed }) => [
        styles.tile,
        position,
        retro.panel,
        night && retro.panelNight,
        cornerRadius(corner),
        filled && { backgroundColor: fill, borderColor: night ? world.nightInk : world.ink },
        state === 'muted' && styles.muted,
        pressed && !disabled && retroPressed,
      ]}
    >
      <View style={[styles.body, { alignItems: isLeftCorner(corner) ? 'flex-start' : 'flex-end' }]}>
        <Text
          style={[
            styles.answer,
            night && styles.answerNight,
            filled && { color: ON_FILL_TEXT },
            { textAlign: isLeftCorner(corner) ? 'left' : 'right' },
          ]}
        >
          {answer}
        </Text>
        {mark ? (
          <Text style={[retro.kicker, styles.mark, filled ? { color: ON_FILL_TEXT } : night && retro.kickerNight]}>
            {mark}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Square on the outside, rounded on the inside — the "anchored" read. */
const cornerRadius = (corner: FourCorner) => ({
  borderTopLeftRadius: isTopCorner(corner) && isLeftCorner(corner) ? 0 : RETRO_RADIUS * 2.5,
  borderTopRightRadius: isTopCorner(corner) && !isLeftCorner(corner) ? 0 : RETRO_RADIUS * 2.5,
  borderBottomLeftRadius: !isTopCorner(corner) && isLeftCorner(corner) ? 0 : RETRO_RADIUS * 2.5,
  borderBottomRightRadius: !isTopCorner(corner) && !isLeftCorner(corner) ? 0 : RETRO_RADIUS * 2.5,
});

const styles = StyleSheet.create({
  tile: {
    position: 'absolute',
    // A share of the board rather than a fixed width, so two tiles plus the
    // pet's lane always fit — 360pt phones included.
    width: '43%',
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 11,
    justifyContent: 'center',
    borderWidth: RETRO_BORDER_WIDTH,
    ...retroShadow,
  },
  muted: { opacity: 0.5 },
  body: { gap: 4, width: '100%' },
  answer: {
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    lineHeight: 17,
    color: world.ink,
  },
  answerNight: { color: world.nightText },
  mark: { letterSpacing: 1.1 },
});
