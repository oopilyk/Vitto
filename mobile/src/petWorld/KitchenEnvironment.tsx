import { Platform, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';
import { CircleButton } from './CircleButton';
import type { EnvironmentDressing } from './EnvironmentStage';

/**
 * The Kitchen: reached by tapping Meal, it presents the "choose food" control
 * that opens the existing `MealCaptureScreen` modal — no rebuilt camera/search
 * UI, no shop, just the entry point into the flow that already exists,
 * dressed as a distinct scene rather than a form. Illustrated with plain RN
 * shapes in Vitto's own palette (per the product owner's note: no photographic
 * assets, no bright cartoon icon crowding), not a new asset.
 */

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

function KitchenBackground() {
  return (
    <View style={styles.scenery} pointerEvents="none">
      <View style={styles.counter} />
      <View style={styles.bowl} />
    </View>
  );
}

export function kitchenEnvironment(props: KitchenEnvironmentControlsProps): EnvironmentDressing {
  return {
    background: <KitchenBackground />,
    backgroundColor: colors.yellow,
    controls: <KitchenEnvironmentControls {...props} />,
  };
}

const styles = StyleSheet.create({
  scenery: { flex: 1, justifyContent: 'flex-end' },
  // A plain counter line and a bowl — just enough dressing to read as a
  // kitchen without drawing anything representational.
  counter: {
    height: 64,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(154,123,40,0.25)',
  },
  bowl: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    width: 84,
    height: 28,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(154,123,40,0.25)',
  },
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
