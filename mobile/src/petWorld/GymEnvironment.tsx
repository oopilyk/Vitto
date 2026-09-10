import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';
import type { EnvironmentDressing } from './EnvironmentStage';
import { EnvironmentActionRow } from './EnvironmentActionRow';
import { EnvironmentBackdrop } from './EnvironmentBackdrop';
import { isNightTime } from './timeOfDay';
import type { EnvironmentId } from './types';

/**
 * The Gym: reached by tapping Gym from any other scene, it opens the existing
 * `WorkoutScreen` modal -- the same shape as the Kitchen, which wraps
 * `MealCaptureScreen`. No new workout UI, just the entry point dressed as a
 * place the pet can stand in, with the same day/night art swap as the others.
 *
 * The bottom row matches Main's and Kitchen's so the buttons stay in the same
 * spots; the leading button is "Living room" (back), and the row's own Gym
 * button logs the workout here rather than navigating -- see
 * `EnvironmentActionRow`. Logging a workout is the point of the scene, so it
 * also gets the floating call to action, mirroring Kitchen's "Log meal".
 */

const GYM_DAY = require('../../assets/environments/gym-day.png');
const GYM_NIGHT = require('../../assets/environments/gym-night.png');

/** The art's own top-edge tone -- see `EnvironmentBackdrop`. */
const DAY_TINT = '#8f7f6d';
const NIGHT_TINT = '#433558';

interface GymEnvironmentControlsProps {
  onStartWorkout: () => void;
  /** Walks the pet into the tapped scene (row buttons and "Living room" back). */
  onNavigate: (id: EnvironmentId) => void;
}

/** The Gym's dedicated call to action, in the same slot as Kitchen's "Log meal". */
function LogWorkoutButton({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.workoutSlot} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log workout"
        onPress={onPress}
        style={({ pressed }) => [styles.workout, pressed && styles.workoutPressed]}
      >
        <Text style={styles.workoutLabel}>Log workout</Text>
      </Pressable>
    </View>
  );
}

function GymEnvironmentControls({
  onStartWorkout,
  onNavigate,
  night,
}: GymEnvironmentControlsProps & { night: boolean }) {
  return (
    <>
      <LogWorkoutButton onPress={onStartWorkout} />
      <EnvironmentActionRow current="gym" onNavigate={onNavigate} night={night} />
    </>
  );
}

export function gymEnvironment(props: GymEnvironmentControlsProps): EnvironmentDressing {
  const night = isNightTime();
  return {
    background: <EnvironmentBackdrop source={night ? GYM_NIGHT : GYM_DAY} />,
    backgroundColor: night ? NIGHT_TINT : DAY_TINT,
    controls: <GymEnvironmentControls {...props} night={night} />,
  };
}

const styles = StyleSheet.create({
  workoutSlot: {
    position: 'absolute',
    top: '32%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  workout: {
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
  workoutPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  workoutLabel: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 0.8,
    color: '#fff',
  },
});
