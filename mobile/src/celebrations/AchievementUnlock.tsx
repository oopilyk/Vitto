import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ACHIEVEMENT_BY_ID, type AchievementId, type BodyProfile, type PetState, type TrophyId } from '@vitto/core';
import { PetAvatar } from '../components/PetAvatar';
import { IDLE_ACTIVITY } from '../petWorld/toPetAvatarActivityProps';
import { retro } from '../petWorld/retroStyle';
import { playCelebrationSound } from '../services/mealFeedback';
import { colors, fonts } from '../theme';
import { PixelConfetti } from './PixelConfetti';

/**
 * The "achievement unlocked" moment. Same family as `LevelUpCelebration` —
 * veil, spring-in, confetti, a retro plate — but smaller and quicker: a level-up
 * is the pet's moment and takes the whole screen; this is the user's, and it
 * should feel like a reward without stopping play for long. It dismisses itself
 * after a beat, or on tap.
 *
 * Presentation only. The achievement is derived from history and already
 * counted as seen by the time this mounts; if it never renders, nothing is lost.
 *
 * Sequence (ms from mount; shorter and without motion under Reduce Motion):
 *   0    veil in, success haptic
 *   180  plate springs in, pet springs up beside it playing its cheer band
 *   420  confetti bursts; the title slams in
 *   2600 auto-dismiss (unless tapped first)
 */
interface Props {
  id: AchievementId;
  pet: PetState;
  profile: Pick<BodyProfile, 'trainingDaysPerWeek'>;
  night?: boolean;
  onComplete: () => void;
}

const AUTO_DISMISS_MS = 2600;

const TROPHY_ART: Partial<Record<AchievementId, ReturnType<typeof require>>> = {
  dumbbell: require('../../assets/trophies/dumbbell.png'),
  shoe: require('../../assets/trophies/shoe.png'),
  drumstick: require('../../assets/trophies/drumstick.png'),
  book: require('../../assets/trophies/book.png'),
};

function useReducedMotion(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => alive && setReduced(value))
      .catch(() => alive && setReduced(false));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

export function AchievementUnlock({ id, pet, profile, night, onComplete }: Props) {
  const achievement = ACHIEVEMENT_BY_ID[id];
  const reduceMotion = useReducedMotion();
  const [confetti, setConfetti] = useState(false);

  const veil = useRef(new Animated.Value(0)).current;
  const plateIn = useRef(new Animated.Value(0)).current;
  const petIn = useRef(new Animated.Value(0)).current;
  const titleIn = useRef(new Animated.Value(0)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const started = useRef(false);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    timers.current.forEach(clearTimeout);
    Animated.timing(veil, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => onComplete());
  };

  useEffect(() => {
    if (reduceMotion === null || started.current) return;
    started.current = true;
    const rm = reduceMotion;
    const at = (ms: number, fn: () => void) => {
      timers.current.push(setTimeout(fn, rm ? Math.round(ms * 0.5) : ms));
    };
    const spring = (value: Animated.Value, tension = 90) =>
      rm
        ? Animated.timing(value, { toValue: 1, duration: 200, useNativeDriver: true })
        : Animated.spring(value, { toValue: 1, friction: 6, tension, useNativeDriver: true });

    playCelebrationSound();
    Animated.timing(veil, { toValue: 1, duration: rm ? 160 : 260, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    at(180, () => {
      spring(plateIn).start();
      spring(petIn, 60).start();
    });
    at(420, () => {
      if (!rm) setConfetti(true);
      spring(titleIn, 120).start();
    });
    at(AUTO_DISMISS_MS, finish);
    return () => timers.current.forEach(clearTimeout);
    // The timeline runs once per mount; `finish` and the values are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const art = TROPHY_ART[id as TrophyId];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Achievement unlocked: ${achievement.title}. Tap to continue`}
      onPress={finish}
      style={StyleSheet.absoluteFill}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.veil, { opacity: veil }]} />
      <PixelConfetti fire={confetti} />

      <View style={styles.centre} pointerEvents="none">
        <Animated.View
          style={{
            opacity: petIn,
            transform: [
              { translateY: petIn.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
              { scale: petIn.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
            ],
          }}
        >
          <PetAvatar
            {...IDLE_ACTIVITY}
            pet={pet}
            isCelebrating
            hideStatusCaption
            size={150}
            stageStyle={{ height: 180, backgroundColor: 'transparent' }}
          >
            {null}
          </PetAvatar>
        </Animated.View>

        <Animated.View
          style={[
            retro.panel,
            night && retro.panelNight,
            styles.plate,
            {
              opacity: plateIn,
              transform: [{ scale: plateIn.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
            },
          ]}
        >
          <Text style={[retro.label, night && retro.labelNight, styles.kicker]}>
            {achievement.kind === 'trophy' ? 'TROPHY EARNED' : 'ACHIEVEMENT UNLOCKED'}
          </Text>
          {art ? <Image source={art} resizeMode="contain" style={styles.art} /> : <Text style={[styles.star, night && styles.starNight]}>★</Text>}
          <Animated.Text
            style={[
              styles.title,
              night && styles.titleNight,
              {
                opacity: titleIn,
                transform: [{ scale: titleIn.interpolate({ inputRange: [0, 1], outputRange: [1.4, 1] }) }],
              },
            ]}
          >
            {achievement.title}
          </Animated.Text>
          <Text style={[retro.subtle, night && retro.subtleNight, styles.describe]}>
            {achievement.describe(profile)}
          </Text>
          <Text style={[retro.subtle, night && retro.subtleNight, styles.hint]}>tap to continue</Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  veil: { backgroundColor: 'rgba(20,18,38,0.55)' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 6 },
  plate: { paddingHorizontal: 22, paddingVertical: 16, alignItems: 'center', maxWidth: 360, width: '100%' },
  kicker: { fontSize: 10, letterSpacing: 2 },
  art: { width: 84, height: 60, marginTop: 10 },
  star: { fontSize: 44, lineHeight: 50, color: colors.coral, marginTop: 6 },
  starNight: { color: '#ffd36b' },
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    letterSpacing: -0.5,
    color: colors.ink,
    marginTop: 6,
    textAlign: 'center',
  },
  titleNight: { color: '#f7f5ff' },
  describe: { marginTop: 6, textAlign: 'center' },
  hint: { marginTop: 12, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },
});
