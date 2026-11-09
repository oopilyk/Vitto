import { describe, expect, it } from 'vitest';
import type { HealthEvent, WorkoutExercise } from './health';
import { personalRecords } from './personalRecords';
import { runRecords } from './runRecords';
import { liftScores } from './strengthRanks';
import { lastSetsByExercise } from './workoutTemplates';
import { checkWorkout, plausibleSet } from './workoutLimits';

const lift = (name: string, weight: number, reps: number, unit: 'kg' | 'lb' = 'lb'): WorkoutExercise => ({
  id: name, name, muscleGroup: 'chest', sets: [{ id: `${name}-1`, weight, reps, unit, completed: true }],
});
const workout = (id: string, exercises: WorkoutExercise[], extra: Record<string, unknown> = {}): HealthEvent => ({
  id, userId: 'u', type: 'WORKOUT', source: 'manual', occurredAt: `2026-11-0${id}T07:00:00Z`,
  metadata: { workoutType: 'strength', durationMinutes: 45, exercises, ...extra },
});
const running: WorkoutExercise = { id: 'run', name: 'Running', muscleGroup: 'cardio', distance: true, sets: [] };

describe('checkWorkout', () => {
  it('lets an ordinary session through', () => {
    expect(checkWorkout({ exercises: [lift('Bench Press', 185, 8)], durationMinutes: 50 })).toBeNull();
    expect(checkWorkout({ exercises: [running], durationMinutes: 30, distanceKm: 5 })).toBeNull();
  });

  it('refuses what no one can do: the testers’ 1102 lb × 8, 9999 reps, 100 miles in a minute', () => {
    expect(checkWorkout({ exercises: [lift('Bench Press', 1102, 8)], durationMinutes: 50 })?.level).toBe('refuse');
    expect(checkWorkout({ exercises: [lift('Bench Press', 99999, 9999)], durationMinutes: 50 })?.level).toBe('refuse');
    expect(checkWorkout({ exercises: [running], durationMinutes: 1, distanceKm: 160.9 })?.level).toBe('refuse');
    expect(checkWorkout({ exercises: [running], durationMinutes: 2000 })?.level).toBe('refuse');
  });

  it('asks about the merely remarkable, and a refusal wins over a question', () => {
    expect(checkWorkout({ exercises: [lift('Deadlift', 800, 1)], durationMinutes: 50 })).toMatchObject({ level: 'confirm' });
    expect(checkWorkout({ exercises: [running], durationMinutes: 15, distanceKm: 7 })).toMatchObject({ level: 'confirm' });
    expect(checkWorkout({ exercises: [lift('Deadlift', 800, 1), lift('Squat', 2000, 5)], durationMinutes: 50 })?.level).toBe('refuse');
  });

  it('weighs kilograms as kilograms', () => {
    expect(plausibleSet({ weight: 250, reps: 3, unit: 'kg' })).toBe(true);
    expect(plausibleSet({ weight: 500, reps: 8, unit: 'kg' })).toBe(false);
  });
});

describe('typos already in the log', () => {
  const log = [workout('1', [lift('Bench Press', 225, 5)]), workout('2', [lift('Bench Press', 1102, 8)])];

  it('do not become a record, a rank or next session’s numbers', () => {
    expect(personalRecords(log, 'lb')[0]?.record).toMatchObject({ weight: 225, reps: 5 });
    expect(liftScores(log, { sex: 'male', weightKg: 80 }).find((score) => score.lift === 'bench')?.from).toMatchObject({ weight: 225 });
    expect(lastSetsByExercise(log).get('Bench Press')?.[0]).toMatchObject({ weight: 225 });
  });

  it('do not become the fastest run', () => {
    const runs = [
      workout('3', [running], { workoutType: 'cardio', durationMinutes: 50, distanceKm: 10 }),
      workout('4', [running], { workoutType: 'cardio', durationMinutes: 1, distanceKm: 160.9 }),
    ];
    expect(runRecords(runs, 'metric').fastest).toMatchObject({ distance: 10 });
  });
});

describe('otherLifts', () => {
  it('lists any weighted exercise lifted in two or more workouts, outside the six ranked lifts', async () => {
    const { otherLifts, exerciseHistory } = await import('./strengthRanks');
    const fly = (id: string, weight: number) => workout(id, [lift('Cable Fly', weight, 10), lift('Bench Press', 185, 5)]);
    const log = [fly('1', 30), fly('2', 35), workout('3', [lift('Leg Extension', 90, 12)])];
    const others = otherLifts(log);
    expect(others.map((other) => other.exercise)).toEqual(['Cable Fly']);
    expect(others[0]).toMatchObject({ sessions: 2, best: { from: { weight: 35 } } });
    expect(exerciseHistory(log, 'Cable Fly')).toHaveLength(2);
  });
});

describe('liftingUnit', () => {
  it('follows the newest weighted set, not the profile', async () => {
    const { liftingUnit } = await import('./workoutTemplates');
    expect(liftingUnit([workout('1', [lift('Bench Press', 100, 5, 'kg')]), workout('2', [lift('Bench Press', 205, 8, 'lb')])], 'kg')).toBe('lb');
    expect(liftingUnit([], 'kg')).toBe('kg');
  });
});

describe('mid-workout records', () => {
  it('calls a heavier set or a better estimated max a record, but not on the first session', async () => {
    const { exerciseBest, setRecord, exerciseSessions } = await import('./workoutTemplates');
    const log = [workout('1', [lift('Bench Press', 185, 5)]), workout('2', [lift('Bench Press', 195, 3)])];
    const best = exerciseBest(log, 'Bench Press');
    expect(setRecord({ weight: 200, reps: 1, unit: 'lb' }, best)).toBe('weight');
    expect(setRecord({ weight: 185, reps: 8, unit: 'lb' }, best)).toBe('oneRepMax');
    expect(setRecord({ weight: 135, reps: 5, unit: 'lb' }, best)).toBeNull();
    expect(setRecord({ weight: 135, reps: 5, unit: 'lb' }, exerciseBest([], 'Bench Press'))).toBeNull();
    expect(exerciseSessions(log, 'Bench Press').map((session) => session.id)).toEqual(['2', '1']);
  });
});
