import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Animated, type ImageSourcePropType, Platform, StyleSheet, View } from 'react-native';
import { colors, getColorScheme, themedStyles } from '../theme';
import { EnvironmentButton } from './EnvironmentButton';
import { useTourTarget, type TourTargetId } from '../tour/FirstRunTour';
import { useChromeScale } from './chromeScale';
import type { EnvironmentId } from './types';

/**
 * The Snapchat-style hotbar across the bottom of every scene: a translucent
 * full-width strip with five fixed-position icons on it and the room visible
 * THROUGH it. The current scene's icon is filled in; the rest are dimmed. Icons
 * never move and all five are always shown -- the active one is inert, since
 * the room you are standing in is not a place you can travel to.
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
  /** Under the icon: what you do there, not the room's name ("Mind", not "Study"). */
  label: string;
  filledSource: ImageSourcePropType;
  outlineSource: ImageSourcePropType;
}

/**
 * The five destinations, fixed left-to-right order -- never reflowed, never
 * filtered. Outside leads, the living room sits dead centre and the Gym is to
 * its right, per the product owner's layout call.
 */
const SCENES: readonly SceneButton[] = [
  { id: 'outside', label: 'Outside', accessibilityLabel: 'Go outdoors', filledSource: OUTDOORS_FILLED, outlineSource: OUTDOORS_OUTLINE },
  { id: 'kitchen', label: 'Food', accessibilityLabel: 'Go to the kitchen', filledSource: KITCHEN_FILLED, outlineSource: KITCHEN_OUTLINE },
  { id: 'main', label: 'Home', accessibilityLabel: 'Back to the living room', filledSource: LIVING_ROOM_FILLED, outlineSource: LIVING_ROOM_OUTLINE },
  { id: 'gym', label: 'Gym', accessibilityLabel: 'Go to the gym', filledSource: GYM_FILLED, outlineSource: GYM_OUTLINE },
  { id: 'study', label: 'Mind', accessibilityLabel: 'Go to the study', filledSource: STUDY_FILLED, outlineSource: STUDY_OUTLINE },
];

// Clears the home indicator on modern iPhones without pulling in a safe-area
// package, which drags a second copy of React into the workspace.
const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 20 : 10;
const TOP_PAD = 6;
/** The floating pill's height and its gap to the screen sides. */
const PILL_HEIGHT = 50;
const PILL_SIDE = 14;
/** How far the active tab's highlight sits inside the pill's edge. */
const HIGHLIGHT_INSET = 4;
/**
 * How much of the screen's bottom the bar covers, at a chrome `scale` (see
 * chromeScale), in the units of a layer zoomed by that scale -- the HUD's.
 * For anything that has to sit just above it.
 */
export const navBarHeight = (scale = 1): number => PILL_HEIGHT + (TOP_PAD + HOME_INDICATOR_INSET) / scale;

/** Real iOS 26 Liquid Glass when the device has it; a frosted tint otherwise. */
const LIQUID_GLASS = (() => {
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
})();

/** The see-through tint behind the icons where there is no Liquid Glass. */
const SCENE_GLASS = 'rgba(28,22,26,0.62)';
const SCENE_EDGE = 'rgba(242,232,212,0.16)';
const SCENE_HIGHLIGHT = 'rgba(242,232,212,0.16)';

export interface EnvironmentActionRowProps {
  /** The scene on screen -- its icon is the filled one. */
  current: EnvironmentId;
  /** Walks the pet into the tapped scene. */
  onNavigate: (id: EnvironmentId) => void;
  /** Swaps the bar and icon tints to their night treatment. */
  night: boolean;
  /** On a room page the bar floats over the page, not the scene: a paper-toned
   *  pill with dark glyphs instead of the dark glass. */
  onPaper?: boolean;
}

/**
 * A floating glass pill holding the five rooms, with a softer pill sliding
 * behind the one you are in -- the pattern iOS's own tab bars use.
 */
export function EnvironmentActionRow({ current, onNavigate, night, onPaper = false }: EnvironmentActionRowProps) {
  // A tablet draws the icons bigger, in a taller strip (see chromeScale).
  const scale = useChromeScale();
  const zoomed = scale !== 1;
  const [width, setWidth] = useState(0);
  const index = Math.max(0, SCENES.findIndex((scene) => scene.id === current));
  const slot = width / SCENES.length;
  const slide = useRef(new Animated.Value(index)).current;
  useEffect(() => {
    Animated.spring(slide, { toValue: index, useNativeDriver: true, speed: 22, bounciness: 6 }).start();
  }, [index, slide]);

  const lightPaper = onPaper && getColorScheme() === 'light';
  const glyph = lightPaper ? colors.ink : undefined;
  const glassTint = onPaper ? (lightPaper ? 'rgba(255,255,255,0.72)' : 'rgba(28,28,31,0.72)') : SCENE_GLASS;
  const highlight = lightPaper ? 'rgba(23,23,26,0.08)' : SCENE_HIGHLIGHT;
  const edge = lightPaper ? colors.border : SCENE_EDGE;
  const height = PILL_HEIGHT * scale;

  // A plain opaque-to-touch View (not `box-none`): taps on the gaps between the
  // icons must be caught here, not fall through to the pet's tap layer beneath.
  return (
    <View style={[styles.bar, { paddingTop: TOP_PAD, paddingBottom: HOME_INDICATOR_INSET, paddingHorizontal: PILL_SIDE * scale }]}>
      <GlassView
        glassEffectStyle="regular"
        colorScheme={lightPaper ? 'light' : 'dark'}
        style={[
          styles.pill,
          { height, borderRadius: height / 2, borderColor: edge },
          !LIQUID_GLASS && { backgroundColor: glassTint },
          !LIQUID_GLASS && Platform.OS === 'web' && ({ backdropFilter: 'blur(18px) saturate(160%)' } as object),
        ]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        testID="room-nav-pill"
      >
        {width > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.highlight,
              {
                width: slot - HIGHLIGHT_INSET * 2,
                borderRadius: (height - HIGHLIGHT_INSET * 2) / 2,
                backgroundColor: highlight,
                transform: [{ translateX: Animated.add(Animated.multiply(slide, slot), HIGHLIGHT_INSET) }],
              },
            ]}
          />
        ) : null}
        {SCENES.map((scene) => (
          <View key={scene.id} style={styles.slot}>
            <TourableScene id={scene.id} scale={zoomed ? scale : 1}>
              <EnvironmentButton
                accessibilityLabel={scene.accessibilityLabel}
                label={scene.label}
                filledSource={scene.filledSource}
                outlineSource={scene.outlineSource}
                isActive={scene.id === current}
                night={onPaper ? false : night}
                glyph={glyph}
                onPress={() => onNavigate(scene.id)}
              />
            </TourableScene>
          </View>
        ))}
      </GlassView>
    </View>
  );
}

const styles = themedStyles(() => ({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  highlight: { position: 'absolute', left: 0, top: HIGHLIGHT_INSET, bottom: HIGHLIGHT_INSET },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
}));

/** The rooms the first-run tour points at (see FirstRunTour); the others need no wrapper. */
const TOUR_ROOMS: Partial<Record<EnvironmentId, TourTargetId>> = { kitchen: 'kitchen', gym: 'gym', outside: 'outside', study: 'study' };

function TourableScene({ id, scale, children }: { id: EnvironmentId; scale: number; children: React.ReactNode }) {
  const target = TOUR_ROOMS[id];
  const zoomed = scale === 1 ? children : <View style={{ transform: [{ scale }] }}>{children}</View>;
  return target ? <TourTarget id={target}>{zoomed}</TourTarget> : <>{zoomed}</>;
}

function TourTarget({ id, children }: { id: TourTargetId; children: React.ReactNode }) {
  const ref = useTourTarget(id);
  return (
    <View ref={ref} collapsable={false}>
      {children}
    </View>
  );
}
