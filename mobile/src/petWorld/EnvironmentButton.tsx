import { useEffect, useRef } from 'react';
import { Animated, Image, type ImageSourcePropType, Pressable, StyleSheet, View } from 'react-native';
import { world } from '../theme';

/**
 * One icon on the bottom hotbar (`EnvironmentActionRow`). Warm-cream glyph art
 * — not stark white — sitting on the translucent strip.
 *
 *  - inactive       -- the cream shape, dimmed.
 *  - active          -- the cream shape at full strength, with a crisp cream
 *    keyline and a short muted-coral "you are here" pedestal that scales in.
 *  - night           -- every icon carries the keyline so a dim glyph never
 *    vanishes against a dark bar over a dark scene.
 */
const ICON_SIZE = 40;
const SLOT_SIZE = 48;

const GLYPH = '#f2e8d4'; // warm cream
const KEYLINE = '#f2e8d4';

const FILL_OPACITY = {
  dayInactive: 0.68,
  dayActive: 1,
  nightInactive: 0.5,
  nightActive: 1,
} as const;

export interface EnvironmentButtonProps {
  /** A verb phrase ("Go to the gym"), so a screen reader announces a destination. */
  accessibilityLabel: string;
  filledSource: ImageSourcePropType;
  outlineSource: ImageSourcePropType;
  isActive: boolean;
  night: boolean;
  onPress: () => void;
}

export function EnvironmentButton({
  accessibilityLabel,
  filledSource,
  outlineSource,
  isActive,
  night,
  onPress,
}: EnvironmentButtonProps) {
  const opacity = night
    ? isActive
      ? FILL_OPACITY.nightActive
      : FILL_OPACITY.nightInactive
    : isActive
      ? FILL_OPACITY.dayActive
      : FILL_OPACITY.dayInactive;

  const showKeyline = night || isActive;

  // The pedestal scales in on becoming active — a quick "I moved here" beat.
  const pedestal = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(pedestal, {
      toValue: isActive ? 1 : 0,
      duration: isActive ? 160 : 110,
      useNativeDriver: true,
    }).start();
  }, [isActive, pedestal]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // `disabled` as well as `selected`: the active room is not somewhere you
      // can go, and a screen reader should not offer it as a destination.
      accessibilityState={{ selected: isActive, disabled: isActive }}
      disabled={isActive}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.slot, pressed && !isActive && styles.pressed]}
    >
      <View style={styles.iconBox}>
        <Image
          source={filledSource}
          style={[styles.icon, { tintColor: GLYPH, opacity }]}
          resizeMode="contain"
        />
        {showKeyline ? (
          <View style={styles.outlineLayer} pointerEvents="none">
            <Image
              source={outlineSource}
              style={[styles.icon, { tintColor: KEYLINE }]}
              resizeMode="contain"
            />
          </View>
        ) : null}
      </View>
      <Animated.View
        pointerEvents="none"
        style={[styles.pedestal, { opacity: pedestal, transform: [{ scaleX: pedestal }] }]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: { width: SLOT_SIZE, height: SLOT_SIZE, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6, transform: [{ scale: 0.9 }] },
  iconBox: { width: ICON_SIZE, height: ICON_SIZE, alignItems: 'center', justifyContent: 'center' },
  icon: { width: ICON_SIZE, height: ICON_SIZE },
  outlineLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pedestal: {
    position: 'absolute',
    bottom: 2,
    width: 18,
    height: 3,
    borderRadius: 1,
    backgroundColor: world.accent,
  },
});
