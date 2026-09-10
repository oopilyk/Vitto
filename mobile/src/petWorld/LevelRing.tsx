import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

const SIZE = 90;
const STROKE = 7;

/**
 * The pet's level/XP badge — the single loudest piece of HUD chrome, per the
 * product owner's "the level circle should be a lot bigger in comparison to
 * everything else" note. Tapped to reach the full stat sheet.
 *
 * No SVG dependency: RN has no conic-gradient, so the XP fill is approximated in
 * quarters (0/25/50/75/100% of `xpPct`) via the four border sides of a rotated
 * ring rather than a true swept arc — coarser than an SVG ring, but close enough
 * at this size to read as "mostly there" without a new dependency. A solid ink
 * outline and a hard offset shadow give it the blocky, pixel-UI weight.
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
      {/* Hard, un-blurred drop shadow — a duplicate disc offset behind the
          badge, so the retro shadow survives the ring's -45° rotation (which a
          `shadow*` style on the ring itself would be dragged around by). */}
      <View style={styles.shadowDisc} />
      {/* The solid outlined face the number sits on. Same colour in every room. */}
      <View style={[styles.face, night && styles.faceNight]} />
      <View
        style={[
          styles.ring,
          {
            borderTopColor: quarters[0] ? colors.coral : track,
            borderRightColor: quarters[1] ? colors.coral : track,
            borderBottomColor: quarters[2] ? colors.coral : track,
            borderLeftColor: quarters[3] ? colors.coral : track,
          },
        ]}
      />
      <Text style={[styles.kicker, night && styles.levelNight]}>LV</Text>
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
  shadowDisc: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: '#1b1830',
    transform: [{ translateX: 3 }, { translateY: 4 }],
  },
  face: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.card,
    borderWidth: 3,
    borderColor: colors.ink,
  },
  faceNight: { backgroundColor: '#141226', borderColor: '#4b4870' },
  ring: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: SIZE - 12,
    height: SIZE - 12,
    borderRadius: (SIZE - 12) / 2,
    borderWidth: STROKE,
    backgroundColor: 'transparent',
    transform: [{ rotate: '-45deg' }],
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: colors.inkSoft,
    marginBottom: -3,
  },
  level: {
    fontFamily: fonts.mono,
    fontSize: 32,
    fontWeight: '700',
    color: colors.ink,
  },
  levelNight: { color: '#ffffff' },
});
