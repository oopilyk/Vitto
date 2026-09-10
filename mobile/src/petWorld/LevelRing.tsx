import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, world } from '../theme';
import { retroPressed } from './retroStyle';

const SIZE = 90;
const STROKE = 7;

/**
 * The pet's level/XP badge — a warm parchment disc with a warm-ink outline and
 * a hard offset shadow, the loudest piece of HUD chrome (but still quieter than
 * Orion). Tapped to reach the full stat sheet.
 *
 * No SVG dependency: RN has no conic-gradient, so the XP fill is approximated in
 * quarters (0/25/50/75/100% of `xpPct`) via the four border sides of a rotated
 * ring rather than a true swept arc — coarser than an SVG ring, but close
 * enough at this size to read as "mostly there". The earned arc is the muted
 * coral Vitto uses for progression everywhere.
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
  /** Warm-cream number so it stays legible over a dark night backdrop. */
  night?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, xpPct));
  const quarters = [pct >= 25, pct >= 50, pct >= 75, pct >= 100];
  // The unearned part of the ring — a warm hairline, per theme.
  const track = night ? 'rgba(239,229,208,0.22)' : world.surfaceSoft;
  const earned = night ? world.nightAccent : world.accent;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open pet stats"
      hitSlop={8}
      style={({ pressed }) => [styles.wrap, pressed && retroPressed]}
    >
      {/* Hard, un-blurred drop shadow — a duplicate disc offset behind the
          badge, so the retro shadow survives the ring's -45° rotation. */}
      <View style={styles.shadowDisc} />
      {/* The solid outlined face the number sits on. Same colour in every room. */}
      <View style={[styles.face, night && styles.faceNight]} />
      <View
        style={[
          styles.ring,
          {
            borderTopColor: quarters[0] ? earned : track,
            borderRightColor: quarters[1] ? earned : track,
            borderBottomColor: quarters[2] ? earned : track,
            borderLeftColor: quarters[3] ? earned : track,
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
  shadowDisc: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: '#2a1f16',
    opacity: 0.9,
    transform: [{ translateX: 3 }, { translateY: 4 }],
  },
  face: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: world.surface,
    borderWidth: 3,
    borderColor: world.ink,
  },
  faceNight: { backgroundColor: world.nightSurface, borderColor: world.nightInk },
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
    color: world.inkSoft,
    marginBottom: -3,
  },
  level: {
    fontFamily: fonts.mono,
    fontSize: 32,
    fontWeight: '700',
    color: world.ink,
  },
  levelNight: { color: world.nightText },
});
