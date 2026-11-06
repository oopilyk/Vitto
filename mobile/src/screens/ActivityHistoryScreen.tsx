import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  BRAIN_GAME_LABEL,
  formatWater,
  waterMlOf,
  type BrainTrainingMetadata,
  type HealthEvent,
  type HydrationMetadata,
  type MealMetadata,
  type MeasurementSystem,
  type ScreenTimeMetadata,
  type SleepMetadata,
  type StepMetadata,
  type WorkoutMetadata,
} from '@vitto/core';
import { MealDiaryRow } from '../components/MealDiaryRow';
import { SettingsPage } from '../components/settingsKit';
import { formatMinutes } from '../services/minutes';
import { colors, fonts, themedStyles } from '../theme';

const PAGE_SIZE = 20;

/** "Push day · 45 min", or the kind of session when it was never named. */
const describeWorkout = (workout: Partial<WorkoutMetadata>): string => {
  const kind = workout.workoutType?.trim();
  const fallback = !kind || kind === 'strength' ? 'Workout' : `${kind[0].toUpperCase()}${kind.slice(1)}`;
  const title = workout.name?.trim() || fallback;
  return workout.durationMinutes ? `${title} · ${formatMinutes(workout.durationMinutes)}` : title;
};

export const describeEvent = (event: HealthEvent, system: MeasurementSystem = 'metric'): string => {
  if (event.type === 'WORKOUT') return describeWorkout((event.metadata ?? {}) as Partial<WorkoutMetadata>);
  if (event.type === 'STEP_ACTIVITY') {
    // The day's count as of that sync.
    const steps = (event.metadata as Partial<StepMetadata> | undefined)?.steps;
    return typeof steps === 'number' ? `Steps · ${steps.toLocaleString()}` : 'Steps';
  }
  if (event.type === 'BRAIN_TRAINING') {
    const session = event.metadata as Partial<BrainTrainingMetadata>;
    const name = (session.game && BRAIN_GAME_LABEL[session.game]) || 'Mind training';
    // Only the games with a points scale report one; a bare score means different things per game.
    return typeof session.points === 'number' ? `${name} · ${session.points} points` : name;
  }
  if (event.type === 'HYDRATION') {
    const ml = (event.metadata as Partial<HydrationMetadata> | undefined)?.ml;
    return typeof ml === 'number' ? `Water · ${formatWater(ml, system)}` : 'Water';
  }
  if (event.type === 'SLEEP') {
    const minutes = (event.metadata as Partial<SleepMetadata> | undefined)?.asleepMinutes;
    return typeof minutes === 'number' ? `Sleep · ${formatMinutes(minutes)}` : 'Sleep';
  }
  if (event.type === 'SCREEN_TIME') {
    const screen = event.metadata as ScreenTimeMetadata;
    const verdict = screen.withinBudget === undefined ? '' : screen.withinBudget ? ' · under budget' : ' · over budget';
    return `Screen time · ${formatMinutes(screen.minutes)}${verdict}`;
  }
  return 'Activity';
};

/**
 * A day's events as rows. Water is logged a cup at a time, and taking a cup
 * back on Today's tracker logs a cup the other way (the log only ever grows),
 * so its entries listed one by one read as a run of identical rows and
 * phantom drinks. A day's water is one row instead, with the day's total as
 * Today counts it, where the latest drink was; a day whose cups were all taken
 * back has none.
 */
export const historyRows = (events: readonly HealthEvent[]): { key: string; events: HealthEvent[] }[] => {
  const rows: { key: string; events: HealthEvent[] }[] = [];
  let water: { key: string; events: HealthEvent[] } | null = null;
  for (const event of events) {
    if (event.type !== 'HYDRATION') {
      rows.push({ key: event.id, events: [event] });
    } else if (water) {
      water.events.push(event);
    } else {
      water = { key: event.id, events: [event] };
      rows.push(water);
    }
  }
  return rows.filter((row) => row.events[0]!.type !== 'HYDRATION' || waterTotal(row.events) > 0);
};

/** The water in a day's entries, oldest first, never below zero: the same sum Today shows. */
const waterTotal = (events: readonly HealthEvent[]): number =>
  [...events]
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
    .reduce((total, event) => Math.max(0, total + waterMlOf(event)), 0);

export const describeRow = (events: readonly HealthEvent[], system: MeasurementSystem = 'metric'): string =>
  events[0]!.type === 'HYDRATION' ? `Water · ${formatWater(waterTotal(events), system)}` : describeEvent(events[0]!, system);

/** "Today", "Yesterday", or "Mon, Sep 28". */
const dayHeading = (iso: string, now = new Date()): string => {
  const day = new Date(iso);
  const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(day)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

/** Everything logged, newest first, under a heading per day (from Profile). */
export function ActivityHistoryScreen({
  events,
  system = 'metric',
  onClose,
}: {
  events: HealthEvent[];
  /** For water amounts, in the person's own units. */
  system?: MeasurementSystem;
  onClose: () => void;
}) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const shown = events.slice(0, limit);
  const days: { heading: string; events: HealthEvent[] }[] = [];
  for (const event of shown) {
    const heading = dayHeading(event.occurredAt);
    if (days.at(-1)?.heading === heading) days.at(-1)!.events.push(event);
    else days.push({ heading, events: [event] });
  }

  return (
    <SettingsPage
      title="Activity history"
      lead={events.length ? `${events.length} care moments, newest first.` : undefined}
      backLabel="Profile"
      onBack={onClose}
    >
      {events.length === 0 ? <Text style={styles.empty}>Your care history will appear here.</Text> : null}
      {days.map((day) => (
        <View key={day.heading} style={styles.day}>
          <Text style={styles.dayHeading}>{day.heading}</Text>
          <View style={styles.list}>
            {historyRows(day.events).map(({ key, events: group }) => {
              const event = group[0]!;
              return event.type === 'MEAL' ? (
                <View key={key} style={styles.mealRow}>
                  <MealDiaryRow event={event as HealthEvent<MealMetadata>} />
                </View>
              ) : (
                <View key={key} style={styles.row}>
                  <View style={styles.dot} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>{describeRow(group, system)}</Text>
                    <Text style={styles.rowTime}>
                      {new Date(event.occurredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ))}
      {events.length > limit ? (
        <Pressable accessibilityRole="button" onPress={() => setLimit((current) => current + PAGE_SIZE)} style={styles.more}>
          <Text style={styles.moreLabel}>Load more</Text>
        </Pressable>
      ) : null}
    </SettingsPage>
  );
}

const styles = themedStyles(() => ({
  empty: { fontFamily: fonts.ui, fontSize: 15, color: colors.muted, marginTop: 20 },
  day: { marginTop: 22, gap: 8 },
  dayHeading: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.faint, marginLeft: 4 },
  list: { borderRadius: 12, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.card, paddingHorizontal: 16 },
  mealRow: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  dot: { width: 8, height: 8, borderRadius: 12, backgroundColor: colors.coral },
  rowText: { flex: 1 },
  rowName: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '500', color: colors.ink },
  rowTime: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint, marginTop: 3 },
  more: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  moreLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.inkSoft },
}));
