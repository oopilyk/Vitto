import { describe, expect, it } from '@jest/globals';
import {
  excludeKnownExternalIds,
  getKnownHealthKitExternalIds,
  groupSleepSegmentsIntoNights,
  mapSleepNight,
  mapStepSample,
  mapWorkoutSample,
  reconstructMealsFromNutrientSamples,
} from '../services/healthKitMapping';
import type { HealthEvent, MealMetadata, SleepMetadata, WorkoutMetadata } from '@vitto/core';

describe('mapStepSample', () => {
  it('rounds fractional step counts and tags the event as HealthKit-sourced', () => {
    const event = mapStepSample('user-1', { quantity: 6840.7, startDate: new Date('2026-08-28T09:00:00.000Z') });
    expect(event.metadata.steps).toBe(6841);
    expect(event.source).toBe('healthkit');
    expect(event.type).toBe('STEP_ACTIVITY');
    expect(event.occurredAt).toBe('2026-08-28T09:00:00.000Z');
  });
});

describe('mapWorkoutSample', () => {
  it('maps a known strength activity name to workoutType "strength"', () => {
    const event = mapWorkoutSample('user-1', {
      uuid: 'hk-workout-1',
      activityName: 'traditionalStrengthTraining',
      durationSeconds: 2700,
      startDate: new Date('2026-08-28T18:00:00.000Z'),
      sourceName: 'Strong',
    });
    expect(event.metadata.workoutType).toBe('strength');
    expect(event.metadata.durationMinutes).toBe(45);
    expect(event.metadata.workoutId).toBe('hk-workout-1');
    expect(event.metadata.notes).toBe('Imported from Strong');
  });

  it('falls back to "cardio" for activity names outside the known strength set', () => {
    const event = mapWorkoutSample('user-1', {
      uuid: 'hk-workout-2',
      activityName: 'running',
      durationSeconds: 1800,
      startDate: new Date('2026-08-28T07:00:00.000Z'),
      sourceName: 'Strong',
    });
    expect(event.metadata.workoutType).toBe('cardio');
  });

  it('rounds a sub-minute duration up to at least one minute', () => {
    const event = mapWorkoutSample('user-1', {
      uuid: 'hk-workout-3',
      activityName: 'running',
      durationSeconds: 20,
      startDate: new Date('2026-08-28T07:00:00.000Z'),
      sourceName: 'Strong',
    });
    expect(event.metadata.durationMinutes).toBe(1);
  });
});

describe('reconstructMealsFromNutrientSamples', () => {
  it('joins nutrient samples that share the same timestamp into one meal', () => {
    const startDate = new Date('2026-08-28T12:30:00.000Z');
    const events = reconstructMealsFromNutrientSamples('user-1', {
      energy: [{ uuid: 'e1', quantity: 520, startDate }],
      protein: [{ uuid: 'p1', quantity: 42, startDate }],
      carbohydrates: [{ uuid: 'c1', quantity: 48, startDate }],
      fat: [{ uuid: 'f1', quantity: 14, startDate }],
      fiber: [{ uuid: 'fi1', quantity: 6, startDate }],
    });

    expect(events).toHaveLength(1);
    expect(events[0].metadata.analysis?.macros).toEqual({
      calories: 520,
      proteinGrams: 42,
      carbsGrams: 48,
      fatGrams: 14,
    });
    expect(events[0].metadata.loggedVia).toBe('healthkit');
    expect(events[0].metadata.externalId).toBe('e1');
    expect(events[0].source).toBe('healthkit');
  });

  it('defaults unmatched nutrients to zero rather than dropping the meal', () => {
    const startDate = new Date('2026-08-28T12:30:00.000Z');
    const events = reconstructMealsFromNutrientSamples('user-1', {
      energy: [{ uuid: 'e1', quantity: 300, startDate }],
      protein: [],
      carbohydrates: [],
      fat: [],
      fiber: [],
    });

    expect(events).toHaveLength(1);
    expect(events[0].metadata.analysis?.macros).toEqual({
      calories: 300,
      proteinGrams: 0,
      carbsGrams: 0,
      fatGrams: 0,
    });
  });

  it('does not join nutrient samples logged at different times', () => {
    const events = reconstructMealsFromNutrientSamples('user-1', {
      energy: [
        { uuid: 'e1', quantity: 300, startDate: new Date('2026-08-28T08:00:00.000Z') },
        { uuid: 'e2', quantity: 600, startDate: new Date('2026-08-28T18:00:00.000Z') },
      ],
      protein: [{ uuid: 'p1', quantity: 40, startDate: new Date('2026-08-28T18:00:00.000Z') }],
      carbohydrates: [],
      fat: [],
      fiber: [],
    });

    expect(events).toHaveLength(2);
    expect(events[0].metadata.analysis?.macros.proteinGrams).toBe(0);
    expect(events[1].metadata.analysis?.macros.proteinGrams).toBe(40);
  });
});

describe('getKnownHealthKitExternalIds', () => {
  it('collects workoutId from WORKOUT events and externalId from MEAL events, ignoring the rest', () => {
    const events: HealthEvent[] = [
      {
        id: '1',
        userId: 'u',
        occurredAt: '2026-08-28T00:00:00.000Z',
        type: 'WORKOUT',
        source: 'healthkit',
        metadata: { workoutType: 'strength', durationMinutes: 30, workoutId: 'hk-w1' } as WorkoutMetadata,
      },
      {
        id: '2',
        userId: 'u',
        occurredAt: '2026-08-28T00:00:00.000Z',
        type: 'MEAL',
        source: 'healthkit',
        metadata: {
          protein: false,
          vegetables: false,
          fruit: false,
          wholeGrains: false,
          fiber: false,
          treats: false,
          externalId: 'hk-m1',
        } as MealMetadata,
      },
      {
        id: '3',
        userId: 'u',
        occurredAt: '2026-08-28T00:00:00.000Z',
        type: 'STEP_ACTIVITY',
        source: 'manual',
        metadata: { steps: 100 },
      },
    ];

    expect(getKnownHealthKitExternalIds(events)).toEqual(new Set(['hk-w1', 'hk-m1']));
  });
});

describe('excludeKnownExternalIds', () => {
  it('drops items whose externalId has already been recorded', () => {
    const items = [{ externalId: 'a' }, { externalId: 'b' }, { externalId: 'c' }];
    const result = excludeKnownExternalIds(items, new Set(['b']));
    expect(result.map((item) => item.externalId)).toEqual(['a', 'c']);
  });

  it('falls back to the uuid field when externalId is absent', () => {
    const items = [{ uuid: 'x' }, { uuid: 'y' }];
    const result = excludeKnownExternalIds(items, new Set(['x']));
    expect(result.map((item) => item.uuid)).toEqual(['y']);
  });

  it('keeps items with neither externalId nor uuid rather than silently dropping them', () => {
    const items = [{}, { externalId: 'known' }];
    const result = excludeKnownExternalIds(items, new Set(['known']));
    expect(result).toHaveLength(1);
  });
});

describe('groupSleepSegmentsIntoNights', () => {
  const seg = (startIso: string, endIso: string, value: number, uuid?: string) => ({
    uuid,
    startDate: new Date(startIso),
    endDate: new Date(endIso),
    value,
  });

  it('stitches consecutive asleep segments into one night', () => {
    const nights = groupSleepSegmentsIntoNights([
      seg('2026-09-02T23:00:00Z', '2026-09-03T01:00:00Z', 3),
      seg('2026-09-03T01:00:00Z', '2026-09-03T03:30:00Z', 5),
      seg('2026-09-03T03:30:00Z', '2026-09-03T06:00:00Z', 4),
    ]);
    expect(nights).toHaveLength(1);
    expect(nights[0].asleepMinutes).toBe(420);
  });

  it('excludes inBed and awake segments so lying awake is not counted as rest', () => {
    const nights = groupSleepSegmentsIntoNights([
      seg('2026-09-02T22:00:00Z', '2026-09-02T23:00:00Z', 0),
      seg('2026-09-02T23:00:00Z', '2026-09-03T02:00:00Z', 3),
      seg('2026-09-03T02:00:00Z', '2026-09-03T02:30:00Z', 2),
      seg('2026-09-03T02:30:00Z', '2026-09-03T05:00:00Z', 5),
    ]);
    expect(nights).toHaveLength(1);
    // Three asleep hours plus two and a half; the inBed hour and the awake half
    // hour contribute nothing.
    expect(nights[0].asleepMinutes).toBe(330);
  });

  it('counts overlapping segments from two devices once, not twice', () => {
    const nights = groupSleepSegmentsIntoNights([
      seg('2026-09-02T23:00:00Z', '2026-09-03T05:00:00Z', 1, 'phone'),
      seg('2026-09-02T23:30:00Z', '2026-09-03T04:30:00Z', 3, 'watch'),
    ]);
    expect(nights).toHaveLength(1);
    expect(nights[0].asleepMinutes).toBe(360);
  });

  it('splits an evening nap from the night that follows it', () => {
    const nights = groupSleepSegmentsIntoNights([
      seg('2026-09-02T14:00:00Z', '2026-09-02T14:40:00Z', 1),
      seg('2026-09-02T23:00:00Z', '2026-09-03T06:00:00Z', 3),
    ]);
    expect(nights.map((night) => night.asleepMinutes)).toEqual([40, 420]);
  });

  it('keeps a short mid-night wake-up inside the same night', () => {
    const nights = groupSleepSegmentsIntoNights([
      seg('2026-09-02T23:00:00Z', '2026-09-03T02:00:00Z', 3),
      seg('2026-09-03T03:00:00Z', '2026-09-03T06:00:00Z', 3),
    ]);
    expect(nights).toHaveLength(1);
    expect(nights[0].asleepMinutes).toBe(360);
  });

  it('drops zero-length segments rather than emitting empty nights', () => {
    expect(groupSleepSegmentsIntoNights([
      seg('2026-09-03T01:00:00Z', '2026-09-03T01:00:00Z', 3),
    ])).toEqual([]);
  });
});

describe('mapSleepNight', () => {
  it('attributes the night to the morning it ended and carries its id for dedupe', () => {
    const event = mapSleepNight('user-1', {
      asleepMinutes: 415,
      endedAt: new Date('2026-09-03T06:00:00Z'),
      externalId: 'last-segment',
    });
    expect(event.type).toBe('SLEEP');
    expect(event.source).toBe('healthkit');
    expect(event.metadata.asleepMinutes).toBe(415);
    expect(event.metadata.externalId).toBe('last-segment');
    expect(event.occurredAt).toBe('2026-09-03T06:00:00.000Z');
  });

  it('is recognised by the dedupe index so a night is never replayed', () => {
    const event = mapSleepNight('user-1', {
      asleepMinutes: 400,
      endedAt: new Date('2026-09-03T06:00:00Z'),
      externalId: 'night-1',
    });
    const known = getKnownHealthKitExternalIds([event as HealthEvent<SleepMetadata>]);
    expect(known.has('night-1')).toBe(true);
  });
});
