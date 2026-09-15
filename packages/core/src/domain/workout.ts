import { newId } from './ids';
import type { WeightUnit, WorkoutExercise, WorkoutSet, WorkoutStats } from './health';

/**
 * The exercise picker, grouped by muscle so a scroll reads like a gym: chest,
 * back, legs, shoulders, arms, core, cardio. The muscle labels are the ones
 * `axisForMuscleGroup` and `startingWeight` know — chest/shoulders/triceps push,
 * back/biceps pull, legs are legs; core and cardio train no axis — so a new row
 * only needs a name, a group, and whether it is loaded.
 */
export const exerciseLibrary = [
  // Chest
  ['Bench Press', 'chest'], ['Incline Bench Press', 'chest'], ['Dumbbell Bench Press', 'chest'],
  ['Incline Dumbbell Press', 'chest'], ['Machine Chest Press', 'chest'], ['Chest Fly', 'chest'],
  ['Cable Crossover', 'chest'], ['Push Ups', 'chest', 'bodyweight'], ['Dips', 'chest', 'bodyweight'],
  // Back
  ['Barbell Row', 'back'], ['Dumbbell Row', 'back'], ['Seated Cable Row', 'back'], ['T-Bar Row', 'back'],
  ['Lat Pulldown', 'back'], ['Straight-Arm Pulldown', 'back'], ['Deadlift', 'back'], ['Face Pull', 'back'],
  ['Pull Ups', 'back', 'bodyweight'], ['Chin Ups', 'back', 'bodyweight'],
  // Legs
  ['Squat', 'legs'], ['Front Squat', 'legs'], ['Goblet Squat', 'legs'], ['Leg Press', 'legs'],
  ['Romanian Deadlift', 'legs'], ['Sumo Deadlift', 'legs'], ['Hip Thrust', 'legs'], ['Bulgarian Split Squat', 'legs'],
  ['Leg Extension', 'legs'], ['Leg Curl', 'legs'], ['Calf Raise', 'legs'], ['Lunges', 'legs', 'bodyweight'],
  // Shoulders
  ['Shoulder Press', 'shoulders'], ['Dumbbell Shoulder Press', 'shoulders'], ['Arnold Press', 'shoulders'],
  ['Lateral Raise', 'shoulders'], ['Front Raise', 'shoulders'], ['Rear Delt Fly', 'shoulders'],
  ['Upright Row', 'shoulders'], ['Shrugs', 'shoulders'],
  // Biceps
  ['Bicep Curl', 'biceps'], ['Hammer Curl', 'biceps'], ['EZ Bar Curl', 'biceps'], ['Preacher Curl', 'biceps'],
  ['Incline Dumbbell Curl', 'biceps'], ['Cable Curl', 'biceps'],
  // Triceps
  ['Tricep Pushdown', 'triceps'], ['Skull Crushers', 'triceps'], ['Overhead Tricep Extension', 'triceps'],
  ['Close-Grip Bench Press', 'triceps'], ['Tricep Kickback', 'triceps'],
  // Core
  ['Plank', 'core', 'bodyweight'], ['Crunches', 'core', 'bodyweight'], ['Hanging Leg Raise', 'core', 'bodyweight'],
  ['Russian Twist', 'core', 'bodyweight'], ['Ab Wheel Rollout', 'core', 'bodyweight'], ['Dead Bug', 'core', 'bodyweight'],
  ['Mountain Climbers', 'core', 'bodyweight'], ['Cable Crunch', 'core'],
  // Cardio
  ['Running', 'cardio', 'bodyweight'], ['Walking', 'cardio', 'bodyweight'], ['Cycling', 'cardio', 'bodyweight'],
  ['Rowing', 'cardio', 'bodyweight'], ['Elliptical', 'cardio', 'bodyweight'], ['Stair Climber', 'cardio', 'bodyweight'],
  ['Jump Rope', 'cardio', 'bodyweight'], ['Swimming', 'cardio', 'bodyweight'], ['Burpees', 'cardio', 'bodyweight'],
] as const;

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
export const createExercise = (name: string, muscleGroup: string, bodyweight = false, unit: WeightUnit = 'kg'): WorkoutExercise => ({ id: newId(), name, muscleGroup, bodyweight, sets: [newSet(bodyweight, unit, muscleGroup)] });

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

/** Inherits the unit of the set before it, so one exercise never mixes units. */
export const addSet = (exercise: WorkoutExercise, unit?: WeightUnit): WorkoutExercise => ({
  ...exercise,
  sets: [
    ...exercise.sets,
    newSet(Boolean(exercise.bodyweight), unit ?? exercise.sets[exercise.sets.length - 1]?.unit ?? 'kg', exercise.muscleGroup),
  ],
});
export const updateSet = (exercise: WorkoutExercise, setId: string, patch: Partial<WorkoutSet>): WorkoutExercise => ({ ...exercise, sets: exercise.sets.map((set) => set.id === setId ? { ...set, ...patch } : set) });