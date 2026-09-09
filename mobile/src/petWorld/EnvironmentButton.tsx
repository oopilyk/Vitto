import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text } from 'react-native';
import { colors, fonts } from '../theme';

/**
 * One destination in the bottom action row (Kitchen / Gym / Outdoors / Study).
 * It is just the button's own PNG art with a caption under it — no circle, tint
 * or glyph chrome around it: the art already carries its own rounded-square
 * backing and soft shadow, so wrapping it in another shape only fought it.
 */
const ART_SIZE = 60;

export interface EnvironmentButtonProps {
  label: string;
  /** The button's PNG (a self-contained icon, drawn with its own backing). */
  source: ImageSourcePropType;
  onPress: () => void;
  /** Defaults to `label`; callers pass a verb phrase ("Log meal") where the
   *  bare noun would not read as an action to a screen reader. */
  accessibilityLabel?: string;
  /**
   * The caption sits directly on the environment photo, not on a panel, so it
   * needs its own day/night treatment: dark ink reads on the day scenes but
   * disappears against the night ones. Defaults to the day (dark) look.
   */
  night?: boolean;
}

export function EnvironmentButton({
  label,
  source,
  onPress,
  accessibilityLabel,
  night,
}: EnvironmentButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      <Image source={source} style={styles.art} resizeMode="contain" />
      <Text style={[styles.label, night && styles.labelNight]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: { alignItems: 'center', gap: 6 },
  itemPressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  art: { width: ART_SIZE, height: ART_SIZE },
  label: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.ink,
    letterSpacing: 0.3,
    textShadowColor: 'rgba(255,255,255,0.6)',
    textShadowRadius: 3,
  },
  labelNight: {
    color: '#f7f5ff',
    textShadowColor: 'rgba(0,0,0,0.55)',
  },
});
