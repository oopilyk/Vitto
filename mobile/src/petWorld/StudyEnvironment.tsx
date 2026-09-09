import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';
import type { EnvironmentDressing } from './EnvironmentStage';
import { EnvironmentActionRow } from './EnvironmentActionRow';
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
const LIVING_ROOM_BUTTON = require('../../assets/buttons/living_room.png');

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

const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 28 : 16;

interface StudyEnvironmentControlsProps {
  onTrainMind: () => void;
  onBack: () => void;
  onEnterGym: () => void;
  onLogWorkout: () => void;
  onEnterOutside: () => void;
  onSyncSteps: () => void;
}

/** The Study's call to action, in the same slot as the Gym's "Log workout". */
function TrainMindButton({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.trainSlot} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Train mind"
        onPress={onPress}
        style={({ pressed }) => [styles.train, pressed && styles.trainPressed]}
      >
        <Text style={styles.trainLabel}>Train mind</Text>
      </Pressable>
    </View>
  );
}

function StudyEnvironmentControls({
  onTrainMind,
  onBack,
  onEnterGym,
  onLogWorkout,
  onEnterOutside,
  onSyncSteps,
  night,
}: StudyEnvironmentControlsProps & { night: boolean }) {
  return (
    <>
      <TrainMindButton onPress={onTrainMind} />
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
          // No `onEnterStudy`: already here, so the button trains instead.
          onTrainMind={onTrainMind}
          night={night}
        />
      </View>
    </>
  );
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
    controls: <StudyEnvironmentControls {...props} night={night} />,
  };
}

const styles = StyleSheet.create({
  // Matches every other scene's `bottomRow` exactly so the buttons land in the
  // same spots wherever the pet is standing.
  bottomRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: HOME_INDICATOR_INSET,
  },
  trainSlot: {
    position: 'absolute',
    top: '32%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  train: {
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
  trainPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  trainLabel: { fontFamily: fonts.mono, fontSize: 12, letterSpacing: 0.8, color: '#fff' },
});
