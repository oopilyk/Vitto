import { describe, expect, it } from 'vitest';
import { calculateWorkoutStats, createExercise } from './workout';
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
