import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { haptic } from './ui';
import { colors, fonts, themedStyles } from '../theme';

const CHART_HEIGHT = 150;
/** A day with anything in it shows at least this tall, so a small day still reads. */
const MIN_BAR = 4;
const DENSE_LABEL_WIDTH = 44;
/** Centred under its bar, except at either end, where it lines up with the chart's edge instead of overhanging it. */
const denseLabelAt = (index: number, count: number) => {
  const centre = ((index + 0.5) / count) * 100;
  if (index === count - 1) return { right: 0, textAlign: 'right' as const };
  if (index < 2) return { left: 0, textAlign: 'left' as const };
  return { left: `${centre}%` as const, marginLeft: -DENSE_LABEL_WIDTH / 2 };
};
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export interface TrendBar {
  date: Date;
  value: number;
  isToday?: boolean;
}

/**
 * One bar a day, with the goal as a dashed line across. A bar that reached
 * the goal is filled in full colour, the rest softer, and today (not over
 * yet) lighter still. Tapping a bar reads out that day above the chart.
 */
export function TrendBars({
  bars,
  goal,
  format,
  unit,
}: {
  bars: readonly TrendBar[];
  goal?: number;
  format: (value: number) => string;
  unit: string;
}) {
  // Picked by day, not by position: switching 7 → 30 days kept the 5th bar
  // picked, which was another day entirely (and often an empty one).
  const [picked, setPicked] = useState<string | null>(null);
  const top = Math.max(1, goal ?? 0, ...bars.map((bar) => bar.value)) * 1.08;
  const dense = bars.length > 10;
  const shown = bars.find((bar) => dayKey(bar.date) === picked) ?? null;
  return (
    <View>
      <Text style={styles.readout} accessibilityLiveRegion="polite">
        {shown
          ? `${shown.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${format(shown.value)} ${unit}`
          : 'Tap a day to see it'}
      </Text>
      <View style={styles.chart}>
        {goal ? (
          <View style={[styles.goal, { bottom: (goal / top) * CHART_HEIGHT }]} pointerEvents="none">
            <Text style={styles.goalLabel}>goal</Text>
          </View>
        ) : null}
        {bars.map((bar) => {
          const met = goal !== undefined && bar.value >= goal * 0.9;
          const on = dayKey(bar.date) === picked;
          return (
            <Pressable
              key={bar.date.toISOString()}
              accessibilityRole="button"
              accessibilityLabel={`${bar.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}: ${format(bar.value)} ${unit}`}
              onPress={() => {
                haptic('select');
                setPicked(on ? null : dayKey(bar.date));
              }}
              style={styles.column}
            >
              <View
                style={[
                  styles.bar,
                  { height: Math.max(bar.value > 0 ? MIN_BAR : 0, (bar.value / top) * CHART_HEIGHT), borderRadius: dense ? 2 : 5 },
                  met ? styles.barMet : styles.barSoft,
                  bar.isToday && styles.barToday,
                  on && styles.barPicked,
                ]}
              />
            </Pressable>
          );
        })}
      </View>
      {dense ? (
        // A date every seven days, centred on its bar and free to be wider
        // than it: squeezed into one bar's column, "10/14" showed as "1..".
        <View style={styles.denseLabels}>
          {bars.map((bar, index) =>
            index % 7 === (bars.length - 1) % 7 ? (
              <Text
                key={bar.date.toISOString()}
                style={[styles.denseLabel, denseLabelAt(index, bars.length), bar.isToday && styles.labelToday]}
                numberOfLines={1}
              >
                {`${bar.date.getMonth() + 1}/${bar.date.getDate()}`}
              </Text>
            ) : null,
          )}
        </View>
      ) : (
        <View style={styles.labels}>
          {bars.map((bar) => (
            <Text key={bar.date.toISOString()} style={[styles.label, bar.isToday && styles.labelToday]} numberOfLines={1}>
              {DAY_LETTER[bar.date.getDay()]}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

/** A figure in a tile: the number big, what it is under it, and a note under that. */
export function StatTile({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      {note ? <Text style={styles.tileNote}>{note}</Text> : null}
    </View>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

const styles = themedStyles(() => ({
  readout: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, marginBottom: 10, fontVariant: ['tabular-nums'] },
  chart: { height: CHART_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  column: { flex: 1, height: CHART_HEIGHT, justifyContent: 'flex-end' },
  bar: { width: '100%' },
  barMet: { backgroundColor: colors.coral },
  // The wash alone all but vanished on a dark card.
  barSoft: { backgroundColor: colors.coral, opacity: 0.4 },
  barToday: { opacity: 0.55 },
  barPicked: { backgroundColor: colors.coralDeep, opacity: 1 },
  goal: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.muted,
    zIndex: 1,
  },
  goalLabel: { position: 'absolute', right: 0, top: -16, fontFamily: fonts.ui, fontSize: 11, color: colors.muted },
  labels: { flexDirection: 'row', gap: 3, marginTop: 6 },
  label: { flex: 1, textAlign: 'center', fontFamily: fonts.ui, fontSize: 11, color: colors.faint, overflow: 'visible' },
  denseLabels: { height: 16, marginTop: 6 },
  denseLabel: {
    position: 'absolute',
    width: DENSE_LABEL_WIDTH,
    textAlign: 'center',
    fontFamily: fonts.ui,
    fontSize: 11,
    color: colors.faint,
  },
  labelToday: { color: colors.ink, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    padding: 14,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  tileValue: { fontFamily: fonts.ui, fontSize: 22, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  tileLabel: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, marginTop: 2 },
  tileNote: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint, marginTop: 4 },
}));
