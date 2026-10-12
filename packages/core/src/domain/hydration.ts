import type { HealthEvent, HydrationMetadata } from './health';
import type { MeasurementSystem } from './macroTargets';
import { isSameDay } from './nutritionSummary';

/** What the day's water aims for: eight cups, the familiar rule of thumb. */
export const WATER_GOAL_ML = 2000;
/** One cup on the tracker's row, and what its + and − add or take away. Eight make the goal. */
export const WATER_CUP_ML = 250;
const ML_PER_FL_OZ = 29.5735;

/**
 * An entry's amount. Negative is the tracker's − taking a cup back. Entries
 * from before amounts existed were all one 250 mL glass.
 */
export const waterMlOf = (event: HealthEvent): number => {
  const ml = (event.metadata as Partial<HydrationMetadata> | undefined)?.ml;
  return typeof ml === 'number' && Number.isFinite(ml) && ml !== 0 ? ml : WATER_CUP_ML;
};

/**
 * The day's water, entry by entry in time order. A cup taken back never takes
 * the total below zero, so a later cup is counted from nothing, not from a debt.
 */
const waterDay = (events: readonly HealthEvent[], day: Date): { total: number; peak: number } => {
  let total = 0;
  let peak = 0;
  const entries = events
    .filter((event) => event.type === 'HYDRATION' && isSameDay(event.occurredAt, day))
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  for (const event of entries) {
    total = Math.max(0, total + waterMlOf(event));
    peak = Math.max(peak, total);
  }
  return { total, peak };
};

/** Water logged on the calendar day of `day`, in mL, after any cups taken back. */
export const waterMlForDay = (events: readonly HealthEvent[], day: Date = new Date()): number =>
  waterDay(events, day).total;

/**
 * The most the day's total has stood at, in mL. The pet is only paid for water
 * above this, so taking a cup back and adding it again earns nothing twice.
 */
export const waterPeakMlForDay = (events: readonly HealthEvent[], day: Date = new Date()): number =>
  waterDay(events, day).peak;

/**
 * Whether `event` is the drink that first takes the day to the goal: the one
 * moment water is worth anything to the pet. `history` must not include it.
 */
export const waterReachesGoal = (history: readonly HealthEvent[], event: HealthEvent): boolean => {
  if (event.type !== 'HYDRATION') return false;
  const ml = waterMlOf(event);
  const day = new Date(event.occurredAt);
  const { total, peak } = waterDay(history, day);
  return ml > 0 && peak < WATER_GOAL_ML && total + ml >= WATER_GOAL_ML;
};

/** "1.25 L" or "42 fl oz". Under a litre, metric reads in mL. */
export const formatWater = (ml: number, system: MeasurementSystem): string => {
  if (system === 'imperial') return `${Math.round(ml / ML_PER_FL_OZ)} fl oz`;
  if (ml < 1000) return `${Math.round(ml)} mL`;
  return `${Math.round(ml / 10) / 100} L`;
};
