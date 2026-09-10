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
import { colors, fonts } from '../theme';
import { PixelConfetti } from './PixelConfetti';

/**
 * The full-screen level-up reward. Mounted by `DashboardScreen` when `App.tsx`
 * raises a `levelUp` celebration (see `detectLevelUp`) and unmounted when the
 * user taps Continue.
 *
 * It owns only *presentation* — the pet has already levelled and been saved. If
 * this never mounts, or is killed mid-animation, the level is still correct.
 *
 * Sequence (times are ms from mount; shortened and de-motioned under Reduce
 * Motion):
 *   enter     veil fades the environment back
 *   gather    the pet springs up to fill the centre
 *   celebrate pet plays its `cheer` band; pixel confetti bursts; a brief flash
 *   announce  "LEVEL UP!", the big number slams in, "<name> is growing!"
 *   ready     Continue springs in and becomes pressable
 *   exit      everything fades; `onComplete()` returns the user where they were
 */
interface Props {
  pet: PetState;
  /** The level just reached — a number, so a decayed projection of the pet
   *  can't change what's announced. */
  level: number;
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

export function LevelUpCelebration({ pet, level, night, onComplete }: Props) {
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();

  const [phase, setPhase] = useState<Phase>('enter');
  const [celebrating, setCelebrating] = useState(false);
  const [shownLevel, setShownLevel] = useState(level);

  const veil = useRef(new Animated.Value(0)).current;
  const petIn = useRef(new Animated.Value(0)).current;
  const numberIn = useRef(new Animated.Value(0)).current;
  const textIn = useRef(new Animated.Value(0)).current;
  const continueIn = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const startedRef = useRef(false);
  const rmRef = useRef(false);
  const continueRef = useRef<View>(null);

  // Run the timeline exactly once, and only after the Reduce Motion setting is
  // known so the first beat is never the wrong variant.
  useEffect(() => {
    if (reduceMotion === null || startedRef.current) return;
    startedRef.current = true;
    const rm = reduceMotion;
    rmRef.current = rm;
    if (!rm) setShownLevel(Math.max(1, level - 1));

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
      if (!rm) {
        Animated.sequence([
          Animated.timing(flash, { toValue: 1, duration: 80, useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0, duration: 280, useNativeDriver: true }),
        ]).start();
      }
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
      AccessibilityInfo.announceForAccessibility(`Level ${level}. ${pet.name} is growing.`);
    });

    at(2500, () => {
      setPhase('ready');
      Animated.spring(continueIn, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }).start();
    });

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [reduceMotion, level, pet.name, veil, petIn, numberIn, textIn, continueIn, flash]);

  // From the announcement on, show the real level — which may still be climbing
  // if a Health backfill is looping care moments through `recordEvent`. Before
  // then it holds at `level - 1` (set once the timeline starts) for the count-up.
  useEffect(() => {
    if (phase === 'announce' || phase === 'ready' || phase === 'exit') setShownLevel(level);
  }, [level, phase]);

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

  // Web keyboard: focus Continue when it appears (Enter/Space fire onPress
  // natively); Escape also continues once it's allowed.
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    if (canContinue) {
      const node = continueRef.current as unknown as { focus?: () => void } | null;
      node?.focus?.();
    }
    const onKey = (event: { key: string }) => {
      if (event.key === 'Escape' && canContinue) handleContinue();
    };
    const web = globalThis as unknown as {
      addEventListener?: (t: string, cb: (e: never) => void) => void;
      removeEventListener?: (t: string, cb: (e: never) => void) => void;
    };
    web.addEventListener?.('keydown', onKey as (e: never) => void);
    return () => web.removeEventListener?.('keydown', onKey as (e: never) => void);
  }, [canContinue, handleContinue]);

  const petSize = Math.round(Math.min(width * 0.74, height * 0.4, 300));
  const numberSize = Math.round(Math.min(width * 0.44, 176));

  const petTransform = rmRef.current
    ? []
    : [
        { scale: petIn.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) },
        { translateY: petIn.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
      ];

  return (
    <Animated.View
      style={[styles.root, { opacity: veil }]}
      accessibilityViewIsModal
      accessibilityLabel={`${pet.name} reached level ${level}`}
    >
      <View style={styles.backdrop} pointerEvents="none">
        <Starfield count={26} />
      </View>

      <PixelConfetti fire={celebrating && !rmRef.current} />

      <View style={styles.stack} pointerEvents="box-none">
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

        <Animated.Text
          style={[
            styles.kicker,
            {
              opacity: textIn,
              transform: [{ translateY: textIn.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            },
          ]}
        >
          LEVEL UP!
        </Animated.Text>

        <View style={styles.numberRow}>
          <Text style={styles.numberTag}>LVL</Text>
          <Animated.Text
            style={[
              styles.number,
              {
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
            {shownLevel}
          </Animated.Text>
        </View>

        <Animated.Text
          style={[
            styles.subtitle,
            {
              opacity: textIn,
              transform: [{ translateY: textIn.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            },
          ]}
        >
          {pet.name} is growing!
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

      <Animated.View
        style={[
          styles.flash,
          { opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }) },
        ]}
        pointerEvents="none"
      />
    </Animated.View>
  );
}

/** A sparse, fixed grid of 1–3px "stars" — cheap retro texture on the backdrop. */
function Starfield({ count }: { count: number }) {
  const stars = useRef(
    Array.from({ length: count }, (_, i) => ({
      key: i,
      top: `${(i * 61) % 100}%` as `${number}%`,
      left: `${(i * 37 + 11) % 100}%` as `${number}%`,
      size: i % 5 === 0 ? 3 : i % 2 === 0 ? 2 : 1,
      dim: i % 3 === 0,
    })),
  ).current;
  return (
    <>
      {stars.map((s) => (
        <View
          key={s.key}
          style={{
            position: 'absolute',
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            backgroundColor: s.dim ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.4)',
          }}
        />
      ))}
    </>
  );
}

const BACKDROP = '#171334';
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  root: {
    ...FILL,
    zIndex: 20,
    elevation: 20,
    backgroundColor: BACKDROP,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backdrop: { ...FILL, backgroundColor: BACKDROP },
  stack: { alignItems: 'center', width: '100%' },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 4,
    color: colors.yellow,
    marginTop: 6,
  },
  numberRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 2 },
  numberTag: {
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#c9c3ef',
    marginTop: 14,
    marginRight: 8,
  },
  number: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    color: '#f7f2e4',
    textShadowColor: colors.coral,
    textShadowOffset: { width: 4, height: 4 },
    textShadowRadius: 0,
  },
  subtitle: {
    fontFamily: fonts.mono,
    fontSize: 14,
    letterSpacing: 0.5,
    color: '#e9e5ff',
    marginTop: 8,
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
    color: colors.ink,
  },
  continueMark: { fontFamily: fonts.mono, fontSize: 16, fontWeight: '700', color: colors.ink },
  flash: { ...FILL, backgroundColor: '#fdf6e3' },
});
