import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';
import { CircleButton } from './CircleButton';
import type { EnvironmentDressing } from './EnvironmentStage';
import { isNightTime } from './timeOfDay';

/**
 * The Kitchen: reached by tapping Meal, it presents the "choose food" control
 * that opens the existing `MealCaptureScreen` modal — no rebuilt camera/search
 * UI, no shop, just the entry point into the flow that already exists,
 * dressed as a distinct scene rather than a form. Dressed with the product
 * owner's own day/night kitchen art, picked by `isNightTime` the same way
 * `MainEnvironment` does.
 */

const KITCHEN_DAY = require('../../assets/environments/kitchen-day.png');
const KITCHEN_NIGHT = require('../../assets/environments/kitchen-night.png');
const NIGHT_TINT = '#3d3a63';

const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 28 : 16;

interface KitchenEnvironmentControlsProps {
  petName: string;
  onChooseFood: () => void;
  onBack: () => void;
}

function KitchenEnvironmentControls({ petName, onChooseFood, onBack }: KitchenEnvironmentControlsProps) {
  return (
    <View style={styles.bottomRow}>
      <Text style={styles.prompt}>What should {petName} eat?</Text>
      <CircleButton
        label="Choose food"
        accessibilityLabel="Choose food"
        icon="✣"
        tint={colors.yellow}
        ink={colors.yellowDeep}
        size={64}
        onPress={onChooseFood}
      />
      <Text
        accessibilityRole="button"
        accessibilityLabel="Back to the bedroom"
        onPress={onBack}
        style={styles.back}
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
    controls: <KitchenEnvironmentControls {...props} />,
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
    gap: 12,
    paddingHorizontal: 24,
  },
  prompt: { fontFamily: fonts.mono, fontSize: 11, color: colors.yellowDeep, letterSpacing: 0.3 },
  back: { fontFamily: fonts.mono, fontSize: 11, color: colors.inkSoft, marginTop: 4, letterSpacing: 0.3 },
});
