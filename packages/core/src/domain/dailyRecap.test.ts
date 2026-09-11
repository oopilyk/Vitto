import { describe, expect, it } from 'vitest';
import type {
  BrainTrainingMetadata,
  HealthEvent,
  HealthEventType,
  MealMetadata,
  StepMetadata,
  WorkoutMetadata,
} from './health';
import { buildDailyRecap } from './dailyRecap';
import { PROFILE_SURVEY_DEFAULTS, type BodyProfile } from './macroTargets';
import type { PetState } from './pet';

// ---------------------------------------------------------------------------
// Event + fixture factories, in the style of insights.test.ts.
// ---------------------------------------------------------------------------

let nextId = 0;
const makeEvent = <T>(type: HealthEventType, occurredAt: string, metadata: T): HealthEvent<T> => ({
  id: `event-${(nextId += 1)}`,
  userId: 'user-1',
  occurredAt,
  type,
  source: 'manual',
  metadata,
});

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
};

const pet: PetState = {
  id: 'pet-1',
  userId: 'user-1',
  name: 'Orion',
  species: 'dog',
  level: 3,
  xp: 42,
  health: 80,
  energy: 80,
  happiness: 80,
  nutrition: 80,
  strength: 20,
  pushingStrength: 10,
  pullingStrength: 10,
  legStrength: 10,
  endurance: 20,
  recovery: 20,
  mind: 20,
  mood: 'content',
  adoptedAt: '2026-01-01T00:00:00.000Z',
};

const day = new Date(2026, 8, 10); // 2026-09-10
const onDay = (time: string) => `2026-09-10T${time}:00.000Z`;
const onOtherDay = (time: string) => `2026-09-09T${time}:00.000Z`;

describe('buildDailyRecap', () => {
  it('returns an all-empty, encouraging recap for a day with no events', () => {
    const recap = buildDailyRecap({ events: [], profile, pet, stepGoal: 10000, day });

    expect(recap.xp).toBe(0);
    expect(recap.gym.done).toBe(false);
    expect(recap.outdoors.steps).toBe(0);
    expect(recap.mind.sessionCount).toBe(0);
    expect(recap.food.mealCount).toBe(0);
    expect(recap.dailyProgress).toBe(0);
    expect(recap.activity).toEqual([]);
  });

  it('sums the XP the engine actually granted, split by pillar, and ignores other days', () => {
    const events: HealthEvent[] = [
      makeEvent<WorkoutMetadata & { xpAwarded: number }>('WORKOUT', onDay('08:00'), {
        workoutType: 'strength',
        durationMinutes: 40,
        xpAwarded: 15,
      }),
      makeEvent<StepMetadata & { xpAwarded: number }>('STEP_ACTIVITY', onDay('12:00'), {
        steps: 6000,
        xpAwarded: 8,
      }),
      // A previous day's workout must not leak into today's total.
      makeEvent<WorkoutMetadata & { xpAwarded: number }>('WORKOUT', onOtherDay('08:00'), {
        workoutType: 'strength',
        durationMinutes: 40,
        xpAwarded: 99,
      }),
    ];

    const recap = buildDailyRecap({ events, profile, pet, stepGoal: 10000, day });

    expect(recap.xp).toBe(23);
    expect(recap.xpByPillar).toEqual({ gym: 15, outdoors: 8, mind: 0, food: 0 });
  });

  it('treats an event with no stamped xpAwarded as zero XP rather than throwing', () => {
    const events: HealthEvent[] = [
      makeEvent<WorkoutMetadata>('WORKOUT', onDay('08:00'), {
        workoutType: 'strength',
        durationMinutes: 40,
      }),
    ];

    const recap = buildDailyRecap({ events, profile, pet, stepGoal: 10000, day });

    expect(recap.xp).toBe(0);
    expect(recap.gym.done).toBe(true);
  });

  it('takes the highest cumulative step snapshot for the day, not the sum of re-syncs', () => {
    // A device re-syncing steps through the day reports the running daily total
    // each time -- three syncs of a 6,840-step day, not three separate walks.
    const events: HealthEvent[] = [
      makeEvent<StepMetadata>('STEP_ACTIVITY', onDay('09:00'), { steps: 2000 }),
      makeEvent<StepMetadata>('STEP_ACTIVITY', onDay('14:00'), { steps: 5000 }),
      makeEvent<StepMetadata>('STEP_ACTIVITY', onDay('20:00'), { steps: 6840 }),
    ];

    const recap = buildDailyRecap({ events, profile, pet, stepGoal: 10000, day });

    expect(recap.outdoors.steps).toBe(6840);
    expect(recap.outdoors.percent).toBe(68);
    expect(recap.outdoors.goalReached).toBe(false);
  });

  it('aggregates multiple workouts into one gym summary', () => {
    const events: HealthEvent[] = [
      makeEvent<WorkoutMetadata>('WORKOUT', onDay('07:00'), {
        workoutType: 'strength',
        durationMinutes: 30,
        name: 'Upper Body',
        stats: {
          durationMinutes: 30,
          exerciseCount: 2,
          completedSets: 6,
          totalReps: 60,
          totalVolume: 1200,
          muscleGroups: ['chest', 'back'],
        },
      }),
      makeEvent<WorkoutMetadata>('WORKOUT', onDay('18:00'), {
        workoutType: 'cardio',
        durationMinutes: 20,
        stats: {
          durationMinutes: 20,
          exerciseCount: 1,
          completedSets: 0,
          totalReps: 0,
          totalVolume: 0,
          muscleGroups: ['legs'],
        },
      }),
    ];

    const recap = buildDailyRecap({ events, profile, pet, stepGoal: 10000, day });

    expect(recap.gym.workoutCount).toBe(2);
    expect(recap.gym.totalMinutes).toBe(50);
    expect(recap.gym.exerciseCount).toBe(3);
    expect(recap.activity).toContainEqual({ id: 'gym', label: 'Completed 2 workouts' });
  });

  it('flags an approximate food total when a meal has no usable macro analysis', () => {
    const events: HealthEvent[] = [
      makeEvent<MealMetadata>('MEAL', onDay('12:00'), {
        protein: true,
        vegetables: true,
        fruit: false,
        wholeGrains: true,
        fiber: false,
        treats: false,
        analysis: {
          grade: 'B',
          summary: 'Chicken and rice',
          confidence: 0.9,
          detectedFoods: ['chicken', 'rice'],
          macros: { calories: 500, proteinGrams: 40, carbsGrams: 50, fatGrams: 10 },
          nutrients: {
            protein: true,
            vegetables: false,
            fruit: false,
            wholeGrains: true,
            fiber: false,
            treats: false,
          },
        },
      }),
      makeEvent<MealMetadata>('MEAL', onDay('19:00'), {
        protein: false,
        vegetables: false,
        fruit: false,
        wholeGrains: false,
        fiber: false,
        treats: false,
        // No analysis at all -- e.g. logged manually with no image.
      }),
    ];

    const recap = buildDailyRecap({ events, profile, pet, stepGoal: 10000, day });

    expect(recap.food.mealCount).toBe(2);
    expect(recap.food.consumed.calories).toBe(500);
    expect(recap.food.someMealsUnanalyzed).toBe(true);
    expect(recap.activity).toContainEqual({ id: 'food', label: 'Logged 2 meals' });
  });

  it('keys mind sessions on puzzleDate when set, so a late-night puzzle still counts for its day', () => {
    const events: HealthEvent[] = [
      makeEvent<BrainTrainingMetadata>('BRAIN_TRAINING', '2026-09-11T00:30:00.000Z', {
        game: 'wordPuzzle',
        correct: 4,
        total: 5,
        durationSeconds: 90,
        score: 80,
        puzzleDate: '2026-09-10',
      }),
    ];

    const recap = buildDailyRecap({ events, profile, pet, stepGoal: 10000, day });

    expect(recap.mind.sessionCount).toBe(1);
    expect(recap.mind.wordPuzzleDone).toBe(true);
  });

  it('reports level progress straight from the pet, never a second copy', () => {
    const recap = buildDailyRecap({ events: [], profile, pet, stepGoal: 10000, day });
    expect(recap.levelProgress).toEqual({ level: 3, xpIntoLevel: 42, xpForLevel: 100 });
  });
});
