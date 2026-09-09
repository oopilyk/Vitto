import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';
import type { EnvironmentDressing } from './EnvironmentStage';
import { EnvironmentActionRow } from './EnvironmentActionRow';
import { isNightTime } from './timeOfDay';

/**
 * The Kitchen: reached by tapping Kitchen, it opens the existing
 * `MealCaptureScreen` modal — no rebuilt camera/search UI, no shop, just the
 * entry point into the flow that already exists, dressed as a distinct scene
 * rather than a form. Dressed with the product owner's own day/night kitchen
 * art, picked by `isNightTime` the same way `MainEnvironment` does.
 *
 * Shows the same `EnvironmentActionRow` Main does -- Gym/Outdoors/Study are
 * one tap away without a trip back through Main first, and tapping Kitchen
 * again here just re-opens the food picker (same `onChooseFood` action).
 */

const KITCHEN_DAY = require('../../assets/environments/kitchen-day.png');
const KITCHEN_NIGHT = require('../../assets/environments/kitchen-night.png');
const NIGHT_TINT = '#3d3a63';

const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 28 : 16;

interface KitchenEnvironmentControlsProps {
  onChooseFood: () => void;
  onBack: () => void;
  onLogWorkout: () => void;
  onSyncSteps: () => void;
  onTrainMind: () => void;
}

function KitchenEnvironmentControls({
  onChooseFood,
  onBack,
  onLogWorkout,
  onSyncSteps,
  onTrainMind,
  night,
}: KitchenEnvironmentControlsProps & { night: boolean }) {
  return (
    <View style={styles.bottomRow}>
      <EnvironmentActionRow
        onFeedTap={onChooseFood}
        onLogWorkout={onLogWorkout}
        onSyncSteps={onSyncSteps}
        onTrainMind={onTrainMind}
        night={night}
      />
      <Text
        accessibilityRole="button"
        accessibilityLabel="Back to the bedroom"
        onPress={onBack}
        style={[styles.back, night && styles.backNight]}
        suppressHighlighting
      >
        Not right now
      </Text>
    </View>
  );
}

export function kitchenEnvironment(props: KitchenEnvironmentControlsProps): EnvironmentDressing {
  const night = isNightTime();
  return {
    background: (
      <Image source={night ? KITCHEN_NIGHT : KITCHEN_DAY} style={styles.backdrop} resizeMode="cover" />
    ),
    backgroundColor: night ? NIGHT_TINT : colors.yellow,
    controls: <KitchenEnvironmentControls {...props} night={night} />,
  };
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  bottomRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: HOME_INDICATOR_INSET,
    alignItems: 'center',
    gap: 10,
  },
  back: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkSoft, letterSpacing: 0.3 },
  backNight: { color: '#f7f5ff' },
});
