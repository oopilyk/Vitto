import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';
import { RETRO_RADIUS, retroShadow } from '../petWorld/retroStyle';
import { fonts, world } from '../theme';
import { ON_FILL_TEXT } from './board';

interface PointsFlourishProps {
  /** Already formatted — "+200", "+40 XP". */
  label: string;
  reduceMotion: boolean;
}

/** Just long enough to read a three-character number on the way past. */
const FLOURISH_MS = 620;
/** How far the chip drifts up, in points. Fixed: it travels over the pet's own
 *  head, which is already sized to the stage, so this is a local nudge and not a
 *  screen measurement. */
const RISE = 26;

/**
 * The "+200" that pops off the pet when a square is won. Mounted only for the
 * reveal, so the animation starts from the mount rather than needing a trigger
 * prop — the same one-shot shape `PixelConfetti` uses.
 *
 * Under Reduce Motion the chip is simply there, full opacity, no travel: the
 * number is information, and information never depends on movement.
 */
export function PointsFlourish({ label, reduceMotion }: PointsFlourishProps) {
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: FLOURISH_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, reduceMotion]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -RISE],
    extrapolate: 'clamp',
  });
  // Fades in fast, holds, and is still fully readable at the end of the rise —
  // it never disappears mid-flight, it is unmounted with the reveal.
  const opacity = progress.interpolate({
    inputRange: [0, 0.25, 1],
    outputRange: [0, 1, 1],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.chip, { opacity, transform: [{ translateY }] }]}
    >
      <Text style={styles.label}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: RETRO_RADIUS,
    borderWidth: 2,
    borderColor: world.ink,
    backgroundColor: world.accentDeep,
    ...retroShadow,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: ON_FILL_TEXT,
  },
});
