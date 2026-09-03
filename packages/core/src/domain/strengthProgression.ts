import type { HealthEvent, WorkoutMetadata, WorkoutStats } from './health';
import type { PetState } from './pet';

/**
 * How strength is earned from a workout.
 *
 * The old model paid out on completed-set COUNT and a flat per-muscle-group
 * bonus. This one is volume-driven (weight×reps) and, crucially, *relative to
 * the user's own recent training*: a workout is scored against a rolling
 * baseline of what they have been lifting for that muscle group. Beating the
 * baseline (progressive overload) earns the most; matching it earns
 * maintenance; well below it earns little. Gains also shrink as a stat nears
 * 100, so the last stretch is the hardest.
 */

/** The three trained axes a pet tracks separately, alongside overall `strength`. */
export type StrengthAxis = 'push' | 'pull' | 'legs';

const MUSCLE_GROUP_AXIS: Record<string, StrengthAxis> = {
  chest: 'push',
  shoulders: 'push',
  triceps: 'push',
  back: 'pull',
  lats: 'pull',
  biceps: 'pull',
  legs: 'legs',
  quads: 'legs',
  hamstrings: 'legs',
  glutes: 'legs',
  calves: 'legs',
};

/** Maps a raw muscle-group label to its push/pull/legs axis, or `null` (e.g. core, cardio). */
export const axisForMuscleGroup = (muscleGroup: string): StrengthAxis | null =>
  MUSCLE_GROUP_AXIS[muscleGroup.trim().toLowerCase()] ?? null;

// --- Tunables -------------------------------------------------------------

/** Reps-only fallback: one bodyweight rep counts as this many kg of loaded volume. */
const BODYWEIGHT_REP_VOLUME_KG = 4;
/** When bodyweight is known, the fraction of body mass a typical bodyweight rep moves. */
const BODYWEIGHT_LOAD_FRACTION = 0.5;

/** Rolling baseline looks back this far and over at most this many workouts. */
const BASELINE_WINDOW_DAYS = 14;
const BASELINE_MAX_WORKOUTS = 6;
const MS_PER_DAY = 86_400_000;

/** Volume ÷ baseline at or above this is progressive overload; at or below the other is underperforming. */
const OVERLOAD_RATIO = 1.15;
const UNDERLOAD_RATIO = 0.85;
/** Overload reward stops climbing once volume is this multiple of baseline. */
const OVERLOAD_CAP_RATIO = 2;

/** Base gain (before diminishing returns) for maintenance, full overload, and a first-ever workout. */
const GAIN_MAINTENANCE = 3;
const GAIN_OVERLOAD = 6;
const GAIN_FIRST_WORKOUT = 4;

/** Higher = gains fall off faster as the stat approaches 100. */
const DIMINISHING_EXPONENT = 1.3;
/** Above this a stat only creeps, even on overload. */
const NEAR_MAX_STAT = 99;

// --- Volume -------------------------------------------------------------

/** Effective training volume for one workout, per axis plus a `total`. */
export interface AxisVolumes {
  push: number;
  pull: number;
  legs: number;
  total: number;
}

const AXES: readonly (keyof AxisVolumes)[] = ['push', 'pull', 'legs', 'total'];

const emptyVolumes = (): AxisVolumes => ({ push: 0, pull: 0, legs: 0, total: 0 });

const bodyweightVolume = (reps: number, bodyWeightKg?: number): number => {
  if (reps <= 0) return 0;
  if (bodyWeightKg && bodyWeightKg > 0) return reps * bodyWeightKg * BODYWEIGHT_LOAD_FRACTION;
  return reps * BODYWEIGHT_REP_VOLUME_KG;
};

/**
 * Effective volume for a single workout, attributed to push/pull/legs. Bodyweight
 * work contributes through reps (scaled by `bodyWeightKg` when supplied). Falls
 * back to `totalVolume` for legacy stats that lack the per-group breakdown.
 */
export const workoutAxisVolumes = (
  stats: WorkoutStats | undefined,
  bodyWeightKg?: number,
): AxisVolumes => {
  const volumes = emptyVolumes();
  if (!stats) return volumes;

  const loaded = stats.volumeByMuscleGroup ?? {};
  const bodyweightReps = stats.bodyweightRepsByMuscleGroup ?? {};
  const groups = new Set([...Object.keys(loaded), ...Object.keys(bodyweightReps)]);

  for (const group of groups) {
    const volume = (loaded[group] ?? 0) + bodyweightVolume(bodyweightReps[group] ?? 0, bodyWeightKg);
    if (volume <= 0) continue;
    volumes.total += volume;
    const axis = axisForMuscleGroup(group);
    if (axis) volumes[axis] += volume;
  }

  if (volumes.total === 0 && stats.totalVolume > 0) volumes.total = stats.totalVolume;
  return volumes;
};

// --- Baseline -------------------------------------------------------------

/** A rolling baseline: trailing average volume per axis, plus how many workouts fed it. */
export interface StrengthBaseline extends AxisVolumes {
  sampleCount: number;
}

const workoutEventsBefore = (history: HealthEvent[], before: Date): WorkoutMetadata[] => {
  const cutoff = before.getTime() - BASELINE_WINDOW_DAYS * MS_PER_DAY;
  return history
    .filter((entry) => entry.type === 'WORKOUT')
    .map((entry) => ({ at: new Date(entry.occurredAt).getTime(), meta: entry.metadata as unknown as WorkoutMetadata }))
    .filter((entry) => Number.isFinite(entry.at) && entry.at >= cutoff && entry.at < before.getTime())
    .sort((a, b) => b.at - a.at)
    .slice(0, BASELINE_MAX_WORKOUTS)
    .map((entry) => entry.meta);
};

/**
 * Trailing average volume per axis over recent workouts (last
 * {@link BASELINE_WINDOW_DAYS} days, at most {@link BASELINE_MAX_WORKOUTS}).
 * Only workouts that actually trained an axis count toward that axis's average.
 */
export const rollingStrengthBaseline = (
  history: HealthEvent[],
  before: Date,
  bodyWeightKg?: number,
): StrengthBaseline => {
  const workouts = workoutEventsBefore(history, before);
  const sums = emptyVolumes();
  const counts = emptyVolumes();

  for (const workout of workouts) {
    const volumes = workoutAxisVolumes(workout.stats, bodyWeightKg);
    for (const axis of AXES) {
      if (volumes[axis] <= 0) continue;
      sums[axis] += volumes[axis];
      counts[axis] += 1;
    }
  }

  const average = (axis: keyof AxisVolumes): number => (counts[axis] > 0 ? sums[axis] / counts[axis] : 0);
  return {
    push: average('push'),
    pull: average('pull'),
    legs: average('legs'),
    total: average('total'),
    sampleCount: workouts.length,
  };
};

// --- Scoring -------------------------------------------------------------

const baseGainForRatio = (volume: number, baseline: number, hasBaseline: boolean): number => {
  if (volume <= 0) return 0;
  if (!hasBaseline) return GAIN_FIRST_WORKOUT;

  const ratio = volume / baseline;
  if (ratio >= OVERLOAD_RATIO) {
    const progress = Math.min(1, (ratio - OVERLOAD_RATIO) / (OVERLOAD_CAP_RATIO - OVERLOAD_RATIO));
    return GAIN_MAINTENANCE + progress * (GAIN_OVERLOAD - GAIN_MAINTENANCE);
  }
  if (ratio <= UNDERLOAD_RATIO) {
    return (ratio / UNDERLOAD_RATIO) * GAIN_MAINTENANCE;
  }
  return GAIN_MAINTENANCE;
};

/** Multiplier in [0, 1] that shrinks a gain as the stat nears 100. */
export const diminishingReturnsFactor = (currentStat: number): number => {
  const headroom = Math.max(0, (100 - currentStat) / 100);
  return headroom ** DIMINISHING_EXPONENT;
};

/**
 * Integer strength points a workout adds to one stat: base gain from
 * volume-vs-baseline, then diminishing returns near 100. A genuine overload
 * always nudges the stat up by at least 1 until it is nearly maxed.
 */
export const strengthGain = (
  currentStat: number,
  volume: number,
  baseline: number,
  hasBaseline: boolean,
): number => {
  const base = baseGainForRatio(volume, baseline, hasBaseline);
  if (base <= 0) return 0;

  const scaled = base * diminishingReturnsFactor(currentStat);
  const isOverload = hasBaseline && baseline > 0 && volume / baseline >= OVERLOAD_RATIO;
  const floor = isOverload && currentStat < NEAR_MAX_STAT ? 1 : 0;
  return Math.max(floor, Math.round(scaled));
};

// --- Public entry point -------------------------------------------------------------

/** Recent history and body weight used to score a workout relative to the user's baseline. */
export interface WorkoutStrengthContext {
  /** Prior health events (workouts are picked out); the current event must NOT be included. */
  history?: HealthEvent[];
  /** The user's body weight in kg, if known — scales bodyweight-exercise volume. */
  bodyWeightKg?: number;
  /** ISO timestamp of the workout being scored. */
  occurredAt: string;
}

/** The four strength stats a workout moves. */
export type WorkoutStrengthDelta = Pick<
  PetState,
  'strength' | 'pushingStrength' | 'pullingStrength' | 'legStrength'
>;

/**
 * Strength points a completed strength workout awards, relative to the user's
 * rolling baseline and with diminishing returns near 100. With no usable
 * history every trained axis gets the modest first-workout gain.
 */
export const workoutStrengthDelta = (
  pet: WorkoutStrengthDelta,
  stats: WorkoutStats | undefined,
  context: WorkoutStrengthContext,
): WorkoutStrengthDelta => {
  const { bodyWeightKg } = context;
  const volumes = workoutAxisVolumes(stats, bodyWeightKg);
  const baseline = rollingStrengthBaseline(context.history ?? [], new Date(context.occurredAt), bodyWeightKg);
  const hasHistory = baseline.sampleCount > 0;

  const gainFor = (current: number, volume: number, axisBaseline: number): number =>
    strengthGain(current, volume, axisBaseline, hasHistory && axisBaseline > 0);

  return {
    strength: gainFor(pet.strength, volumes.total, baseline.total),
    pushingStrength: gainFor(pet.pushingStrength, volumes.push, baseline.push),
    pullingStrength: gainFor(pet.pullingStrength, volumes.pull, baseline.pull),
    legStrength: gainFor(pet.legStrength, volumes.legs, baseline.legs),
  };
};
