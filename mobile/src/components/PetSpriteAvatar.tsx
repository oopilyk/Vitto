import { StyleSheet, Text, View } from 'react-native';
import type { PetState } from '@vitto/core';
import { sheetForPet } from './petSprites';
import { SpriteFrame } from './SpriteFrame';
import { colors, fonts } from '../theme';

interface Props {
  /** The friend's pet, or `null` when they have not adopted one. */
  pet: PetState | null;
  /** Diameter of the circle, in px. */
  size?: number;
  /** Letter shown in the placeholder when `pet` is null (the friend's initial). */
  placeholderInitial?: string;
  backgroundColor: string;
}

const DEFAULT_SIZE = 48;

/**
 * A friend's pet as a circular avatar -- the Snapchat-style list's "profile
 * picture is a picture of their pet". Renders the pet's idle sprite frame
 * clipped to a circle; falls back to an initial on a neutral disc when there is
 * no pet. Deliberately still (no frame timer) -- a list of twenty animating
 * sprites would be a lot of churn for a glance.
 */
export function PetSpriteAvatar({ pet, size = DEFAULT_SIZE, placeholderInitial, backgroundColor }: Props) {
  const circle = { width: size, height: size, borderRadius: size / 2, backgroundColor };

  if (!pet) {
    return (
      <View style={[styles.circle, circle, styles.center]}>
        <Text style={[styles.initial, { fontSize: size * 0.42 }]}>
          {(placeholderInitial ?? '?').toUpperCase()}
        </Text>
      </View>
    );
  }

  const sheet = sheetForPet(pet);
  // The sprite art sits low in its cell, so nudge it up a touch and scale it
  // past the circle's edge -- otherwise the pet floats in the top half with a
  // band of empty disc beneath it.
  const spriteSize = size * 1.15;
  return (
    <View style={[styles.circle, circle, styles.center]}>
      <View style={{ marginTop: size * 0.08 }}>
        <SpriteFrame sheet={sheet} frame={sheet.animations.idle[0]} size={spriteSize} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: fonts.display, color: colors.inkSoft, fontWeight: '700' },
});
