import { describe, expect, it } from 'vitest';
import type { HealthEvent, WorkoutExercise } from './health';
import { BIG_LIFTS, personalRecords } from './personalRecords';

const set = (weight: number | undefined, reps: number, completed = true, unit: 'kg' | 'lb' = 'kg') =>
  ({ id: `${weight}-${reps}-${unit}`, weight, reps, unit, completed });
const lift = (name: string, sets: ReturnType<typeof set>[]): WorkoutExercise =>
  ({ id: name, name, muscleGroup: 'chest', sets });
const workout = (id: string, occurredAt: string, exercises: WorkoutExercise[]): HealthEvent => ({
  id, userId: 'u', type: 'WORKOUT', source: 'manual', occurredAt,
  metadata: { workoutType: 'strength', durationMinutes: 45, exercises },
});

describe('personalRecords', () => {
  it('lists every big lift in order, empty until it has been lifted', () => {
    const records = personalRecords([], 'kg');
    expect(records.map((r) => r.exercise)).toEqual([...BIG_LIFTS]);
    expect(records.every((r) => r.record === null)).toBe(true);
  });

  it('keeps the heaviest ticked set, and breaks a tie on reps', () => {
    const events = [
      workout('a', '2026-09-01T10:00:00Z', [lift('Bench Press', [set(60, 8), set(80, 3)])]),
      workout('b', '2026-09-08T10:00:00Z', [lift('Bench Press', [set(80, 5), set(70, 10)])]),
    ];
    const bench = personalRecords(events, 'kg').find((r) => r.exercise === 'Bench Press')!;
    expect(bench.record).toEqual({ weight: 80, reps: 5, occurredAt: '2026-09-08T10:00:00Z' });
  });

  it('ignores unticked rows and bodyweight sets — a plan is not a lift', () => {
    const events = [
      workout('a', '2026-09-01T10:00:00Z', [
        lift('Squat', [set(140, 1, false), set(100, 5)]),
        lift('Deadlift', [set(undefined, 10), set(0, 10)]),
      ]),
    ];
    const byName = Object.fromEntries(personalRecords(events, 'kg').map((r) => [r.exercise, r.record]));
    expect(byName['Squat']).toMatchObject({ weight: 100, reps: 5 });
    expect(byName['Deadlift']).toBeNull();
  });

  it('converts every set into the unit asked for, whatever it was logged in', () => {
    const events = [
      workout('a', '2026-09-01T10:00:00Z', [lift('Deadlift', [set(100, 3, true, 'kg'), set(225, 5, true, 'lb')])]),
    ];
    // 225 lb is 102.1 kg — the heavier pull, once they are compared in one unit.
    expect(personalRecords(events, 'kg').find((r) => r.exercise === 'Deadlift')!.record)
      .toMatchObject({ weight: 102.1, reps: 5 });
    expect(personalRecords(events, 'lb').find((r) => r.exercise === 'Deadlift')!.record)
      .toMatchObject({ weight: 225, reps: 5 });
  });

  it('only reads the lifts it was asked about', () => {
    const events = [workout('a', '2026-09-01T10:00:00Z', [lift('Bicep Curl', [set(20, 12)])])];
    expect(personalRecords(events, 'kg', ['Bicep Curl'])[0].record).toMatchObject({ weight: 20 });
    expect(personalRecords(events, 'kg').every((r) => r.record === null)).toBe(true);
  });
});
