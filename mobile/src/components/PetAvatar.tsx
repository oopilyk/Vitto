import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import {
  type MealAnalysis,
  type PetAilment,
  type PetCondition,
  type PetState,
  assessCondition,
  assessDecline,
  getEvolutionStage,
} from '@vitto/core';
import { FRAME_MS, HOLDS_LAST_FRAME, type PetAnimation, SPRITE_ART_TOP, sheetForPet } from './petSprites';
import { SpriteFrame } from './SpriteFrame';
import {
  Confetti,
  DizzyOrbit,
  Fading,
  HeartStream,
  HungerPangs,
  PetAura,
  RainCloud,
  Zzz,
} from './PetEffects';
import { colors, fonts } from '../theme';

export type PetActivity = 'idle' | 'analyzing' | 'eating' | 'workout' | 'exploring' | 'celebrating';

interface PetAvatarProps {
  pet: PetState;
  isAnalyzingMeal: boolean;
  isEating: boolean;
  feedingImage: string | null;
  feedingGrade: MealAnalysis['grade'] | null;
  isCelebrating: boolean;
  isWorkingOut: boolean;
  isExploring: boolean;
  children?: React.ReactNode;
}

const STATUS_TEXT: Record<PetActivity, (name: string) => string> = {
  celebrating: (name) => `${name} feels great!`,
  eating: (name) => `${name} is enjoying dinner`,
  analyzing: (name) => `${name} is curious about that plate`,
  workout: (name) => `${name} is training hard`,
  exploring: (name) => `${name} is exploring`,
  idle: (name) => `${name} is here`,
};

const STAGE_SIZE = { baby: 148, teen: 184, adult: 216 } as const;

/** Matches the window App keeps `feedingImage` set for. */
const FOOD_FLIGHT_MS = 880;

const AURA_BY_MOOD: Record<PetState['mood'], string> = {
  bright: '#c8e6cc',
  content: '#b8d3bb',
  sleepy: '#cfc4bb',
  hungry: '#e3c9a6',
};

/**
 * An ailment repaints the aura, because the mood palette has no colour that reads
 * as "something is wrong". `exhausted` reuses the sleepy tone deliberately: it is
 * the same dulled-out read, just further along.
 */
const AURA_BY_AILMENT: Record<PetAilment, string> = {
  dying: colors.slate,
  starving: colors.yellow,
  exhausted: AURA_BY_MOOD.sleepy,
  sad: colors.periwinkle,
  foggy: colors.lilac,
};

/** The body pose each ailment puts the pet in. `starving` has no art of its own. */
const ANIMATION_BY_AILMENT: Record<PetAilment, PetAnimation> = {
  dying: 'faint',
  starving: 'sad',
  exhausted: 'rest',
  sad: 'sad',
  foggy: 'unwell',
};

/**
 * Energy at or below this reads as a pet that has chosen to nap. It sits ABOVE
 * the `exhausted` ailment line (energy <= 20): below that the pet has collapsed
 * from exhaustion and `condition.primary` takes over, so this band is only the
 * gentle "winding down" stretch in between.
 */
export const NAP_ENERGY = 34;

/**
 * A true sleep read, distinct from `exhausted`: the pet is idle, nothing is
 * actually wrong, and energy has drifted low. Drives a peaceful rest pose, the
 * Zzz overlay and a slowed bob.
 *
 * ART GAP: neither sprite sheet has a real sleeping pose, so this still borrows
 * `rest` (the calmest single frame each sheet owns). A dedicated curled-up /
 * eyes-closed frame per sheet would let this stop sharing a pose with
 * `exhausted`.
 */
export const isSleeping = (
  energy: number,
  condition: PetCondition,
  activity: PetActivity,
): boolean => activity === 'idle' && condition.primary === null && energy <= NAP_ENERGY;

/** Linear blend between two `#rrggbb` strings; `t` clamped to 0..1. */
export const mixHex = (from: string, to: string, t: number): string => {
  const amount = Math.max(0, Math.min(1, t));
  const parse = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const [fr, fg, fb] = parse(from);
  const [tr, tg, tb] = parse(to);
  const channel = (a: number, b: number) =>
    Math.round(a + (b - a) * amount)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(fr, tr)}${channel(fg, tg)}${channel(fb, tb)}`;
};

/**
 * Which band of the sheet plays, given what the pet is doing right now.
 *
 * Activity outranks condition on purpose: feeding a starving dog has to show it
 * eating, not still starving, or the care moment reads as having done nothing.
 * Condition then outranks mood, since `mood` only knows about three needs and
 * cannot express "dying".
 */
export const animationFor = (
  activity: PetActivity,
  mood: PetState['mood'],
  condition: PetCondition,
): PetAnimation => {
  if (activity === 'celebrating' || activity === 'eating') return 'cheer';
  if (activity === 'workout' || activity === 'exploring') return 'move';
  if (condition.primary) return ANIMATION_BY_AILMENT[condition.primary];
  if (activity === 'analyzing') return 'idle';
  return mood === 'sleepy' ? 'rest' : 'idle';
};

export function PetAvatar({
  pet,
  isAnalyzingMeal,
  isEating,
  feedingImage,
  feedingGrade,
  isCelebrating,
  isWorkingOut,
  isExploring,
  children,
}: PetAvatarProps) {
  const activity: PetActivity = isCelebrating
    ? 'celebrating'
    : isEating
      ? 'eating'
      : isAnalyzingMeal
        ? 'analyzing'
        : isWorkingOut
          ? 'workout'
          : isExploring
            ? 'exploring'
            : 'idle';

  const sheet = sheetForPet(pet);
  // Cheap and pure, so it is derived here rather than threaded down as a prop.
  const condition = assessCondition(pet);
  const decline = assessDecline(pet);
  const sleeping = isSleeping(pet.energy, condition, activity);
  const animation = sleeping ? 'rest' : animationFor(activity, pet.mood, condition);
  const frames = sheet.animations[animation];
  const size = STAGE_SIZE[getEvolutionStage(pet.level)];

  // Step through the band's cells; each animation restarts from its first frame.
  const [frameIndex, setFrameIndex] = useState(0);
  useEffect(() => {
    setFrameIndex(0);
    if (frames.length < 2) return;
    // A collapse plays once and stays down. Looping it would stand the pet back
    // up every couple of seconds, which reads as recovery that never happened.
    const holds = HOLDS_LAST_FRAME.has(animation);
    const timer = setInterval(
      () =>
        setFrameIndex((current) =>
          holds ? Math.min(current + 1, frames.length - 1) : (current + 1) % frames.length,
        ),
      sheet.frameMs?.[animation] ?? FRAME_MS[animation],
    );
    return () => clearInterval(timer);
  }, [animation, frames.length, sheet]);

  // A gentle bob on top of the frame animation, so idle never sits perfectly still.
  // A sleeping or sleepy pet breathes slower; a fainted one not at all.
  const slowBob = sleeping || pet.mood === 'sleepy' || animation === 'rest';
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // A fainted pet does not breathe up and down. Nothing else about the stage
    // moves at that point, and that stillness is the whole read.
    if (animation === 'faint') {
      bob.setValue(0);
      return;
    }
    const halfCycleMs = slowBob ? 2600 : 1500;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: halfCycleMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: halfCycleMs,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animation, bob, slowBob]);

  const bobTransform: ViewStyle['transform'] = [
    {
      translateY: bob.interpolate({
        inputRange: [0, 1],
        outputRange: [0, animation === 'rest' ? -2 : -5],
      }) as unknown as number,
    },
  ];

  // The plate flies in from the lower left, arcs up, and shrinks into the pet's
  // mouth — the same path the web build ran as a CSS keyframe.
  const flight = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!feedingImage) return;
    flight.setValue(0);
    Animated.timing(flight, {
      toValue: 1,
      duration: FOOD_FLIGHT_MS,
      easing: Easing.bezier(0.2, 0.8, 0.3, 1),
      useNativeDriver: true,
    }).start();
  }, [feedingImage, flight]);

  const foodStyle = {
    transform: [
      {
        translateX: flight.interpolate({
          inputRange: [0, 1],
          outputRange: [-size * 0.85, 0],
        }) as unknown as number,
      },
      {
        translateY: flight.interpolate({
          inputRange: [0, 0.6, 1],
          outputRange: [size * 0.45, -size * 0.3, -size * 0.12],
        }) as unknown as number,
      },
      {
        rotate: flight.interpolate({
          inputRange: [0, 1],
          outputRange: ['-12deg', '300deg'],
        }) as unknown as string,
      },
      {
        scale: flight.interpolate({
          inputRange: [0, 0.65, 1],
          outputRange: [1, 0.7, 0.12],
        }) as unknown as number,
      },
    ],
    opacity: flight.interpolate({
      inputRange: [0, 0.8, 1],
      outputRange: [1, 1, 0],
    }) as unknown as number,
  };

  const currentFrame = frames[Math.min(frameIndex, frames.length - 1)];
  const showHearts = isCelebrating && (feedingGrade === 'A' || feedingGrade === 'B');
  // Distance from the stage centre up to the top of the pet's head. Effects take
  // it as their anchor and add their own clearance, so none of them has to know
  // how the sprite sits inside its cell.
  const headOffset = size * (0.5 - SPRITE_ART_TOP);
  /**
   * The same precedence `animationFor` applies to the sprite, extended to
   * everything else the condition drives. A care moment is the pet doing
   * something, so while one plays the ailment dressing stands down: a rain cloud
   * parked over a pet mid-meal, or a grey dying wash over a cheering one, reads
   * as the care moment having accomplished nothing. `analyzing` is not in the
   * list on purpose — it leaves the sprite on the ailment band too, since
   * nothing has actually been given to the pet yet.
   */
  const activityOutranksCondition =
    activity === 'celebrating' ||
    activity === 'eating' ||
    activity === 'workout' ||
    activity === 'exploring';
  const overlays = new Set(activityOutranksCondition ? [] : condition.overlays);
  // Drop the overlays this sheet's art already draws, so a pet whose sprite has
  // its own spiral eyes does not also get the stand-in particles on top.
  for (const ailment of sheet.selfDrawn ?? []) overlays.delete(ailment);

  // The aura is the pool of light the pet stands in, so draining colour out of it
  // as health falls is the quietest way to show a gradual decline. An ailment
  // aura already reads as "something is wrong", so only dull the mood palette.
  // While a care moment plays the pet is doing something good, so the aura drops
  // back to the plain mood palette — no ailment tint, no decline wash.
  const baseAura = activityOutranksCondition
    ? AURA_BY_MOOD[pet.mood]
    : condition.primary
      ? AURA_BY_AILMENT[condition.primary]
      : mixHex(AURA_BY_MOOD[pet.mood], colors.slate, decline.intensity * 0.7);

  return (
    <View style={styles.stage}>
      {children}
      <PetAura color={baseAura} size={size} />
      {feedingImage ? (
        <Animated.Image source={{ uri: feedingImage }} style={[styles.food, foodStyle]} />
      ) : null}

      {/* A window one cell wide, with the whole sheet slid behind it. */}
      <Animated.View
        accessibilityRole="image"
        accessibilityLabel={`${pet.name}, ${STATUS_TEXT[activity](pet.name)}`}
        style={[styles.window, { transform: bobTransform }]}
      >
        <SpriteFrame sheet={sheet} frame={currentFrame} size={size} />
        {/* Inside the window on purpose: the wash is a tinted copy of the frame
            stacked on it, so it must share the sprite's exact position. It ramps
            in from the first sign of decline rather than snapping on at `dying`,
            so a pet losing health looks like it is losing health the whole way —
            but a care moment stands it down, same as every other ailment cue. */}
        {decline.intensity > 0 && !activityOutranksCondition ? (
          <Fading
            active
            severity={decline.intensity}
            sheet={sheet}
            frame={currentFrame}
            size={size}
          />
        ) : null}
      </Animated.View>

      {activity === 'analyzing' ? (
        <View style={styles.thought}>
          <Text style={styles.thoughtMark}>✣</Text>
        </View>
      ) : null}
      {activity === 'workout' || activity === 'exploring' ? (
        <View style={styles.particles} pointerEvents="none">
          <Text style={[styles.particle, { color: activity === 'workout' ? colors.coral : colors.mintDeep }]}>
            {activity === 'workout' ? '↗' : '⌁'}
          </Text>
          <Text style={[styles.particle, { color: activity === 'workout' ? colors.coral : colors.mintDeep }]}>
            {activity === 'workout' ? '↗' : '⌁'}
          </Text>
        </View>
      ) : null}
      {/* At most two of these; `assessCondition` clears them all while dying. */}
      <HungerPangs active={overlays.has('starving')} headOffset={headOffset} />
      <Zzz active={overlays.has('exhausted') || sleeping} headOffset={headOffset} />
      <RainCloud active={overlays.has('sad')} headOffset={headOffset} />
      <DizzyOrbit active={overlays.has('foggy')} headOffset={headOffset} />

      <Confetti active={isCelebrating} headOffset={headOffset} />
      <HeartStream active={showHearts} headOffset={headOffset} />

      <Text style={styles.status}>
        {STATUS_TEXT[activity](pet.name)} <Text style={{ color: colors.coral }}>♥</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    height: 320,
    backgroundColor: colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  window: { overflow: 'hidden', zIndex: 1 },
  // Centred on the pet; the flight transform carries it in from off to the side.
  food: { position: 'absolute', width: 76, height: 76, borderRadius: 38, zIndex: 3 },
  thought: {
    position: 'absolute',
    top: 26,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.cardSoft,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  thoughtMark: { color: colors.yellowDeep, fontSize: 16 },
  particles: {
    position: 'absolute',
    top: '26%',
    width: '74%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  particle: { fontSize: 20, fontWeight: '700' },
  status: {
    position: 'absolute',
    bottom: 20,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: '#55705d',
  },
});
