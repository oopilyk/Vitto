import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RETRO_BORDER_WIDTH, retro, retroPressed } from '../petWorld/retroStyle';
import { fonts, world } from '../theme';
import { ON_FILL_TEXT, answerLabel } from './board';

/**
 * `idle` — waiting on a tap. `correct` — the right answer, whether or not it was
 * the one tapped. `wrong` — the tapped tile, and the answer was elsewhere.
 * `muted` — an untouched decoy during the reveal.
 */
export type AnswerTileState = 'idle' | 'correct' | 'wrong' | 'muted';

interface AnswerTileProps {
  answer: string;
  state: AnswerTileState;
  /**
   * The word printed on the tile during a reveal — "CORRECT" / "ANSWER" /
   * "YOUR PICK". Load-bearing rather than decorative: right and wrong have to be
   * distinguishable without relying on the green/coral difference.
   */
  mark: string | null;
  night: boolean;
  disabled: boolean;
  onPress: () => void;
}

/**
 * The same darkened sage `CornerTile` uses for a correct answer — the palette's
 * own `positive` is a background tone and only manages 3.3:1 under cream text.
 */
const CORRECT_FILL = '#58744f';

/**
 * One answer, full width. Stacked rather than laid out three-across: the answers
 * in this pool run to phrases ("Nepal and China", "Carbon dioxide"), and a third
 * of a 360pt phone wraps those to three cramped lines. Full width also means one
 * generous tap target per answer at every screen size.
 */
export function AnswerTile({ answer, state, mark, night, disabled, onPress }: AnswerTileProps) {
  const filled = state === 'correct' || state === 'wrong';
  const fill = state === 'correct' ? CORRECT_FILL : state === 'wrong' ? world.accentDeep : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={answerLabel(answer, mark)}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        retro.panel,
        night && retro.panelNight,
        filled && { backgroundColor: fill, borderColor: night ? world.nightInk : world.ink },
        state === 'muted' && styles.muted,
        pressed && !disabled && retroPressed,
      ]}
    >
      <View style={styles.body}>
        <Text style={[styles.answer, night && styles.answerNight, filled && { color: ON_FILL_TEXT }]}>
          {answer}
        </Text>
        {mark ? (
          <Text
            style={[
              retro.kicker,
              styles.mark,
              filled ? { color: ON_FILL_TEXT } : night && retro.kickerNight,
            ]}
          >
            {mark}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 56,
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: RETRO_BORDER_WIDTH,
  },
  muted: { opacity: 0.5 },
  body: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  answer: {
    flexShrink: 1,
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
    letterSpacing: 0.2,
    color: world.ink,
  },
  answerNight: { color: world.nightText },
  mark: { letterSpacing: 1.1 },
});
