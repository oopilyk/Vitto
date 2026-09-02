import { useEffect, useId, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import { SpriteFrame } from './SpriteFrame';
import type { PetSheet } from './petSprites';
import { colors } from '../theme';

/**
 * How far above the head each effect parks, in points.
 *
 * Each value covers whatever that effect draws BELOW its own anchor, so nothing
 * reaches back down into the sprite: the orbit dips by its squashed y-radius, a
 * glyph by half its line box, and the cloud by half its 56pt frame plus the
 * length of the rain. Fixed rather than scaled by pet size, because the art
 * being cleared — glyphs, drops, the cloud — is itself a fixed size.
 */
const GLYPH_CLEARANCE = 16;
const ORBIT_CLEARANCE = 24;
const CLOUD_CLEARANCE = 36;
const CONFETTI_CLEARANCE = 10;

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

interface EffectProps {
  active: boolean;
  /**
   * Distance from the stage centre up to the top of the pet's head. Each effect
   * adds its own clearance on top, sized to how far its own art hangs below the
   * anchor — a rain cloud needs far more room than a drifting glyph.
   */
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
    <View style={[styles.layer, { marginTop: -(headOffset + CONFETTI_CLEARANCE) }]} pointerEvents="none">
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

export interface GlyphStreamProps {
  active: boolean;
  /**
   * Distance from the stage centre up to the top of the pet's head. Each effect
   * adds its own clearance on top, sized to how far its own art hangs below the
   * anchor — a rain cloud needs far more room than a drifting glyph.
   */
  headOffset: number;
  /** One entry per drifting glyph; the array's length fixes how many there are. */
  glyphs: readonly string[];
  color: string;
  /** How far the glyph travels before it fades out. */
  riseDistance?: number;
  durationMs?: number;
  /** `down` sends the glyphs toward the pet's feet instead of up past its head. */
  direction?: 'up' | 'down';
}

/**
 * A staggered loop of glyphs drifting away from the pet's head, each on its own
 * offset so they trail one after another rather than moving as a block. The
 * hearts, the sleep z's and the hunger rumbles are all this component with
 * different glyphs and pacing.
 */
export function GlyphStream({
  active,
  headOffset,
  glyphs,
  color,
  riseDistance = 74,
  durationMs = 1400,
  direction = 'up',
}: GlyphStreamProps) {
  // Keyed on the count, not the array identity: callers pass module-level arrays,
  // and only a change in how many glyphs there are needs new animated values.
  const progress = useMemo(
    () => glyphs.map(() => new Animated.Value(0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [glyphs.length],
  );

  useEffect(() => {
    if (!active) return;
    const loops = progress.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 320),
          Animated.timing(value, {
            toValue: 1,
            duration: durationMs,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [active, progress, durationMs]);

  if (!active) return null;

  const travel = direction === 'up' ? -riseDistance : riseDistance;

  return (
    <View style={[styles.layer, { marginTop: -(headOffset + GLYPH_CLEARANCE) }]} pointerEvents="none">
      {glyphs.map((glyph, index) => (
        <Animated.Text
          key={index}
          style={[
            styles.glyph,
            {
              color,
              opacity: progress[index].interpolate({
                inputRange: [0, 0.15, 0.7, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                {
                  // A slight sideways wander so the column never looks ruled.
                  translateX: progress[index].interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, index === 1 ? 12 : -12 + index * 20, index === 1 ? -6 : 6],
                  }),
                },
                {
                  translateY: progress[index].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, travel],
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
          {glyph}
        </Animated.Text>
      ))}
    </View>
  );
}

const HEART_GLYPHS = ['♥', '♥', '♥'];

/** Hearts drifting up out of the top of the pet, one after another. */
export function HeartStream({ active, headOffset }: EffectProps) {
  return (
    <GlyphStream active={active} headOffset={headOffset} glyphs={HEART_GLYPHS} color={colors.coral} />
  );
}

const SLEEP_GLYPHS = ['z', 'z', 'z'];

/** Slow, sparse z's for a pet that has run out of energy. */
export function Zzz({ active, headOffset }: EffectProps) {
  return (
    <GlyphStream
      active={active}
      headOffset={headOffset}
      glyphs={SLEEP_GLYPHS}
      color={colors.slateDeep}
      riseDistance={58}
      durationMs={2200}
    />
  );
}

const HUNGER_GLYPHS = ['~', '~', '~'];

/** Quick little rumble waves, in the same warm tone the hungry aura uses. */
export function HungerPangs({ active, headOffset }: EffectProps) {
  return (
    <GlyphStream
      active={active}
      headOffset={headOffset}
      glyphs={HUNGER_GLYPHS}
      color={colors.yellowDeep}
      riseDistance={46}
      durationMs={1000}
    />
  );
}

// A rounded cloud silhouette in a 54x30 box, flat along the bottom so the drops
// read as falling out from under it.
const CLOUD_PATH = 'M12 26 C5 26 3 18 9 15 C7 6 20 2 26 8 C31 2 43 5 42 14 C49 16 48 26 41 26 Z';

const RAIN_DROPS = [0, 1, 2, 3].map((index) => ({
  key: index,
  left: 9 + index * 12,
  delay: index * 170,
}));

/** A small rain cloud parked over the pet's head, for a pet that is unhappy. */
export function RainCloud({ active, headOffset }: EffectProps) {
  const progress = useRef(RAIN_DROPS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!active) return;
    const loops = progress.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(RAIN_DROPS[index].delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 900,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [active, progress]);

  if (!active) return null;

  return (
    <View style={[styles.layer, { marginTop: -(headOffset + CLOUD_CLEARANCE) }]} pointerEvents="none">
      <View style={styles.cloud}>
        <Svg width={54} height={30} viewBox="0 0 54 30">
          <Path d={CLOUD_PATH} fill={colors.slateDeep} fillOpacity={0.38} />
        </Svg>
        {RAIN_DROPS.map((drop, index) => (
          <Animated.View
            key={drop.key}
            style={[
              styles.drop,
              {
                left: drop.left,
                opacity: progress[index].interpolate({
                  inputRange: [0, 0.15, 0.75, 1],
                  outputRange: [0, 0.7, 0.7, 0],
                }),
                transform: [
                  {
                    translateY: progress[index].interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 22],
                    }),
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const ORBIT_RADIUS = 26;
/** Enough samples that the piecewise-linear interpolation still reads as a circle. */
const ORBIT_STEPS = 12;
const ORBIT_INPUT = Array.from({ length: ORBIT_STEPS + 1 }, (_, index) => index / ORBIT_STEPS);

// One shared rotation drives all three glyphs; the phase offset is baked into each
// glyph's interpolation curve rather than into a separate animation.
const ORBIT_GLYPHS = ['✦', '✧', '✦'].map((glyph, index) => {
  const phase = index / 3;
  const angle = (t: number) => (t + phase) * Math.PI * 2;
  return {
    key: index,
    glyph,
    x: ORBIT_INPUT.map((t) => Math.cos(angle(t)) * ORBIT_RADIUS),
    // Squashed hard, so the ring reads as an orbit around the head seen from
    // slightly above rather than a pinwheel spinning flat in the screen plane.
    y: ORBIT_INPUT.map((t) => Math.sin(angle(t)) * ORBIT_RADIUS * 0.4),
    // Dimmer on the far side of the orbit, brighter as it swings to the front.
    fade: ORBIT_INPUT.map((t) => 0.45 + 0.55 * ((Math.sin(angle(t)) + 1) / 2)),
  };
});

/** Glyphs circling the pet's head, for a pet whose mind has bottomed out. */
export function DizzyOrbit({ active, headOffset }: EffectProps) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, spin]);

  if (!active) return null;

  return (
    <View style={[styles.layer, { marginTop: -(headOffset + ORBIT_CLEARANCE) }]} pointerEvents="none">
      {ORBIT_GLYPHS.map((orbit) => (
        <Animated.Text
          key={orbit.key}
          style={[
            styles.glyph,
            {
              color: colors.lilacDeep,
              fontSize: 14,
              opacity: spin.interpolate({ inputRange: ORBIT_INPUT, outputRange: orbit.fade }),
              transform: [
                { translateX: spin.interpolate({ inputRange: ORBIT_INPUT, outputRange: orbit.x }) },
                { translateY: spin.interpolate({ inputRange: ORBIT_INPUT, outputRange: orbit.y }) },
              ],
            },
          ]}
        >
          {orbit.glyph}
        </Animated.Text>
      ))}
    </View>
  );
}

interface FadingProps {
  active: boolean;
  /** 0 = untouched, 1 = as washed out as this effect goes. */
  severity: number;
  /** The frame being washed — must be the one on screen, or the wash misaligns. */
  sheet: PetSheet;
  frame: readonly [number, number];
  size: number;
}

/**
 * A grey wash over the pet as it declines.
 *
 * Drawn as a tinted copy of the pet's CURRENT frame stacked on the real one, so
 * the wash lands on the pet's silhouette and nothing else. The obvious version —
 * a translucent grey View over the sprite — paints the sprite's whole bounding
 * box, and since a cell is mostly transparent that shows up as a hard grey
 * square around the pet.
 *
 * Still an approximation, and honest about it: React Native has no CSS
 * `filter: grayscale` and no native filter module is installed, so the pet's
 * pixels cannot actually be desaturated. Tinting toward slate dulls and flattens
 * it, but this is grey laid over colour, not colour drained out of it. A real
 * desaturation needs a native filter dependency.
 */
export function Fading({ active, severity, sheet, frame, size }: FadingProps) {
  const target = Math.max(0, Math.min(1, severity)) * 0.45;
  const wash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(wash, {
      toValue: active ? target : 0,
      duration: 600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [active, target, wash]);

  if (!active) return null;

  return (
    <Animated.View style={[styles.fade, { opacity: wash }]} pointerEvents="none">
      <SpriteFrame sheet={sheet} frame={frame} size={size} tintColor={colors.slateDeep} />
    </Animated.View>
  );
}

/** How far the aura reaches past the sprite. Generous, because the rim fades to nothing. */
const AURA_SCALE = 1.62;

interface PetAuraProps {
  color: string;
  /** The sprite's on-screen edge length; the aura is sized in multiples of it. */
  size: number;
}

/**
 * The pool of light the pet stands in.
 *
 * Drawn as a radial gradient that reaches zero alpha at its rim rather than a
 * flat disc, so there is no hard edge anywhere — a solid circle behind pixel art
 * reads as a sticker sitting on the panel instead of as atmosphere. It is also
 * squashed slightly (`ry < rx`) and pushed a little below the sprite's midline,
 * which is where light would actually pool around something standing on ground.
 *
 * Aura colours must stay pale. This is additive-feeling light over the sage
 * panel, so a dark tone reads as a bruise rather than a glow.
 */
export function PetAura({ color, size }: PetAuraProps) {
  // react-native-svg resolves gradient ids globally, so two auras mounted at
  // once (a picker beside the stage) would otherwise share whichever painted last.
  const gradientId = useId();
  const box = size * AURA_SCALE;

  return (
    <View style={[styles.aura, { width: box, height: box }]} pointerEvents="none">
      <Svg width={box} height={box} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={gradientId} cx="50%" cy="50%" rx="50%" ry="50%">
            {/* Front-loaded stops: bright and flat across the pet, then most of
                the falloff spent in the outer third so the rim never shows. */}
            <Stop offset="0" stopColor={color} stopOpacity={0.66} />
            <Stop offset="0.42" stopColor={color} stopOpacity={0.44} />
            <Stop offset="0.72" stopColor={color} stopOpacity={0.15} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50" cy="52" rx="50" ry="44" fill={`url(#${gradientId})`} />
        {/* Contact shadow: without it the sprite floats on a flat panel. Kept
            far softer than the glow — it is a hint of weight, not a light source. */}
        <Ellipse cx="50" cy="79" rx="24" ry="4.2" fill={colors.slateDeep} opacity={0.13} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  aura: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  // Sits at the stage centre; marginTop lifts it clear of the pet's head.
  layer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  piece: { position: 'absolute', borderRadius: 2 },
  glyph: { position: 'absolute', fontSize: 20 },
  cloud: { width: 54, height: 56, alignItems: 'center' },
  drop: {
    position: 'absolute',
    top: 24,
    width: 3,
    height: 8,
    borderRadius: 2,
    backgroundColor: colors.slateDeep,
  },
  // Above the sprite but below the effect layers, so confetti and glyphs stay crisp.
  // Stacked directly on the sprite inside the avatar's window, so it inherits
  // the same position and never needs its own bounds.
  fade: { position: 'absolute', top: 0, left: 0, zIndex: 2 },
});
