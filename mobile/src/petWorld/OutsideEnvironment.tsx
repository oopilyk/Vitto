import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';
import type { EnvironmentDressing } from './EnvironmentStage';
import { EnvironmentActionRow } from './EnvironmentActionRow';
import { EnvironmentBackdrop } from './EnvironmentBackdrop';
import { isNightTime } from './timeOfDay';

/**
 * Outdoors: reached by tapping Outdoors from any other scene. Syncing steps is
 * the point of the scene, so it gets the floating call to action, mirroring
 * Kitchen's "Log meal" and the Gym's "Log workout". Same shape as those two --
 * no new UI, just the existing action dressed as a place the pet can stand in.
 *
 * The row's own Outdoors button logs steps here rather than navigating, since
 * the pet is already outside -- see `EnvironmentActionRow`.
 */

const OUTSIDE_DAY = require('../../assets/environments/outside-day.png');
const OUTSIDE_NIGHT = require('../../assets/environments/outside-night.png');
const LIVING_ROOM_BUTTON = require('../../assets/buttons/living_room.png');

/**
 * Kept as the stage's colour even though `fill` leaves no band to paint: the
 * scene transition blends between the outgoing and incoming stage colours, so
 * this is what the other scenes fade to and from on the way here.
 */
const DAY_SKY = '#808463';
const NIGHT_SKY = '#252c4f';

const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 28 : 16;

interface OutsideEnvironmentControlsProps {
  onSyncSteps: () => void;
  onBack: () => void;
  onEnterGym: () => void;
  onLogWorkout: () => void;
  onTrainMind: () => void;
}

function LogStepsButton({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.stepsSlot} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log steps"
        onPress={onPress}
        style={({ pressed }) => [styles.steps, pressed && styles.stepsPressed]}
      >
        <Text style={styles.stepsLabel}>Log steps</Text>
      </Pressable>
    </View>
  );
}

function OutsideEnvironmentControls({
  onSyncSteps,
  onBack,
  onEnterGym,
  onLogWorkout,
  onTrainMind,
  night,
}: OutsideEnvironmentControlsProps & { night: boolean }) {
  return (
    <>
      <LogStepsButton onPress={onSyncSteps} />
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
          // No `onEnterOutside`: already here, so the button logs steps instead.
          onSyncSteps={onSyncSteps}
          onTrainMind={onTrainMind}
          night={night}
        />
      </View>
    </>
  );
}

export function outsideEnvironment(props: OutsideEnvironmentControlsProps): EnvironmentDressing {
  const night = isNightTime();
  return {
    // The only scene drawn edge to edge: its art is built around the centre
    // path, so covering the screen costs sides that carry nothing. See `fill`.
    background: <EnvironmentBackdrop source={night ? OUTSIDE_NIGHT : OUTSIDE_DAY} fill />,
    backgroundColor: night ? NIGHT_SKY : DAY_SKY,
    controls: <OutsideEnvironmentControls {...props} night={night} />,
  };
}

const styles = StyleSheet.create({
  bottomRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: HOME_INDICATOR_INSET,
  },
  stepsSlot: {
    position: 'absolute',
    top: '32%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  steps: {
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
  stepsPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  stepsLabel: { fontFamily: fonts.mono, fontSize: 12, letterSpacing: 0.8, color: '#fff' },
});
