/**
 * How a day's screen time is graded.
 *
 * A single user-set budget answered only "over or under", which made every day
 * either a win or a nothing. Bands give the same log a shape: two hours reads
 * differently from nine, without either being a punishment.
 *
 * The boundaries double as the thresholds an iOS `DeviceActivityMonitor` would
 * register (see mobile/SCREENTIME.md). That platform can never report an exact
 * total — only that a registered threshold was crossed — so a design built on
 * bands is one iOS can actually deliver, where "exact minutes" is not.
 */

export type ScreenTimeBandId = 'light' | 'moderate' | 'heavy' | 'excessive';

export interface ScreenTimeBand {
  id: ScreenTimeBandId;
  /** Highest minute total still in this band. The last band is open-ended. */
  ceilingMinutes: number;
  /** How the day is described back to the user. Never a rebuke. */
  verdict: string;
}

/**
 * Ordered lightest first. `Infinity` on the last band is deliberate: a day can
 * always be longer, and a lookup that can fall off the end is a bug waiting for
 * whoever logs 25 hours by fat-fingering the minutes field.
 */
export const SCREEN_TIME_BANDS: readonly ScreenTimeBand[] = [
  { id: 'light', ceilingMinutes: 2 * 60, verdict: 'a good day' },
  { id: 'moderate', ceilingMinutes: 4 * 60, verdict: 'fine' },
  { id: 'heavy', ceilingMinutes: 6 * 60, verdict: 'pushing it' },
  { id: 'excessive', ceilingMinutes: Number.POSITIVE_INFINITY, verdict: 'a lot' },
];

/**
 * The minute marks worth registering as iOS DeviceActivity thresholds: each
 * band boundary, plus 8h so the heaviest band still has resolution inside it.
 * The highest crossed mark is a floor on the day's total, never the total.
 */
export const SCREEN_TIME_THRESHOLD_MINUTES: readonly number[] = [2 * 60, 4 * 60, 6 * 60, 8 * 60];

/** Treats anything unusable as zero rather than letting NaN pick a band at random. */
export const getScreenTimeBand = (minutes: number): ScreenTimeBand => {
  const safe = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  return SCREEN_TIME_BANDS.find((band) => safe <= band.ceilingMinutes) ?? SCREEN_TIME_BANDS[SCREEN_TIME_BANDS.length - 1];
};
