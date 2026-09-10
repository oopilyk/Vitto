import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import type { PetMood } from '@vitto/core';
import { fonts } from '../theme';

/** What one tap makes the pet emote — a glyph and, sometimes, a short word. */
export interface TapReaction {
  emote: string;
  caption?: string;
}

/** Taps within this window of each other count as "rapid" and escalate. */
export const RAPID_TAP_WINDOW_MS = 650;

const HAPPY: TapReaction[] = [
  { emote: '❤️', caption: 'hi!' },
  { emote: '✨' },
  { emote: '😄', caption: 'hehe' },
  { emote: '🐾', caption: 'boop!' },
  { emote: '⭐' },
  { emote: '🎵', caption: '♪' },
];
const SLEEPY: TapReaction[] = [
  { emote: '😴', caption: 'so sleepy…' },
  { emote: '💤' },
];
const HUNGRY: TapReaction[] = [
  { emote: '🍽️', caption: 'kinda hungry…' },
  { emote: '🥺' },
];
const UNWELL: TapReaction[] = [
  { emote: '🥺', caption: 'not feeling great' },
  { emote: '💧' },
  { emote: '😷', caption: 'needs some care' },
];

/**
 * Chooses the reaction for a tap. Pure and exported so it can be unit-tested
 * without driving the animation.
 *
 * @param burst  Monotonic tap counter — indexes into the active pool so
 *               consecutive taps vary instead of repeating.
 * @param rapid  How many taps have landed in quick succession (see
 *               `RAPID_TAP_WINDOW_MS`); a run of them escalates to a playful
 *               "okay okay!" and then a dizzy spell.
 */
export function pickTapReaction(
  burst: number,
  rapid: number,
  mood: PetMood,
  unwell: boolean,
): TapReaction {
  if (rapid >= 7) return { emote: '😵‍💫', caption: 'whoa, dizzy!' };
  if (rapid >= 4) return { emote: '😆', caption: 'okay okay!' };

  const pool = unwell
    ? UNWELL
    : mood === 'sleepy'
      ? SLEEPY
      : mood === 'hungry'
        ? HUNGRY
        : HAPPY;

  const base = pool[Math.abs(burst) % pool.length];
  // Happy captions every other tap only, so a fast tapper isn't buried in words.
  if (pool === HAPPY && burst % 2 === 1) return { emote: base.emote };
  return base;
}

/**
 * A single emote (plus optional word) that pops above the pet and floats up as
 * it fades — the visible "the pet noticed you" beat for a tap. Re-fires every
 * time `burst` changes; the parent (`EnvironmentStage`) owns the tap counter.
 */
export function PetTapReaction({
  burst,
  rapid,
  mood,
  unwell,
  night,
}: {
  burst: number;
  rapid: number;
  mood: PetMood;
  unwell: boolean;
  night?: boolean;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const [reaction, setReaction] = useState<TapReaction | null>(null);

  useEffect(() => {
    if (burst <= 0) return;
    setReaction(pickTapReaction(burst, rapid, mood, unwell));
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 950,
      easing: (t) => t, // linear; the interpolations below shape it
      useNativeDriver: true,
    }).start();
    // `rapid`/`mood`/`unwell` are read at fire time — `burst` is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burst, anim]);

  if (!reaction) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          opacity: anim.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -68] }) },
            { scale: anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.5, 1.15, 1] }) },
          ],
        },
      ]}
    >
      <Text style={styles.emote}>{reaction.emote}</Text>
      {reaction.caption ? (
        <Text style={[styles.caption, night && styles.captionNight]}>{reaction.caption}</Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  emote: { fontSize: 34 },
  caption: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#26312d',
    marginTop: 2,
    textShadowColor: 'rgba(255,255,255,0.7)',
    textShadowRadius: 3,
  },
  captionNight: { color: '#f2efff', textShadowColor: 'rgba(0,0,0,0.4)' },
});
