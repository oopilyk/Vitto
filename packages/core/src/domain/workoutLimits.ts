import type { WorkoutExercise, WorkoutSet } from './health';
import { convertWeightValue } from './macroTargets';
import { estimatedOneRepMax } from './oneRepMax';

/**
 * How far a logged workout can go before it is a typo.
 *
 * Testers logged 1102 lb for 8, 99999 lb for 9999, and 100 miles in a minute.
 * Each was saved, and the lift became a permanent "Grand Champion" record that
 * the next session then prefilled. Two lines for each number: past `usual` the
 * lifter is asked whether they meant it (a strong lifter is real), past `max`
 * it cannot be a human doing it and is refused.
 *
 * Lifts are judged by the estimated one-rep max, not the bare weight: 500 kg
 * once is a world record, 500 kg for eight is not anyone.
 */
export const WORKOUT_LIMITS = {
  oneRepMaxKg: { usual: 350, max: 600 },
  reps: { usual: 100, max: 1000 },
  minutes: { usual: 300, max: 24 * 60 },
  distanceKm: { usual: 100, max: 500 },
} as const;

/** Average speed over a whole session, km/h: about elite pace to asked, past any human to refused. */
const SPEED_KMH: Record<string, { usual: number; max: number }> = {
  Running: { usual: 25, max: 45 },
  Walking: { usual: 9, max: 16 },
  Cycling: { usual: 50, max: 110 },
  Rowing: { usual: 22, max: 30 },
  Elliptical: { usual: 25, max: 45 },
  'Stair Climber': { usual: 10, max: 20 },
  Swimming: { usual: 7, max: 10 },
};
const DEFAULT_SPEED_KMH = { usual: 50, max: 110 };

const setOneRepMaxKg = (set: Pick<WorkoutSet, 'weight' | 'reps' | 'unit'>): number =>
  set.weight && set.weight > 0 ? estimatedOneRepMax(convertWeightValue(set.weight, set.unit ?? 'kg', 'kg'), set.reps) : 0;

/**
 * Whether a set could be real. PRs, strength ranks and next session's
 * prefill skip any that cannot, so a typo already in the log stops counting.
 */
export const plausibleSet = (set: Pick<WorkoutSet, 'weight' | 'reps' | 'unit'>): boolean =>
  set.reps <= WORKOUT_LIMITS.reps.max && setOneRepMaxKg(set) <= WORKOUT_LIMITS.oneRepMaxKg.max;

/** Whether a run, ride or swim could be real: its distance, and its average speed. */
export const plausibleDistance = (exercise: string | undefined, distanceKm: number, minutes: number): boolean => {
  if (distanceKm > WORKOUT_LIMITS.distanceKm.max) return false;
  if (!(minutes > 0) || !(distanceKm > 0)) return true;
  const speed = SPEED_KMH[exercise ?? ''] ?? DEFAULT_SPEED_KMH;
  return distanceKm / (minutes / 60) <= speed.max;
};

export interface WorkoutCheck {
  /** `confirm`: ask before saving. `refuse`: it cannot be saved as typed. */
  level: 'confirm' | 'refuse';
  message: string;
}

/**
 * The first number in a session that needs a second look, or null. Refusals
 * come before questions, so one typo is never waved through by answering
 * "yes" to a smaller one.
 */
export const checkWorkout = ({
  exercises,
  durationMinutes,
  distanceKm,
}: {
  exercises: readonly WorkoutExercise[];
  durationMinutes: number;
  distanceKm?: number;
}): WorkoutCheck | null => {
  const asks: WorkoutCheck[] = [];
  const sets = exercises.flatMap((exercise) => exercise.sets.map((set) => ({ exercise: exercise.name, set })));

  for (const { exercise, set } of sets) {
    if (set.reps > WORKOUT_LIMITS.reps.max) return { level: 'refuse', message: `${set.reps} reps of ${exercise} can't be right. Check the set.` };
    if (setOneRepMaxKg(set) > WORKOUT_LIMITS.oneRepMaxKg.max) {
      return { level: 'refuse', message: `${set.weight} ${set.unit ?? 'kg'} × ${set.reps} on ${exercise} is past any world record. Check the weight.` };
    }
    if (set.reps > WORKOUT_LIMITS.reps.usual) asks.push({ level: 'confirm', message: `${set.reps} reps of ${exercise} in one set?` });
    else if (setOneRepMaxKg(set) > WORKOUT_LIMITS.oneRepMaxKg.usual) {
      asks.push({ level: 'confirm', message: `${set.weight} ${set.unit ?? 'kg'} × ${set.reps} on ${exercise}? That's elite.` });
    }
  }

  if (durationMinutes > WORKOUT_LIMITS.minutes.max) return { level: 'refuse', message: 'A session can be 24 hours at most. Check the time.' };
  if (durationMinutes > WORKOUT_LIMITS.minutes.usual) asks.push({ level: 'confirm', message: `${durationMinutes} minutes in one session?` });

  if (distanceKm !== undefined && distanceKm > 0) {
    const moving = exercises.find((exercise) => exercise.distance)?.name ?? exercises[0]?.name;
    if (!plausibleDistance(moving, distanceKm, durationMinutes)) {
      return { level: 'refuse', message: "That distance and time aren't possible together. Check both." };
    }
    const speed = SPEED_KMH[moving ?? ''] ?? DEFAULT_SPEED_KMH;
    if (distanceKm > WORKOUT_LIMITS.distanceKm.usual) asks.push({ level: 'confirm', message: 'Over 100 km in one session?' });
    else if (durationMinutes > 0 && distanceKm / (durationMinutes / 60) > speed.usual) {
      asks.push({ level: 'confirm', message: "That's faster than most elite athletes. Is the time right?" });
    }
  }

  return asks[0] ?? null;
};
