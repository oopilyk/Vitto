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
  /**
   * Walks the pet into the Gym scene. Omitted by the Gym itself, where the
   * button falls back to `onLogWorkout` — re-entering the scene you are already
   * standing in would be a no-op, and logging the workout is what the button
   * means once you are there.
   */
  onEnterGym?: () => void;
  onLogWorkout: () => void;
  /**
   * Walks the pet outdoors. Omitted by the Outdoors scene itself, where the
   * button falls back to `onSyncSteps` for the same reason `onEnterGym` is
   * omitted in the Gym.
   */
  onEnterOutside?: () => void;
  onSyncSteps: () => void;
  onTrainMind: () => void;
  /** Brightens the labels so they stay readable over a dark night backdrop. */
  night: boolean;
}

/**
 * The four destination buttons across the bottom of every scene. The first slot
 * is the scene-specific jump (into the Kitchen from the living room, back to the
 * living room from the Kitchen); the other three are always Gym / Outdoors /
 * Study, kept one tap away from wherever the pet is. Gym is a destination like
 * the Kitchen — except in the Gym, where it logs the workout instead.
 */
export function EnvironmentActionRow({
  primary,
  onEnterGym,
  onLogWorkout,
  onEnterOutside,
  onSyncSteps,
  onTrainMind,
  night,
}: EnvironmentActionRowProps) {
  return (
    <View style={styles.bottomRow}>
      <EnvironmentButton {...primary} night={night} />
      <EnvironmentButton
        label="Gym"
        accessibilityLabel={onEnterGym ? 'Go to the gym' : 'Log workout'}
        source={GYM_BUTTON}
        night={night}
        onPress={onEnterGym ?? onLogWorkout}
      />
      <EnvironmentButton
        label="Outdoors"
        accessibilityLabel={onEnterOutside ? 'Go outdoors' : 'Log steps'}
        source={OUTDOORS_BUTTON}
        night={night}
        onPress={onEnterOutside ?? onSyncSteps}
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
