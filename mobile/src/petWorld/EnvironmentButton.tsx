import { Image, type ImageSourcePropType, Pressable, StyleSheet, View } from 'react-native';

/**
 * One icon on the Snapchat-style hotbar (`EnvironmentActionRow`) -- white icon
 * art on transparent, tinted to fit the bar rather than wrapped in any chrome.
 * No caption: the bar reads as a strip of glyphs sitting directly on the scene.
 *
 * Four looks, from `night` x `isActive`:
 *  - day, inactive  -- solid shape, white, slightly dimmed.
 *  - day, active    -- a dark shape with a crisp white keyline: the `filled` art
 *    tinted near-black UNDER the `outline` art tinted white. Two layered images
 *    in one fixed-size slot, which is why this state renders two `<Image>`s and
 *    the others render one.
 *  - night, inactive -- dark shape with a white keyline, so it still reads
 *    against a dark bar over a dark scene; the current one stands out by being
 *    solid white rather than by the others vanishing.
 *  - night, active  -- solid shape, white, full strength (also keylined).
 *
 * Every night button carries the white outline; in the day only the active one
 * does (the day scene is bright enough that a plain white glyph reads fine).
 */
const ICON_SIZE = 40;

/** Per-state tint + opacity for the single `filled` layer. */
const FILLED_STYLE = {
  dayInactive: { tintColor: '#ffffff', opacity: 0.9 },
  dayActive: { tintColor: '#1b1b1b', opacity: 1 },
  nightInactive: { tintColor: '#111111', opacity: 0.8 },
  nightActive: { tintColor: '#ffffff', opacity: 1 },
} as const;

/** White keyline drawn over the dark `filled` layer in the day-active state. */
const ACTIVE_OUTLINE_TINT = '#ffffff';

export interface EnvironmentButtonProps {
  /** A verb phrase ("Go to the gym"), so a screen reader announces a destination. */
  accessibilityLabel: string;
  /** The scene's solid-shape crop. */
  filledSource: ImageSourcePropType;
  /** The scene's thin-stroke crop, used only for the day-active keyline. */
  outlineSource: ImageSourcePropType;
  /** This button's scene is the one on screen. */
  isActive: boolean;
  /** The scene is showing its night dressing. */
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

  // Every night button gets the white keyline (otherwise a dark glyph on a dark
  // bar over a dark scene is invisible); in the day only the active one needs it.
  const showOutline = night || isActive;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // `disabled` as well as `selected`: the active room is not somewhere you
      // can go, and a screen reader should not offer it as a destination.
      accessibilityState={{ selected: isActive, disabled: isActive }}
      // The room you are in is not a button. Inert rather than merely ignored on
      // press, so it does not dim and shrink under a tap that goes nowhere --
      // press feedback with no result is what makes a control feel broken.
      disabled={isActive}
      onPress={onPress}
      style={({ pressed }) => [styles.slot, pressed && !isActive && styles.pressed]}
    >
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: { width: ICON_SIZE, height: ICON_SIZE, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6, transform: [{ scale: 0.92 }] },
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
});
