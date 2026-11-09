import type { HealthEvent } from './health';
import { isRemoved } from './removedEvents';

/**
 * Weigh-ins: a BODY_WEIGHT event each, in kilograms. Private body data: never
 * run through the pet engine, a care partner's log or a friend's view.
 */
export interface WeightMetadata {
  kg: number;
}

export interface WeighIn {
  id: string;
  at: string;
  kg: number;
  /** The smoothed weight as of this weigh-in (see `weightTrend`). */
  trendKg: number;
}

/** A day's weight swings a kilo or more with water and food; this much of each new reading moves the trend. */
const TREND_WEIGHT = 0.25;

/**
 * Every weigh-in, oldest first, each with the trend up to it: an exponential
 * average, the way weight apps show it, so one salty dinner reads as noise
 * and a month of change reads as change.
 */
export const weighIns = (events: readonly HealthEvent[]): WeighIn[] => {
  const entries = events
    .filter((event) => event.type === 'BODY_WEIGHT' && !isRemoved(event))
    .map((event) => ({ id: event.id, at: event.occurredAt, kg: (event.metadata as WeightMetadata).kg }))
    .filter((entry) => Number.isFinite(entry.kg) && entry.kg > 0)
    .sort((a, b) => a.at.localeCompare(b.at));
  let trend: number | null = null;
  return entries.map((entry) => {
    trend = trend === null ? entry.kg : trend + TREND_WEIGHT * (entry.kg - trend);
    return { ...entry, trendKg: Math.round(trend * 100) / 100 };
  });
};

export interface WeightSummary {
  latest: WeighIn | null;
  /** Trend now less the trend about 30 days ago (or at the first weigh-in after it). Null under two weigh-ins. */
  change30: number | null;
  /** Kilograms from the trend to the goal: negative to lose, positive to gain. Null without a goal. */
  toGoal: number | null;
  /** Whole days since the last weigh-in. */
  daysSince: number | null;
}

export const weightSummary = (entries: readonly WeighIn[], goalKg: number | undefined, now: Date = new Date()): WeightSummary => {
  const latest = entries.at(-1) ?? null;
  if (!latest) return { latest: null, change30: null, toGoal: null, daysSince: null };
  const monthAgo = now.getTime() - 30 * 86_400_000;
  const base = entries.find((entry) => Date.parse(entry.at) >= monthAgo) ?? entries[0]!;
  return {
    latest,
    change30: entries.length > 1 && base.id !== latest.id ? Math.round((latest.trendKg - base.trendKg) * 10) / 10 : null,
    toGoal: goalKg === undefined ? null : Math.round((goalKg - latest.trendKg) * 10) / 10,
    daysSince: Math.floor((now.getTime() - Date.parse(latest.at)) / 86_400_000),
  };
};

/** A weigh-in a person could stand on a scale for: 20 to 400 kg. */
export const plausibleWeighIn = (kg: number): boolean => Number.isFinite(kg) && kg >= 20 && kg <= 400;
