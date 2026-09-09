import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

/**
 * One large circular touch target, sitting directly on the environment rather
 * than in a bordered bar/card — the bottom action row (Main) and the "choose
 * food" control (Kitchen) are both built from this. `tint`/`ink` follow the
 * same pairing `DashboardScreen`'s old quick-action icons used, so the palette
 * stays recognizable even though the chrome around it changed.
 */
export function CircleButton({
  label,
  icon,
  tint,
  ink,
  size = 56,
  onPress,
  accessibilityLabel,
  backgroundImage,
  night,
}: {
  label: string;
  icon: string;
  tint: string;
  ink: string;
  size?: number;
  onPress: () => void;
  /** Defaults to `Log <label>` — Main's quick actions keep their existing
   * accessible name. Kitchen's single CTA passes its own, since "Log choose
   * food" doesn't read as a sentence. */
  accessibilityLabel?: string;
  /**
   * A photo filling the circle behind the glyph, clipped to it. Optional and
   * backward-compatible — omitting it keeps the original flat-tinted circle
   * (e.g. Kitchen's "Choose food" button, which has no art of its own yet).
   */
  backgroundImage?: ImageSourcePropType;
  /**
   * The label sits directly on the environment photo, not on any panel, so it
   * needs its own day/night treatment: dark ink reads fine on the day scenes
   * but disappears against the night ones. Defaults to the day (dark) look.
   */
  night?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `Log ${label.toLowerCase()}`}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: tint },
        ]}
      >
        {backgroundImage ? (
          <Image source={backgroundImage} style={styles.circleImage} resizeMode="cover" />
        ) : null}
        <Text style={[{ color: ink, fontSize: size * 0.36 }, !!backgroundImage && styles.glyphOnImage]}>
          {icon}
        </Text>
      </View>
      <Text style={[styles.label, night && styles.labelNight]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: { alignItems: 'center', gap: 6 },
  itemPressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#26312d',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  circleImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // A soft shadow under the glyph keeps it legible sitting on top of a photo,
  // rather than needing its own solid-chip backing.
  glyphOnImage: {
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
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
