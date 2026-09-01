import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

const CONFETTI_COLORS = [colors.coral, colors.mintDeep, colors.yellowDeep, colors.lilacDeep, '#84a08a'];

/** Fixed, not random, so pieces do not jump around between renders. */
const CONFETTI = Array.from({ length: 16 }, (_, index) => ({
  key: index,
  color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
  // Fan out across the full circle, biased upward by the rise below.
  drift: Math.cos((index / 16) * Math.PI * 2) * (58 + (index % 5) * 16),
  rise: 66 + (index % 4) * 20,
  spin: (index % 2 ? 1 : -1) * (360 + index * 24),
  delay: (index % 6) * 45,
  wide: index % 3 === 0,
}));

const HEARTS = [0, 1, 2];

interface EffectProps {
  active: boolean;
  /** Distance from the stage centre up to the top of the pet. */
  headOffset: number;
}

/** A burst that throws pieces up and out, then lets them fall. */
export function Confetti({ active, headOffset }: EffectProps) {
  const progress = useRef(CONFETTI.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!active) return;
    const animations = CONFETTI.map((piece, index) =>
      Animated.sequence([
        Animated.delay(piece.delay),
        Animated.timing(progress[index], {
          toValue: 1,
          duration: 1150,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    progress.forEach((value) => value.setValue(0));
    const burst = Animated.parallel(animations);
    burst.start();
    return () => burst.stop();
  }, [active, progress]);

  if (!active) return null;

  return (
    <View style={[styles.layer, { marginTop: -headOffset }]} pointerEvents="none">
      {CONFETTI.map((piece, index) => (
        <Animated.View
          key={piece.key}
          style={[
            styles.piece,
            {
              backgroundColor: piece.color,
              width: piece.wide ? 9 : 5,
              height: piece.wide ? 5 : 10,
              opacity: progress[index].interpolate({
                inputRange: [0, 0.1, 0.75, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                {
                  translateX: progress[index].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, piece.drift],
                  }),
                },
                {
                  translateY: progress[index].interpolate({
                    inputRange: [0, 0.35, 1],
                    outputRange: [0, -piece.rise, -piece.rise + 150],
                  }),
                },
                {
                  rotate: progress[index].interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', `${piece.spin}deg`],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

/** Hearts drifting up out of the top of the pet, one after another. */
export function HeartStream({ active, headOffset }: EffectProps) {
  const progress = useRef(HEARTS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!active) return;
    const loops = HEARTS.map((_, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 320),
          Animated.timing(progress[index], {
            toValue: 1,
            duration: 1400,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(progress[index], { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [active, progress]);

  if (!active) return null;

  return (
    <View style={[styles.layer, { marginTop: -headOffset }]} pointerEvents="none">
      {HEARTS.map((heart, index) => (
        <Animated.Text
          key={heart}
          style={[
            styles.heart,
            {
              opacity: progress[index].interpolate({
                inputRange: [0, 0.15, 0.7, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                {
                  translateX: progress[index].interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, index === 1 ? 12 : -12 + index * 20, index === 1 ? -6 : 6],
                  }),
                },
                {
                  translateY: progress[index].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -74],
                  }),
                },
                {
                  scale: progress[index].interpolate({
                    inputRange: [0, 0.3, 1],
                    outputRange: [0.5, 1, 0.7],
                  }),
                },
              ],
            },
          ]}
        >
          ♥
        </Animated.Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Sits at the stage centre; marginTop lifts it to the pet's head.
  layer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  piece: { position: 'absolute', borderRadius: 2 },
  heart: { position: 'absolute', color: colors.coral, fontSize: 20 },
});
