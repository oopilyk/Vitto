import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { PetState } from '@vitto/core';
import { PetAvatar } from '../components/PetAvatar';
import { IDLE_ACTIVITY } from '../petWorld/toPetAvatarActivityProps';
import { retro } from '../petWorld/retroStyle';
import { fonts, world } from '../theme';
import { PixelConfetti } from './PixelConfetti';

/**
 * The full-screen streak reward. Mounted by `DashboardScreen` when `App.tsx`
 * raises a `streak` celebration (see `detectNewStreakDay`) and unmounted when
 * the user taps Continue.
 *
 * Same phase timeline and reduced-motion handling as `LevelUpCelebration` —
 * this owns only *presentation*, the streak has already incremented and been
 * derived from the real activity log by the time this mounts. Styled with
 * Vitto's own `world`/`retro` day-night language rather than that
 * celebration's fixed purple backdrop: this is meant to be the Duolingo-style
 * "pet, huge number, DAY STREAK!" moment, but unmistakably Vitto's own room,
 * not a copy of anyone else's.
 *
 * Sequence (times are ms from mount; shortened and de-motioned under Reduce
 * Motion):
 *   enter     veil fades in over the scene
 *   gather    the pet springs up to fill the centre
 *   celebrate pet plays its `cheer` band; pixel confetti bursts
 *   announce  the flame+number slam in, "DAY STREAK!", "<name> is proud!"
 *   ready     Continue springs in and becomes pressable
 *   exit      everything fades; `onComplete()` returns the user where they were
 */
interface Props {
  pet: PetState;
  /** The streak count as of the day just created — see `createsNewStreakDay`. */
  streak: number;
  night?: boolean;
  onComplete: () => void;
}

type Phase = 'enter' | 'celebrate' | 'announce' | 'ready' | 'exit';

/** `null` while the OS setting is still being read. */
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

export function StreakCelebration({ pet, streak, night, onComplete }: Props) {
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const c = night ? nightColors : dayColors;

  const [phase, setPhase] = useState<Phase>('enter');
  const [celebrating, setCelebrating] = useState(false);
  // Counts up from one less than the real streak, exactly like LevelUpCelebration's
  // level count-up — the "0 → 1" first-ever streak still gets a from-zero beat.
  const [shownStreak, setShownStreak] = useState(streak);

  const veil = useRef(new Animated.Value(0)).current;
  const petIn = useRef(new Animated.Value(0)).current;
  const numberIn = useRef(new Animated.Value(0)).current;
  const textIn = useRef(new Animated.Value(0)).current;
  const continueIn = useRef(new Animated.Value(0)).current;

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const startedRef = useRef(false);
  const rmRef = useRef(false);
  const continueRef = useRef<View>(null);

  useEffect(() => {
    if (reduceMotion === null || startedRef.current) return;
    startedRef.current = true;
    const rm = reduceMotion;
    rmRef.current = rm;
    if (!rm) setShownStreak(Math.max(1, streak - 1));

    const at = (ms: number, fn: () => void) => {
      timers.current.push(setTimeout(fn, rm ? Math.round(ms * 0.45) : ms));
    };

    Animated.timing(veil, {
      toValue: 1,
      duration: rm ? 180 : 320,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    at(240, () => {
      if (rm) {
        Animated.timing(petIn, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      } else {
        Animated.spring(petIn, { toValue: 1, friction: 6, tension: 55, useNativeDriver: true }).start();
      }
    });

    at(540, () => {
      setCelebrating(true);
      setPhase('celebrate');
    });

    at(950, () => {
      setPhase('announce');
      if (rm) {
        Animated.timing(numberIn, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      } else {
        Animated.spring(numberIn, { toValue: 1, friction: 5, tension: 95, useNativeDriver: true }).start();
      }
      Animated.timing(textIn, {
        toValue: 1,
        duration: rm ? 200 : 420,
        delay: rm ? 40 : 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
      AccessibilityInfo.announceForAccessibility(`${streak} day streak. ${pet.name} is proud.`);
    });

    at(2300, () => {
      setPhase('ready');
      Animated.spring(continueIn, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }).start();
    });

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [reduceMotion, streak, pet.name, veil, petIn, numberIn, textIn, continueIn]);

  useEffect(() => {
    if (phase === 'announce' || phase === 'ready' || phase === 'exit') setShownStreak(streak);
  }, [streak, phase]);

  const canContinue = phase === 'ready';

  const handleContinue = useCallback(() => {
    if (!canContinue) return;
    setPhase('exit');
    Animated.timing(veil, {
      toValue: 0,
      duration: rmRef.current ? 150 : 320,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => onComplete());
  }, [canContinue, veil, onComplete]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    if (canContinue) {
      const node = continueRef.current as unknown as { focus?: () => void } | null;
      node?.focus?.();
    }
    const onKey = (event: { key: string }) => {
      if (event.key === 'Escape' && canContinue) handleContinue();
    };
    const webGlobal = globalThis as unknown as {
      addEventListener?: (t: string, cb: (e: never) => void) => void;
      removeEventListener?: (t: string, cb: (e: never) => void) => void;
    };
    webGlobal.addEventListener?.('keydown', onKey as (e: never) => void);
    return () => webGlobal.removeEventListener?.('keydown', onKey as (e: never) => void);
  }, [canContinue, handleContinue]);

  const petSize = Math.round(Math.min(width * 0.62, height * 0.32, 240));
  const numberSize = Math.round(Math.min(width * 0.5, 196));

  const petTransform = rmRef.current
    ? []
    : [
        { scale: petIn.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) },
        { translateY: petIn.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
      ];

  return (
    <Animated.View
      style={[styles.root, { backgroundColor: c.bg, opacity: veil }]}
      accessibilityViewIsModal
      accessibilityLabel={`${streak} day streak. ${pet.name} is proud.`}
    >
      <View style={styles.backdrop} pointerEvents="none">
        <PixelField color={c.speckle} />
      </View>

      <PixelConfetti fire={celebrating && !rmRef.current} />

      <View style={styles.stack} pointerEvents="box-none">
        <Text style={[styles.nameKicker, { color: c.soft }]}>{pet.name.toUpperCase()}</Text>

        <Animated.View style={{ opacity: petIn, transform: petTransform }}>
          <PetAvatar
            {...IDLE_ACTIVITY}
            pet={pet}
            isCelebrating={celebrating}
            size={petSize}
            hideStatusCaption
            stageStyle={{ height: Math.round(petSize * 1.2), backgroundColor: 'transparent' }}
          >
            {null}
          </PetAvatar>
        </Animated.View>

        <View style={styles.numberRow}>
          <Animated.Text
            style={[
              styles.flame,
              {
                opacity: numberIn,
                transform: [{ scale: numberIn.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.3, 1.15, 1] }) }],
              },
            ]}
          >
            🔥
          </Animated.Text>
          <Animated.Text
            style={[
              styles.number,
              {
                color: c.ink,
                textShadowColor: c.accent,
                fontSize: numberSize,
                lineHeight: Math.round(numberSize * 1.04),
                opacity: numberIn,
                transform: [
                  { scale: numberIn.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.3, 1.12, 1] }) },
                ],
              },
            ]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {shownStreak}
          </Animated.Text>
        </View>

        <Animated.Text
          style={[
            styles.kicker,
            {
              color: c.accentDeep,
              opacity: textIn,
              transform: [{ translateY: textIn.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            },
          ]}
        >
          DAY STREAK!
        </Animated.Text>

        <Animated.Text
          style={[
            styles.subtitle,
            {
              color: c.soft,
              opacity: textIn,
              transform: [{ translateY: textIn.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            },
          ]}
        >
          {pet.name} is proud!
        </Animated.Text>
      </View>

      <Animated.View
        style={[
          styles.continueWrap,
          {
            opacity: continueIn,
            transform: [{ translateY: continueIn.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
          },
        ]}
        pointerEvents={canContinue ? 'auto' : 'none'}
      >
        <Pressable
          ref={continueRef}
          onPress={handleContinue}
          disabled={!canContinue}
          accessibilityRole="button"
          accessibilityLabel="Continue"
          accessibilityHint={`Return to ${pet.name}`}
          accessibilityState={{ disabled: !canContinue }}
          style={({ pressed }) => [
            retro.panel,
            night && retro.panelNight,
            styles.continueBtn,
            pressed && styles.continuePressed,
          ]}
        >
          <Text style={[styles.continueLabel, night && retro.labelNight]}>CONTINUE</Text>
          <Text style={[styles.continueMark, night && retro.labelNight]}>›</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * A sparse, fixed grid of 1–3px pixel flecks — the same cheap retro texture
 * `LevelUpCelebration`'s Starfield uses, tinted to Vitto's own day/night
 * accent instead of white stars so the backdrop reads as this game's room,
 * not a generic dark-mode screen.
 */
function PixelField({ color }: { color: string }) {
  const specks = useRef(
    Array.from({ length: 22 }, (_, i) => ({
      key: i,
      top: `${(i * 61) % 100}%` as `${number}%`,
      left: `${(i * 37 + 11) % 100}%` as `${number}%`,
      size: i % 5 === 0 ? 3 : i % 2 === 0 ? 2 : 1,
    })),
  ).current;
  return (
    <>
      {specks.map((s) => (
        <View
          key={s.key}
          style={{
            position: 'absolute',
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            backgroundColor: color,
          }}
        />
      ))}
    </>
  );
}

const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

/** Warm cream day / warm charcoal-brown night — never the purple/navy of the older celebration. */
const dayColors = {
  bg: '#f4ecdb',
  ink: world.ink,
  soft: world.inkSoft,
  accent: world.accent,
  accentDeep: world.accentDeep,
  speckle: 'rgba(67,55,44,0.10)',
};
const nightColors = {
  bg: world.nightSurface,
  ink: world.nightText,
  soft: world.nightTextSoft,
  accent: world.nightAccent,
  accentDeep: world.nightAccent,
  speckle: 'rgba(239,229,208,0.10)',
};

const styles = StyleSheet.create({
  root: {
    ...FILL,
    zIndex: 20,
    elevation: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backdrop: { ...FILL },
  stack: { alignItems: 'center', width: '100%' },
  nameKicker: {
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 4,
  },
  numberRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 4 },
  flame: { fontSize: 40, marginTop: 6 },
  number: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    textShadowOffset: { width: 4, height: 4 },
    textShadowRadius: 0,
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: 2,
  },
  subtitle: {
    fontFamily: fonts.mono,
    fontSize: 14,
    letterSpacing: 0.5,
    marginTop: 10,
    textAlign: 'center',
  },
  continueWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 44,
    alignItems: 'center',
  },
  continueBtn: {
    minWidth: 220,
    paddingVertical: 15,
    paddingHorizontal: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  continuePressed: { opacity: 0.8, transform: [{ translateX: 1 }, { translateY: 1 }] },
  continueLabel: {
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    color: world.ink,
  },
  continueMark: { fontFamily: fonts.mono, fontSize: 16, fontWeight: '700', color: world.ink },
});
