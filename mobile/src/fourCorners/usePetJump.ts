import { useCallback, useRef, useState } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';
import { JUMP_MS, type Offset } from './corners';

/**
 * The pet's hop from the centre of the board to a corner, in the house
 * squash-and-hop idiom (`EnvironmentStage`'s poke): a short `Animated.timing`
 * out, then a `friction: 3.5 / tension: 150` spring settling the landing.
 *
 * One driver (`travel`, 0 = centre, 1 = corner) carries the whole flight, so the
 * horizontal slide, the up-and-over arc and the take-off stretch cannot drift
 * out of sync. `land` is a second, shorter driver for the squash on impact — it
 * has to start *after* the flight rather than alongside it, which is why the
 * spring is kicked off from the timing's completion callback.
 *
 * Under Reduce Motion the pet is placed on the corner with no travel at all.
 * Nothing else changes: the caller still reveals the answer and still
 * auto-advances on the same clock, so reduced motion costs movement, never
 * information.
 */
export interface PetJump {
  /** Applied to the `Animated.View` wrapping the pet. */
  transform: ViewStyle['transform'];
  jumpTo: (offset: Offset) => void;
  returnToCentre: () => void;
}

/** Height of the arc, scaled off the distance travelled with a floor for short hops. */
const arcLift = (target: Offset): number =>
  Math.max(26, Math.hypot(target.x, target.y) * 0.34);

export function usePetJump(reduceMotion: boolean): PetJump {
  const travel = useRef(new Animated.Value(0)).current;
  const land = useRef(new Animated.Value(0)).current;
  const [target, setTarget] = useState<Offset>({ x: 0, y: 0 });

  const jumpTo = useCallback(
    (offset: Offset) => {
      travel.stopAnimation();
      land.stopAnimation();
      land.setValue(0);
      travel.setValue(0);
      setTarget(offset);

      if (reduceMotion) {
        travel.setValue(1);
        return;
      }

      Animated.timing(travel, {
        toValue: 1,
        duration: JUMP_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        land.setValue(1);
        Animated.spring(land, {
          toValue: 0,
          friction: 3.5,
          tension: 150,
          useNativeDriver: true,
        }).start();
      });
    },
    [land, reduceMotion, travel],
  );

  const returnToCentre = useCallback(() => {
    travel.stopAnimation();
    land.stopAnimation();
    land.setValue(0);
    if (reduceMotion) {
      travel.setValue(0);
      return;
    }
    Animated.spring(travel, {
      toValue: 0,
      friction: 7,
      tension: 140,
      useNativeDriver: true,
    }).start();
  }, [land, reduceMotion, travel]);

  const lift = arcLift(target);

  // Every interpolation is clamped: the return spring overshoots past 0, and an
  // unclamped output range would fling the pet out the far side of the board.
  const translateX = travel.interpolate({
    inputRange: [0, 1],
    outputRange: [0, target.x],
    extrapolate: 'clamp',
  });
  const translateY = Animated.add(
    travel.interpolate({ inputRange: [0, 1], outputRange: [0, target.y], extrapolate: 'clamp' }),
    travel.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -lift, 0], extrapolate: 'clamp' }),
  );
  const scaleX = Animated.multiply(
    travel.interpolate({ inputRange: [0, 0.2, 1], outputRange: [1, 0.9, 1], extrapolate: 'clamp' }),
    land.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18], extrapolate: 'clamp' }),
  );
  const scaleY = Animated.multiply(
    travel.interpolate({ inputRange: [0, 0.2, 1], outputRange: [1, 1.14, 1], extrapolate: 'clamp' }),
    land.interpolate({ inputRange: [0, 1], outputRange: [1, 0.84], extrapolate: 'clamp' }),
  );

  // The same `as unknown as number` bridge `PetAvatar` uses for its bob/flight
  // transforms: RN's ViewStyle types predate animated transform members.
  const transform: ViewStyle['transform'] = [
    { translateX: translateX as unknown as number },
    { translateY: translateY as unknown as number },
    { scaleX: scaleX as unknown as number },
    { scaleY: scaleY as unknown as number },
  ];

  return { transform, jumpTo, returnToCentre };
}
