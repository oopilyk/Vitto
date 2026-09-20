// GENERATED FILE -- DO NOT EDIT BY HAND.
// Source: packages/core/src/companion/patterns.ts
// Regenerate with: node scripts/syncCompanion.mjs

import type { CompanionEvent, UserPattern } from './types.ts';
import { DAY, WEEKDAYS, dayKey, timeOfDayFor } from './util.ts';

const isWorkout = (event: CompanionEvent) => event.type === 'WORKOUT_COMPLETED';
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Consecutive calendar days, ending today or yesterday, with a workout. */
export const currentWorkoutStreak = (events: readonly CompanionEvent[], now: number): number => {
  const days = new Set(events.filter(isWorkout).map((event) => dayKey(event.timestamp)));
  let streak = 0;
  let cursor = now;
  if (!days.has(dayKey(cursor))) cursor -= DAY; // today is not over yet
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor -= DAY;
  }
  return streak;
};

/** True when there is a same-weekday workout habit and no workout yet today. */
export const expectedWorkoutMissing = (
  events: readonly CompanionEvent[],
  now: number,
): { expected: boolean; weekday: string } => {
  const today = new Date(now);
  const weekday = WEEKDAYS[today.getDay()]!;
  const sameWeekday = new Set(
    events
      .filter(
        (event) =>
          isWorkout(event) &&
          new Date(event.timestamp).getDay() === today.getDay() &&
          dayKey(event.timestamp) !== dayKey(now) &&
          now - event.timestamp < 35 * DAY,
      )
      .map((event) => dayKey(event.timestamp)),
  );
  const doneToday = events.some((event) => isWorkout(event) && dayKey(event.timestamp) === dayKey(now));
  return { expected: sameWeekday.size >= 2 && !doneToday, weekday };
};

/**
 * "Habits observed", derived from the raw event log on demand. Nothing is stored:
 * patterns are cheap to recompute, and that keeps them honest as the data changes.
 */
export const observePatterns = (events: readonly CompanionEvent[], now: number): UserPattern[] => {
  const patterns: UserPattern[] = [];
  const workouts = events.filter(isWorkout);

  const byWeekday = new Map<number, Set<string>>();
  for (const workout of workouts) {
    const day = new Date(workout.timestamp).getDay();
    if (!byWeekday.has(day)) byWeekday.set(day, new Set());
    byWeekday.get(day)!.add(dayKey(workout.timestamp));
  }
  const routineDays = [...byWeekday.entries()].filter(([, days]) => days.size >= 2).sort((a, b) => b[1].size - a[1].size);
  if (routineDays.length) {
    patterns.push({
      key: 'workout_weekdays',
      description: `Usually works out on ${routineDays.map(([day]) => `${WEEKDAYS[day]}s`).join(' and ')}`,
      confidence: Math.min(1, routineDays[0]![1].size / 4),
    });
  }

  const kinds = new Map<string, number>();
  for (const workout of workouts) {
    const kind = typeof workout.metadata.kind === 'string' ? workout.metadata.kind : null;
    if (kind) kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
  }
  const topKind = [...kinds.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topKind && topKind[1] >= 2) {
    patterns.push({
      key: 'favourite_workout',
      description: `${cap(topKind[0])} is their go-to workout (${topKind[1]} times recently)`,
      confidence: Math.min(1, topKind[1] / 5),
    });
  }

  const weekWorkouts = workouts.filter((workout) => now - workout.timestamp < 7 * DAY).length;
  if (weekWorkouts >= 1) {
    patterns.push({
      key: 'week_activity',
      description: `Worked out ${weekWorkouts} time${weekWorkouts === 1 ? '' : 's'} in the last 7 days`,
      confidence: 1,
    });
  }

  const streak = currentWorkoutStreak(events, now);
  if (streak >= 2) patterns.push({ key: 'workout_streak', description: `On a ${streak}-day workout streak`, confidence: 1 });

  const poorSleep = events.filter((event) => event.type === 'POOR_SLEEP' && now - event.timestamp < 7 * DAY).length;
  if (poorSleep >= 2) {
    patterns.push({ key: 'sleep_trouble', description: `Has slept badly ${poorSleep} times this week`, confidence: 0.8 });
  }

  const opens = events.filter((event) => event.type === 'USER_OPENED_APP' || event.type === 'USER_SENT_MESSAGE');
  const slots = new Map<string, number>();
  for (const open of opens) {
    const slot = timeOfDayFor(new Date(open.timestamp).getHours());
    slots.set(slot, (slots.get(slot) ?? 0) + 1);
  }
  const topSlot = [...slots.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topSlot && topSlot[1] >= 5 && topSlot[1] / opens.length >= 0.5) {
    patterns.push({
      key: 'checkin_time',
      description: `Usually checks in with you in the ${topSlot[0]}`,
      confidence: topSlot[1] / opens.length,
    });
  }

  return patterns;
};
