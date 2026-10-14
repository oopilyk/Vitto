import { useEffect, useId, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { SpriteFrame } from './SpriteFrame';
import type { PetSheet } from './petSprites';
import { colors, themedStyles } from '../theme';

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
            far softer than the glow — it is a hint of weight, not a light source.
            `shadow`, which is dark in both schemes: slate turns light in dark
            mode, and a light ellipse here reads as a spotlight. */}
        <Ellipse cx="50" cy="71" rx="24" ry="4.2" fill={colors.shadow} opacity={0.13} />
      </Svg>
    </View>
  );
}

const styles = themedStyles(() => ({
  aura: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  // Stacked directly on the sprite inside the avatar's window, so it inherits
  // the same position and never needs its own bounds.
  fade: { position: 'absolute', top: 0, left: 0, zIndex: 2 },
}));
