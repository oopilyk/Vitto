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

export const markRemoved = <T extends HealthEvent<unknown>>(event: T, now: Date = new Date()): T => ({
  ...event,
  metadata: { ...(event.metadata as Record<string, unknown>), removedAt: now.toISOString() },
});

export const restoreRemoved = <T extends HealthEvent<unknown>>(event: T): T => {
  const { removedAt: _removed, ...metadata } = event.metadata as Record<string, unknown>;
  return { ...event, metadata } as T;
};
