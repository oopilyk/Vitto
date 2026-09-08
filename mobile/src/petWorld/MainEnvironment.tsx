import { Image, Platform, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { CircleButton } from './CircleButton';
import type { EnvironmentDressing } from './EnvironmentStage';
import { isNightTime } from './timeOfDay';

/**
 * The default/"bedroom" environment. Idle, tired and asleep are already
 * covered without any new code here: `PetAvatar` derives all three from
 * `pet.mood`/`pet.energy` (see `isSleeping` in `PetAvatar.tsx`), so this
 * environment's only job is to be the plain, calm scene they play out in.
 * Dressed with the product owner's own day/night room art, swapped by
 * `isNightTime` -- `require` needs a static path per variant, so both are
 * bundled and picked between rather than loaded from one dynamic path.
 */

const MAIN_DAY = require('../../assets/environments/main-day.png');
const MAIN_NIGHT = require('../../assets/environments/main-night.png');

/** Roughly the night art's own dominant tone, so the crossfade/underlay never flashes the day color. */
const NIGHT_TINT = '#3c3a5e';

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
  const night = isNightTime();
  return {
    background: (
      <Image source={night ? MAIN_NIGHT : MAIN_DAY} style={styles.backdrop} resizeMode="cover" />
    ),
    backgroundColor: night ? NIGHT_TINT : colors.sage,
    controls: <MainEnvironmentControls {...props} />,
  };
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
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
