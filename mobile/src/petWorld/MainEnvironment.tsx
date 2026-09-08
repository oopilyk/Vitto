import { Platform, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { CircleButton } from './CircleButton';
import type { EnvironmentDressing } from './EnvironmentStage';

/**
 * The default/"bedroom" environment. Idle, tired and asleep are already
 * covered without any new code here: `PetAvatar` derives all three from
 * `pet.mood`/`pet.energy` (see `isSleeping` in `PetAvatar.tsx`), so this
 * environment's only job is to be the plain, calm scene they play out in —
 * per the product owner's note, that means no card/panel behind the pet, just
 * the sage ground it has always stood on.
 */

// Clears the home indicator on modern iPhones without pulling in a safe-area
// package, which drags a second copy of React into the workspace.
const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 28 : 16;

interface MainEnvironmentControlsProps {
  /** Feed no longer opens the meal modal directly — it walks the pet into the
   * Kitchen first. The caller decides what "entering the kitchen" means (see
   * `DashboardScreen`'s `enterKitchen`). */
  onFeedTap: () => void;
  onLogWorkout: () => void;
  onSyncSteps: () => void;
  onTrainMind: () => void;
}

function MainEnvironmentControls({
  onFeedTap,
  onLogWorkout,
  onSyncSteps,
  onTrainMind,
}: MainEnvironmentControlsProps) {
  return (
    <View style={styles.bottomRow}>
      <CircleButton label="Meal" icon="✣" tint={colors.yellow} ink={colors.yellowDeep} onPress={onFeedTap} />
      <CircleButton
        label="Workout"
        icon="↗"
        tint={colors.coralWash}
        ink={colors.coralDeep}
        onPress={onLogWorkout}
      />
      <CircleButton label="Steps" icon="⁁" tint={colors.mint} ink={colors.mintDeep} onPress={onSyncSteps} />
      <CircleButton label="Mind" icon="✻" tint={colors.lilac} ink={colors.lilacDeep} onPress={onTrainMind} />
    </View>
  );
}

export function mainEnvironment(props: MainEnvironmentControlsProps): EnvironmentDressing {
  return {
    background: null,
    backgroundColor: colors.sage,
    controls: <MainEnvironmentControls {...props} />,
  };
}

const styles = StyleSheet.create({
  bottomRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: HOME_INDICATOR_INSET,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
  },
});
