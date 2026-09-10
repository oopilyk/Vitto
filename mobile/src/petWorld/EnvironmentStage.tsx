import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { PetState } from '@vitto/core';
import { PetAvatar } from '../components/PetAvatar';
import { playPokeFeedback } from '../services/mealFeedback';
import { PetNameBubble } from './PetNameBubble';
import { stageMetrics } from './EnvironmentBackdrop';
import { ENVIRONMENT_TRANSITION_MS } from './timing';
import type { EnvironmentId, PetAvatarActivityProps } from './types';

/**
 * The pet's size and floor position come from `stageMetrics`, as a share of the
 * room art rather than a fixed point size: a fixed 280pt was three quarters of
 * a small phone's width and a quarter of an iPad's while the room scaled with
 * the screen, so the pet looked huge on one and lost on the other. On the
 * reference phone the numbers are unchanged (280pt, 64pt off the bottom); these
 * are only what is used before the stage has reported its size.
 */
const FALLBACK_STAGE = { width: 393, height: 852 };

/** The name bubble floats at roughly the pet's head, so it reads as coming from the pet. */
const NAME_BUBBLE_HEAD_FRACTION = 0.86;

/** How long the name bubble lingers after a tap on touch devices (no hover). */
const NAME_BUBBLE_HOLD_MS = 2200;

/** What one environment dresses the persistent pet in. */
export interface EnvironmentDressing {
  /**
   * Full-bleed, non-interactive scenery — sits behind the pet, so a shape drawn
   * here can be occluded by the pet standing on top of it but never blocks a
   * touch (rendered with `pointerEvents="none"`).
   */
  background: ReactNode;
  backgroundColor: string;
  /**
   * The environment's own interactive controls (Main's action row, Kitchen's
   * "choose food" button) — absolutely positioned, small, and rendered with
   * `pointerEvents="box-none"` so the empty space around them still reaches the
   * pet's own tap target underneath.
   */
  controls: ReactNode;
}

interface EnvironmentStageProps {
  environment: EnvironmentId;
  pet: PetState;
  activityProps: PetAvatarActivityProps;
  /**
   * Live "the user is at their saved gym" cue (see mobile/AMBIENT.md). A prop
   * rather than part of `activityProps`/`PetInteractionState`: being at the gym
   * says where the user is, not what the pet is doing, so it must not change
   * the animation band — it only parks a dumbbell beside the pet.
   */
  atGym?: boolean;
  /**
   * Chrome that doesn't belong to either scene — the level ring, status chips,
   * profile/today icons. Shown over the pet in both environments, same as the
   * pet itself is persistent across them.
   */
  hudOverlay?: ReactNode;
  /**
   * Every scene's dressing, keyed by id. A record rather than one prop per
   * scene: with two it was `main`/`kitchen` and a single 0..1 blend between
   * them, which does not survive a third.
   */
  environments: Record<EnvironmentId, EnvironmentDressing>;
  /** A tap anywhere on the pet itself — used to fire a "noticing" reaction. */
  onPetTap?: () => void;
  /** Dark-mode the pet's name bubble so it stays legible on night backdrops. */
  night?: boolean;
}

/**
 * The reusable half of the "environment" system: keeps exactly one `PetAvatar`
 * mounted regardless of which scene is showing (so its sprite frame, bob loop
 * and flight animation never reset mid-transition), full-bleed behind whatever
 * global chrome and environment controls are layered over it. Adding a scene is
 * one more `EnvironmentDressing` in the `environments` record plus one more
 * `EnvironmentId` member — nothing about this component's shape changes.
 */
export function EnvironmentStage({
  environment,
  pet,
  activityProps,
  atGym,
  hudOverlay,
  environments,
  onPetTap,
  night,
}: EnvironmentStageProps) {
  const regions = environments[environment];

  // The stage measures itself once and sizes the pet from that; every scene's
  // art is fitted from the same width, so this is the same box the backdrop
  // draws in (see `stageMetrics`).
  const [stageSize, setStageSize] = useState(FALLBACK_STAGE);
  const onStageLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setStageSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    }
  };
  const metrics = stageMetrics(stageSize.width, stageSize.height);
  const nameBubbleLift = metrics.petBottom + Math.round(metrics.petSize * NAME_BUBBLE_HEAD_FRACTION);

  // 0 = the scene being left, 1 = the one being entered. Drives the background
  // blend and a small settle-pulse on the pet, so the pet visibly "carries
  // through" the change rather than the whole screen just swapping.
  const progress = useRef(new Animated.Value(1)).current;
  // The colour to blend *from*. Recorded on the way out rather than the way in:
  // set during the effect that starts the animation, a re-render mid-transition
  // would interpolate from the destination colour to itself and the blend would
  // vanish halfway through.
  const leavingColor = useRef(regions.backgroundColor);
  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: ENVIRONMENT_TRANSITION_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false, // backgroundColor cannot use the native driver.
    }).start();
    return () => {
      leavingColor.current = regions.backgroundColor;
    };
  }, [environment, progress, regions.backgroundColor]);

  const backgroundColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [leavingColor.current, regions.backgroundColor],
  });

  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    // A gentle settle rather than a visible zoom -- with the longer transition
    // a bigger dip read as the whole scene lurching.
    pulse.setValue(0.97);
    Animated.timing(pulse, {
      toValue: 1,
      duration: ENVIRONMENT_TRANSITION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [environment, pulse]);

  // A quick squash-and-hop whenever the pet itself is tapped, so a poke reads as
  // the pet reacting to the touch and not just as opening something. Kept apart
  // from `pulse` (the scene-change settle) so the two can play over each other.
  const poke = useRef(new Animated.Value(0)).current;
  const handlePetPress = useCallback(() => {
    if (!onPetTap) return;
    poke.stopAnimation();
    poke.setValue(0);
    Animated.sequence([
      Animated.timing(poke, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(poke, {
        toValue: 0,
        friction: 3.5,
        tension: 150,
        useNativeDriver: true,
      }),
    ]).start();
    playPokeFeedback();
    onPetTap();
  }, [onPetTap, poke]);

  // The name bubble: visible while the pointer hovers the pet (web) or for a
  // short beat after a tap (touch, where there is no hover). A tap always
  // reveals it, even when `onPetTap` is absent and the Pressable is disabled,
  // via `onPressIn` still firing on hover-capable platforms — the timeout is
  // the touch fallback.
  const [nameShown, setNameShown] = useState(false);
  const hoverName = useRef(false);
  const nameHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearNameTimer = useCallback(() => {
    if (nameHideTimer.current) {
      clearTimeout(nameHideTimer.current);
      nameHideTimer.current = null;
    }
  }, []);

  const showNameOnHover = useCallback(() => {
    hoverName.current = true;
    clearNameTimer();
    setNameShown(true);
  }, [clearNameTimer]);

  const hideNameOnHoverOut = useCallback(() => {
    hoverName.current = false;
    setNameShown(false);
  }, []);

  const flashNameOnTap = useCallback(() => {
    clearNameTimer();
    setNameShown(true);
    nameHideTimer.current = setTimeout(() => {
      if (!hoverName.current) setNameShown(false);
    }, NAME_BUBBLE_HOLD_MS);
  }, [clearNameTimer]);

  useEffect(() => clearNameTimer, [clearNameTimer]);

  const pokeScale = poke.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09] });
  const pokeHop = poke.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });

  return (
    <Animated.View style={[styles.stage, { backgroundColor }]} onLayout={onStageLayout}>
      <FadeSwap swapKey={environment}>
        <Animated.View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {regions.background}
        </Animated.View>
      </FadeSwap>

      <Pressable
        onPress={handlePetPress}
        onPressIn={flashNameOnTap}
        onHoverIn={showNameOnHover}
        onHoverOut={hideNameOnHoverOut}
        disabled={!onPetTap}
        style={[StyleSheet.absoluteFill, styles.petLayer]}
        accessibilityRole={onPetTap ? 'button' : undefined}
        accessibilityLabel={onPetTap ? `Say hi to ${pet.name}` : undefined}
      >
        <Animated.View
          style={[
            styles.petStage,
            { paddingBottom: metrics.petBottom },
            {
              transform: [
                { translateY: pokeHop },
                { scale: Animated.multiply(pulse, pokeScale) },
              ],
            },
          ]}
        >
          <PetAvatar
            pet={pet}
            {...activityProps}
            atGym={atGym}
            stageStyle={[styles.petStage, { paddingBottom: metrics.petBottom }]}
            hideStatusCaption
            size={metrics.petSize}
          >
            {null}
          </PetAvatar>
        </Animated.View>
      </Pressable>

      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.nameLayer, { paddingBottom: nameBubbleLift }]}>
        <PetNameBubble name={pet.name} visible={nameShown} night={night} />
      </View>

      <FadeSwap swapKey={environment} style={styles.controlsLayer}>
        <Animated.View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {regions.controls}
        </Animated.View>
      </FadeSwap>

      {hudOverlay ? (
        <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.hudLayer]}>
          {hudOverlay}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/**
 * Fades its child in whenever `swapKey` changes. Deliberately a fade-in-only
 * swap rather than a true crossfade of both old and new content: the scenes'
 * scenery/controls differ enough in shape that keeping both mounted to blend
 * between them would need them to also agree on layout space. The
 * background colour above already carries the continuous blend; this just
 * keeps the content swap from being an instant jump-cut.
 */
function FadeSwap({
  swapKey,
  style,
  children,
}: {
  swapKey: string;
  /**
   * Applied to the faded wrapper itself, not its child — so a `zIndex` here
   * lands on the element that is actually a sibling of the stage's other
   * layers. Setting it one level in (on the child) leaves the wrapper at the
   * default `zIndex: 0`, which on web let the pet's tap layer (`zIndex: 1`)
   * sit on top of the controls and swallow every button press.
   */
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: ENVIRONMENT_TRANSITION_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
    // Keyed on `swapKey` rather than `opacity` (which is a stable ref and would
    // only ever fire once): this is what makes the fade replay on every swap.
  }, [swapKey, opacity]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style, { opacity }]}>{children}</Animated.View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1 },
  // Explicit stacking order (rather than relying on JSX sibling order alone,
  // which React Native Web can get wrong across nested Animated.View/transform
  // stacking contexts): pet lowest, environment controls above it, HUD always
  // on top so its profile/today buttons can never end up under something else
  // and silently stop responding to taps.
  petLayer: { zIndex: 1 },
  controlsLayer: { zIndex: 2 },
  hudLayer: { zIndex: 3 },
  // Above the pet, below the HUD chrome. Anchors the name bubble near the pet's
  // head. Non-interactive, so it never steals a tap from the controls beneath.
  // `paddingBottom` is set inline from `stageMetrics`.
  nameLayer: {
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  // `paddingBottom` is set inline from `stageMetrics`.
  petStage: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
});
