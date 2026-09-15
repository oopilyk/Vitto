import type { HealthEvent, WeightUnit, WorkoutMetadata } from './health';
import { convertWeightValue } from './macroTargets';

/**
 * Personal records: the heaviest set ever ticked on each of the big lifts.
 *
 * Read straight off the workout log, never stored — a PR is a fact about the
 * history, so it comes back after a reload, follows a deleted workout down, and
 * cannot drift from what was actually lifted. Matched by exercise name against
 * the picker's own names, so a lift logged from a routine and one added by hand
 * land on the same record.
 *
 * "Heaviest set" is the record, not an estimated one-rep max: it is the number
 * the lifter remembers pulling, and it needs no formula to argue with. Reps and
 * the date ride along so a tie at the same weight goes to the set with more
 * reps, and so the card can say when it happened.
 */

/** The lifts worth a tile. Display order. Names are `exerciseLibrary`'s. */
export const BIG_LIFTS: readonly string[] = ['Bench Press', 'Squat', 'Deadlift', 'Lat Pulldown'];

export interface LiftRecord {
  /** Heaviest weight ticked, in `unit`. */
  weight: number;
  reps: number;
  /** ISO timestamp of the workout it happened in. */
  occurredAt: string;
}

export interface PersonalRecord {
  exercise: string;
  /** Null until the lift has been logged with a weight. */
  record: LiftRecord | null;
}

const beats = (candidate: LiftRecord, current: LiftRecord | null): boolean =>
  current === null ||
  candidate.weight > current.weight ||
  (candidate.weight === current.weight && candidate.reps > current.reps);

/**
 * One entry per big lift, in `BIG_LIFTS` order, with the heaviest completed set
 * on record converted into `unit`. Only ticked sets with a real weight count: an
 * unticked row is a plan, not a lift, and a bodyweight set has no weight to rank.
 */
export const personalRecords = (
  events: readonly HealthEvent[],
  unit: WeightUnit,
  lifts: readonly string[] = BIG_LIFTS,
): PersonalRecord[] => {
  const best = new Map<string, LiftRecord | null>(lifts.map((lift) => [lift, null]));
  for (const event of events) {
    if (event.type !== 'WORKOUT') continue;
    const { exercises } = event.metadata as WorkoutMetadata;
    for (const exercise of exercises ?? []) {
      if (!best.has(exercise.name)) continue;
      for (const set of exercise.sets) {
        if (!set.completed || !set.weight || set.weight <= 0) continue;
        const weight = Math.round(convertWeightValue(set.weight, set.unit ?? 'kg', unit) * 10) / 10;
        const candidate = { weight, reps: Math.max(0, set.reps), occurredAt: event.occurredAt };
        if (beats(candidate, best.get(exercise.name) ?? null)) best.set(exercise.name, candidate);
      }
    }
  }
  return lifts.map((exercise) => ({ exercise, record: best.get(exercise) ?? null }));
};
