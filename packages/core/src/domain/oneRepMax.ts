/**
 * The one-rep-max estimate, on its own so that the ranks (strengthRanks) and
 * the limits that judge a set (workoutLimits) can both use it without
 * importing each other.
 */

/** Sets with more reps than this say little about a one-rep max. */
const MAX_REPS_FOR_ESTIMATE = 10;

/** Epley's estimate of a one-rep max from a set. */
export const estimatedOneRepMax = (weight: number, reps: number): number =>
  reps <= 1 ? weight : weight * (1 + Math.min(reps, MAX_REPS_FOR_ESTIMATE) / 30);
