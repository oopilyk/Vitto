import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

interface StatBarProps {
  label: string;
  value: number;
  color: string;
  /** How the stat is raised, shown under the bar when there is room for it. */
  hint?: string;
  max?: number;
}

/**
 * One labelled 0-100 bar. The track clips its fill rather than trusting the
 * width, so a value past `max` reads as full instead of spilling over the end.
 */
export function StatBar({ label, value, color, hint, max = 100 }: StatBarProps) {
  const ceiling = max > 0 ? max : 100;
  const percent = Math.max(0, Math.min(100, (value / ceiling) * 100));

  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {Math.round(value)}
          <Text style={styles.ceiling}>/{ceiling}</Text>
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%`, backgroundColor: color }]} />
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, letterSpacing: 0.5 },
  value: { fontFamily: fonts.mono, fontSize: 10, color: colors.ink },
  ceiling: { color: colors.faint },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#deded7',
    marginTop: 6,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 3 },
  hint: { fontSize: 11, color: colors.faint, marginTop: 6, lineHeight: 16 },
});
