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
  /**
   * The unearned part of the ring. It needs its own colour per theme now that
   * the disc behind it is opaque: the old translucent white read against the
   * artwork, but against a near-white fill it would vanish, taking the sense of
   * "this much to go" with it.
   */
  const track = night ? 'rgba(255,255,255,0.26)' : colors.hairline;

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
          night && styles.ringNight,
          {
            borderTopColor: quarters[0] ? colors.coral : track,
            borderRightColor: quarters[1] ? colors.coral : track,
            borderBottomColor: quarters[2] ? colors.coral : track,
            borderLeftColor: quarters[3] ? colors.coral : track,
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
    // Opaque, not a wash: the level sat directly on the scene, so a pale wall or
    // a lit window decided how readable the number was. The disc is the same
    // colour in every room.
    backgroundColor: colors.card,
    transform: [{ rotate: '-45deg' }],
  },
  // The night chrome's own tone (the caption card's, at full opacity).
  ringNight: { backgroundColor: '#141226' },
  level: {
    fontFamily: fonts.mono,
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  levelNight: { color: '#ffffff' },
});
