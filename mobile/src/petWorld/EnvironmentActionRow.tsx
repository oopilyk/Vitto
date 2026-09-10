import { type ImageSourcePropType, Platform, StyleSheet, View } from 'react-native';
import { EnvironmentButton } from './EnvironmentButton';
import type { EnvironmentId } from './types';

/**
 * The Snapchat-style hotbar across the bottom of every scene: a translucent
 * full-width strip with five fixed-position icons on it and the room visible
 * THROUGH it. The current scene's icon is filled in; the rest are dimmed. Icons
 * never move and all five are always shown -- tapping the active one just
 * re-navigates to the scene it is already in, which is harmless.
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
const ICON_EDGE_PADDING = 24;
/** Translucent enough that the room reads through the bar -- the whole point. */
const DAY_BAR_BG = 'rgba(18,17,24,0.30)';
const NIGHT_BAR_BG = 'rgba(0,0,0,0.34)';
const TOP_HAIRLINE = 'rgba(255,255,255,0.12)';

export interface EnvironmentActionRowProps {
  /** The scene on screen -- its icon is the filled one. */
  current: EnvironmentId;
  /** Walks the pet into the tapped scene. */
  onNavigate: (id: EnvironmentId) => void;
  /** Swaps the bar and icon tints to their night treatment. */
  night: boolean;
}

export function EnvironmentActionRow({ current, onNavigate, night }: EnvironmentActionRowProps) {
  // A plain opaque-to-touch View (not `box-none`): taps on the gaps between the
  // icons must be caught here, not fall through to the pet's tap layer beneath.
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: night ? NIGHT_BAR_BG : DAY_BAR_BG,
          paddingTop: HOME_INDICATOR_INSET,
          paddingBottom: HOME_INDICATOR_INSET,
        },
      ]}
    >
      <View style={styles.hairline} />
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
  hairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: TOP_HAIRLINE,
  },
  icons: {
    height: ICON_AREA_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ICON_EDGE_PADDING,
  },
});
