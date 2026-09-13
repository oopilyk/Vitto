import { describe, expect, it } from 'vitest';
import {
  calculateQualifyingStreaks,
  calculateStreakStatus,
  calculateStreaks,
  createsNewStreakDay,
  isQualifyingStreakEvent,
} from './streaks';
import type { BrainTrainingMetadata, HealthEvent, HealthEventType, SleepMetadata } from './health';

const makeEvent = (occurredAt: string): HealthEvent => ({
  id: occurredAt,
  userId: 'user-1',
  occurredAt,
  type: 'STEP_ACTIVITY',
  source: 'manual',
  metadata: { steps: 1000 },
});

let nextId = 0;
const event = <T>(type: HealthEventType, occurredAt: string, metadata: T): HealthEvent<T> => ({
  id: `event-${(nextId += 1)}`,
  userId: 'user-1',
  occurredAt,
  type,
  source: 'manual',
  metadata,
});

const meal = (occurredAt: string) =>
  event(
    'MEAL',
    occurredAt,
    { protein: true, vegetables: true, fruit: false, wholeGrains: false, fiber: false, treats: false },
  );
const workout = (occurredAt: string) => event('WORKOUT', occurredAt, { workoutType: 'strength', durationMinutes: 30 });
const steps = (occurredAt: string, count: number) => event('STEP_ACTIVITY', occurredAt, { steps: count });
const sleep = (occurredAt: string) =>
  event<SleepMetadata>('SLEEP', occurredAt, { asleepMinutes: 420, night: occurredAt.slice(0, 10) });
const mind = (occurredAt: string, over: Partial<BrainTrainingMetadata> = {}) =>
  event<BrainTrainingMetadata>('BRAIN_TRAINING', occurredAt, {
    game: 'math',
    correct: 8,
    total: 10,
    durationSeconds: 90,
    score: 80,
    ...over,
  });

describe('calculateStreaks', () => {
  it('counts today toward the current streak when today already has activity', () => {
    const today = new Date(2026, 7, 28);
    const events = [
      makeEvent('2026-08-26T09:00:00'),
      makeEvent('2026-08-27T09:00:00'),
      makeEvent('2026-08-28T09:00:00'),
    ];

    expect(calculateStreaks(events, today).currentStreak).toBe(3);
  });

  it('keeps yesterday-based streak alive when today has no activity yet', () => {
    const today = new Date(2026, 7, 28);
    const events = [makeEvent('2026-08-26T09:00:00'), makeEvent('2026-08-27T09:00:00')];

    expect(calculateStreaks(events, today).currentStreak).toBe(2);
  });

  it('resets the current streak to zero after a missed day', () => {
    const today = new Date(2026, 7, 28);
    const events = [makeEvent('2026-08-20T09:00:00'), makeEvent('2026-08-21T09:00:00')];

    expect(calculateStreaks(events, today).currentStreak).toBe(0);
  });

  it('tracks the longest streak independently of the current one', () => {
    const today = new Date(2026, 7, 28);
    const events = [
      makeEvent('2026-08-01T09:00:00'),
      makeEvent('2026-08-02T09:00:00'),
      makeEvent('2026-08-03T09:00:00'),
      makeEvent('2026-08-04T09:00:00'),
      makeEvent('2026-08-27T09:00:00'),
      makeEvent('2026-08-28T09:00:00'),
    ];

    const summary = calculateStreaks(events, today);
    expect(summary.longestStreak).toBe(4);
    expect(summary.currentStreak).toBe(2);
  });

  it('only counts one day of credit for multiple events on the same day', () => {
    const today = new Date(2026, 7, 28);
    const events = [makeEvent('2026-08-28T09:00:00'), makeEvent('2026-08-28T18:00:00')];

    expect(calculateStreaks(events, today).currentStreak).toBe(1);
  });
});

describe('isQualifyingStreakEvent', () => {
  it('qualifies a meal, a workout, and a mind session regardless of magnitude', () => {
    expect(isQualifyingStreakEvent(meal('2026-09-10T12:00:00'))).toBe(true);
    expect(isQualifyingStreakEvent(workout('2026-09-10T07:00:00'))).toBe(true);
    expect(isQualifyingStreakEvent(mind('2026-09-10T20:00:00'))).toBe(true);
  });

  it('qualifies a step reading only once it is meaningful, not any nonzero count', () => {
    expect(isQualifyingStreakEvent(steps('2026-09-10T09:00:00', 40))).toBe(false);
    expect(isQualifyingStreakEvent(steps('2026-09-10T09:00:00', 1000))).toBe(true);
  });

  it('does not qualify sleep or screen time -- the exact "just opened the app" loophole this closes', () => {
    expect(isQualifyingStreakEvent(sleep('2026-09-10T23:00:00'))).toBe(false);
    expect(
      isQualifyingStreakEvent(event('SCREEN_TIME', '2026-09-10T21:00:00', { minutes: 90 })),
    ).toBe(false);
  });
});

describe('calculateQualifyingStreaks', () => {
  it('does not count a day whose only activity is a passive, non-qualifying event', () => {
    // The exact case the redesign targets: opening the app (or a wearable's
    // automatic overnight sync) leaves only a SLEEP row for the day -- no
    // qualifying streak day should result from that alone.
    const today = new Date(2026, 8, 10);
    const events = [sleep('2026-09-08T23:00:00'), sleep('2026-09-09T23:00:00'), sleep('2026-09-10T08:00:00')];
    expect(calculateQualifyingStreaks(events, today).currentStreak).toBe(0);
  });

  it('lets any of the qualifying activity types start a streak', () => {
    const today = new Date(2026, 8, 10);
    expect(calculateQualifyingStreaks([meal('2026-09-10T12:00:00')], today).currentStreak).toBe(1);
    expect(calculateQualifyingStreaks([workout('2026-09-10T07:00:00')], today).currentStreak).toBe(1);
    expect(calculateQualifyingStreaks([mind('2026-09-10T20:00:00')], today).currentStreak).toBe(1);
    expect(calculateQualifyingStreaks([steps('2026-09-10T18:00:00', 8500)], today).currentStreak).toBe(1);
  });

  it('counts several qualifying activities on one day as a single streak day', () => {
    const today = new Date(2026, 8, 10);
    const events = [
      meal('2026-09-10T08:00:00'),
      workout('2026-09-10T12:00:00'),
      steps('2026-09-10T18:00:00', 8000),
      mind('2026-09-10T20:00:00'),
      meal('2026-09-10T21:00:00'),
    ];
    expect(calculateQualifyingStreaks(events, today).currentStreak).toBe(1);
  });

  it('breaks the streak on a missed calendar day', () => {
    const today = new Date(2026, 8, 11); // Thursday
    const events = [
      meal('2026-09-08T08:00:00'), // Monday
      workout('2026-09-09T08:00:00'), // Tuesday
      // Wednesday: nothing
      meal('2026-09-11T08:00:00'), // Thursday
    ];
    expect(calculateQualifyingStreaks(events, today).currentStreak).toBe(1);
  });

  it('starts a brand-new streak at 1 for the very first qualifying activity ever', () => {
    const today = new Date(2026, 8, 10);
    expect(calculateQualifyingStreaks([meal('2026-09-10T08:00:00')], today).currentStreak).toBe(1);
  });

  it('credits a late-night word puzzle to the puzzle day, not the clock day it was finished on', () => {
    const today = new Date(2026, 8, 10);
    // Started before midnight, finished just after -- but its puzzleDate says
    // it belongs to the 10th.
    const events = [mind('2026-09-11T00:03:00', { game: 'wordPuzzle', puzzleDate: '2026-09-10' })];
    expect(calculateQualifyingStreaks(events, today).activeDateKeys.has('2026-09-10')).toBe(true);
    expect(calculateQualifyingStreaks(events, today).activeDateKeys.has('2026-09-11')).toBe(false);
  });
});

describe('calculateStreakStatus', () => {
  it('reports today as not yet qualifying, while still counting yesterday toward the current streak', () => {
    const today = new Date(2026, 8, 10);
    const status = calculateStreakStatus([meal('2026-09-09T08:00:00')], today);
    expect(status.todayQualifies).toBe(false);
    expect(status.currentStreak).toBe(1); // still alive, not yet broken
  });

  it('reports today as qualifying once a qualifying activity is logged', () => {
    const today = new Date(2026, 8, 10);
    const status = calculateStreakStatus(
      [meal('2026-09-09T08:00:00'), workout('2026-09-10T08:00:00')],
      today,
    );
    expect(status.todayQualifies).toBe(true);
    expect(status.currentStreak).toBe(2);
  });
});

describe('createsNewStreakDay', () => {
  it('is true for the first qualifying activity of a new day', () => {
    expect(createsNewStreakDay([], meal('2026-09-10T08:00:00'))).toBe(true);
  });

  it('is false for a second qualifying activity on a day that already qualified', () => {
    const existing = [meal('2026-09-10T08:00:00')];
    expect(createsNewStreakDay(existing, workout('2026-09-10T18:00:00'))).toBe(false);
    expect(createsNewStreakDay(existing, meal('2026-09-10T21:00:00'))).toBe(false);
  });

  it('is false for a non-qualifying event, whatever the day', () => {
    expect(createsNewStreakDay([], sleep('2026-09-10T23:00:00'))).toBe(false);
    expect(createsNewStreakDay([], steps('2026-09-10T09:00:00', 50))).toBe(false);
  });

  it('is true again the first day after a missed day, even with a long qualifying history before it', () => {
    const existing = [meal('2026-09-01T08:00:00'), workout('2026-09-08T08:00:00')]; // last one two days before the gap
    // 2026-09-09 was missed entirely; today (the 10th) is a new day.
    expect(createsNewStreakDay(existing, meal('2026-09-10T08:00:00'))).toBe(true);
  });
});
