import { type HealthEvent, newId, type ScreenTimeMetadata, toDateKey } from '@vitto/core';

/**
 * Pure mapping from raw screen-time readings into Vitto's SCREEN_TIME event.
 * No native calls, so it is fully unit-tested (mobile/src/__tests__/
 * screenTimeMapping.test.tsx) without a device. See mobile/SCREENTIME.md for
 * the platform picture — why iOS can only give thresholds, why Android can
 * give a real total.
 *
 * Privacy is enforced by the shape of the inputs: every function here accepts a
 * single total (or a threshold) and nothing else, so a per-app breakdown cannot
 * leak into an event even by accident. Keep it that way — the Kotlin module
 * returns only a summed number for the same reason.
 */

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_DAY = 24 * 60;

/** Foreground milliseconds → whole minutes, clamped to a day so a bad reading cannot claim 30 hours. */
export const minutesFromForegroundMillis = (millis: number): number => {
  if (!Number.isFinite(millis) || millis <= 0) return 0;
  return Math.min(MINUTES_PER_DAY, Math.round(millis / MS_PER_MINUTE));
};

/**
 * Whether a day stayed inside the budget; undefined when there is no usable
 * budget, so the engine scores the day as a neutral log rather than a verdict.
 */
export const isWithinBudget = (minutes: number, budgetMinutes?: number): boolean | undefined => {
  if (budgetMinutes === undefined || !Number.isFinite(budgetMinutes) || budgetMinutes <= 0) return undefined;
  return minutes <= budgetMinutes;
};

export interface ScreenTimeReading {
  minutes: number;
  /** The day the total is for. Defaults to today. */
  date?: Date;
  source: ScreenTimeMetadata['source'];
  budgetMinutes?: number;
}

/**
 * Builds the event every entry path (manual, Android usage stats, iOS
 * thresholds) funnels through, so budget handling lives in exactly one place.
 * `occurredAt` is "now" rather than the day's start: the pet reacts when the log
 * lands, and `metadata.date` carries which day it describes.
 */
export const buildScreenTimeEvent = (
  userId: string,
  reading: ScreenTimeReading,
  eventSource: HealthEvent['source'],
  now: Date = new Date(),
): HealthEvent<ScreenTimeMetadata> => {
  // Throw rather than coerce: a NaN total is a caller bug (unparsed input, a
  // broken native read), and the one-log-per-day rule would make a silently
  // zeroed event impossible to correct. Callers gate on Number.isFinite first.
  if (!Number.isFinite(reading.minutes)) {
    throw new Error('Screen time must be a number of minutes.');
  }
  const minutes = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(reading.minutes)));
  const hasBudget = isWithinBudget(minutes, reading.budgetMinutes) !== undefined;
  return {
    id: newId(),
    userId,
    occurredAt: now.toISOString(),
    type: 'SCREEN_TIME',
    source: eventSource,
    metadata: {
      minutes,
      date: toDateKey(reading.date ?? now),
      source: reading.source,
      budgetMinutes: hasBudget ? reading.budgetMinutes : undefined,
      withinBudget: isWithinBudget(minutes, reading.budgetMinutes),
    },
  };
};

/** A number the user read off Settings → Screen Time (iOS) or Digital Wellbeing (Android) and typed in. */
export const mapManualScreenTime = (
  userId: string,
  minutes: number,
  budgetMinutes?: number,
  now: Date = new Date(),
): HealthEvent<ScreenTimeMetadata> =>
  buildScreenTimeEvent(userId, { minutes, source: 'manual', budgetMinutes }, 'manual', now);

/** What the Android module hands back: one summed number for one day, nothing per app. */
export interface RawUsageStatsTotal {
  foregroundMillis: number;
  date?: Date;
}

export const mapUsageStatsTotal = (
  userId: string,
  total: RawUsageStatsTotal,
  budgetMinutes?: number,
  now: Date = new Date(),
): HealthEvent<ScreenTimeMetadata> =>
  buildScreenTimeEvent(
    userId,
    { minutes: minutesFromForegroundMillis(total.foregroundMillis), date: total.date, source: 'usage_stats', budgetMinutes },
    'device',
    now,
  );

/**
 * What an iOS DeviceActivityMonitor extension would report when the user
 * crosses a registered threshold (see SCREENTIME.md, Phase 3). The host app
 * never learns the real total, so `minutes` is the threshold itself — a floor —
 * and the day is by definition over budget when the threshold *is* the budget.
 */
export interface RawThresholdCrossing {
  thresholdMinutes: number;
  date?: Date;
}

export const mapThresholdCrossing = (
  userId: string,
  crossing: RawThresholdCrossing,
  now: Date = new Date(),
): HealthEvent<ScreenTimeMetadata> => {
  const event = buildScreenTimeEvent(
    userId,
    { minutes: crossing.thresholdMinutes, date: crossing.date, source: 'thresholds', budgetMinutes: crossing.thresholdMinutes },
    'device',
    now,
  );
  // Crossing means strictly more than the threshold was used, which the
  // `<=` in isWithinBudget cannot express from the floor alone.
  return { ...event, metadata: { ...event.metadata, withinBudget: false } };
};

/**
 * The SCREEN_TIME event already logged for a day, if any — the "one log per
 * day" check, keyed on `metadata.date` so a total typed in after midnight is
 * still found under the day it describes. Events without a date fall back to
 * the day they were recorded.
 */
export const findScreenTimeForDate = (
  events: readonly HealthEvent[],
  date: Date,
): HealthEvent<ScreenTimeMetadata> | undefined => {
  const key = toDateKey(date);
  return events.find((event): event is HealthEvent<ScreenTimeMetadata> => {
    if (event.type !== 'SCREEN_TIME') return false;
    const logged = (event.metadata as ScreenTimeMetadata | undefined)?.date ?? toDateKey(new Date(event.occurredAt));
    return logged === key;
  });
};
