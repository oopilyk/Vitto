import { describe, expect, it } from 'vitest';
import {
  PROFILE_SURVEY_DEFAULTS,
  calculateMacroTargets,
  convertHeightToFeetAndInches,
  convertWeightValue,
  feetAndInchesToCm,
  weightGoalProgress,
  withSurveyDefaults,
  type BodyProfile,
} from './macroTargets';

const baseProfile: BodyProfile = {
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

describe('unit conversion helpers', () => {
  it('preserves the same value when converting between kg and lb', () => {
    const pounds = convertWeightValue(10, 'kg', 'lb');
    expect(pounds).toBeCloseTo(22.0462, 4);
    expect(convertWeightValue(pounds, 'lb', 'kg')).toBeCloseTo(10, 4);
  });

  it('preserves the same height when converting between cm and ft/in', () => {
    const feetAndInches = convertHeightToFeetAndInches(170);
    expect(feetAndInches).toEqual({ feet: 5, inches: 7 });
    expect(feetAndInchesToCm(feetAndInches.feet, feetAndInches.inches)).toBe(170);
  });
});

describe('survey answers change the targets', () => {
  it('widens the calorie gap as the pace gets more aggressive', () => {
    const cutting = { ...baseProfile, goal: 'lose' as const };
    const gentle = calculateMacroTargets({ ...cutting, goalPace: 'gentle' }).calories;
    const steady = calculateMacroTargets({ ...cutting, goalPace: 'steady' }).calories;
    const focused = calculateMacroTargets({ ...cutting, goalPace: 'focused' }).calories;

    expect(gentle).toBeGreaterThan(steady);
    expect(steady).toBeGreaterThan(focused);
    expect(gentle - focused).toBe(400);
  });

  it('reverses that direction when building muscle', () => {
    const bulking = { ...baseProfile, goal: 'gain' as const };
    expect(calculateMacroTargets({ ...bulking, goalPace: 'focused' }).calories).toBeGreaterThan(
      calculateMacroTargets({ ...bulking, goalPace: 'gentle' }).calories,
    );
  });

  it('leaves maintenance untouched by the pace answer', () => {
    expect(calculateMacroTargets({ ...baseProfile, goalPace: 'focused' }).calories).toBe(
      calculateMacroTargets({ ...baseProfile, goalPace: 'gentle' }).calories,
    );
  });

  it('raises calories for each extra training day', () => {
    const rest = calculateMacroTargets({ ...baseProfile, trainingDaysPerWeek: 0 }).calories;
    const busy = calculateMacroTargets({ ...baseProfile, trainingDaysPerWeek: 6 }).calories;
    expect(busy).toBeGreaterThan(rest);
  });

  it('stops crediting training days beyond six', () => {
    expect(calculateMacroTargets({ ...baseProfile, trainingDaysPerWeek: 7 }).calories).toBe(
      calculateMacroTargets({ ...baseProfile, trainingDaysPerWeek: 6 }).calories,
    );
  });

  it('asks more protein of someone lifting than someone only doing cardio', () => {
    const lifting = calculateMacroTargets({ ...baseProfile, trainingStyle: 'strength', trainingDaysPerWeek: 4 });
    const cardio = calculateMacroTargets({ ...baseProfile, trainingStyle: 'cardio', trainingDaysPerWeek: 4 });
    expect(lifting.proteinGrams).toBeGreaterThan(cardio.proteinGrams);
  });

  it('never drops below the calorie floor', () => {
    const tiny = calculateMacroTargets({
      ...baseProfile,
      weightKg: 40,
      heightCm: 150,
      age: 70,
      sex: 'female',
      activity: 'low',
      trainingDaysPerWeek: 0,
      goal: 'lose',
      goalPace: 'focused',
    });
    expect(tiny.calories).toBe(1200);
    expect(tiny.carbsGrams).toBeGreaterThanOrEqual(0);
  });
});

describe('weightGoalProgress', () => {
  it('reports the gap and whether it agrees with the stated goal', () => {
    const cutting = { ...baseProfile, goal: 'lose' as const, targetWeightKg: 74.5 };
    expect(weightGoalProgress(cutting)).toEqual({ direction: 'lose', remainingKg: 5.5, matchesGoal: true });

    const contradictory = { ...cutting, targetWeightKg: 86 };
    expect(weightGoalProgress(contradictory)?.matchesGoal).toBe(false);
  });

  it('is absent until a target is set', () => {
    expect(weightGoalProgress(baseProfile)).toBeNull();
  });
});

describe('withSurveyDefaults', () => {
  it('fills in answers for profiles saved before the survey existed', () => {
    const legacy = withSurveyDefaults({ age: 30, weightKg: 70 });
    expect(legacy.goalPace).toBe('steady');
    expect(legacy.trainingDaysPerWeek).toBe(3);
    expect(legacy.focusAreas.length).toBeGreaterThan(0);
  });

  it('keeps answers that are already there', () => {
    const answered = withSurveyDefaults({ goalPace: 'focused', focusAreas: ['mind'] });
    expect(answered.goalPace).toBe('focused');
    expect(answered.focusAreas).toEqual(['mind']);
  });
});
