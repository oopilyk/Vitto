import { useEffect, useRef } from 'react';
import { Animated, Image, type ImageSourcePropType, Pressable, StyleSheet } from 'react-native';

/**
 * One icon on the bottom hotbar (`EnvironmentActionRow`). There is no bar behind
 * it any more, so each icon carries its own contrast: a hard 1px pixel shadow
 * copy behind, and an always-on white keyline in front, so it reads on a bright
 * wall or a dark night sky alike. No blur, no glow.
 *
 * The current room:
 *  - solid white fill at full strength,
 *  - lifts 2px,
 *  - and drops a short coral pixel pedestal that scales in when the room changes
 *    — a "you are here" marker that needs no label.
 *
 * Every other room: the same shape, dimmed, sitting flat.
 */
const ICON_SIZE = 40;
const SLOT_SIZE = 48;

const FILL_TINT = {
  dayInactive: { tintColor: '#ffffff', opacity: 0.78 },
  dayActive: { tintColor: '#ffffff', opacity: 1 },
  nightInactive: { tintColor: '#ffffff', opacity: 0.6 },
  nightActive: { tintColor: '#ffffff', opacity: 1 },
} as const;

const SHADOW_TINT = '#12101c';
const KEYLINE_TINT = '#ffffff';
/** One "you are here" colour, day or night — coral is Vitto's progress hue. */
const PEDESTAL = '#e5654c';

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
  const fill = night
    ? isActive
      ? FILL_TINT.nightActive
      : FILL_TINT.nightInactive
    : isActive
      ? FILL_TINT.dayActive
      : FILL_TINT.dayInactive;

  // The active icon lifts, and its pedestal scales in — a quick "I moved here".
  const active = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(active, {
      toValue: isActive ? 1 : 0,
      duration: isActive ? 160 : 110,
      useNativeDriver: true,
    }).start();
  }, [isActive, active]);
  const lift = active.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });

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
      <Animated.View style={[styles.iconBox, { transform: [{ translateY: lift }] }]}>
        {/* hard pixel shadow */}
        <Image
          source={filledSource}
          style={[styles.icon, styles.shadowIcon, { tintColor: SHADOW_TINT }]}
          resizeMode="contain"
        />
        {/* the shape */}
        <Image source={filledSource} style={[styles.icon, fill]} resizeMode="contain" />
        {/* always-on keyline */}
        <Image
          source={outlineSource}
          style={[styles.icon, styles.keyline, { tintColor: KEYLINE_TINT, opacity: isActive ? 1 : 0.85 }]}
          resizeMode="contain"
        />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.pedestal, { opacity: active, transform: [{ scaleX: active }] }]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: { width: SLOT_SIZE, height: SLOT_SIZE, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6, transform: [{ scale: 0.9 }] },
  iconBox: { width: ICON_SIZE, height: ICON_SIZE, alignItems: 'center', justifyContent: 'center' },
  icon: { position: 'absolute', width: ICON_SIZE, height: ICON_SIZE },
  shadowIcon: { transform: [{ translateX: 1.5 }, { translateY: 1.5 }], opacity: 0.5 },
  keyline: {},
  pedestal: {
    position: 'absolute',
    bottom: 1,
    width: 20,
    height: 3,
    borderRadius: 1,
    backgroundColor: PEDESTAL,
  },
});
