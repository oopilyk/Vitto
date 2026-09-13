import { newId } from './ids';
import type { WeightUnit, WorkoutExercise, WorkoutSet, WorkoutStats } from './health';

export const exerciseLibrary = [
  ['Bench Press', 'chest'], ['Push Ups', 'chest', 'bodyweight'], ['Barbell Row', 'back'], ['Lat Pulldown', 'back'],
  ['Squat', 'legs'], ['Romanian Deadlift', 'legs'], ['Shoulder Press', 'shoulders'], ['Lateral Raise', 'shoulders'],
  ['Bicep Curl', 'biceps'], ['Tricep Pushdown', 'triceps'], ['Plank', 'core', 'bodyweight'], ['Running', 'cardio', 'bodyweight'],
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

const newSet = (bodyweight: boolean, unit: WeightUnit, muscleGroup: string): WorkoutSet => ({
  id: newId(),
  reps: 8,
  weight: bodyweight ? undefined : startingWeight(muscleGroup, unit),
  unit,
  completed: false,
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