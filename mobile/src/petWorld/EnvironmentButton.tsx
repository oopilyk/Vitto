import { useEffect, useRef } from 'react';
import { Animated, Image, type ImageSourcePropType, Pressable, StyleSheet, View } from 'react-native';

/**
 * One icon on the Snapchat-style hotbar (`EnvironmentActionRow`) -- white icon
 * art on transparent, tinted to fit the bar rather than wrapped in any chrome.
 * The bar reads as a strip of glyphs sitting directly on the scene.
 *
 * Four looks, from `night` x `isActive`:
 *  - day, inactive  -- solid shape, white, slightly dimmed.
 *  - day, active    -- a dark shape with a crisp white keyline: the `filled` art
 *    tinted near-black UNDER the `outline` art tinted white.
 *  - night, inactive -- dark shape with a white keyline, so it still reads
 *    against a dark bar over a dark scene.
 *  - night, active  -- solid shape, white, full strength (also keylined).
 *
 * The current room also gets a short coral "you are here" pedestal under it --
 * a 3px pixel bar, no glow -- so the active state is unmistakable without a
 * label. It scales in when the room changes.
 */
const ICON_SIZE = 40;
const SLOT_SIZE = 48;

const FILLED_STYLE = {
  dayInactive: { tintColor: '#ffffff', opacity: 0.85 },
  dayActive: { tintColor: '#1b1b1b', opacity: 1 },
  nightInactive: { tintColor: '#111111', opacity: 0.75 },
  nightActive: { tintColor: '#ffffff', opacity: 1 },
} as const;

const ACTIVE_OUTLINE_TINT = '#ffffff';
const PEDESTAL_DAY = '#e5654c';
const PEDESTAL_NIGHT = '#ffffff';

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
  const filledStyle = night
    ? isActive
      ? FILLED_STYLE.nightActive
      : FILLED_STYLE.nightInactive
    : isActive
      ? FILLED_STYLE.dayActive
      : FILLED_STYLE.dayInactive;

  const showOutline = night || isActive;

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
        <Image source={filledSource} style={[styles.icon, filledStyle]} resizeMode="contain" />
        {showOutline ? (
          <View style={styles.outlineLayer} pointerEvents="none">
            <Image
              source={outlineSource}
              style={[styles.icon, { tintColor: ACTIVE_OUTLINE_TINT }]}
              resizeMode="contain"
            />
          </View>
        ) : null}
      </View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pedestal,
          { backgroundColor: night ? PEDESTAL_NIGHT : PEDESTAL_DAY },
          { opacity: pedestal, transform: [{ scaleX: pedestal }] },
        ]}
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
  },
});
