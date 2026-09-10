import { newId } from './ids';
import type { WeightUnit, WorkoutExercise, WorkoutSet, WorkoutStats } from './health';

export const exerciseLibrary = [
  ['Bench Press', 'chest'], ['Push Ups', 'chest', 'bodyweight'], ['Barbell Row', 'back'], ['Lat Pulldown', 'back'],
  ['Squat', 'legs'], ['Romanian Deadlift', 'legs'], ['Shoulder Press', 'shoulders'], ['Lateral Raise', 'shoulders'],
  ['Bicep Curl', 'biceps'], ['Tricep Pushdown', 'triceps'], ['Plank', 'core', 'bodyweight'], ['Running', 'cardio', 'bodyweight'],
] as const;

/**
 * A starting load, in whichever unit the lifter uses. 20 kg and 45 lb are both
 * "an empty barbell", so the suggestion means the same thing either way — 20 lb
 * would be a mystery number to someone working in pounds.
 */
const STARTING_WEIGHT: Record<WeightUnit, number> = { kg: 20, lb: 45 };

const newSet = (bodyweight: boolean, unit: WeightUnit): WorkoutSet => ({
  id: newId(),
  reps: 8,
  weight: bodyweight ? undefined : STARTING_WEIGHT[unit],
  unit,
  completed: false,
});

/**
 * `unit` defaults to kg so existing callers keep working, but every UI passes
 * the lifter's own unit — the set records what its number means, so a workout
 * logged in pounds still reads as pounds later.
 */
export const createExercise = (name: string, muscleGroup: string, bodyweight = false, unit: WeightUnit = 'kg'): WorkoutExercise => ({ id: newId(), name, muscleGroup, bodyweight, sets: [newSet(bodyweight, unit)] });

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
    newSet(Boolean(exercise.bodyweight), unit ?? exercise.sets[exercise.sets.length - 1]?.unit ?? 'kg'),
  ],
});
export const updateSet = (exercise: WorkoutExercise, setId: string, patch: Partial<WorkoutSet>): WorkoutExercise => ({ ...exercise, sets: exercise.sets.map((set) => set.id === setId ? { ...set, ...patch } : set) });