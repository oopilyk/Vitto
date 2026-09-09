import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

const SIZE = 46;
const STROKE = 3;

/**
 * A compact level/XP indicator — what used to be the boxed "VITALS" panel
 * (four separate stat bars) is consolidated into one quiet ring, tapped to
 * reach the same full stat sheet. No SVG dependency: RN has no conic-gradient,
 * so the fill is approximated in quarters (0/25/50/75/100% of `xpPct`) via the
 * four border sides rather than a true swept arc — coarser than an SVG ring,
 * but close enough at 46px to read as "mostly there" without a new dependency.
 */
export function LevelRing({
  level,
  xpPct,
  onPress,
  night,
}: {
  level: number;
  xpPct: number;
  onPress: () => void;
  /** Whitens the level number so it stays legible over a dark night backdrop. */
  night?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, xpPct));
  const quarters = [pct >= 25, pct >= 50, pct >= 75, pct >= 100];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open pet stats"
      hitSlop={8}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <View
        style={[
          styles.ring,
          {
            borderTopColor: quarters[0] ? colors.coral : styles.ring.borderColor,
            borderRightColor: quarters[1] ? colors.coral : styles.ring.borderColor,
            borderBottomColor: quarters[2] ? colors.coral : styles.ring.borderColor,
            borderLeftColor: quarters[3] ? colors.coral : styles.ring.borderColor,
          },
        ]}
      />
      <Text style={[styles.level, night && styles.levelNight]}>{level}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  ring: {
    ...StyleSheet.absoluteFill,
    borderRadius: SIZE / 2,
    borderWidth: STROKE,
    borderColor: 'rgba(255,255,255,0.55)',
    transform: [{ rotate: '-45deg' }],
  },
  level: {
    fontFamily: fonts.mono,
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  levelNight: { color: '#ffffff' },
});
