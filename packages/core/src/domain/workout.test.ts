import { describe, expect, it } from 'vitest';
import { calculateWorkoutStats, createExercise, exerciseLibrary, startingWeight } from './workout';
import { axisForMuscleGroup } from './strengthProgression';
import type { WorkoutExercise } from './health';

const completed = (exercise: WorkoutExercise): WorkoutExercise => ({
  ...exercise,
  sets: exercise.sets.map((set) => ({ ...set, completed: true })),
});

describe('calculateWorkoutStats', () => {
  it('splits loaded volume by muscle group and keeps totalVolume as the pure sum', () => {
    const bench = completed({ ...createExercise('Bench Press', 'chest'), sets: [{ id: 's1', reps: 10, weight: 50, completed: true }] });
    const row = completed({ ...createExercise('Barbell Row', 'back'), sets: [{ id: 's2', reps: 8, weight: 40, completed: true }] });

    const stats = calculateWorkoutStats([bench, row], 45);

    expect(stats.volumeByMuscleGroup).toEqual({ chest: 500, back: 320 });
    expect(stats.totalVolume).toBe(820);
    expect(stats.completedSets).toBe(2);
    expect(stats.totalReps).toBe(18);
    expect(stats.bodyweightRepsByMuscleGroup).toEqual({});
  });

  it('records unweighted sets as bodyweight reps rather than volume', () => {
    const pushUps = completed({ ...createExercise('Push Ups', 'chest', true), sets: [{ id: 'p1', reps: 20, completed: true }, { id: 'p2', reps: 15, completed: true }] });

    const stats = calculateWorkoutStats([pushUps], 20);

    expect(stats.totalVolume).toBe(0);
    expect(stats.volumeByMuscleGroup).toEqual({});
    expect(stats.bodyweightRepsByMuscleGroup).toEqual({ chest: 35 });
  });

  it('ignores sets that were not completed', () => {
    const squat = { ...createExercise('Squat', 'legs'), sets: [{ id: 'q1', reps: 5, weight: 100, completed: true }, { id: 'q2', reps: 5, weight: 100, completed: false }] };

    const stats = calculateWorkoutStats([squat], 30);

    expect(stats.completedSets).toBe(1);
    expect(stats.volumeByMuscleGroup).toEqual({ legs: 500 });
  });
});

describe('exerciseLibrary', () => {
  it('has one row per exercise, in a group the app knows', () => {
    const names = exerciseLibrary.map(([name]) => name);
    expect(new Set(names).size).toBe(names.length);
    const known = new Set(['chest', 'back', 'legs', 'shoulders', 'biceps', 'triceps', 'core', 'cardio']);
    for (const [, muscle] of exerciseLibrary) expect(known.has(muscle)).toBe(true);
  });

  it('routes every lift to a strength axis, and leaves core and cardio out of them', () => {
    for (const [, muscle] of exerciseLibrary) {
      const axis = axisForMuscleGroup(muscle);
      if (muscle === 'core' || muscle === 'cardio') expect(axis).toBeNull();
      else expect(axis).not.toBeNull();
    }
  });

  it('starts the big lifts at an empty bar and everything else at a light dumbbell', () => {
    expect(startingWeight('back', 'lb')).toBe(45);
    expect(startingWeight('triceps', 'lb')).toBe(15);
    expect(startingWeight('legs', 'kg')).toBe(20);
  });
});
