import { PROFILE_SURVEY_DEFAULTS, createPet, type BodyProfile, type HealthEvent, type MealMetadata } from '@vitto/core';
import { buildIslandState, withRest } from '../services/petIsland';
import { buildWidgetSnapshot } from '../services/petWidget';

const NOW = new Date(2026, 10, 6, 13, 0, 0);
const profile = {
  age: 30, sex: 'other', heightCm: 173, weightKg: 73, heightUnit: 'cm', weightUnit: 'kg', activity: 'moderate', goal: 'maintain',
  ...PROFILE_SURVEY_DEFAULTS,
} as BodyProfile;
const pet = { ...createPet('u', 'Blue', 'dog', 'bunny'), mood: 'content' as const };

describe('a rest on the Island', () => {
  const state = buildIslandState(pet, NOW.getTime());

  it('lays a running rest over the state as it was sent, in seconds', () => {
    const resting = withRest(state, { startedAt: NOW.getTime(), endsAt: NOW.getTime() + 90_000, label: 'Squat' }, NOW.getTime());
    expect(resting).toMatchObject({ restLabel: 'Squat', restEndsAt: state.asOf + 90, restStartedAt: state.asOf });
    expect(resting.energyEmptyAt).toBe(state.energyEmptyAt);
  });

  it('takes a finished or cleared rest off', () => {
    const resting = withRest(state, { startedAt: 0, endsAt: NOW.getTime() + 1000, label: 'Squat' }, NOW.getTime());
    expect(withRest(resting, null).restEndsAt).toBeUndefined();
    expect(withRest(resting, { startedAt: 0, endsAt: NOW.getTime() - 1, label: 'Squat' }, NOW.getTime()).restLabel).toBeUndefined();
  });
});

describe('the Home Screen widget', () => {
  it("carries the pet and today's food and steps, and when today ends", () => {
    const meal: HealthEvent<MealMetadata> = {
      id: 'm',
      userId: 'u',
      occurredAt: new Date(2026, 10, 6, 8, 0).toISOString(),
      type: 'MEAL',
      source: 'manual',
      metadata: {
        protein: true, vegetables: false, fruit: false, wholeGrains: false, fiber: false, treats: false,
        analysis: {
          grade: 'B', summary: 'Eggs', confidence: 1, detectedFoods: ['eggs'],
          macros: { calories: 350, proteinGrams: 24, carbsGrams: 2, fatGrams: 25 },
          nutrients: { protein: true, vegetables: false, fruit: false, wholeGrains: false, fiber: false, treats: false },
        },
      },
    };
    const snapshot = buildWidgetSnapshot({ pet, events: [meal], profile, stepGoal: 8000 }, NOW);
    expect(snapshot).toMatchObject({ name: 'Blue', calories: 350, proteinGrams: 24, steps: 0, stepGoal: 8000 });
    expect(snapshot.calorieTarget).toBeGreaterThan(0);
    expect(snapshot.dayEndsAt).toBe(Math.round(new Date(2026, 10, 7).getTime() / 1000));
    expect(snapshot.sprite).toBe(buildIslandState(pet, NOW.getTime()).sprite);
  });
});
