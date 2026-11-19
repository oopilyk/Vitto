import type { HealthEvent } from './health';

/**
 * Taking a log back. The row stays, marked with when it was removed, rather
 * than being deleted: Undo is then just clearing the mark, and the meal-XP
 * cap still sees a removed meal, so deleting and logging again cannot farm
 * XP. Everything people see (totals, diaries, charts, records) reads
 * `liveEvents` and never shows it.
 *
 * What a log already did to the pet stays done. Its stats moved on from it
 * long ago, through decay and every log after, so taking it back now would
 * change a past nobody can see.
 */
export const isRemoved = (event: HealthEvent<unknown>): boolean =>
  typeof (event.metadata as { removedAt?: unknown } | null)?.removedAt === 'string';

export const liveEvents = <T extends HealthEvent<unknown>>(events: readonly T[]): T[] =>
  events.filter((event) => !isRemoved(event));

/** Care for the pet, not a weigh-in: what "care moments" counts. */
export const isCareMoment = (event: HealthEvent<unknown>): boolean => event.type !== 'BODY_WEIGHT';

/**
 * How many care moments the log holds. Water is saved a cup at a time, so a
 * day's water counts once however many cups it took (and not at all on a
 * day whose cups were all taken back); everything else counts per log.
 */
export const careMomentCount = (events: readonly HealthEvent<unknown>[]): number => {
  const water = new Map<string, number>();
  let count = 0;
  for (const event of events) {
    if (!isCareMoment(event)) continue;
    if (event.type !== 'HYDRATION') {
      count += 1;
      continue;
    }
    const day = new Date(event.occurredAt);
    const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
    const ml = Number((event.metadata as { ml?: unknown } | null)?.ml) || 0;
    water.set(key, (water.get(key) ?? 0) + ml);
  }
  for (const ml of water.values()) if (ml > 0) count += 1;
  return count;
};

export const markRemoved = <T extends HealthEvent<unknown>>(event: T, now: Date = new Date()): T => ({
  ...event,
  metadata: { ...(event.metadata as Record<string, unknown>), removedAt: now.toISOString() },
});

export const restoreRemoved = <T extends HealthEvent<unknown>>(event: T): T => {
  const { removedAt: _removed, ...metadata } = event.metadata as Record<string, unknown>;
  return { ...event, metadata } as T;
};
