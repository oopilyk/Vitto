import type { HealthEvent, WorkoutMetadata } from './health';
import type { BodyProfile } from './macroTargets';
import { convertWeightValue } from './macroTargets';
import { estimatedOneRepMax } from './oneRepMax';
import { plausibleSet } from './workoutLimits';

/**
 * Strength ranks: how strong each lift is for the person lifting it, as a rank
 * a gamer would recognise, and which muscles that lights up on the body map.
 *
 * A lift is scored by its best ESTIMATED one-rep max (Epley, from any completed
 * set of up to 10 reps) as a multiple of bodyweight, against standards set
 * separately for men and women. The thresholds sit where published strength
 * standards put beginner -> elite, spread over seven ranks, so Grand Champion
 * is genuinely rare: a 315 lb bench at 180 lb bodyweight is 1.75x, which is
 * where it starts.
 *
 * Read off the workout log, never stored -- like personal records.
 */

export const STRENGTH_TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Champion', 'Grand Champion'] as const;
export type StrengthTier = (typeof STRENGTH_TIERS)[number];

export type StandardLift = 'bench' | 'squat' | 'deadlift' | 'ohp' | 'row' | 'curl';

export const STANDARD_LIFT_LABEL: Record<StandardLift, string> = {
  bench: 'Bench press',
  squat: 'Squat',
  deadlift: 'Deadlift',
  ohp: 'Overhead press',
  row: 'Row',
  curl: 'Curl',
};

/**
 * Bodyweight multiples (estimated 1RM / bodyweight) at which each tier starts,
 * for men, Bronze -> Grand Champion.
 */
const MALE_STANDARDS: Record<StandardLift, readonly number[]> = {
  bench: [0.5, 0.75, 1.0, 1.25, 1.45, 1.6, 1.75],
  squat: [0.75, 1.0, 1.25, 1.55, 1.9, 2.2, 2.5],
  deadlift: [1.0, 1.25, 1.55, 1.9, 2.25, 2.6, 2.9],
  ohp: [0.35, 0.5, 0.65, 0.8, 0.95, 1.05, 1.15],
  row: [0.5, 0.65, 0.8, 1.0, 1.2, 1.35, 1.5],
  curl: [0.25, 0.35, 0.45, 0.55, 0.7, 0.8, 0.9],
};

/** Women's standards as a share of men's: upper-body lifts sit lower than lower-body ones. */
const FEMALE_SHARE: Record<StandardLift, number> = {
  bench: 0.68,
  squat: 0.78,
  deadlift: 0.8,
  ohp: 0.65,
  row: 0.68,
  curl: 0.62,
};

/**
 * Which logged exercises count toward each lift, and how a variation converts
 * to the barbell lift the standards are for. A dumbbell's number is one hand's
 * dumbbell; a leg press moves far more than a squat; and so on.
 */
const LIFT_SOURCES: Record<StandardLift, Record<string, number>> = {
  bench: {
    'Bench Press': 1,
    'Close-Grip Bench Press': 1.1,
    'Incline Bench Press': 1.15,
    'Dumbbell Bench Press': 2.4,
    'Incline Dumbbell Press': 2.6,
    'Machine Chest Press': 0.85,
    'Decline Bench Press': 0.9,
    'Smith Machine Bench Press': 0.9,
  },
  squat: { Squat: 1, 'Front Squat': 1.2, 'Leg Press': 0.4, 'Hack Squat': 0.7, 'Smith Machine Squat': 0.85 },
  deadlift: { Deadlift: 1, 'Sumo Deadlift': 1, 'Romanian Deadlift': 1.3, 'Trap Bar Deadlift': 0.9, 'Stiff-Leg Deadlift': 1.3 },
  ohp: { 'Shoulder Press': 1, 'Dumbbell Shoulder Press': 2.3, 'Arnold Press': 2.4, 'Machine Shoulder Press': 0.85, 'Push Press': 0.8 },
  row: { 'Barbell Row': 1, 'T-Bar Row': 1, 'Seated Cable Row': 0.9, 'Dumbbell Row': 1.6, 'Lat Pulldown': 0.85, 'Pendlay Row': 1, 'Seal Row': 1.1 },
  curl: {
    'EZ Bar Curl': 1,
    'Bicep Curl': 1.8,
    'Hammer Curl': 1.7,
    'Preacher Curl': 1.2,
    'Cable Curl': 1.1,
    'Bayesian Curl': 1.15,
    'Spider Curl': 1.25,
    'Concentration Curl': 1.9,
  },
};


export interface LiftScore {
  lift: StandardLift;
  /** Best estimated 1RM as the barbell lift, in kg. Null when it has not been logged. */
  oneRepMaxKg: number | null;
  /** The exercise and set it came from, for "from your 100 kg x 5 bench". */
  from: { exercise: string; weight: number; unit: 'kg' | 'lb'; reps: number } | null;
  /** oneRepMaxKg / bodyweight. */
  ratio: number | null;
  /** Index into STRENGTH_TIERS; null below Bronze or unlogged. */
  tier: number | null;
  /** The next tier's 1RM in kg, or null at the top. */
  nextTierKg: number | null;
}

const standardsFor = (lift: StandardLift, sex: BodyProfile['sex']): number[] => {
  const share = sex === 'female' ? FEMALE_SHARE[lift] : sex === 'male' ? 1 : (1 + FEMALE_SHARE[lift]) / 2;
  return MALE_STANDARDS[lift].map((multiple) => multiple * share);
};

/** The best estimated one-rep max for every standard lift, from the workout log. */
export const liftScores = (events: readonly HealthEvent[], profile: Pick<BodyProfile, 'sex' | 'weightKg'>): LiftScore[] => {
  const best = new Map<StandardLift, { kg: number; from: NonNullable<LiftScore['from']> }>();
  for (const event of events) {
    if (event.type !== 'WORKOUT') continue;
    for (const exercise of (event.metadata as WorkoutMetadata).exercises ?? []) {
      for (const lift of Object.keys(LIFT_SOURCES) as StandardLift[]) {
        const factor = LIFT_SOURCES[lift][exercise.name];
        if (!factor) continue;
        for (const set of exercise.sets) {
          if (!set.completed || !set.weight || set.weight <= 0 || set.reps <= 0 || !plausibleSet(set)) continue;
          const unit = set.unit ?? 'kg';
          const kg = estimatedOneRepMax(convertWeightValue(set.weight, unit, 'kg'), set.reps) * factor;
          if (kg > (best.get(lift)?.kg ?? 0)) {
            best.set(lift, { kg, from: { exercise: exercise.name, weight: set.weight, unit, reps: set.reps } });
          }
        }
      }
    }
  }
  const bodyweight = Math.max(30, profile.weightKg);
  return (Object.keys(LIFT_SOURCES) as StandardLift[]).map((lift) => {
    const found = best.get(lift);
    if (!found) return { lift, oneRepMaxKg: null, from: null, ratio: null, tier: null, nextTierKg: null };
    const ratio = found.kg / bodyweight;
    const standards = standardsFor(lift, profile.sex);
    let tier: number | null = null;
    standards.forEach((threshold, index) => {
      if (ratio >= threshold) tier = index;
    });
    const nextIndex = tier === null ? 0 : (tier as number) + 1;
    return {
      lift,
      oneRepMaxKg: Math.round(found.kg * 10) / 10,
      from: found.from,
      ratio: Math.round(ratio * 100) / 100,
      tier,
      nextTierKg: nextIndex < standards.length ? Math.round(standards[nextIndex]! * bodyweight * 10) / 10 : null,
    };
  });
};

export interface LiftPoint {
  occurredAt: string;
  /** The workout's best estimated one-rep max, as the barbell lift, in kg. */
  oneRepMaxKg: number;
  /** The set it came from. */
  from: NonNullable<LiftScore['from']>;
}

/**
 * A lift's estimated one-rep max over time: one point per workout that
 * trained it (its best set), oldest first. Uses the same estimate and the
 * same variation conversions as `liftScores`, so the graph and the rank
 * always agree.
 */
export const liftHistory = (events: readonly HealthEvent[], lift: StandardLift): LiftPoint[] => {
  const points: LiftPoint[] = [];
  for (const event of events) {
    if (event.type !== 'WORKOUT') continue;
    let best: LiftPoint | null = null;
    for (const exercise of (event.metadata as WorkoutMetadata).exercises ?? []) {
      const factor = LIFT_SOURCES[lift][exercise.name];
      if (!factor) continue;
      for (const set of exercise.sets) {
        if (!set.completed || !set.weight || set.weight <= 0 || set.reps <= 0 || !plausibleSet(set)) continue;
        const unit = set.unit ?? 'kg';
        const kg = estimatedOneRepMax(convertWeightValue(set.weight, unit, 'kg'), set.reps) * factor;
        if (!best || kg > best.oneRepMaxKg) {
          best = { occurredAt: event.occurredAt, oneRepMaxKg: kg, from: { exercise: exercise.name, weight: set.weight, unit, reps: set.reps } };
        }
      }
    }
    if (best) points.push({ ...best, oneRepMaxKg: Math.round(best.oneRepMaxKg * 10) / 10 });
  }
  return points.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
};

/** Each tier's starting 1RM for this lift, in kg, at this bodyweight (Bronze -> Grand Champion). */
export const tierThresholdsKg = (lift: StandardLift, profile: Pick<BodyProfile, 'sex' | 'weightKg'>): number[] =>
  standardsFor(lift, profile.sex).map((multiple) => Math.round(multiple * Math.max(30, profile.weightKg) * 10) / 10);

export type MuscleGroup = 'chest' | 'shoulders' | 'triceps' | 'biceps' | 'upperBack' | 'lowerBack' | 'glutes' | 'hamstrings' | 'quads';

export const MUSCLE_GROUP_LABEL: Record<MuscleGroup, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  triceps: 'Triceps',
  biceps: 'Biceps',
  upperBack: 'Upper back',
  lowerBack: 'Lower back',
  glutes: 'Glutes',
  hamstrings: 'Hamstrings',
  quads: 'Quads',
};

/** Which lifts grade each muscle group. Several: the group takes their average rank. */
export const MUSCLE_LIFTS: Record<MuscleGroup, readonly StandardLift[]> = {
  chest: ['bench'],
  shoulders: ['ohp'],
  triceps: ['bench', 'ohp'],
  biceps: ['curl'],
  upperBack: ['row'],
  lowerBack: ['deadlift'],
  glutes: ['squat', 'deadlift'],
  hamstrings: ['deadlift'],
  quads: ['squat'],
};

/**
 * Each muscle group's rank: its lifts' ranks averaged (rounded down, so one
 * strong lift cannot carry a group), over the lifts that have been logged.
 * Null when none of its lifts has a rank yet.
 */
export const muscleRanks = (
  scores: readonly LiftScore[],
  isolation: Partial<Record<MuscleGroup, number>> = {},
): Record<MuscleGroup, number | null> => {
  const byLift = new Map(scores.map((score) => [score.lift, score.tier]));
  const out = {} as Record<MuscleGroup, number | null>;
  for (const group of Object.keys(MUSCLE_LIFTS) as MuscleGroup[]) {
    const tiers = MUSCLE_LIFTS[group].map((lift) => byLift.get(lift)).filter((tier): tier is number => typeof tier === 'number');
    out[group] = tiers.length ? Math.floor(tiers.reduce((sum, tier) => sum + tier, 0) / tiers.length) : (isolation[group] ?? null);
  }
  return out;
};

/**
 * Isolation lifts that can rank a muscle on their own: each estimates the
 * muscle's standard lift (a lateral raise, the overhead press it would go with)
 * and is graded against that lift's standards. The factors are deliberately
 * low, since machines and cables vary, so a raise never out-ranks a real press.
 * Used only when none of the muscle's standard lifts has a rank, and only for
 * the map: the lifts' own numbers stay what was actually pressed.
 */
const ISOLATION_SOURCES: Partial<Record<MuscleGroup, { lift: StandardLift; sources: Record<string, number> }>> = {
  shoulders: { lift: 'ohp', sources: { 'Lateral Raise': 4, 'Front Raise': 3.5, 'Cable Lateral Raise': 5 } },
  triceps: {
    lift: 'bench',
    sources: { 'Tricep Pushdown': 1.8, 'Rope Pushdown': 2, 'Skull Crushers': 2.2, 'Overhead Tricep Extension': 2, 'Overhead Cable Extension': 2 },
  },
  hamstrings: { lift: 'deadlift', sources: { 'Leg Curl': 1.8, 'Seated Leg Curl': 1.8, 'Lying Leg Curl': 2 } },
  quads: { lift: 'squat', sources: { 'Leg Extension': 1.2 } },
  glutes: { lift: 'squat', sources: { 'Hip Thrust': 0.6, 'Glute Bridge': 0.5 } },
};

/** Each muscle's rank from its isolation lifts alone (see ISOLATION_SOURCES), for muscleRanks. */
export const isolationRanks = (
  events: readonly HealthEvent[],
  profile: Pick<BodyProfile, 'sex' | 'weightKg'>,
): Partial<Record<MuscleGroup, number>> => {
  const out: Partial<Record<MuscleGroup, number>> = {};
  const bodyweight = Math.max(30, profile.weightKg);
  for (const [group, { lift, sources }] of Object.entries(ISOLATION_SOURCES) as [MuscleGroup, { lift: StandardLift; sources: Record<string, number> }][]) {
    let bestKg = 0;
    for (const event of events) {
      if (event.type !== 'WORKOUT') continue;
      for (const exercise of (event.metadata as WorkoutMetadata).exercises ?? []) {
        const factor = sources[exercise.name];
        if (!factor) continue;
        for (const set of exercise.sets) {
          if (!set.completed || !set.weight || set.weight <= 0 || set.reps <= 0 || !plausibleSet(set)) continue;
          bestKg = Math.max(bestKg, estimatedOneRepMax(convertWeightValue(set.weight, set.unit ?? 'kg', 'kg'), set.reps) * factor);
        }
      }
    }
    let tier: number | null = null;
    standardsFor(lift, profile.sex).forEach((threshold, index) => {
      if (bestKg / bodyweight >= threshold) tier = index;
    });
    if (tier !== null) out[group] = tier;
  }
  return out;
};

/** Where a library group's exercises land on the map, unless the exercise is listed in TRAINS below. */
const GROUP_TRAINS: Record<string, readonly MuscleGroup[]> = {
  chest: ['chest'],
  back: ['upperBack'],
  shoulders: ['shoulders'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  legs: ['quads', 'glutes', 'hamstrings'],
};

/** The exercises that train something other than their group's default. */
const TRAINS: Record<string, readonly MuscleGroup[]> = {
  Deadlift: ['lowerBack', 'glutes', 'hamstrings'],
  'Romanian Deadlift': ['hamstrings', 'glutes', 'lowerBack'],
  'Sumo Deadlift': ['glutes', 'hamstrings', 'quads'],
  'Hip Thrust': ['glutes'],
  'Leg Curl': ['hamstrings'],
  'Leg Extension': ['quads'],
  'Calf Raise': [],
  'Face Pull': ['shoulders', 'upperBack'],
  'Rear Delt Fly': ['shoulders', 'upperBack'],
  Shrugs: ['upperBack'],
  'Close-Grip Bench Press': ['triceps', 'chest'],
  Dips: ['chest', 'triceps'],
  'Dumbbell Pullover': ['chest', 'upperBack'],
  'Rack Pull': ['lowerBack', 'upperBack', 'glutes'],
  'Back Extension': ['lowerBack', 'glutes'],
  'Trap Bar Deadlift': ['quads', 'glutes', 'hamstrings', 'lowerBack'],
  'Stiff-Leg Deadlift': ['hamstrings', 'glutes', 'lowerBack'],
  'Good Morning': ['hamstrings', 'glutes', 'lowerBack'],
  'Seated Leg Curl': ['hamstrings'],
  'Lying Leg Curl': ['hamstrings'],
  'Nordic Curl': ['hamstrings'],
  'Glute Bridge': ['glutes'],
  'Hip Abduction': ['glutes'],
  'Cable Glute Kickback': ['glutes'],
  'Kettlebell Swing': ['glutes', 'hamstrings'],
  'Hack Squat': ['quads', 'glutes'],
  'Pendulum Squat': ['quads', 'glutes'],
  'Sissy Squat': ['quads'],
  'Hip Adduction': [],
  'Seated Calf Raise': [],
  'Reverse Pec Deck': ['shoulders', 'upperBack'],
  'Cable Rear Delt Fly': ['shoulders', 'upperBack'],
  'Landmine Press': ['shoulders', 'chest'],
  'Push Press': ['shoulders', 'triceps'],
  'JM Press': ['triceps', 'chest'],
};

/**
 * Every muscle group a logged exercise has worked, ranked or not. A lateral
 * raise or a chest fly has no strength standard to rank against, but the
 * shoulders and chest were trained all the same, and the map says so (in a
 * plain "trained" tint) rather than leaving them grey as if never worked.
 */
export const trainedMuscles = (events: readonly HealthEvent[]): Set<MuscleGroup> => {
  const trained = new Set<MuscleGroup>();
  for (const event of events) {
    if (event.type !== 'WORKOUT') continue;
    for (const exercise of (event.metadata as WorkoutMetadata).exercises ?? []) {
      if (!exercise.sets?.some((set) => set.reps > 0)) continue;
      for (const group of TRAINS[exercise.name] ?? GROUP_TRAINS[exercise.muscleGroup] ?? []) trained.add(group);
    }
  }
  return trained;
};

/** Exercises that are a standard lift as written (not a variation scaled to one). */
const STANDARD_AS_WRITTEN: ReadonlySet<string> = new Set(
  Object.values(LIFT_SOURCES).flatMap((sources) => Object.entries(sources).filter(([, factor]) => factor === 1).map(([name]) => name)),
);

/**
 * One exercise's estimated one-rep max over time, as itself (no conversion to
 * a barbell lift): one point per workout, its best set, oldest first.
 */
export const exerciseHistory = (events: readonly HealthEvent[], exerciseName: string): LiftPoint[] => {
  const points: LiftPoint[] = [];
  for (const event of events) {
    if (event.type !== 'WORKOUT') continue;
    let best: LiftPoint | null = null;
    for (const exercise of (event.metadata as WorkoutMetadata).exercises ?? []) {
      if (exercise.name !== exerciseName) continue;
      for (const set of exercise.sets) {
        if (!set.completed || !set.weight || set.weight <= 0 || set.reps <= 0 || !plausibleSet(set)) continue;
        const unit = set.unit ?? 'kg';
        const kg = estimatedOneRepMax(convertWeightValue(set.weight, unit, 'kg'), set.reps);
        if (!best || kg > best.oneRepMaxKg) {
          best = { occurredAt: event.occurredAt, oneRepMaxKg: kg, from: { exercise: exercise.name, weight: set.weight, unit, reps: set.reps } };
        }
      }
    }
    if (best) points.push({ ...best, oneRepMaxKg: Math.round(best.oneRepMaxKg * 10) / 10 });
  }
  return points.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
};

export interface OtherLift {
  exercise: string;
  /** Workouts it was lifted in, with weight. */
  sessions: number;
  /** Its best estimated one-rep max, in kg, and the set it came from. */
  best: LiftPoint;
}

/**
 * Everything else lifted more than once: any weighted exercise that is not one
 * of the six ranked lifts as written, trained in at least `minSessions`
 * workouts, most often trained first. No rank (there are no published
 * standards for a cable fly), but its progress is worth seeing all the same.
 */
export const otherLifts = (events: readonly HealthEvent[], minSessions = 2): OtherLift[] => {
  const names = new Set<string>();
  for (const event of events) {
    if (event.type !== 'WORKOUT') continue;
    for (const exercise of (event.metadata as WorkoutMetadata).exercises ?? []) {
      if (!exercise.bodyweight && !exercise.distance && !STANDARD_AS_WRITTEN.has(exercise.name)) names.add(exercise.name);
    }
  }
  return [...names]
    .map((exercise) => ({ exercise, points: exerciseHistory(events, exercise) }))
    .filter(({ points }) => points.length >= minSessions)
    .map(({ exercise, points }) => ({
      exercise,
      sessions: points.length,
      best: points.reduce((top, point) => (point.oneRepMaxKg > top.oneRepMaxKg ? point : top)),
    }))
    .sort((a, b) => b.sessions - a.sessions || a.exercise.localeCompare(b.exercise));
};

/** Every exercise name the ranks and the map refer to, for the test that each one is in the library. */
export const mappedExerciseNames = (): string[] => [
  ...Object.values(LIFT_SOURCES).flatMap((sources) => Object.keys(sources)),
  ...Object.values(ISOLATION_SOURCES).flatMap((source) => Object.keys(source?.sources ?? {})),
  ...Object.keys(TRAINS),
];
