import { newId } from './ids';
import type { WorkoutExercise, WorkoutSet, WorkoutStats } from './health';

export const exerciseLibrary = [
  ['Bench Press', 'chest'], ['Push Ups', 'chest', 'bodyweight'], ['Barbell Row', 'back'], ['Lat Pulldown', 'back'],
  ['Squat', 'legs'], ['Romanian Deadlift', 'legs'], ['Shoulder Press', 'shoulders'], ['Lateral Raise', 'shoulders'],
  ['Bicep Curl', 'biceps'], ['Tricep Pushdown', 'triceps'], ['Plank', 'core', 'bodyweight'], ['Running', 'cardio', 'bodyweight'],
] as const;

export const createExercise = (name: string, muscleGroup: string, bodyweight = false): WorkoutExercise => ({ id: newId(), name, muscleGroup, bodyweight, sets: [{ id: newId(), reps: 8, weight: bodyweight ? undefined : 20, unit: 'kg', completed: false }] });

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

export const addSet = (exercise: WorkoutExercise): WorkoutExercise => ({ ...exercise, sets: [...exercise.sets, { id: newId(), reps: 8, weight: exercise.bodyweight ? undefined : 20, unit: 'kg', completed: false }] });
export const updateSet = (exercise: WorkoutExercise, setId: string, patch: Partial<WorkoutSet>): WorkoutExercise => ({ ...exercise, sets: exercise.sets.map((set) => set.id === setId ? { ...set, ...patch } : set) });