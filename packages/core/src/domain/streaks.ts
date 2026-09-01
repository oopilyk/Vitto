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

export const getActiveDateKeys = (events: HealthEvent[]): Set<string> =>
  new Set(events.map((event) => toDateKey(new Date(event.occurredAt))));

export const calculateStreaks = (events: HealthEvent[], today: Date = new Date()): StreakSummary => {
  const activeDateKeys = getActiveDateKeys(events);
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
