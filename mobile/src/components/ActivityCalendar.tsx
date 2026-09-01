import { StyleSheet, View } from 'react-native';
import { getRecentDays, toDateKey } from '../domain/streaks';
import { colors } from '../theme';

interface ActivityCalendarProps {
  activeDateKeys: Set<string>;
  weeks?: number;
}

export function ActivityCalendar({ activeDateKeys, weeks = 12 }: ActivityCalendarProps) {
  const days = getRecentDays(weeks * 7);

  return (
    <View
      style={styles.grid}
      accessibilityRole="image"
      accessibilityLabel={`Activity over the last ${weeks} weeks`}
    >
      {days.map((day) => {
        const key = toDateKey(day);
        return (
          <View key={key} style={[styles.cell, activeDateKeys.has(key) && styles.cellActive]} />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 14 },
  cell: { width: 12, height: 12, borderRadius: 3, backgroundColor: '#e4e2db' },
  cellActive: { backgroundColor: colors.coral },
});
