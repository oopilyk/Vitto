import { describe, expect, it } from 'vitest';
import {
  deriveEnergyGoal,
  deriveTrainingStyle,
  hasCompletedQuestionnaire,
  optimalDailySteps,
  optimalTrainingDays,
  petSurvivalGuidance,
  suggestStepGoal,
  weeksUntil,
} from './onboarding';

describe('deriveEnergyGoal', () => {
  it('reads the calorie axis from current vs goal weight', () => {
    expect(deriveEnergyGoal(80, 72)).toBe('lose');
    expect(deriveEnergyGoal(70, 78)).toBe('gain');
    expect(deriveEnergyGoal(75, 75)).toBe('maintain');
    expect(deriveEnergyGoal(75, 75.3)).toBe('maintain');
    expect(deriveEnergyGoal(75, undefined)).toBe('maintain');
  });
});

describe('weeksUntil', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  it('converts a target date to whole weeks, floored at 1', () => {
    expect(weeksUntil('2026-03-26', now)).toBe(12);
    expect(weeksUntil('2026-01-02', now)).toBe(1);
    expect(weeksUntil('2025-06-01', now)).toBe(1);
    expect(weeksUntil(undefined, now)).toBeUndefined();
  });
});

describe('deriveTrainingStyle', () => {
  it('reads mixed / strength / cardio from the training types', () => {
    expect(deriveTrainingStyle(['weightlifting', 'running'])).toBe('mixed');
    expect(deriveTrainingStyle(['weightlifting'])).toBe('strength');
    expect(deriveTrainingStyle(['running', 'cycling'])).toBe('cardio');
    expect(deriveTrainingStyle([])).toBeUndefined();
    expect(deriveTrainingStyle(undefined)).toBeUndefined();
  });
});

describe('suggestStepGoal', () => {
  it('scales with everyday activity and frequent training, rounded to 500', () => {
    expect(suggestStepGoal({ activity: 'low', trainingDaysPerWeek: 0 })).toBe(6000);
    expect(suggestStepGoal({ activity: 'moderate', trainingDaysPerWeek: 5 })).toBe(10000);
    expect(suggestStepGoal({ activity: 'high', trainingDaysPerWeek: 6 })).toBe(12000);
  });
});

describe('optimal targets for the summary screen', () => {
  it('recommends more movement for a weight-loss goal', () => {
    expect(optimalDailySteps({ goal: 'lose', activity: 'moderate' })).toBe(10000);
    expect(optimalDailySteps({ goal: 'maintain', activity: 'moderate' })).toBe(8000);
    expect(optimalTrainingDays({ goal: 'lose' })).toBe(4);
    expect(optimalTrainingDays({ goal: 'maintain' })).toBe(3);
  });
});

describe('petSurvivalGuidance', () => {
  it('names the pet and gives a concrete neglect window', () => {
    const g = petSurvivalGuidance('Miso');
    expect(g.headline).toBe('Miso needs you');
    expect(g.detail).toContain('Miso');
    expect(g.neglectDays).toBe(14);
    expect(g.minActiveDaysPerWeek).toBeGreaterThan(0);
  });
});

describe('hasCompletedQuestionnaire', () => {
  it('is the resume marker: a goal weight set and at least one motivation', () => {
    expect(hasCompletedQuestionnaire({ targetWeightKg: undefined, motivations: [] })).toBe(false);
    expect(hasCompletedQuestionnaire({ targetWeightKg: 70, motivations: [] })).toBe(false);
    expect(hasCompletedQuestionnaire({ targetWeightKg: 70, motivations: ['pet'] })).toBe(true);
  });
});
