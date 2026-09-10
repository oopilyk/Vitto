import { describe, expect, it } from 'vitest';
import {
  FOCUS_AREAS,
  PROFILE_SURVEY_DEFAULTS,
  calculateMacroTargets,
  measurementSystemOf,
  measurementSystemForLocale,
  unitsFor,
  withMeasurementSystem,
  convertHeightToFeetAndInches,
  convertWeightValue,
  feetAndInchesToCm,
  planForGoal,
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

  it('never invents a screen-time budget, but keeps one the user set', () => {
    expect(withSurveyDefaults({ age: 30 }).screenTimeBudgetMinutes).toBeUndefined();
    expect(withSurveyDefaults({ screenTimeBudgetMinutes: 150 }).screenTimeBudgetMinutes).toBe(150);
  });
});

describe('planForGoal', () => {
  const cutting = { ...baseProfile, goal: 'lose' as const, targetWeightKg: 74, goalWeeks: 12 };

  it('turns a target and a deadline into a daily calorie gap', () => {
    const plan = planForGoal(cutting);
    expect(plan?.totalKg).toBe(6);
    expect(plan?.kgPerWeek).toBe(0.5);
    // 0.5 kg/week ≈ 550 kcal/day
    expect(plan?.dailyAdjustment).toBe(-550);
    expect(plan?.capped).toBe(false);
    expect(plan?.achievableWeeks).toBe(12);
  });

  it('drives the calorie target instead of the pace preset', () => {
    const fromTimeline = calculateMacroTargets(cutting).calories;
    const fromPace = calculateMacroTargets({ ...cutting, goalWeeks: undefined }).calories;
    expect(fromTimeline).not.toBe(fromPace);

    const slower = calculateMacroTargets({ ...cutting, goalWeeks: 24 }).calories;
    expect(slower).toBeGreaterThan(fromTimeline);
  });

  it('caps an unsafe deadline and says how long it would really take', () => {
    const crash = planForGoal({ ...cutting, targetWeightKg: 60, goalWeeks: 4 });
    expect(crash?.requestedDaily).toBeGreaterThan(1000);
    expect(crash?.dailyAdjustment).toBe(-1000);
    expect(crash?.capped).toBe(true);
    expect(crash?.achievableWeeks).toBeGreaterThan(4);
  });

  it('caps a bulk lower than a cut', () => {
    const bulk = planForGoal({ ...baseProfile, goal: 'gain', targetWeightKg: 90, goalWeeks: 4 });
    expect(bulk?.dailyAdjustment).toBe(500);
  });

  it('falls back to the pace presets without both answers', () => {
    expect(planForGoal({ ...cutting, goalWeeks: undefined })).toBeNull();
    expect(planForGoal({ ...cutting, targetWeightKg: undefined })).toBeNull();
    expect(planForGoal({ ...cutting, goal: 'maintain' })).toBeNull();
    expect(planForGoal({ ...cutting, goalWeeks: 0 })).toBeNull();
  });

  it('still respects the calorie floor when the deadline is aggressive', () => {
    const targets = calculateMacroTargets({
      ...baseProfile,
      sex: 'female',
      weightKg: 55,
      heightCm: 160,
      goal: 'lose',
      targetWeightKg: 50,
      goalWeeks: 4,
    });
    expect(targets.calories).toBeGreaterThanOrEqual(1200);
  });
});

describe('measurement system', () => {
  const base = {
    age: 30,
    sex: 'male' as const,
    heightCm: 175,
    heightUnit: 'cm' as const,
    weightKg: 70,
    weightUnit: 'kg' as const,
    activity: 'moderate' as const,
    goal: 'maintain' as const,
    goalPace: 'steady' as const,
    trainingDaysPerWeek: 3,
    trainingStyle: 'mixed' as const,
    focusAreas: FOCUS_AREAS,
  };

  it('maps a system to both units at once', () => {
    expect(unitsFor('metric')).toEqual({ heightUnit: 'cm', weightUnit: 'kg' });
    expect(unitsFor('imperial')).toEqual({ heightUnit: 'ft', weightUnit: 'lb' });
  });

  it('reads the system off the weight unit', () => {
    expect(measurementSystemOf({ weightUnit: 'kg' })).toBe('metric');
    expect(measurementSystemOf({ weightUnit: 'lb' })).toBe('imperial');
  });

  it('switches both units together, leaving the stored values alone', () => {
    const imperial = withMeasurementSystem(base, 'imperial');
    expect(imperial.heightUnit).toBe('ft');
    expect(imperial.weightUnit).toBe('lb');
    // Values are always stored metric; only the display unit moves.
    expect(imperial.heightCm).toBe(175);
    expect(imperial.weightKg).toBe(70);
  });

  it('reconciles a mixed pair from before the single toggle existed', () => {
    // Pounds with centimetres was reachable with the old two toggles; weight
    // decides, so this resolves to fully imperial rather than staying mixed.
    const mixed = withSurveyDefaults({ ...base, weightUnit: 'lb', heightUnit: 'cm' });
    expect(mixed.heightUnit).toBe('ft');
    expect(mixed.weightUnit).toBe('lb');
  });

  it('leaves a consistent metric profile untouched', () => {
    const metric = withSurveyDefaults(base);
    expect(metric.heightUnit).toBe('cm');
    expect(metric.weightUnit).toBe('kg');
  });
});


describe('measurementSystemForLocale', () => {
  it('starts an American phone on imperial', () => {
    expect(measurementSystemForLocale('en-US')).toBe('imperial');
    expect(measurementSystemForLocale('es-US')).toBe('imperial');
  });

  it('starts everywhere else on metric', () => {
    for (const locale of ['en-GB', 'en-AU', 'fr-FR', 'de-DE', 'ja-JP', 'en-CA']) {
      expect(measurementSystemForLocale(locale)).toBe('metric');
    }
  });

  it('covers the other two non-metric countries', () => {
    expect(measurementSystemForLocale('en-LR')).toBe('imperial');
    expect(measurementSystemForLocale('my-MM')).toBe('imperial');
  });

  it('reads the region out of the shapes a platform actually returns', () => {
    expect(measurementSystemForLocale('en_US')).toBe('imperial');
    expect(measurementSystemForLocale('en-US-u-ca-gregory')).toBe('imperial');
    expect(measurementSystemForLocale('US')).toBe('imperial');
  });

  it('falls back to metric when there is no locale, or none it recognises', () => {
    expect(measurementSystemForLocale(undefined)).toBe('metric');
    expect(measurementSystemForLocale(null)).toBe('metric');
    expect(measurementSystemForLocale('')).toBe('metric');
    expect(measurementSystemForLocale('en')).toBe('metric');
    expect(measurementSystemForLocale('nonsense')).toBe('metric');
  });

  it('is not fooled by a language subtag that looks like a region', () => {
    // 'us' lower-case is a language code, not the United States.
    expect(measurementSystemForLocale('us-DE')).toBe('metric');
  });
});
