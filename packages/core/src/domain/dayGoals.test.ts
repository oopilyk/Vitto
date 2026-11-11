import { describe, expect, it } from 'vitest';
import { buildDailyRecap } from './dailyRecap';
import { dayGoals } from './dayGoals';
import type { HealthEvent } from './health';
import { PROFILE_SURVEY_DEFAULTS, type BodyProfile } from './macroTargets';
import { createPet } from './pet';

const day = new Date('2026-11-10T15:00:00');
const profile: BodyProfile = {
  age: 30,
  sex: 'male',
  heightCm: 178,
  heightUnit: 'cm',
  weightKg: 80,
  weightUnit: 'kg',
  activity: 'moderate',
  goal: 'maintain',
  ...PROFILE_SURVEY_DEFAULTS,
  trainingDaysPerWeek: 3,
};
const pet = createPet('u', 'Blue');

const event = (type: HealthEvent['type'], at: Date, metadata: Record<string, unknown>): HealthEvent => ({
  id: `${type}-${at.getTime()}`,
  userId: 'u',
  type,
  occurredAt: at.toISOString(),
  metadata,
}) as HealthEvent;

const goalsFor = (events: HealthEvent[], areas?: PetState['careAreas']) => {
  const withAreas = { ...pet, careAreas: areas };
  return dayGoals(buildDailyRecap({ events, profile, pet: withAreas, stepGoal: 10_000, day }), { events, profile, pet: withAreas, day });
};

type PetState = ReturnType<typeof createPet>;

describe('dayGoals', () => {
  it('says what is left of an untouched day', () => {
    const goals = goalsFor([event('STEP_ACTIVITY', day, { steps: 4_837 })]);
    expect(goals.map((goal) => goal.id)).toEqual(['calories', 'workout', 'steps']);
    expect(goals.find((goal) => goal.id === 'steps')).toEqual({ id: 'steps', label: '5,163 steps left', done: false });
    expect(goals.find((goal) => goal.id === 'workout')).toEqual({ id: 'workout', label: 'Workout', done: false });
    expect(goals.find((goal) => goal.id === 'calories')?.label).toMatch(/kcal left$/);
  });

  it('ticks off a workout done today, and only today', () => {
    expect(goalsFor([event('WORKOUT', day, { durationMinutes: 40 })]).find((goal) => goal.id === 'workout')).toEqual({
      id: 'workout',
      label: 'Workout',
      done: true,
    });
    const yesterday = [event('WORKOUT', new Date(day.getTime() - 86_400_000), { durationMinutes: 40 })];
    expect(goalsFor(yesterday).find((goal) => goal.id === 'workout')?.done).toBe(false);
  });

  it('treats eating past the target as done, never as a number over', () => {
    const feast = event('MEAL', day, { analysis: { macros: { calories: 9_000, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 } } });
    expect(goalsFor([feast]).find((goal) => goal.id === 'calories')).toEqual({ id: 'calories', label: 'Calories', done: true });
  });

  it('leaves out an area the person does not track', () => {
    expect(goalsFor([], ['mind', 'movement']).map((goal) => goal.id)).toEqual(['steps']);
  });
});

describe('dayGoals with a training rotation', () => {
  const push = { id: 'push', name: 'Push', exercises: [], updatedAt: '2026-11-01T00:00:00Z' };
  const workoutGoal = (events: HealthEvent[], rotation: Parameters<typeof dayGoals>[1]['rotation']) =>
    dayGoals(buildDailyRecap({ events, profile, pet, stepGoal: 10_000, day }), { events, profile, pet, day, rotation }).find(
      (goal) => goal.id === 'workout',
    );

  it('says which day of the rotation today is, ticked once trained or on a rest day', () => {
    const routineDay = { index: 0, length: 2, day: { kind: 'routine' as const, templateId: 'push' }, template: push };
    expect(workoutGoal([], routineDay)).toEqual({ id: 'workout', label: 'Day 1 · Push', done: false });
    expect(workoutGoal([event('WORKOUT', day, { durationMinutes: 40 })], routineDay)).toEqual({ id: 'workout', label: 'Day 1 · Push', done: true });
    expect(workoutGoal([], { index: 1, length: 2, day: { kind: 'rest', id: 'r' } })).toEqual({ id: 'workout', label: 'Day 2 · Rest', done: true });
  });

  it('cuts a long routine name short so the chip still fits', () => {
    const long = { ...push, name: 'Upper Body Hypertrophy' };
    const label = workoutGoal([], { index: 2, length: 5, day: { kind: 'routine', templateId: 'push' }, template: long })?.label;
    expect(label).toBe('Day 3 · Upper Body Hy…');
  });
});
