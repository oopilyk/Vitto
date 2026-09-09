import { Image, Platform, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import type { EnvironmentDressing } from './EnvironmentStage';
import { EnvironmentActionRow, type EnvironmentActionRowProps } from './EnvironmentActionRow';
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
export const NIGHT_TINT = '#3c3a5e';

// Clears the home indicator on modern iPhones without pulling in a safe-area
// package, which drags a second copy of React into the workspace.
const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 28 : 16;

type MainEnvironmentControlsProps = Omit<EnvironmentActionRowProps, 'night'>;

export function mainEnvironment(props: MainEnvironmentControlsProps): EnvironmentDressing {
  const night = isNightTime();
  return {
    background: (
      <Image source={night ? MAIN_NIGHT : MAIN_DAY} style={styles.backdrop} resizeMode="cover" />
    ),
    backgroundColor: night ? NIGHT_TINT : colors.sage,
    controls: (
      <View style={styles.bottomRow}>
        <EnvironmentActionRow {...props} night={night} />
      </View>
    ),
  };
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  bottomRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: HOME_INDICATOR_INSET,
  },
});
