import { useCallback, useRef } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';
import { HOP_MS, OBSTACLE_SIZE, SHAKE_MS } from './track';

/**
 * The pet's two moves on the run: a hop straight up over a dodged obstacle, in
 * the house squash-and-hop idiom `usePetJump` uses for Four Corners, and a
 * sideways stumble when one gets through.
 *
 * One driver (`hop`, 0 = on the ground, 1 = top of the arc) carries the jump so
 * the lift and the take-off stretch cannot drift apart; `land` is the squash on
 * impact and starts from the flight's completion callback. `stumble` is its own
 * driver so a hit that lands mid-hop still reads.
 *
 * Under Reduce Motion neither move travels: the dodge and the hit are still
 * announced by the feedback line and the counters, so reduced motion costs
 * movement, never information.
 */
export interface DodgeHop {
  /** Applied to the `Animated.View` wrapping the pet. */
  transform: ViewStyle['transform'];
  hop: () => void;
  stumble: () => void;
}

/** Clear of the obstacle with room to spare. */
const HOP_LIFT = OBSTACLE_SIZE * 1.25;
const STUMBLE_PX = 9;

export function useDodgeHop(reduceMotion: boolean): DodgeHop {
  const hopValue = useRef(new Animated.Value(0)).current;
  const land = useRef(new Animated.Value(0)).current;
  const stumbleValue = useRef(new Animated.Value(0)).current;

  const hop = useCallback(() => {
    hopValue.stopAnimation();
    land.stopAnimation();
    hopValue.setValue(0);
    land.setValue(0);
    if (reduceMotion) return;

    Animated.sequence([
      Animated.timing(hopValue, {
        toValue: 1,
        duration: HOP_MS / 2,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(hopValue, {
        toValue: 0,
        duration: HOP_MS / 2,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      land.setValue(1);
      Animated.spring(land, { toValue: 0, friction: 3.5, tension: 150, useNativeDriver: true }).start();
    });
  }, [hopValue, land, reduceMotion]);

  const stumble = useCallback(() => {
    stumbleValue.stopAnimation();
    stumbleValue.setValue(0);
    if (reduceMotion) return;

    const step = SHAKE_MS / 4;
    Animated.sequence([
      Animated.timing(stumbleValue, { toValue: 1, duration: step, useNativeDriver: true }),
      Animated.timing(stumbleValue, { toValue: -1, duration: step, useNativeDriver: true }),
      Animated.timing(stumbleValue, { toValue: 0.5, duration: step, useNativeDriver: true }),
      Animated.timing(stumbleValue, { toValue: 0, duration: step, useNativeDriver: true }),
    ]).start();
  }, [reduceMotion, stumbleValue]);

  // Clamped like `usePetJump`'s: the landing spring overshoots past 0.
  const translateY = hopValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -HOP_LIFT],
    extrapolate: 'clamp',
  });
  const translateX = stumbleValue.interpolate({
    inputRange: [-1, 1],
    outputRange: [-STUMBLE_PX, STUMBLE_PX],
    extrapolate: 'clamp',
  });
  const scaleX = Animated.multiply(
    hopValue.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, 0.92, 1], extrapolate: 'clamp' }),
    land.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16], extrapolate: 'clamp' }),
  );
  const scaleY = Animated.multiply(
    hopValue.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, 1.12, 1], extrapolate: 'clamp' }),
    land.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86], extrapolate: 'clamp' }),
  );

  // The same `as unknown as number` bridge `PetAvatar` and `usePetJump` use: RN's
  // ViewStyle types predate animated transform members.
  const transform: ViewStyle['transform'] = [
    { translateX: translateX as unknown as number },
    { translateY: translateY as unknown as number },
    { scaleX: scaleX as unknown as number },
    { scaleY: scaleY as unknown as number },
  ];

  return { transform, hop, stumble };
}
