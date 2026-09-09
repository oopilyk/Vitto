import { Platform, StyleSheet, View } from 'react-native';

import type { EnvironmentDressing } from './EnvironmentStage';
import { EnvironmentActionRow } from './EnvironmentActionRow';
import { EnvironmentBackdrop } from './EnvironmentBackdrop';
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
const KITCHEN_BUTTON = require('../../assets/buttons/kitchen.png');

/**
 * The art's own top-edge tone. Doubles as the crossfade underlay and as the band
 * above the art, which is fitted to full width rather than cropped —
 * see `EnvironmentBackdrop`.
 */
const DAY_TINT = '#c1a693';
export const NIGHT_TINT = '#434280';

// Clears the home indicator on modern iPhones without pulling in a safe-area
// package, which drags a second copy of React into the workspace.
const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 28 : 16;

interface MainControlsProps {
  /** Walks the pet into the Study scene. */
  onEnterStudy: () => void;
  /** Walks the pet into the Kitchen scene. */
  onFeedTap: () => void;
  /** Walks the pet into the Gym scene. */
  onEnterGym: () => void;
  onLogWorkout: () => void;
  /** Walks the pet outdoors. */
  onEnterOutside: () => void;
  onSyncSteps: () => void;
  onTrainMind: () => void;
}

export function mainEnvironment({
  onFeedTap,
  onEnterGym,
  onLogWorkout,
  onEnterOutside,
  onSyncSteps,
  onEnterStudy,
  onTrainMind,
}: MainControlsProps): EnvironmentDressing {
  const night = isNightTime();
  return {
    background: <EnvironmentBackdrop source={night ? MAIN_NIGHT : MAIN_DAY} />,
    backgroundColor: night ? NIGHT_TINT : DAY_TINT,
    controls: (
      <View style={styles.bottomRow}>
        <EnvironmentActionRow
          primary={{
            label: 'Kitchen',
            accessibilityLabel: 'Go to the kitchen',
            source: KITCHEN_BUTTON,
            onPress: onFeedTap,
          }}
          onEnterGym={onEnterGym}
          onLogWorkout={onLogWorkout}
          onEnterOutside={onEnterOutside}
          onSyncSteps={onSyncSteps}
          onEnterStudy={onEnterStudy}
          onTrainMind={onTrainMind}
          night={night}
        />
      </View>
    ),
  };
}

const styles = StyleSheet.create({
  bottomRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: HOME_INDICATOR_INSET,
  },
});
