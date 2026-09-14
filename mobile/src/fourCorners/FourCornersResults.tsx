import { StyleSheet, Text, View } from 'react-native';
import {
  type BrainTrainingMetadata,
  type FourCornersRound,
  type PetState,
  brainTrainingXp,
  fourCornersCorrectCount,
  fourCornersPoints,
} from '@vitto/core';
import { PetAvatar } from '../components/PetAvatar';
import { ErrorText, PrimaryButton, TextButton } from '../components/ui';
import { PixelConfetti } from '../celebrations/PixelConfetti';
import { retro } from '../petWorld/retroStyle';
import { IDLE_ACTIVITY } from '../petWorld/toPetAvatarActivityProps';
import { fonts, world } from '../theme';

interface FourCornersResultsProps {
  pet: PetState;
  round: FourCornersRound;
  /** Built once by the screen when the round completed, so the numbers never drift. */
  metadata: BrainTrainingMetadata;
  night: boolean;
  saving: boolean;
  error: string | null;
  onSaveAndLeave: () => void;
  onPlayAgain: () => void;
}

const RESULT_PET_SIZE = 148;

/** Warm, never graded. Five of five is a moment; one of five is still a round played. */
const closingLine = (correct: number, total: number): string => {
  if (total === 0) return 'Nothing answered yet.';
  if (correct === total) return 'Every corner. Showing off.';
  if (correct === 0) return 'Brutal set. The pet had fun anyway.';
  return correct * 2 >= total ? 'Solid round.' : 'A few tricky ones in there.';
};

export function FourCornersResults({
  pet,
  round,
  metadata,
  night,
  saving,
  error,
  onSaveAndLeave,
  onPlayAgain,
}: FourCornersResultsProps) {
  const correct = fourCornersCorrectCount(round);
  const xp = brainTrainingXp(metadata);
  const points = fourCornersPoints(round);

  return (
    <View style={styles.wrap}>
      <View style={[styles.scorePanel, retro.panel, night && retro.panelNight]}>
        <Text style={[retro.kicker, night && retro.kickerNight]}>Four Corners</Text>
        <Text style={[styles.score, night && styles.scoreNight]}>
          {`${correct} / ${round.answers.length} correct`}
        </Text>
        <Text style={[retro.caption, night && retro.captionNight, styles.line]}>
          {closingLine(correct, round.answers.length)}
        </Text>
      </View>

      <View style={styles.stage}>
        <PetAvatar
          pet={pet}
          {...IDLE_ACTIVITY}
          isCelebrating
          hideStatusCaption
          size={RESULT_PET_SIZE}
          stageStyle={styles.petStage}
        />
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <PixelConfetti fire />
        </View>
      </View>

      <View style={styles.rewards}>
        <Reward value={`+${xp}`} unit="XP" night={night} />
        <Reward value={`+${points}`} unit="Mind Points" night={night} />
        <Reward value={`${metadata.durationSeconds}s`} unit="Round time" night={night} />
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
    height: RESULT_PET_SIZE + 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  petStage: { height: RESULT_PET_SIZE + 24, backgroundColor: 'transparent', overflow: 'visible' },
  rewards: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  reward: { paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', minWidth: 96 },
  rewardValue: { fontFamily: fonts.mono, fontSize: 18, fontWeight: '700', color: world.ink },
  rewardValueNight: { color: world.nightText },
  actions: { width: '100%', marginTop: 'auto', paddingBottom: 28 },
  again: { alignItems: 'center', marginTop: 16 },
});
