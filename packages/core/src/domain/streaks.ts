import type { HealthEvent } from './health';

export interface StreakSummary {
  currentStreak: number;
  longestStreak: number;
  activeDateKeys: Set<string>;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/**
 * Which day an event counts toward. Defaults to its completion time, but a game whose
 * identity is fixed when it is opened -- Inkling picks its puzzle date up front -- passes
 * its own `keyOf` so a session carried across midnight still credits the day it belongs to.
 */
export type EventDateKey = (event: HealthEvent) => string;

const occurredAtKey: EventDateKey = (event) => toDateKey(new Date(event.occurredAt));

export const getActiveDateKeys = (
  events: HealthEvent[],
  keyOf: EventDateKey = occurredAtKey,
): Set<string> => new Set(events.map(keyOf));

export const calculateStreaks = (
  events: HealthEvent[],
  today: Date = new Date(),
  keyOf: EventDateKey = occurredAtKey,
): StreakSummary => {
  const activeDateKeys = getActiveDateKeys(events, keyOf);
  const todayKey = toDateKey(today);

  const sortedKeys = Array.from(activeDateKeys).sort();
  let longestStreak = 0;
  let runLength = 0;
  let previousDay: Date | null = null;
  for (const key of sortedKeys) {
    const [year, month, day] = key.split('-').map(Number);
    const current = new Date(year, month - 1, day);
    runLength = previousDay && current.getTime() - previousDay.getTime() === ONE_DAY_MS ? runLength + 1 : 1;
    longestStreak = Math.max(longestStreak, runLength);
    previousDay = current;
  }

  let currentStreak = 0;
  const cursor = startOfDay(today);
  if (!activeDateKeys.has(todayKey)) cursor.setDate(cursor.getDate() - 1);
  while (activeDateKeys.has(toDateKey(cursor))) {
    currentStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { currentStreak, longestStreak, activeDateKeys };
};

export const getRecentDays = (count: number, today: Date = new Date()): Date[] =>
  Array.from({ length: count }, (_, index) => {
    const date = startOfDay(today);
    date.setDate(date.getDate() - (count - 1 - index));
    return date;
  });

export { toDateKey };
