import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { retro } from '../petWorld/retroStyle';
import { fonts, world } from '../theme';
import { AnswerTile, type AnswerTileState } from './AnswerTile';

export interface StageReveal {
  correctIndex: number;
  chosenIndex: number;
  correct: boolean;
  /** The one line that states the verdict, already built by `board.ts`. */
  line: string;
}

interface QuestionStageProps {
  /** The category, or "Final Jeopardy". */
  kicker: string;
  /** What is riding on this one — "200 points", "50 XP at stake". */
  stake: string;
  prompt: string;
  options: readonly string[];
  /** Null until the reveal has settled — the tiles stay neutral until then. */
  reveal: StageReveal | null;
  night: boolean;
  disabled: boolean;
  onAnswer: (index: number) => void;
  /** The pet, wrapped in the screen's `Animated.View` so the hop lives with the clock. */
  petSlot: ReactNode;
  /** The pet's lane reports its size so the hop can be a share of it, not a guess. */
  onPetStageLayout: (event: LayoutChangeEvent) => void;
  /** The "+200" chip, mounted by the screen only while a won reveal is up. */
  flourish?: ReactNode;
  /** The Final's taller stage — it is the moment the game builds to. */
  emphasis?: boolean;
  /** The Final's "See results" button; board questions advance themselves. */
  footer?: ReactNode;
}

/**
 * One question, and the pet asking it. Shared by the board squares and the
 * Final so the two cannot drift apart in tile behaviour or reveal wording —
 * the Final only turns on `emphasis` and supplies its own footer.
 *
 * The pet sits between the prompt and the answers rather than behind them: it is
 * the thing reacting to the tap, so it has to be visible at the moment of the
 * tap. Its lane is the flexible row — on a short phone the pet gives up height
 * to the prompt and the tiles, and neither ever has to scroll.
 */
export function QuestionStage({
  kicker,
  stake,
  prompt,
  options,
  reveal,
  night,
  disabled,
  onAnswer,
  petSlot,
  onPetStageLayout,
  flourish,
  emphasis,
  footer,
}: QuestionStageProps) {
  const tileState = (index: number): AnswerTileState => {
    if (!reveal) return 'idle';
    if (index === reveal.correctIndex) return 'correct';
    if (index === reveal.chosenIndex) return 'wrong';
    return 'muted';
  };

  const tileMark = (index: number): string | null => {
    if (!reveal) return null;
    if (index === reveal.correctIndex) return reveal.correct ? 'CORRECT' : 'ANSWER';
    if (index === reveal.chosenIndex) return 'YOUR PICK';
    return null;
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <View style={[styles.chip, retro.panelQuiet, night && retro.panelQuietNight]}>
          <Text style={[retro.kicker, night && retro.kickerNight]}>{kicker}</Text>
        </View>
        <View style={[styles.chip, retro.panelQuiet, night && retro.panelQuietNight]}>
          <Text style={[retro.kicker, night && retro.kickerNight]}>{stake}</Text>
        </View>
      </View>

      <View style={[styles.prompt, retro.panel, night && retro.panelNight]}>
        <Text style={[styles.promptText, emphasis && styles.promptTextBig, night && styles.promptTextNight]}>
          {prompt}
        </Text>
      </View>

      <View
        style={[styles.petLane, emphasis && styles.petLaneTall]}
        onLayout={onPetStageLayout}
        pointerEvents="none"
      >
        {petSlot}
        {flourish ? <View style={styles.flourishSlot}>{flourish}</View> : null}
      </View>

      {/*
        A fixed-height slot so the answer tiles never jump when the verdict
        appears. The result is carried by the words and the tile fills, not by
        this line's colour — tinting the one line that states the outcome would
        have made it the least readable thing on screen. The polite live region
        is what gets it spoken: a screen reader does not re-read a tile the user
        is not focused on.
      */}
      <View style={styles.verdictSlot} accessibilityLiveRegion="polite">
        {reveal ? (
          <View style={[styles.verdictChip, retro.panelQuiet, night && retro.panelQuietNight]}>
            <Text style={[styles.verdict, night && styles.verdictNight]}>{reveal.line}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.answers}>
        {options.map((option, index) => (
          <AnswerTile
            key={option}
            answer={option}
            state={tileState(index)}
            mark={tileMark(index)}
            night={night}
            disabled={disabled}
            onPress={() => onAnswer(index)}
          />
        ))}
      </View>

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  chip: { paddingVertical: 5, paddingHorizontal: 10 },
  prompt: { marginTop: 10, paddingVertical: 14, paddingHorizontal: 16 },
  promptText: { fontFamily: fonts.display, fontSize: 19, lineHeight: 25, color: world.ink },
  promptTextBig: { fontSize: 22, lineHeight: 29 },
  promptTextNight: { color: world.nightText },
  // The flexible row. `minHeight` keeps the pet present even on the shortest
  // phone; `flex` hands it every spare point on a tall one.
  petLane: { flex: 1, minHeight: 108, alignItems: 'center', justifyContent: 'center' },
  petLaneTall: { minHeight: 148 },
  flourishSlot: { position: 'absolute', top: 8, alignItems: 'center' },
  verdictSlot: { height: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  verdictChip: { paddingVertical: 4, paddingHorizontal: 12 },
  verdict: { fontFamily: fonts.mono, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: world.ink },
  verdictNight: { color: world.nightText },
  answers: { gap: 10, paddingBottom: 16 },
  footer: { paddingBottom: 20 },
});
