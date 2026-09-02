import { describe, expect, it } from '@jest/globals';
import {
  excludeKnownExternalIds,
  getKnownHealthKitExternalIds,
  mapStepSample,
  mapWorkoutSample,
  reconstructMealsFromNutrientSamples,
} from '../services/healthKitMapping';
import type { HealthEvent, MealMetadata, WorkoutMetadata } from '@vitto/core';

describe('mapStepSample', () => {
  it('rounds fractional step counts and tags the event as HealthKit-sourced', () => {
    const event = mapStepSample('user-1', { value: 6840.7, startDate: '2026-08-28T09:00:00.000Z' });
    expect(event.metadata.steps).toBe(6841);
    expect(event.source).toBe('healthkit');
    expect(event.type).toBe('STEP_ACTIVITY');
    expect(event.occurredAt).toBe('2026-08-28T09:00:00.000Z');
  });
});

describe('mapWorkoutSample', () => {
  it('maps a known strength activity name to workoutType "strength"', () => {
    const event = mapWorkoutSample('user-1', {
      id: 'hk-workout-1',
      activityName: 'TraditionalStrengthTraining',
      duration: 2700,
      start: '2026-08-28T18:00:00.000Z',
      sourceName: 'Strong',
    });
    expect(event.metadata.workoutType).toBe('strength');
    expect(event.metadata.durationMinutes).toBe(45);
    expect(event.metadata.workoutId).toBe('hk-workout-1');
    expect(event.metadata.notes).toBe('Imported from Strong');
  });

  it('falls back to "cardio" for activity names outside the known strength set', () => {
    const event = mapWorkoutSample('user-1', {
      id: 'hk-workout-2',
      activityName: 'Running',
      duration: 1800,
      start: '2026-08-28T07:00:00.000Z',
      sourceName: 'Strong',
    });
    expect(event.metadata.workoutType).toBe('cardio');
  });

  it('rounds a sub-minute duration up to at least one minute', () => {
    const event = mapWorkoutSample('user-1', {
      id: 'hk-workout-3',
      activityName: 'Running',
      duration: 20,
      start: '2026-08-28T07:00:00.000Z',
      sourceName: 'Strong',
    });
    expect(event.metadata.durationMinutes).toBe(1);
  });
});

describe('reconstructMealsFromNutrientSamples', () => {
  it('joins nutrient samples that share the same timestamp into one meal', () => {
    const startDate = '2026-08-28T12:30:00.000Z';
    const events = reconstructMealsFromNutrientSamples('user-1', {
      energy: [{ id: 'e1', value: 520, startDate }],
      protein: [{ id: 'p1', value: 42, startDate }],
      carbohydrates: [{ id: 'c1', value: 48, startDate }],
      fat: [{ id: 'f1', value: 14, startDate }],
      fiber: [{ id: 'fi1', value: 6, startDate }],
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
    const startDate = '2026-08-28T12:30:00.000Z';
    const events = reconstructMealsFromNutrientSamples('user-1', {
      energy: [{ id: 'e1', value: 300, startDate }],
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
        { id: 'e1', value: 300, startDate: '2026-08-28T08:00:00.000Z' },
        { id: 'e2', value: 600, startDate: '2026-08-28T18:00:00.000Z' },
      ],
      protein: [{ id: 'p1', value: 40, startDate: '2026-08-28T18:00:00.000Z' }],
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

  it('falls back to the id field when externalId is absent', () => {
    const items = [{ id: 'x' }, { id: 'y' }];
    const result = excludeKnownExternalIds(items, new Set(['x']));
    expect(result.map((item) => item.id)).toEqual(['y']);
  });

  it('keeps items with neither externalId nor id rather than silently dropping them', () => {
    const items = [{}, { externalId: 'known' }];
    const result = excludeKnownExternalIds(items, new Set(['known']));
    expect(result).toHaveLength(1);
  });
});
