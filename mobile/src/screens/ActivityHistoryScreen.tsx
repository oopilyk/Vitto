import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BrainTrainingMetadata, HealthEvent, MealMetadata, ScreenTimeMetadata } from '@vitto/core';
import { MealDiaryRow } from '../components/MealDiaryRow';
import { SettingsPage } from '../components/settingsKit';
import { formatMinutes } from '../services/minutes';
import { colors, fonts } from '../theme';

const PAGE_SIZE = 20;

export const describeEvent = (event: HealthEvent): string => {
  if (event.type === 'WORKOUT') return 'Workout';
  if (event.type === 'STEP_ACTIVITY') return 'Steps';
  if (event.type === 'BRAIN_TRAINING') {
    const session = event.metadata as BrainTrainingMetadata;
    return `${session.game === 'math' ? 'Quick maths' : 'Read and recall'} · ${session.score} mind score`;
  }
  if (event.type === 'SCREEN_TIME') {
    const screen = event.metadata as ScreenTimeMetadata;
    const verdict = screen.withinBudget === undefined ? '' : screen.withinBudget ? ' · under budget' : ' · over budget';
    return `Screen time · ${formatMinutes(screen.minutes)}${verdict}`;
  }
  return 'Healthy moment';
};

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
export function ActivityHistoryScreen({ events, onClose }: { events: HealthEvent[]; onClose: () => void }) {
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
            {day.events.map((event) =>
              event.type === 'MEAL' ? (
                <View key={event.id} style={styles.mealRow}>
                  <MealDiaryRow event={event as HealthEvent<MealMetadata>} />
                </View>
              ) : (
                <View key={event.id} style={styles.row}>
                  <View style={styles.dot} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>{describeEvent(event)}</Text>
                    <Text style={styles.rowTime}>
                      {new Date(event.occurredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              ),
            )}
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

const styles = StyleSheet.create({
  empty: { fontSize: 14, color: colors.muted, marginTop: 20 },
  day: { marginTop: 22, gap: 8 },
  dayHeading: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.faint, marginLeft: 4 },
  list: { borderRadius: 16, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.card, paddingHorizontal: 16 },
  mealRow: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#eee9e1',
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.coral },
  rowText: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '500', color: colors.ink },
  rowTime: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 3 },
  more: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  moreLabel: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
});
