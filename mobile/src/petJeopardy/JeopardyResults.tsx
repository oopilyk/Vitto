import { StyleSheet, Text, View } from 'react-native';
import {
  type JeopardyGame,
  type PetState,
  jeopardyAnsweredCount,
  jeopardyBoardXp,
  jeopardyCorrectCount,
  jeopardyNetXp,
  jeopardyWagerDelta,
} from '@vitto/core';
import { PetAvatar } from '../components/PetAvatar';
import { ErrorText, PrimaryButton, TextButton } from '../components/ui';
import { PixelConfetti } from '../celebrations/PixelConfetti';
import { retro } from '../petWorld/retroStyle';
import { IDLE_ACTIVITY } from '../petWorld/toPetAvatarActivityProps';
import { fonts, world } from '../theme';
import { isJeopardyWin } from './board';

interface JeopardyResultsProps {
  pet: PetState;
  game: JeopardyGame;
  night: boolean;
  saving: boolean;
  error: string | null;
  onSaveAndLeave: () => void;
  onPlayAgain: () => void;
}

const RESULT_PET_SIZE = 132;

/** Warm, never graded — a board left early is still a board played. */
const closingLine = (game: JeopardyGame, correct: number, answered: number): string => {
  if (answered === 0) return 'Nothing answered yet.';
  if (game.final?.correct) return 'Called it, and cashed it.';
  if (game.final?.correct === false) return 'The wager was the fun part.';
  return correct * 2 >= answered ? 'Solid board.' : 'Some tough squares in there.';
};

/** "+12", "−12", or the honest zero when the Final was never played. */
const signed = (value: number): string => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0');

export function JeopardyResults({
  pet,
  game,
  night,
  saving,
  error,
  onSaveAndLeave,
  onPlayAgain,
}: JeopardyResultsProps) {
  const correct = jeopardyCorrectCount(game);
  const answered = jeopardyAnsweredCount(game);
  const won = isJeopardyWin(game);

  return (
    <View style={styles.wrap}>
      <View style={[styles.scorePanel, retro.panel, night && retro.panelNight]}>
        <Text style={[retro.kicker, night && retro.kickerNight]}>Pet Jeopardy</Text>
        <Text style={[styles.score, night && styles.scoreNight]}>{`${correct} / ${answered} correct`}</Text>
        <Text style={[retro.caption, night && retro.captionNight, styles.line]}>
          {closingLine(game, correct, answered)}
        </Text>
      </View>

      <View style={styles.stage}>
        <PetAvatar
          pet={pet}
          {...IDLE_ACTIVITY}
          isCelebrating={won}
          hideStatusCaption
          size={RESULT_PET_SIZE}
          stageStyle={styles.petStage}
        />
        {won ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <PixelConfetti fire />
          </View>
        ) : null}
      </View>

      <View style={styles.rewards}>
        <Reward value={`+${jeopardyBoardXp(game)}`} unit="Board XP" night={night} />
        <Reward value={signed(jeopardyWagerDelta(game))} unit="Wager" night={night} />
        <Reward value={`+${jeopardyNetXp(game)}`} unit="Session XP" night={night} />
      </View>

      <ErrorText>{error}</ErrorText>

      <View style={styles.actions}>
        <PrimaryButton label="Save and go back" onPress={onSaveAndLeave} busy={saving} />
        <View style={styles.again}>
          <TextButton label="Play again" onPress={onPlayAgain} disabled={saving} tone="coral" />
        </View>
      </View>
    </View>
  );
}

function Reward({ value, unit, night }: { value: string; unit: string; night: boolean }) {
  return (
    <View style={[styles.reward, retro.panelQuiet, night && retro.panelQuietNight]}>
      <Text style={[styles.rewardValue, night && styles.rewardValueNight]}>{value}</Text>
      <Text style={[retro.kicker, night && retro.kickerNight]}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', paddingHorizontal: 20, paddingTop: 8 },
  scorePanel: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 24 },
  score: { fontFamily: fonts.display, fontSize: 30, color: world.ink, marginTop: 8, letterSpacing: -0.6 },
  scoreNight: { color: world.nightText },
  line: { marginTop: 6, textAlign: 'center' },
  stage: {
    width: '100%',
    height: RESULT_PET_SIZE + 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  petStage: { height: RESULT_PET_SIZE + 20, backgroundColor: 'transparent', overflow: 'visible' },
  rewards: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  reward: { paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', minWidth: 96 },
  rewardValue: { fontFamily: fonts.mono, fontSize: 18, fontWeight: '700', color: world.ink },
  rewardValueNight: { color: world.nightText },
  actions: { width: '100%', marginTop: 'auto', paddingBottom: 28 },
  again: { alignItems: 'center', marginTop: 16 },
});
