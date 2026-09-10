import { type ImageSourcePropType, Platform, StyleSheet, View } from 'react-native';
import { EnvironmentButton } from './EnvironmentButton';
import type { EnvironmentId } from './types';

/**
 * The hotbar across the bottom of every scene: five fixed-position icons that
 * sit directly ON the world — no bar, no panel, no blur. The room reads right
 * up to the bottom edge; the icons carry their own keyline so they stay legible
 * over anything, and the current room gets a short coral pixel pedestal (see
 * `EnvironmentButton`). Icons never move and all five are always shown -- the
 * active one is inert, since the room you are standing in is not a place you
 * can travel to.
 *
 * Pure navigation. Each scene's own action (log a meal, a workout, steps, a mind
 * session) is that scene's floating call to action above the pet, not a slot
 * here.
 */

const LIVING_ROOM_FILLED = require('../../assets/buttons/nav/living_room_filled.png');
const LIVING_ROOM_OUTLINE = require('../../assets/buttons/nav/living_room_outline.png');
const KITCHEN_FILLED = require('../../assets/buttons/nav/kitchen_filled.png');
const KITCHEN_OUTLINE = require('../../assets/buttons/nav/kitchen_outline.png');
const GYM_FILLED = require('../../assets/buttons/nav/gym_filled.png');
const GYM_OUTLINE = require('../../assets/buttons/nav/gym_outline.png');
const OUTDOORS_FILLED = require('../../assets/buttons/nav/outdoors_filled.png');
const OUTDOORS_OUTLINE = require('../../assets/buttons/nav/outdoors_outline.png');
const STUDY_FILLED = require('../../assets/buttons/nav/study_filled.png');
const STUDY_OUTLINE = require('../../assets/buttons/nav/study_outline.png');

interface SceneButton {
  id: EnvironmentId;
  /** A verb phrase, so a screen reader announces it as somewhere to go. */
  accessibilityLabel: string;
  filledSource: ImageSourcePropType;
  outlineSource: ImageSourcePropType;
}

/**
 * The five destinations, fixed left-to-right order -- never reflowed, never
 * filtered. Gym leads and the living room sits dead centre, per the product
 * owner's layout call.
 */
const SCENES: readonly SceneButton[] = [
  { id: 'gym', accessibilityLabel: 'Go to the gym', filledSource: GYM_FILLED, outlineSource: GYM_OUTLINE },
  { id: 'kitchen', accessibilityLabel: 'Go to the kitchen', filledSource: KITCHEN_FILLED, outlineSource: KITCHEN_OUTLINE },
  { id: 'main', accessibilityLabel: 'Back to the living room', filledSource: LIVING_ROOM_FILLED, outlineSource: LIVING_ROOM_OUTLINE },
  { id: 'outside', accessibilityLabel: 'Go outdoors', filledSource: OUTDOORS_FILLED, outlineSource: OUTDOORS_OUTLINE },
  { id: 'study', accessibilityLabel: 'Go to the study', filledSource: STUDY_FILLED, outlineSource: STUDY_OUTLINE },
];

// Clears the home indicator on modern iPhones without pulling in a safe-area
// package, which drags a second copy of React into the workspace.
const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 28 : 16;
/** Height of the icon strip itself; the home-indicator inset pads it top and
 *  bottom equally so the icons sit centred in the bar rather than up against
 *  its top edge. */
const ICON_AREA_HEIGHT = 60;
/** Keeps the two end icons off the very screen edge while they spread out. */
const ICON_EDGE_PADDING = 22;

export interface EnvironmentActionRowProps {
  /** The scene on screen -- its icon is the filled one. */
  current: EnvironmentId;
  /** Walks the pet into the tapped scene. */
  onNavigate: (id: EnvironmentId) => void;
  /** Swaps the bar and icon tints to their night treatment. */
  night: boolean;
}

export function EnvironmentActionRow({ current, onNavigate, night }: EnvironmentActionRowProps) {
  // No background — the icons sit on the world. Still a plain (not `box-none`)
  // View so a tap that misses an icon near the bottom edge is caught here
  // rather than poking the pet through the layer beneath.
  return (
    <View
      style={[
        styles.bar,
        { paddingTop: HOME_INDICATOR_INSET, paddingBottom: HOME_INDICATOR_INSET },
      ]}
    >
      <View style={styles.icons}>
        {SCENES.map((scene) => (
          <EnvironmentButton
            key={scene.id}
            accessibilityLabel={scene.accessibilityLabel}
            filledSource={scene.filledSource}
            outlineSource={scene.outlineSource}
            isActive={scene.id === current}
            night={night}
            onPress={() => onNavigate(scene.id)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  icons: {
    height: ICON_AREA_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ICON_EDGE_PADDING,
  },
});
