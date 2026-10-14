import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import type { PetAilment, PetMood } from '@vitto/core';
import { themedStyles } from '../theme';

/**
 * How the pet feels, as one emoji: smiling when happy, sad when sad. What is
 * wrong outranks the mood, as it does on the plaque: a starving pet is not
 * "content" just because its mood says so.
 */
const BY_AILMENT: Record<PetAilment, string> = {
  dying: '🤒',
  starving: '😩',
  exhausted: '😴',
  sad: '😢',
  foggy: '😵‍💫',
};
const BY_MOOD: Record<PetMood, string> = {
  bright: '😄',
  content: '😊',
  sleepy: '😪',
  sluggish: '😮‍💨',
  hungry: '🤤',
};

/** The emoji for how the pet feels. Pure and exported for tests. */
export const feelingEmoji = (mood: PetMood, ailment: PetAilment | null): string =>
  ailment ? BY_AILMENT[ailment] : BY_MOOD[mood];

/** At most this many in the air at once; a frantic tapper retires the oldest. */
const MAX_FLOATING = 14;
const FLOAT_MS = 1100;

interface Floater {
  id: number;
  emoji: string;
  /** Where it starts, from the middle of the pet's head, in points. */
  x: number;
  y: number;
  /** Sideways drift as it rises, and a slight tilt, so a cluster spreads out. */
  drift: number;
  tilt: number;
}

/**
 * An emoji of how the pet feels that pops above it, floats up and fades — the
 * visible "the pet noticed you" beat for a tap. Every change of `burst` adds
 * one more, from its own spot round the head, so rapid taps fill the air with
 * them rather than restarting the last. The parent (`EnvironmentStage`) owns
 * the tap counter.
 */
export function PetTapReaction({
  burst,
  mood,
  ailment,
  onActiveChange,
}: {
  burst: number;
  mood: PetMood;
  ailment: PetAilment | null;
  /** True while any emoji is in the air, false once the last one has faded. */
  onActiveChange?: (active: boolean) => void;
}) {
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const active = floaters.length > 0;
  useEffect(() => onActiveChange?.(active), [active, onActiveChange]);

  useEffect(() => {
    if (burst <= 0) return;
    // The first tap pops straight up from the head; the ones after it scatter.
    const scatter = (range: number) => (burst === 1 ? 0 : (Math.random() * 2 - 1) * range);
    const floater: Floater = {
      id: burst,
      emoji: feelingEmoji(mood, ailment),
      x: scatter(44),
      y: scatter(14),
      drift: (Math.random() * 2 - 1) * 18,
      tilt: (Math.random() * 2 - 1) * 14,
    };
    setFloaters((current) => [...current.slice(-(MAX_FLOATING - 1)), floater]);
    // `mood`/`ailment` are read at fire time — `burst` is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burst]);

  const retire = useCallback((id: number) => setFloaters((current) => current.filter((item) => item.id !== id)), []);

  if (floaters.length === 0) return null;

  // A zero-width anchor at the head: each emoji is placed round it absolutely,
  // so a new one never shoves the others aside.
  return (
    <View pointerEvents="none" style={styles.anchor}>
      {floaters.map((floater) => (
        <FloatingEmoji key={floater.id} floater={floater} onDone={retire} />
      ))}
    </View>
  );
}

function FloatingEmoji({ floater, onDone }: { floater: Floater; onDone: (id: number) => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: FLOAT_MS,
      easing: (t) => t, // linear; the interpolations below shape it
      useNativeDriver: true,
    }).start(({ finished }) => finished && onDone(floater.id));
  }, [anim, floater.id, onDone]);

  return (
    <Animated.View
      style={[
        styles.floater,
        {
          opacity: anim.interpolate({ inputRange: [0, 0.12, 0.6, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [floater.x, floater.x + floater.drift] }) },
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [floater.y, floater.y - 80] }) },
            { rotate: `${floater.tilt}deg` },
            { scale: anim.interpolate({ inputRange: [0, 0.18, 0.32, 1], outputRange: [0.4, 1.2, 1, 1] }) },
          ],
        },
      ]}
    >
      <Text style={styles.emoji}>{floater.emoji}</Text>
    </Animated.View>
  );
}

const styles = themedStyles(() => ({
  anchor: { width: 0, height: 42 },
  floater: { position: 'absolute', bottom: 0, left: -30, width: 60, alignItems: 'center' },
  emoji: { fontSize: 34, lineHeight: 42 },
}));
