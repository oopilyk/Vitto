import { type ImageSourcePropType, StyleSheet, View } from 'react-native';
import { EnvironmentButton } from './EnvironmentButton';
import type { EnvironmentId } from './types';

const LIVING_ROOM_BUTTON = require('../../assets/buttons/living_room.png');
const KITCHEN_BUTTON = require('../../assets/buttons/kitchen.png');
const GYM_BUTTON = require('../../assets/buttons/gym.png');
const OUTDOORS_BUTTON = require('../../assets/buttons/outdoors.png');
const STUDY_BUTTON = require('../../assets/buttons/study.png');

interface SceneButton {
  id: EnvironmentId;
  label: string;
  /** A verb phrase, so a screen reader announces it as somewhere to go. */
  accessibilityLabel: string;
  source: ImageSourcePropType;
}

/**
 * Every place the row can send the pet, in a fixed left-to-right order. The row
 * drops whichever one the pet is already standing in, so a scene never shows a
 * button back into itself -- four buttons, always the four *other* rooms. That
 * is what turns the Gym slot into the Kitchen slot once the pet is in the Gym,
 * and the Kitchen slot into "Living room" once it is in the Kitchen.
 */
const SCENES: readonly SceneButton[] = [
  { id: 'main', label: 'Living room', accessibilityLabel: 'Back to the living room', source: LIVING_ROOM_BUTTON },
  { id: 'kitchen', label: 'Kitchen', accessibilityLabel: 'Go to the kitchen', source: KITCHEN_BUTTON },
  { id: 'gym', label: 'Gym', accessibilityLabel: 'Go to the gym', source: GYM_BUTTON },
  { id: 'outside', label: 'Outdoors', accessibilityLabel: 'Go outdoors', source: OUTDOORS_BUTTON },
  { id: 'study', label: 'Study', accessibilityLabel: 'Go to the study', source: STUDY_BUTTON },
];

export interface EnvironmentActionRowProps {
  /** The scene on screen -- its own button is left out of the row. */
  current: EnvironmentId;
  /** Walks the pet into the tapped scene. */
  onNavigate: (id: EnvironmentId) => void;
  /** Brightens the captions so they stay readable over a dark night backdrop. */
  night: boolean;
}

/**
 * The four destination buttons across the bottom of every scene. They are pure
 * navigation now -- each scene's own action (log a meal, a workout, steps, a
 * mind session) lives in that scene's floating call to action above the pet, so
 * the row never needs a "do the thing here instead" fallback.
 */
export function EnvironmentActionRow({ current, onNavigate, night }: EnvironmentActionRowProps) {
  return (
    <View style={styles.bottomRow}>
      {SCENES.filter((scene) => scene.id !== current).map((scene) => (
        <EnvironmentButton
          key={scene.id}
          label={scene.label}
          accessibilityLabel={scene.accessibilityLabel}
          source={scene.source}
          night={night}
          onPress={() => onNavigate(scene.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
  },
});
