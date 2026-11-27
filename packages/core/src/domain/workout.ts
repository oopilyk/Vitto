import { newId } from './ids';
import type { WeightUnit, WorkoutExercise, WorkoutSet, WorkoutStats } from './health';
import { msg } from '../i18n';

/**
 * The exercise picker, grouped by muscle so a scroll reads like a gym: chest,
 * back, legs, shoulders, arms, core, cardio. The muscle labels are the ones
 * `axisForMuscleGroup` and `startingWeight` know — chest/shoulders/triceps push,
 * back/biceps pull, legs are legs; core and cardio train no axis — so a new row
 * only needs a name, a group, and whether it is loaded.
 *
 * Names and groups are saved with a workout and looked up by (records, ranks,
 * starting weights), so they stay English here: `msg` marks them for
 * translation, and a screen draws them with `t(name)`.
 */
export const exerciseLibrary = [
  // Chest
  [msg('Bench Press'), msg('chest')], [msg('Incline Bench Press'), msg('chest')], [msg('Dumbbell Bench Press'), msg('chest')],
  [msg('Incline Dumbbell Press'), msg('chest')], [msg('Machine Chest Press'), msg('chest')], [msg('Chest Fly'), msg('chest')],
  [msg('Cable Crossover'), msg('chest')], [msg('Push Ups'), msg('chest'), 'bodyweight'], [msg('Dips'), msg('chest'), 'bodyweight'],
  [msg('Decline Bench Press'), msg('chest')], [msg('Smith Machine Bench Press'), msg('chest')], [msg('Incline Machine Press'), msg('chest')],
  [msg('Pec Deck'), msg('chest')], [msg('Incline Cable Fly'), msg('chest')], [msg('Low-to-High Cable Fly'), msg('chest')], [msg('Dumbbell Pullover'), msg('chest')],
  // Back
  [msg('Barbell Row'), msg('back')], [msg('Dumbbell Row'), msg('back')], [msg('Seated Cable Row'), msg('back')], [msg('T-Bar Row'), msg('back')],
  [msg('Lat Pulldown'), msg('back')], [msg('Straight-Arm Pulldown'), msg('back')], [msg('Deadlift'), msg('back')], [msg('Face Pull'), msg('back')],
  [msg('Pull Ups'), msg('back'), 'bodyweight'], [msg('Chin Ups'), msg('back'), 'bodyweight'],
  [msg('Pendlay Row'), msg('back')], [msg('Chest-Supported Row'), msg('back')], [msg('Seal Row'), msg('back')], [msg('Meadows Row'), msg('back')],
  [msg('Machine Row'), msg('back')], [msg('Single-Arm Cable Row'), msg('back')], [msg('Close-Grip Lat Pulldown'), msg('back')],
  [msg('Single-Arm Lat Pulldown'), msg('back')], [msg('Rack Pull'), msg('back')], [msg('Back Extension'), msg('back')], [msg('Inverted Row'), msg('back'), 'bodyweight'],
  // Legs
  [msg('Squat'), msg('legs')], [msg('Front Squat'), msg('legs')], [msg('Goblet Squat'), msg('legs')], [msg('Leg Press'), msg('legs')],
  [msg('Romanian Deadlift'), msg('legs')], [msg('Sumo Deadlift'), msg('legs')], [msg('Hip Thrust'), msg('legs')], [msg('Bulgarian Split Squat'), msg('legs')],
  [msg('Leg Extension'), msg('legs')], [msg('Leg Curl'), msg('legs')], [msg('Calf Raise'), msg('legs')], [msg('Lunges'), msg('legs'), 'bodyweight'],
  [msg('Hack Squat'), msg('legs')], [msg('Smith Machine Squat'), msg('legs')], [msg('Pendulum Squat'), msg('legs')], [msg('Trap Bar Deadlift'), msg('legs')],
  [msg('Stiff-Leg Deadlift'), msg('legs')], [msg('Good Morning'), msg('legs')], [msg('Walking Lunges'), msg('legs')], [msg('Reverse Lunges'), msg('legs')],
  [msg('Split Squat'), msg('legs')], [msg('Step Ups'), msg('legs')], [msg('Seated Leg Curl'), msg('legs')], [msg('Lying Leg Curl'), msg('legs')],
  [msg('Glute Bridge'), msg('legs')], [msg('Hip Abduction'), msg('legs')], [msg('Hip Adduction'), msg('legs')], [msg('Cable Glute Kickback'), msg('legs')],
  [msg('Seated Calf Raise'), msg('legs')], [msg('Kettlebell Swing'), msg('legs')], [msg('Sissy Squat'), msg('legs'), 'bodyweight'],
  [msg('Nordic Curl'), msg('legs'), 'bodyweight'],
  // Shoulders
  [msg('Shoulder Press'), msg('shoulders')], [msg('Dumbbell Shoulder Press'), msg('shoulders')], [msg('Arnold Press'), msg('shoulders')],
  [msg('Lateral Raise'), msg('shoulders')], [msg('Front Raise'), msg('shoulders')], [msg('Rear Delt Fly'), msg('shoulders')],
  [msg('Upright Row'), msg('shoulders')], [msg('Shrugs'), msg('shoulders')],
  [msg('Machine Shoulder Press'), msg('shoulders')], [msg('Push Press'), msg('shoulders')], [msg('Landmine Press'), msg('shoulders')],
  [msg('Cable Lateral Raise'), msg('shoulders')], [msg('Machine Lateral Raise'), msg('shoulders')], [msg('Reverse Pec Deck'), msg('shoulders')],
  [msg('Cable Rear Delt Fly'), msg('shoulders')],
  // Biceps
  [msg('Bicep Curl'), msg('biceps')], [msg('Hammer Curl'), msg('biceps')], [msg('EZ Bar Curl'), msg('biceps')], [msg('Preacher Curl'), msg('biceps')],
  [msg('Incline Dumbbell Curl'), msg('biceps')], [msg('Cable Curl'), msg('biceps')],
  [msg('Bayesian Curl'), msg('biceps')], [msg('Spider Curl'), msg('biceps')], [msg('Concentration Curl'), msg('biceps')], [msg('Reverse Curl'), msg('biceps')],
  [msg('Drag Curl'), msg('biceps')], [msg('Zottman Curl'), msg('biceps')], [msg('Machine Preacher Curl'), msg('biceps')], [msg('Rope Hammer Curl'), msg('biceps')],
  // Triceps
  [msg('Tricep Pushdown'), msg('triceps')], [msg('Skull Crushers'), msg('triceps')], [msg('Overhead Tricep Extension'), msg('triceps')],
  [msg('Close-Grip Bench Press'), msg('triceps')], [msg('Tricep Kickback'), msg('triceps')],
  [msg('Rope Pushdown'), msg('triceps')], [msg('Overhead Cable Extension'), msg('triceps')], [msg('Single-Arm Pushdown'), msg('triceps')],
  [msg('JM Press'), msg('triceps')], [msg('Machine Dips'), msg('triceps')], [msg('Bench Dips'), msg('triceps'), 'bodyweight'],
  [msg('Diamond Push Ups'), msg('triceps'), 'bodyweight'],
  // Core
  [msg('Plank'), msg('core'), 'bodyweight'], [msg('Crunches'), msg('core'), 'bodyweight'], [msg('Hanging Leg Raise'), msg('core'), 'bodyweight'],
  [msg('Russian Twist'), msg('core'), 'bodyweight'], [msg('Ab Wheel Rollout'), msg('core'), 'bodyweight'], [msg('Dead Bug'), msg('core'), 'bodyweight'],
  [msg('Mountain Climbers'), msg('core'), 'bodyweight'], [msg('Cable Crunch'), msg('core')],
  [msg('Sit Ups'), msg('core'), 'bodyweight'], [msg('Bicycle Crunch'), msg('core'), 'bodyweight'], [msg('Leg Raises'), msg('core'), 'bodyweight'],
  [msg('Side Plank'), msg('core'), 'bodyweight'], [msg('Hollow Hold'), msg('core'), 'bodyweight'], [msg('Pallof Press'), msg('core')],
  [msg('Cable Woodchopper'), msg('core')], [msg("Farmer's Carry"), msg('core')],
  // Cardio, split by how it is actually counted. The ones marked `distance` go
  // somewhere and are logged as ground covered plus time; the rest are reps like
  // any other bodyweight movement, and keep their sets.
  [msg('Running'), msg('cardio'), 'distance'], [msg('Walking'), msg('cardio'), 'distance'], [msg('Cycling'), msg('cardio'), 'distance'],
  [msg('Rowing'), msg('cardio'), 'distance'], [msg('Elliptical'), msg('cardio'), 'distance'], [msg('Stair Climber'), msg('cardio'), 'distance'],
  [msg('Swimming'), msg('cardio'), 'distance'],
  [msg('Hiking'), msg('cardio'), 'distance'],
  [msg('Jump Rope'), msg('cardio'), 'bodyweight'], [msg('Burpees'), msg('cardio'), 'bodyweight'], [msg('Box Jumps'), msg('cardio'), 'bodyweight'],
  [msg('Battle Ropes'), msg('cardio'), 'bodyweight'],
] as const;

/**
 * Exercises logged as a distance and a time rather than as sets.
 *
 * Read off the library so there is one source of truth: adding a rowing machine
 * is a row in the table above, not a second list to remember. Note this is a
 * property of the EXERCISE, not of the muscle group — burpees and jump rope are
 * cardio too, and they are counted in reps like anything else.
 */
const DISTANCE_EXERCISES: ReadonlySet<string> = new Set(
  exerciseLibrary.filter(([, , kind]) => kind === 'distance').map(([name]) => name),
);

/** Whether this exercise is logged by distance and time instead of sets. */
export const tracksDistance = (name: string): boolean => DISTANCE_EXERCISES.has(name);

/**
 * A starting load, in whichever unit the lifter uses, by what the exercise is.
 *
 * Big compound lifts (chest, back, legs) start at an empty barbell — 20 kg and
 * 45 lb are the same bar, so the suggestion means the same thing either way.
 * Everything else — shoulders, arms, core, cardio — is dumbbell-and-cable
 * territory, where 45 lb for a bicep curl is not a starting point but a
 * warning. Those start at a light dumbbell. Only a starting point: the first
 * time it is trained, the routine remembers what was actually lifted.
 */
const BARBELL_GROUPS: ReadonlySet<string> = new Set(['chest', 'back', 'legs']);
const STARTING_WEIGHT: Record<'barbell' | 'dumbbell', Record<WeightUnit, number>> = {
  barbell: { kg: 20, lb: 45 },
  dumbbell: { kg: 8, lb: 15 },
};

export const startingWeight = (muscleGroup: string, unit: WeightUnit): number =>
  STARTING_WEIGHT[BARBELL_GROUPS.has(muscleGroup) ? 'barbell' : 'dumbbell'][unit];

/**
 * A set starts done.
 *
 * The log used to ask for a set to be ticked off before it counted, which meant
 * a lifter could type a whole session in, finish it, and be told they had
 * trained nothing — no volume, no XP, no personal record. The row itself is now
 * the claim: if it is on the list you did it, and a set you did not do gets
 * deleted instead (`Remove set`).
 *
 * `completed` stays on the type and every reader still honours it, because
 * sessions logged under the old rule are stored with genuinely unticked sets
 * and those must not be counted retroactively.
 */
const newSet = (bodyweight: boolean, unit: WeightUnit, muscleGroup: string): WorkoutSet => ({
  id: newId(),
  reps: 8,
  weight: bodyweight ? undefined : startingWeight(muscleGroup, unit),
  unit,
  completed: true,
});

/**
 * `unit` defaults to kg so existing callers keep working, but every UI passes
 * the lifter's own unit — the set records what its number means, so a workout
 * logged in pounds still reads as pounds later.
 */
/**
 * A run is a distance and a time, both of which the session already records, so
 * asking it for sets produced nonsense: one bodyweight set of eight reps, and a
 * summary reading "1 set · 8 reps · 0 lb volume" for a ten-mile run. A
 * distance exercise therefore starts with no sets and carries `distance` so the
 * screen knows to draw no set table for it.
 *
 * Burpees and jump rope are cardio but are NOT distance work, so they keep their
 * sets and are counted in reps like any other bodyweight movement.
 */
export const createExercise = (name: string, muscleGroup: string, bodyweight = false, unit: WeightUnit = 'kg'): WorkoutExercise => {
  const distance = tracksDistance(name);
  return {
    id: newId(),
    name,
    muscleGroup,
    bodyweight,
    ...(distance ? { distance: true } : {}),
    sets: distance ? [] : [newSet(bodyweight, unit, muscleGroup)],
  };
};

export const calculateWorkoutStats = (exercises: WorkoutExercise[], durationMinutes: number): WorkoutStats => {
  const volumeByMuscleGroup: Record<string, number> = {};
  const bodyweightRepsByMuscleGroup: Record<string, number> = {};
  let completedSets = 0;
  let totalReps = 0;
  let totalVolume = 0;

  for (const exercise of exercises) {
    const group = exercise.muscleGroup;
    for (const set of exercise.sets) {
      if (!set.completed) continue;
      const reps = Math.max(0, set.reps);
      completedSets += 1;
      totalReps += reps;
      if (set.weight && set.weight > 0) {
        const volume = set.weight * reps;
        totalVolume += volume;
        volumeByMuscleGroup[group] = (volumeByMuscleGroup[group] ?? 0) + volume;
      } else {
        bodyweightRepsByMuscleGroup[group] = (bodyweightRepsByMuscleGroup[group] ?? 0) + reps;
      }
    }
  }

  return {
    durationMinutes: Math.min(180, Math.max(1, durationMinutes)),
    exerciseCount: exercises.length,
    completedSets,
    totalReps,
    totalVolume,
    muscleGroups: [...new Set(exercises.map((exercise) => exercise.muscleGroup))],
    volumeByMuscleGroup,
    bodyweightRepsByMuscleGroup,
  };
};

/**
 * A copy of the set before it, weight, reps and unit, since the next set is
 * usually the same again: one tap instead of retyping both numbers. Only the
 * first set of an exercise starts from the defaults.
 */
export const addSet = (exercise: WorkoutExercise, unit?: WeightUnit): WorkoutExercise => {
  const last = exercise.sets[exercise.sets.length - 1];
  const next: WorkoutSet = last
    ? {
        id: newId(),
        reps: last.reps,
        // The weight keeps the unit it was entered in, so the number still means the same.
        weight: last.weight,
        unit: last.unit ?? unit ?? 'kg',
        completed: true,
      }
    : newSet(Boolean(exercise.bodyweight), unit ?? 'kg', exercise.muscleGroup);
  return { ...exercise, sets: [...exercise.sets, next] };
};
export const updateSet = (exercise: WorkoutExercise, setId: string, patch: Partial<WorkoutSet>): WorkoutExercise => ({ ...exercise, sets: exercise.sets.map((set) => set.id === setId ? { ...set, ...patch } : set) });
/** Under this, a timed session was logged after the fact, not trained live. */
export const MIN_TIMED_SESSION_MINUTES = 10;
/** A set and its rest, for estimating a session logged after the fact. */
export const MINUTES_PER_SET = 3;

/**
 * How long a session took, without asking. A run, ride or swim says its own
 * minutes on its card. Sets are timed from the first exercise added to Finish,
 * unless that is implausibly short (the session was typed in afterwards), when
 * they are estimated at a few minutes each. Capped at three hours, like the
 * stats.
 */
export const sessionMinutes = ({
  cardioMinutes,
  completedSets,
  elapsedMs,
}: {
  /** Typed on a distance exercise's card, if any. */
  cardioMinutes?: number;
  completedSets: number;
  /** Since the first exercise went in; null if it never did. */
  elapsedMs: number | null;
}): number => {
  const typed = Number.isFinite(cardioMinutes) && (cardioMinutes as number) > 0 ? Math.round(cardioMinutes as number) : 0;
  if (completedSets <= 0) return Math.min(180, Math.max(1, typed));
  const timed = elapsedMs !== null && elapsedMs > 0 ? Math.round(elapsedMs / 60_000) : 0;
  // Timed live, the clock already covers any run in the session; estimated,
  // the run's own minutes are added to the sets'.
  const minutes = timed >= MIN_TIMED_SESSION_MINUTES ? timed : completedSets * MINUTES_PER_SET + typed;
  return Math.min(180, Math.max(1, minutes));
};
