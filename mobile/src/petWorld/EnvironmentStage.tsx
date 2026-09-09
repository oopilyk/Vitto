import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';
import type { PetState } from '@vitto/core';
import { PetAvatar } from '../components/PetAvatar';
import { ENVIRONMENT_TRANSITION_MS } from './timing';
import type { EnvironmentId, PetAvatarActivityProps } from './types';

/**
 * Bigger than `PetAvatar`'s own default (148) so the pet reads as the main
 * object of the full-bleed scene it now stands in, without resizing it in any
 * of `PetAvatar`'s other callers (breed pickers, `FriendPetCard`), which don't
 * pass this override and keep the size their art was tuned against.
 */
const PET_STAGE_SIZE = 216;

/**
 * Clears both environments' bottom control rows (now identical -- the same
 * `EnvironmentActionRow` renders in both) with the enlarged pet above, while
 * sitting the pet noticeably lower/closer to the ground per the product
 * owner's note than an earlier, more conservative estimate here used.
 * Kitchen is the taller of the two: home-indicator inset (~28) + row gap
 * (10) + "Not right now" link (~14) + the action row itself (default 56px
 * `CircleButton` circle + 6px internal gap + ~12px label text, ~74px total)
 * comes to roughly 126px from the very bottom of the screen to the top of
 * that stack. This value clears that with a modest buffer; verify on-device
 * if either row's content ever grows.
 */
const PET_STAGE_BOTTOM_PADDING = 140;

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
   * Chrome that doesn't belong to either scene — the level ring, status chips,
   * profile/today icons. Shown over the pet in both environments, same as the
   * pet itself is persistent across them.
   */
  hudOverlay?: ReactNode;
  main: EnvironmentDressing;
  kitchen: EnvironmentDressing;
  /** A tap anywhere on the pet itself — used to fire a "noticing" reaction. */
  onPetTap?: () => void;
}

/**
 * The reusable half of the "environment" system: keeps exactly one `PetAvatar`
 * mounted regardless of which scene is showing (so its sprite frame, bob loop
 * and flight animation never reset mid-transition), full-bleed behind whatever
 * global chrome and environment controls are layered over it. Adding a third
 * environment later is one more `EnvironmentDressing` value plus one more
 * `EnvironmentId` member — nothing about this component's shape changes, which
 * is the point of keeping it a plain union/switch rather than a registry built
 * for scenes that don't exist yet.
 */
export function EnvironmentStage({
  environment,
  pet,
  activityProps,
  hudOverlay,
  main,
  kitchen,
  onPetTap,
}: EnvironmentStageProps) {
  const regions = environment === 'main' ? main : kitchen;

  // 0 = fully Main, 1 = fully Kitchen — drives the background blend and a small
  // settle-pulse on the pet, so the pet visibly "carries through" the change
  // rather than the whole screen just swapping.
  const progress = useRef(new Animated.Value(environment === 'kitchen' ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: environment === 'kitchen' ? 1 : 0,
      duration: ENVIRONMENT_TRANSITION_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false, // backgroundColor cannot use the native driver.
    }).start();
  }, [environment, progress]);

  const backgroundColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [main.backgroundColor, kitchen.backgroundColor],
  });

  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    pulse.setValue(0.94);
    Animated.timing(pulse, {
      toValue: 1,
      duration: ENVIRONMENT_TRANSITION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [environment, pulse]);

  return (
    <Animated.View style={[styles.stage, { backgroundColor }]}>
      <FadeSwap swapKey={environment}>
        <Animated.View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {regions.background}
        </Animated.View>
      </FadeSwap>

      <Pressable
        onPress={onPetTap}
        disabled={!onPetTap}
        style={[StyleSheet.absoluteFill, styles.petLayer]}
        accessibilityRole={onPetTap ? 'button' : undefined}
        accessibilityLabel={onPetTap ? `Say hi to ${pet.name}` : undefined}
      >
        <Animated.View style={[styles.petStage, { transform: [{ scale: pulse }] }]}>
          <PetAvatar
            pet={pet}
            {...activityProps}
            stageStyle={styles.petStage}
            hideStatusCaption
            size={PET_STAGE_SIZE}
          >
            {null}
          </PetAvatar>
        </Animated.View>
      </Pressable>

      <FadeSwap swapKey={environment}>
        <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.controlsLayer]}>
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
 * swap rather than a true crossfade of both old and new content: Main and
 * Kitchen's scenery/controls differ enough in shape that keeping both mounted
 * to blend between them would need them to also agree on layout space. The
 * background colour above already carries the continuous blend; this just
 * keeps the content swap from being an instant jump-cut.
 */
function FadeSwap({ swapKey, children }: { swapKey: string; children: ReactNode }) {
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
  return <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>{children}</Animated.View>;
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
  petStage: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    paddingBottom: PET_STAGE_BOTTOM_PADDING,
  },
});
