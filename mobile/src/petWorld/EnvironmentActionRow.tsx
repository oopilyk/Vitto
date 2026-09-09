import { StyleSheet, View } from 'react-native';
import { EnvironmentButton, type EnvironmentButtonProps } from './EnvironmentButton';

const GYM_BUTTON = require('../../assets/buttons/gym.png');
const OUTDOORS_BUTTON = require('../../assets/buttons/outdoors.png');
const STUDY_BUTTON = require('../../assets/buttons/study.png');

/** The leading button changes per scene (Kitchen in the living room, Living
 *  room in the kitchen); Gym / Outdoors / Study are the same everywhere. */
export type PrimaryAction = Omit<EnvironmentButtonProps, 'night'>;

export interface EnvironmentActionRowProps {
  primary: PrimaryAction;
  onLogWorkout: () => void;
  onSyncSteps: () => void;
  onTrainMind: () => void;
  /** Brightens the labels so they stay readable over a dark night backdrop. */
  night: boolean;
}

/**
 * The four destination buttons across the bottom of every scene. The first slot
 * is the scene-specific jump (into the Kitchen from the living room, back to the
 * living room from the Kitchen); the other three are always Gym / Outdoors /
 * Study, kept one tap away from wherever the pet is.
 */
export function EnvironmentActionRow({
  primary,
  onLogWorkout,
  onSyncSteps,
  onTrainMind,
  night,
}: EnvironmentActionRowProps) {
  return (
    <View style={styles.bottomRow}>
      <EnvironmentButton {...primary} night={night} />
      <EnvironmentButton
        label="Gym"
        accessibilityLabel="Log workout"
        source={GYM_BUTTON}
        night={night}
        onPress={onLogWorkout}
      />
      <EnvironmentButton
        label="Outdoors"
        accessibilityLabel="Log steps"
        source={OUTDOORS_BUTTON}
        night={night}
        onPress={onSyncSteps}
      />
      <EnvironmentButton
        label="Study"
        accessibilityLabel="Log mind"
        source={STUDY_BUTTON}
        night={night}
        onPress={onTrainMind}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
  },
});
