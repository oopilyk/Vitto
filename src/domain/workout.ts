import type { WorkoutExercise, WorkoutSet, WorkoutStats } from './health';

export const exerciseLibrary = [
  ['Bench Press', 'chest'], ['Push Ups', 'chest', 'bodyweight'], ['Barbell Row', 'back'], ['Lat Pulldown', 'back'],
  ['Squat', 'legs'], ['Romanian Deadlift', 'legs'], ['Shoulder Press', 'shoulders'], ['Lateral Raise', 'shoulders'],
  ['Bicep Curl', 'biceps'], ['Tricep Pushdown', 'triceps'], ['Plank', 'core', 'bodyweight'], ['Running', 'cardio', 'bodyweight'],
] as const;

export const createExercise = (name: string, muscleGroup: string, bodyweight = false): WorkoutExercise => ({ id: crypto.randomUUID(), name, muscleGroup, bodyweight, sets: [{ id: crypto.randomUUID(), reps: 8, weight: bodyweight ? undefined : 20, unit: 'kg', completed: false }] });

export const calculateWorkoutStats = (exercises: WorkoutExercise[], durationMinutes: number): WorkoutStats => {
  const completed = exercises.flatMap((exercise) => exercise.sets.filter((set) => set.completed));
  return { durationMinutes: Math.min(180, Math.max(1, durationMinutes)), exerciseCount: exercises.length, completedSets: completed.length, totalReps: completed.reduce((sum, set) => sum + Math.max(0, set.reps), 0), totalVolume: completed.reduce((sum, set) => sum + (set.weight ?? 0) * set.reps, 0), muscleGroups: [...new Set(exercises.map((exercise) => exercise.muscleGroup))] };
};

export const addSet = (exercise: WorkoutExercise): WorkoutExercise => ({ ...exercise, sets: [...exercise.sets, { id: crypto.randomUUID(), reps: 8, weight: exercise.bodyweight ? undefined : 20, unit: 'kg', completed: false }] });
export const updateSet = (exercise: WorkoutExercise, setId: string, patch: Partial<WorkoutSet>): WorkoutExercise => ({ ...exercise, sets: exercise.sets.map((set) => set.id === setId ? { ...set, ...patch } : set) });