import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';
import type { PetState } from '@vitto/core';
import { PetAvatar } from '../components/PetAvatar';
import { ENVIRONMENT_TRANSITION_MS } from './timing';
import type { EnvironmentId, PetAvatarActivityProps } from './types';

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
        style={StyleSheet.absoluteFill}
        accessibilityRole={onPetTap ? 'button' : undefined}
        accessibilityLabel={onPetTap ? `Say hi to ${pet.name}` : undefined}
      >
        <Animated.View style={[styles.petStage, { transform: [{ scale: pulse }] }]}>
          <PetAvatar pet={pet} {...activityProps} stageStyle={styles.petStage} hideStatusCaption>
            {null}
          </PetAvatar>
        </Animated.View>
      </Pressable>

      {hudOverlay ? (
        <Animated.View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {hudOverlay}
        </Animated.View>
      ) : null}

      <FadeSwap swapKey={environment}>
        <Animated.View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {regions.controls}
        </Animated.View>
      </FadeSwap>
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
  petStage: { flex: 1, backgroundColor: 'transparent' },
});
