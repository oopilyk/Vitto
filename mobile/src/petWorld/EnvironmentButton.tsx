import { Image, type ImageSourcePropType, Pressable, Text, View } from 'react-native';
import { fonts, themedStyles } from '../theme';

/**
 * One icon on the bottom hotbar (`EnvironmentActionRow`). Warm-cream glyph art
 * — not stark white — sitting on the translucent strip.
 *
 *  - inactive       -- the cream shape, dimmed.
 *  - active          -- the cream shape at full strength, with a crisp cream
 *    keyline; the bar slides a soft pill behind it.
 *  - night           -- every icon carries the keyline so a dim glyph never
 *    vanishes against a dark bar over a dark scene.
 */
const ICON_SIZE = 24;
// Five slots plus the bar's edge padding must fit a 320pt screen (5 x 56 + 28):
// at 60 the last icon ran off the edge. "OUTSIDE", the widest label, is ~44pt.
const SLOT_WIDTH = 56;
const SLOT_HEIGHT = 42;

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
  /**
   * The word under the icon. Icons alone did not say where they went: the
   * lamp is home and the book is the mind games, which nobody guessed.
   */
  label: string;
  isActive: boolean;
  night: boolean;
  /** Overrides the cream glyph -- the dark ink used when the bar sits on paper. */
  glyph?: string;
  onPress: () => void;
}

export function EnvironmentButton({
  accessibilityLabel,
  filledSource,
  outlineSource,
  label,
  isActive,
  night,
  glyph = GLYPH,
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


  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // `disabled` as well as `selected`: the active room is not somewhere you
      // can go, and a screen reader should not offer it as a destination.
      accessibilityState={{ selected: isActive, disabled: isActive }}
      disabled={isActive}
      // On touch-down, not release: the room changes the instant a finger
      // lands, which is what makes the bar feel immediate. `onPress` stays for
      // VoiceOver, whose activation only fires that; a second call is a no-op.
      onPressIn={onPress}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.slot, pressed && !isActive && styles.pressed]}
    >
      <View style={styles.iconBox}>
        <Image
          source={filledSource}
          style={[styles.icon, { tintColor: glyph, opacity }]}
          resizeMode="contain"
        />
        {showKeyline ? (
          <View style={styles.outlineLayer} pointerEvents="none">
            <Image
              source={outlineSource}
              style={[styles.icon, { tintColor: glyph === GLYPH ? KEYLINE : glyph }]}
              resizeMode="contain"
            />
          </View>
        ) : null}
      </View>
      <Text style={[styles.label, { opacity }, isActive && styles.labelActive, glyph !== GLYPH && { color: glyph }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  slot: { width: SLOT_WIDTH, height: SLOT_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 1 },
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
  label: {
    fontFamily: fonts.systemMono,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: GLYPH,
    flexShrink: 0,
  },
  labelActive: { color: '#fff8ec' },
}));
