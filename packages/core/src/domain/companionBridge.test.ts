import { describe, expect, it } from 'vitest';
import { buildLifeContext, newPersonalRecords, toCompanionEvent } from './companionBridge';
import type { HealthEvent } from './health';
import { withSurveyDefaults } from './macroTargets';
import { createPet } from './pet';

const NOW = new Date(2026, 8, 16, 20, 0);
const at = (daysAgo: number, hour = 9) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo, hour).toISOString();
const profile = withSurveyDefaults({ age: 30, sex: 'male', heightCm: 180, heightUnit: 'cm', weightKg: 80, weightUnit: 'kg', activity: 'moderate', goal: 'maintain' });

const meal = (daysAgo: number, grade: 'A' | 'D', treats = false): HealthEvent => ({
  id: `m${daysAgo}${grade}`, userId: 'u', type: 'MEAL', source: 'manual', occurredAt: at(daysAgo, 12),
  metadata: { protein: true, vegetables: grade === 'A', fruit: false, wholeGrains: false, fiber: false, treats,
    analysis: { foodDescription: '1 bowl of chicken and rice, 1 side salad', grade, summary: '', confidence: 1, detectedFoods: ['chicken', 'rice'],
      macros: { calories: 640, proteinGrams: 42, carbsGrams: 70, fatGrams: 18 },
      nutrients: { protein: true, vegetables: true, fruit: false, wholeGrains: false, fiber: false, treats } } },
});
const bench = (daysAgo: number, weight: number): HealthEvent => ({
  id: `w${daysAgo}`, userId: 'u', type: 'WORKOUT', source: 'manual', occurredAt: at(daysAgo, 18),
  metadata: { workoutType: 'strength', durationMinutes: 45, name: 'Push',
    exercises: [{ id: 'e', name: 'Bench Press', muscleGroup: 'chest', sets: [{ id: 's', weight, reps: 5, unit: 'kg', completed: true }] }] },
});

describe('toCompanionEvent', () => {
  it('tells the pet what was eaten, and whether it was a good plate, but never lectures data', () => {
    expect(toCompanionEvent(meal(0, 'A'))).toMatchObject({ type: 'HEALTHY_MEAL_LOGGED', metadata: { food: 'chicken, rice', grade: 'A', calories: 640 } });
    expect(toCompanionEvent(meal(0, 'D', true))).toMatchObject({ type: 'MEAL_LOGGED', metadata: { treat: true } });
  });

  it('describes a run as a run, and a lift session as strength', () => {
    const run: HealthEvent = { id: 'r', userId: 'u', type: 'WORKOUT', source: 'manual', occurredAt: at(0),
      metadata: { workoutType: 'cardio', durationMinutes: 55, distanceKm: 10, name: 'Morning run' } };
    expect(toCompanionEvent(run)!.metadata).toMatchObject({ kind: 'running', minutes: 55, distanceKm: 10 });
    expect(toCompanionEvent(bench(0, 100))!.metadata).toMatchObject({ kind: 'strength', exercises: ['Bench Press'] });
  });

  it('fires the step goal once, on the sync that crosses it', () => {
    const steps = (n: number): HealthEvent => ({ id: 's', userId: 'u', type: 'STEP_ACTIVITY', source: 'manual', occurredAt: at(0), metadata: { steps: n } });
    expect(toCompanionEvent(steps(8400), { stepGoal: 8000, previousSteps: 6000 })!.type).toBe('STEP_GOAL_REACHED');
    expect(toCompanionEvent(steps(9000), { stepGoal: 8000, previousSteps: 8400 })!.type).toBe('STEPS_LOGGED');
  });

  it('reads a short night as poor sleep and a full one as a goal met', () => {
    const sleep = (minutes: number): HealthEvent => ({ id: 'z', userId: 'u', type: 'SLEEP', source: 'healthkit', occurredAt: at(0, 7), metadata: { asleepMinutes: minutes, night: 'x' } as any });
    expect(toCompanionEvent(sleep(300))!.type).toBe('POOR_SLEEP');
    expect(toCompanionEvent(sleep(450))!.type).toBe('SLEEP_GOAL_REACHED');
  });

  it('has no feelings about event types it does not know', () => {
    expect(toCompanionEvent({ id: 'h', userId: 'u', type: 'HYDRATION', source: 'manual', occurredAt: at(0), metadata: {} } as any)).toBeNull();
  });
});

describe('newPersonalRecords', () => {
  it('reports only the lifts this workout actually beat', () => {
    expect(newPersonalRecords([bench(7, 90)], bench(0, 100), 'kg')).toEqual([{ exercise: 'Bench Press', weight: 100, unit: 'kg', reps: 5 }]);
    expect(newPersonalRecords([bench(7, 100)], bench(0, 95), 'kg')).toEqual([]);
    // A first ever lift is a record too.
    expect(newPersonalRecords([], bench(0, 60), 'kg')).toHaveLength(1);
  });
});

describe('buildLifeContext', () => {
  it('describes the day from the same figures the dashboard draws', () => {
    const pet = { ...createPet('u', 'Blue'), breed: 'bichon' as const, nutrition: 12, adoptedAt: at(40) };
    const life = buildLifeContext({ pet, events: [meal(0, 'A'), bench(0, 100)], profile, stepGoal: 8000, now: NOW });
    expect(life.pet).toMatchObject({ name: 'Blue', species: 'bichon puppy' });
    expect(life.today).toMatchObject({ meals: 1, calories: 640, workouts: 1, lastWorkoutName: 'Push', loggedSomethingToday: true });
    // Hunger is the pet's own feeling, in its own word.
    expect(life.statuses).toContain('Hungry');
    expect(life.now.timeOfDay).toBe('evening');
  });

  it('carries the bond, so a neglected pet knows it has been neglected', () => {
    const pet = { ...createPet('u', 'Blue'), adoptedAt: at(60) };
    const life = buildLifeContext({ pet, events: [meal(9, 'A')], profile, stepGoal: 8000, now: NOW });
    expect(life.bond).toBe('sulking');
    expect(life.silentDays).toBe(9);
  });
});
