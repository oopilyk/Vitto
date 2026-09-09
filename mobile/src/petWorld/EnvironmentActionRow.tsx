import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { CircleButton } from './CircleButton';

const KITCHEN_BUTTON = require('../../assets/buttons/kitchen.png');
const GYM_BUTTON = require('../../assets/buttons/gym.png');
const OUTDOORS_BUTTON = require('../../assets/buttons/outdoors.png');
const STUDY_BUTTON = require('../../assets/buttons/study.png');

export interface EnvironmentActionRowProps {
  onFeedTap: () => void;
  onLogWorkout: () => void;
  onSyncSteps: () => void;
  onTrainMind: () => void;
  /** Brightens the labels so they stay readable over a dark night backdrop. */
  night: boolean;
}

/**
 * The four destination buttons -- Kitchen, Gym, Outdoors, Study -- shown the
 * same way in every environment, not just Main. Reused as-is by
 * `KitchenEnvironment` so every destination is always one tap away rather
 * than routing back through Main first (per the product owner's note that
 * logging food should not force a trip back to the living room).
 */
export function EnvironmentActionRow({
  onFeedTap,
  onLogWorkout,
  onSyncSteps,
  onTrainMind,
  night,
}: EnvironmentActionRowProps) {
  return (
    <View style={styles.bottomRow}>
      <CircleButton
        label="Kitchen"
        accessibilityLabel="Log meal"
        icon="✣"
        tint={colors.yellow}
        ink={colors.yellowDeep}
        backgroundImage={KITCHEN_BUTTON}
        night={night}
        onPress={onFeedTap}
      />
      <CircleButton
        label="Gym"
        accessibilityLabel="Log workout"
        icon="↗"
        tint={colors.coralWash}
        ink={colors.coralDeep}
        backgroundImage={GYM_BUTTON}
        night={night}
        onPress={onLogWorkout}
      />
      <CircleButton
        label="Outdoors"
        accessibilityLabel="Log steps"
        icon="⁁"
        tint={colors.mint}
        ink={colors.mintDeep}
        backgroundImage={OUTDOORS_BUTTON}
        night={night}
        onPress={onSyncSteps}
      />
      <CircleButton
        label="Study"
        accessibilityLabel="Log mind"
        icon="✻"
        tint={colors.lilac}
        ink={colors.lilacDeep}
        backgroundImage={STUDY_BUTTON}
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
