import { describe, expect, it } from 'vitest';
import type { HealthEvent } from './health';
import { PROFILE_SURVEY_DEFAULTS, type BodyProfile } from './macroTargets';
import { weeklyRecap } from './weeklyRecap';

const profile: BodyProfile = {
  age: 30, sex: 'male', heightCm: 180, heightUnit: 'cm', weightKg: 80, weightUnit: 'kg', activity: 'moderate', goal: 'maintain',
  ...PROFILE_SURVEY_DEFAULTS,
};
const at = (day: number, hour = 9) => new Date(2026, 10, day, hour).toISOString();
const bench = (id: string, day: number, weight: number): HealthEvent => ({
  id, userId: 'u', type: 'WORKOUT', source: 'manual', occurredAt: at(day),
  metadata: { workoutType: 'strength', durationMinutes: 45, xpAwarded: 20, exercises: [{ id, name: 'Bench Press', muscleGroup: 'chest', sets: [{ id, weight, reps: 5, unit: 'kg', completed: true }] }] } as never,
});

describe('weeklyRecap', () => {
  it('sums the seven days ending today against the seven before, records included', () => {
    const recap = weeklyRecap([bench('old', 2, 80), bench('a', 6, 85), bench('b', 8, 82)], profile, 10000, new Date(2026, 10, 9, 20));
    expect(recap.workouts).toBe(2);
    expect(recap.workoutMinutes).toBe(90);
    expect(recap.xp).toBe(40);
    expect(recap.records).toEqual(['Bench Press']);
    expect(recap.previous).toEqual({ workouts: 1, xp: 20 });
  });
});
