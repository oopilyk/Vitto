import { describe, expect, it } from 'vitest';
import {
  deriveEnergyGoal,
  deriveTrainingStyle,
  goalInvolvesWeightChange,
  hasCompletedQuestionnaire,
  suggestStepGoal,
} from './onboarding';

describe('deriveEnergyGoal', () => {
  it('maps the game goal onto the calorie axis', () => {
    expect(deriveEnergyGoal('lose_weight')).toBe('lose');
    expect(deriveEnergyGoal('gain_weight')).toBe('gain');
    expect(deriveEnergyGoal('build_muscle')).toBe('gain');
    expect(deriveEnergyGoal('get_stronger')).toBe('maintain');
    expect(deriveEnergyGoal('improve_fitness')).toBe('maintain');
    expect(deriveEnergyGoal(undefined)).toBe('maintain');
  });
});

describe('goalInvolvesWeightChange', () => {
  it('is true only for goals that move the scale', () => {
    expect(goalInvolvesWeightChange('lose_weight')).toBe(true);
    expect(goalInvolvesWeightChange('build_muscle')).toBe(true);
    expect(goalInvolvesWeightChange('maintain')).toBe(false);
    expect(goalInvolvesWeightChange('build_habits')).toBe(false);
    expect(goalInvolvesWeightChange(undefined)).toBe(false);
  });
});

describe('deriveTrainingStyle', () => {
  it('reads mixed / strength / cardio from the training types', () => {
    expect(deriveTrainingStyle(['weightlifting', 'running'])).toBe('mixed');
    expect(deriveTrainingStyle(['weightlifting'])).toBe('strength');
    expect(deriveTrainingStyle(['hiit', 'classes'])).toBe('strength');
    expect(deriveTrainingStyle(['running', 'cycling'])).toBe('cardio');
    expect(deriveTrainingStyle(['other'])).toBe('mixed');
  });

  it('leaves the default alone when nothing is chosen', () => {
    expect(deriveTrainingStyle([])).toBeUndefined();
    expect(deriveTrainingStyle(undefined)).toBeUndefined();
  });
});

describe('suggestStepGoal', () => {
  it('scales with everyday activity and frequent training, rounded to 500', () => {
    expect(suggestStepGoal({ activity: 'low', trainingDaysPerWeek: 0 })).toBe(6000);
    expect(suggestStepGoal({ activity: 'moderate', trainingDaysPerWeek: 2 })).toBe(8000);
    expect(suggestStepGoal({ activity: 'moderate', trainingDaysPerWeek: 5 })).toBe(10000);
    expect(suggestStepGoal({ activity: 'high', trainingDaysPerWeek: 6 })).toBe(12000);
  });
});

describe('hasCompletedQuestionnaire', () => {
  it('is the resume marker: primary goal set and at least one motivation', () => {
    expect(hasCompletedQuestionnaire({ primaryGoal: undefined, motivations: [] })).toBe(false);
    expect(hasCompletedQuestionnaire({ primaryGoal: 'lose_weight', motivations: [] })).toBe(false);
    expect(hasCompletedQuestionnaire({ primaryGoal: 'lose_weight', motivations: ['pet'] })).toBe(true);
  });
});
