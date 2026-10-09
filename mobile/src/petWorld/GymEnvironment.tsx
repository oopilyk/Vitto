import { RoomActionButton } from './RoomActionButton';
import type { EnvironmentDressing } from './EnvironmentStage';
import { EnvironmentBackdrop } from './EnvironmentBackdrop';
import { isNightTime } from './timeOfDay';

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
}

/** The Gym's dedicated call to action, in the same slot as Kitchen's "Log meal". */
function LogWorkoutButton({ onPress }: { onPress: () => void }) {
  return <RoomActionButton label="Log workout" onPress={onPress} />;
}

function GymEnvironmentControls({
  onStartWorkout,
}: GymEnvironmentControlsProps) {
  return <LogWorkoutButton onPress={onStartWorkout} />;
}

export function gymEnvironment(props: GymEnvironmentControlsProps): EnvironmentDressing {
  const night = isNightTime();
  return {
    background: <EnvironmentBackdrop source={night ? GYM_NIGHT : GYM_DAY} />,
    backgroundColor: night ? NIGHT_TINT : DAY_TINT,
    controls: <GymEnvironmentControls {...props} />,
  };
}
