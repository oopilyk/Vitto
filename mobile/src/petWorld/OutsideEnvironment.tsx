import { Pressable, Text } from 'react-native';
import { RoomActionSlot } from './RoomActionSlot';
import { colors, fonts, themedStyles } from '../theme';
import type { EnvironmentDressing } from './EnvironmentStage';
import { EnvironmentBackdrop } from './EnvironmentBackdrop';
import { isNightTime } from './timeOfDay';

/**
 * Outdoors: reached by tapping Outdoors from any other scene. Logging a run,
 * walk or ride is the point of the scene, so it gets the floating call to
 * action, mirroring Kitchen's "Log meal" and the Gym's "Log workout". Steps
 * need no button: they sync from Apple Health on their own (see App.tsx).
 */

const OUTSIDE_DAY = require('../../assets/environments/outside-day.png');
const OUTSIDE_NIGHT = require('../../assets/environments/outside-night.png');

/**
 * Kept as the stage's colour even though `fill` leaves no band to paint: the
 * scene transition blends between the outgoing and incoming stage colours, so
 * this is what the other scenes fade to and from on the way here.
 */
const DAY_SKY = '#808463';
const NIGHT_SKY = '#252c4f';

interface OutsideEnvironmentControlsProps {
  /** Opens the workout logger straight on its runs-and-rides list. */
  onLogRun: () => void;
}

/** Outdoors is for runs, walks and rides. Steps sync on their own. */
function LogRunButton({ onPress }: { onPress: () => void }) {
  return (
    <RoomActionSlot>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log a run"
        onPress={onPress}
        style={({ pressed }) => [styles.steps, pressed && styles.stepsPressed]}
      >
        <Text style={styles.stepsLabel}>Log a run</Text>
      </Pressable>
    </RoomActionSlot>
  );
}

function OutsideEnvironmentControls({
  onLogRun,
}: OutsideEnvironmentControlsProps) {
  return <LogRunButton onPress={onLogRun} />;
}

export function outsideEnvironment(props: OutsideEnvironmentControlsProps): EnvironmentDressing {
  const night = isNightTime();
  return {
    // The only scene drawn edge to edge: its art is built around the centre
    // path, so covering the screen costs sides that carry nothing. See `fill`.
    background: <EnvironmentBackdrop source={night ? OUTSIDE_NIGHT : OUTSIDE_DAY} fill />,
    backgroundColor: night ? NIGHT_SKY : DAY_SKY,
    controls: <OutsideEnvironmentControls {...props} />,
  };
}

const styles = themedStyles(() => ({
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
}));
