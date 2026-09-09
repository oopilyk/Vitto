import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';
import type { EnvironmentDressing } from './EnvironmentStage';
import { EnvironmentActionRow } from './EnvironmentActionRow';
import { EnvironmentBackdrop } from './EnvironmentBackdrop';
import { isNightTime } from './timeOfDay';

/**
 * The Kitchen: reached by tapping Kitchen in the living room, it opens the
 * existing `MealCaptureScreen` modal -- no rebuilt camera/search UI, no shop,
 * just the entry point into the flow that already exists, dressed as a distinct
 * scene. Same day/night art swap as `MainEnvironment`.
 *
 * The bottom row is laid out exactly like Main's so the buttons sit in the same
 * spots; only the leading button differs -- it's "Living room" here (back to the
 * bedroom) instead of "Kitchen". Logging a meal is the point of the scene, so it
 * gets its own button between the name card and the pet rather than a slot in
 * the row.
 */

const KITCHEN_DAY = require('../../assets/environments/kitchen-day.png');
const KITCHEN_NIGHT = require('../../assets/environments/kitchen-night.png');
const LIVING_ROOM_BUTTON = require('../../assets/buttons/living_room.png');
/** The art's own top-edge tone -- see `EnvironmentBackdrop`. */
const DAY_TINT = '#b2978d';
const NIGHT_TINT = '#38346f';

/**
 * The kitchen's floor line — where the island meets the boards — sits lower in
 * its art than the pet's feet do on the stage, which left the pet looking
 * perched on the island rather than standing in front of it. Raising the art by
 * a fourteenth of its height brings the two together.
 */
const KITCHEN_LIFT = 0.07;

/** The art's own bottom-edge floorboards, for the strip the lift uncovers. */
const DAY_FLOOR = '#b79f84';
const NIGHT_FLOOR = '#523961';

const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 28 : 16;

interface KitchenEnvironmentControlsProps {
  /** Walks the pet into the Study scene. */
  onEnterStudy: () => void;
  onChooseFood: () => void;
  onBack: () => void;
  /** Walks the pet into the Gym scene. */
  onEnterGym: () => void;
  onLogWorkout: () => void;
  /** Walks the pet outdoors. */
  onEnterOutside: () => void;
  onSyncSteps: () => void;
  onTrainMind: () => void;
}

/** The Kitchen's dedicated call to action, floating between the name card and
 *  the pet. Coral on white reads on both the day and night kitchen art. */
function LogMealButton({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.mealSlot} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log meal"
        onPress={onPress}
        style={({ pressed }) => [styles.meal, pressed && styles.mealPressed]}
      >
        <Text style={styles.mealLabel}>Log meal</Text>
      </Pressable>
    </View>
  );
}

function KitchenEnvironmentControls({
  onChooseFood,
  onBack,
  onEnterGym,
  onLogWorkout,
  onEnterOutside,
  onSyncSteps,
  onEnterStudy,
  onTrainMind,
  night,
}: KitchenEnvironmentControlsProps & { night: boolean }) {
  return (
    <>
      <LogMealButton onPress={onChooseFood} />
      <View style={styles.bottomRow}>
        <EnvironmentActionRow
          primary={{
            label: 'Living room',
            accessibilityLabel: 'Back to the living room',
            source: LIVING_ROOM_BUTTON,
            onPress: onBack,
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
    </>
  );
}

export function kitchenEnvironment(props: KitchenEnvironmentControlsProps): EnvironmentDressing {
  const night = isNightTime();
  return {
    background: <EnvironmentBackdrop
        source={night ? KITCHEN_NIGHT : KITCHEN_DAY}
        lift={KITCHEN_LIFT}
        floorColor={night ? NIGHT_FLOOR : DAY_FLOOR}
      />,
    backgroundColor: night ? NIGHT_TINT : DAY_TINT,
    controls: <KitchenEnvironmentControls {...props} night={night} />,
  };
}

const styles = StyleSheet.create({
  // Matches MainEnvironment's `bottomRow` exactly so the buttons land in the
  // same spots as the living room scene.
  bottomRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: HOME_INDICATOR_INSET,
  },
  mealSlot: {
    position: 'absolute',
    top: '32%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  meal: {
    backgroundColor: colors.coral,
    paddingVertical: 12,
    paddingHorizontal: 26,
    borderRadius: 22,
    shadowColor: '#26312d',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  mealPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  mealLabel: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 0.8,
    color: '#fff',
  },
});
