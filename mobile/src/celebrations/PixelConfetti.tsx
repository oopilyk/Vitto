import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

/**
 * A one-shot pixel-confetti burst for a full-screen celebration — bigger and
 * blockier than `PetEffects`' in-scene `Confetti`, which is tuned to the small
 * dashboard pet. Squares only, no rounding, rotation snapped to coarse steps so
 * it reads as pixel art rather than tumbling paper.
 *
 * Fixed (not random) piece layout so it can't jump between renders, matching the
 * house pattern in `PetEffects.tsx`.
 */
const PALETTE = [colors.coral, colors.mintDeep, colors.yellowDeep, colors.lilacDeep, '#e7d9a0'];
const PIECE_COUNT = 22;

const PIECES = Array.from({ length: PIECE_COUNT }, (_, i) => {
  const angle = (i / PIECE_COUNT) * Math.PI * 2;
  const spread = 120 + (i % 5) * 34;
  return {
    key: i,
    color: PALETTE[i % PALETTE.length],
    size: 7 + (i % 3) * 3,
    dx: Math.cos(angle) * spread,
    rise: 150 + (i % 4) * 46,
    fall: 260 + (i % 6) * 40,
    spin: (i % 2 ? 1 : -1) * (i % 3 === 0 ? 180 : 90),
    delay: (i % 7) * 40,
  };
});

export function PixelConfetti({ fire }: { fire: boolean }) {
  const t = useRef(PIECES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!fire) return;
    Animated.stagger(
      18,
      PIECES.map((p, i) =>
        Animated.sequence([
          Animated.delay(p.delay),
          Animated.timing(t[i], {
            toValue: 1,
            duration: 1400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ),
    ).start();
  }, [fire, t]);

  if (!fire) return null;

  return (
    <View pointerEvents="none" style={styles.field}>
      {PIECES.map((p, i) => {
        const progress = t[i];
        return (
          <Animated.View
            key={p.key}
            style={[
              styles.piece,
              {
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                opacity: progress.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 0.4, 1],
                      outputRange: [0, -p.rise, p.fall],
                    }),
                  },
                  {
                    rotate: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', `${p.spin}deg`],
                    }),
                  },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  field: {
    ...FILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  piece: { position: 'absolute' },
});
