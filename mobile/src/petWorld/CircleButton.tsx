import { Pressable, StyleSheet, Text, View } from 'react-native';
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
        <Text style={{ color: ink, fontSize: size * 0.36 }}>{icon}</Text>
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: { alignItems: 'center', gap: 6 },
  itemPressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#26312d',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.ink,
    letterSpacing: 0.3,
    textShadowColor: 'rgba(255,255,255,0.6)',
    textShadowRadius: 3,
  },
});
