import { View } from 'react-native';
import { getRecentDays, toDateKey } from '@vitto/core';
import { colors, themedStyles } from '../theme';

interface ActivityCalendarProps {
  activeDateKeys: Set<string>;
  /** Missed days a streak freeze covered, in ice blue. */
  frozenDateKeys?: Set<string>;
  weeks?: number;
}

/** The water tracker's blue on Today, for days a streak freeze kept. */
export const FROZEN_COLOR = '#5b9bc4';

export function ActivityCalendar({ activeDateKeys, frozenDateKeys, weeks = 12 }: ActivityCalendarProps) {
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
          <View
            key={key}
            style={[styles.cell, activeDateKeys.has(key) ? styles.cellActive : frozenDateKeys?.has(key) && styles.cellFrozen]}
          />
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 14 },
  cell: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.track },
  cellActive: { backgroundColor: colors.coral },
  cellFrozen: { backgroundColor: FROZEN_COLOR },
}));
