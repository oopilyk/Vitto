import { RoomActionButton } from './RoomActionButton';
import type { EnvironmentDressing } from './EnvironmentStage';
import { EnvironmentBackdrop } from './EnvironmentBackdrop';
import { isNightTime } from './timeOfDay';

/**
 * The Study: reached by tapping Study from any other scene, it opens the
 * existing `MindGymScreen` -- the same shape as the Gym wrapping `WorkoutScreen`
 * and the Kitchen wrapping `MealCaptureScreen`. Training is the point of the
 * scene, so it gets the floating call to action; the row's own Study button
 * trains here rather than navigating, since the pet has already arrived.
 *
 * Study used to jump straight to the mind gym from anywhere, which made it the
 * odd one out: three of the four buttons walked the pet somewhere and the fourth
 * skipped the pet entirely.
 */

const STUDY_DAY = require('../../assets/environments/study-day.png');
const STUDY_NIGHT = require('../../assets/environments/study-night.png');

/** The art's own top-edge tone -- see `EnvironmentBackdrop`. */
const DAY_TINT = '#8b6f56';
const NIGHT_TINT = '#513b42';

/**
 * Like the Kitchen, the study's floorboards start lower in the art than the pet
 * stands on the stage -- here the rug's near edge is the tell. Same nudge.
 */
const STUDY_LIFT = 0.07;

/** The art's own bottom-edge floorboards, for the strip the lift uncovers. */
const DAY_FLOOR = '#b99670';
const NIGHT_FLOOR = '#54435d';

interface StudyEnvironmentControlsProps {
  onTrainMind: () => void;
}

/** The Study's call to action, in the same slot as the Gym's "Log workout". */
function TrainMindButton({ onPress }: { onPress: () => void }) {
  return <RoomActionButton label="Train mind" onPress={onPress} />;
}

function StudyEnvironmentControls({
  onTrainMind,
}: StudyEnvironmentControlsProps) {
  return <TrainMindButton onPress={onTrainMind} />;
}

export function studyEnvironment(props: StudyEnvironmentControlsProps): EnvironmentDressing {
  const night = isNightTime();
  return {
    background: (
      <EnvironmentBackdrop
        source={night ? STUDY_NIGHT : STUDY_DAY}
        lift={STUDY_LIFT}
        floorColor={night ? NIGHT_FLOOR : DAY_FLOOR}
      />
    ),
    backgroundColor: night ? NIGHT_TINT : DAY_TINT,
    controls: <StudyEnvironmentControls {...props} />,
  };
}
