import { describe, expect, it } from 'vitest';
import { careToast, describeDelta, describeLoggedEvent, formatCount, formatMinutes } from './careToast';
import type { HealthEvent } from './health';

const event = <T,>(type: HealthEvent['type'], metadata: T): HealthEvent =>
  ({ id: 'e-1', userId: 'u-1', occurredAt: '2026-09-09T08:00:00Z', type, source: 'manual', metadata }) as HealthEvent;

describe('formatCount', () => {
  it('groups thousands without relying on the platform locale', () => {
    expect(formatCount(1240)).toBe('1,240');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1234567)).toBe('1,234,567');
  });

  it('survives the numbers a broken health read can hand it', () => {
    expect(formatCount(Number.NaN)).toBe('0');
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe('0');
    expect(formatCount(1240.6)).toBe('1,241');
  });
});

describe('describeLoggedEvent', () => {
  it('puts the user\'s own number in the step message', () => {
    expect(describeLoggedEvent(event('STEP_ACTIVITY', { steps: 1240 }))).toBe('1,240 steps logged');
  });

  it('says "step" for exactly one', () => {
    expect(describeLoggedEvent(event('STEP_ACTIVITY', { steps: 1 }))).toBe('1 step logged');
  });

  it('names the workout and its length', () => {
    expect(describeLoggedEvent(event('WORKOUT', { workoutType: 'running', durationMinutes: 45 }))).toBe(
      '45 min running logged',
    );
  });

  it('drops the parts of a workout it was not given', () => {
    expect(describeLoggedEvent(event('WORKOUT', { workoutType: '', durationMinutes: 30 }))).toBe(
      '30 min workout logged',
    );
    expect(describeLoggedEvent(event('WORKOUT', { workoutType: 'yoga', durationMinutes: 0 }))).toBe('yoga logged');
  });

  it('uses what the meal photo was read as, with its calories', () => {
    const meal = event('MEAL', {
      protein: true,
      vegetables: true,
      fruit: false,
      wholeGrains: false,
      fiber: false,
      treats: false,
      analysis: { foodDescription: 'Chicken bowl', macros: { calories: 520 } },
    });
    expect(describeLoggedEvent(meal)).toBe('Chicken bowl logged · 520 kcal');
  });

  it('falls back to a plain meal when there is no analysis', () => {
    expect(describeLoggedEvent(event('MEAL', { protein: true }))).toBe('Meal logged');
  });

  it('reports the brain-training score', () => {
    expect(describeLoggedEvent(event('BRAIN_TRAINING', { game: 'math', correct: 9, total: 12 }))).toBe(
      'Quick maths: 9/12 correct',
    );
  });

  it('rounds sleep to a readable hour figure', () => {
    expect(describeLoggedEvent(event('SLEEP', { asleepMinutes: 465 }))).toBe('7.8h of sleep logged');
    expect(describeLoggedEvent(event('SLEEP', { asleepMinutes: 480 }))).toBe('8h of sleep logged');
  });

  it('reuses the app\'s duration style for screen time', () => {
    expect(describeLoggedEvent(event('SCREEN_TIME', { minutes: 200 }))).toBe('3h 20m of screen time logged');
    expect(formatMinutes(200)).toBe('3h 20m');
  });

  it('has something to say for every event type', () => {
    expect(describeLoggedEvent(event('HYDRATION', {}))).toBe('Water logged');
    expect(describeLoggedEvent(event('MANUAL_ACTIVITY', {}))).toBe('Logged');
  });
});

describe('describeDelta', () => {
  it('leads with the biggest movement and ends on XP', () => {
    expect(describeDelta({ energy: 7, happiness: 4, endurance: 3, xp: 16 })).toBe(
      '+7 energy · +4 happiness · +3 endurance · +16 XP',
    );
  });

  it('trims to the three that moved most, keeping XP', () => {
    const line = describeDelta({ health: 1, energy: 7, happiness: 4, nutrition: 9, mind: 2, xp: 10 });
    expect(line).toBe('+9 nutrition · +7 energy · +4 happiness · +10 XP');
  });

  it('shows a loss as a loss', () => {
    expect(describeDelta({ energy: -4, happiness: -2, xp: 2 })).toBe('-4 energy · -2 happiness · +2 XP');
  });

  it('ignores stats that did not move', () => {
    expect(describeDelta({ energy: 0, happiness: 3, xp: 5 })).toBe('+3 happiness · +5 XP');
  });

  it('is null when nothing moved, so the toast shows one line not an empty second', () => {
    expect(describeDelta({})).toBeNull();
    expect(describeDelta({ energy: 0, xp: 0 })).toBeNull();
  });
});

describe('careToast', () => {
  it('states the fact and the effect together', () => {
    expect(careToast(event('STEP_ACTIVITY', { steps: 8200 }), { energy: 7, endurance: 3, xp: 16 })).toEqual({
      headline: '8,200 steps logged',
      detail: '+7 energy · +3 endurance · +16 XP',
    });
  });
});
