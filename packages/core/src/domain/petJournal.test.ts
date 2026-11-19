import { describe, expect, it } from 'vitest';
import { createPet } from './pet';
import { petJournal, weekTier } from './petJournal';
import type { WeeklyRecap } from './weeklyRecap';

const recap = (over: Partial<WeeklyRecap> = {}): WeeklyRecap => ({
  start: new Date(2026, 10, 9),
  end: new Date(2026, 10, 15),
  workouts: 0,
  workoutMinutes: 0,
  records: [],
  mealDays: 0,
  averageCalories: null,
  calorieDays: 0,
  proteinDays: 0,
  averageSteps: null,
  stepGoalDays: 0,
  waterDays: 0,
  mindSessions: 0,
  xp: 0,
  weightChangeKg: null,
  previous: { workouts: 0, xp: 0 },
  ...over,
});

describe('petJournal', () => {
  const pet = createPet('u', 'Nugget');

  it('grades the week from nothing to strong', () => {
    expect(weekTier(recap())).toBe(0);
    expect(weekTier(recap({ mealDays: 2 }))).toBe(1);
    expect(weekTier(recap({ workouts: 2, mealDays: 5 }))).toBe(2);
    expect(weekTier(recap({ workouts: 4, mealDays: 7, stepGoalDays: 5, mindSessions: 3 }))).toBe(3);
  });

  it('names what the week held, and says so plainly when it held nothing', () => {
    const busy = petJournal({ ...pet, personality: 'chill' }, recap({ workouts: 3, mealDays: 6, records: ['Bench Press'] }));
    expect(busy.week).toContain('3 workouts');
    expect(busy.week).toContain('6 days of meals logged');
    expect(busy.week).toContain('new record');
    expect(petJournal({ ...pet, personality: 'chill' }, recap()).week).toBe("Not much happened this week. That's okay.");
  });

  it('writes in the temperament, and falls back to an even one', () => {
    const strong = recap({ workouts: 4, mealDays: 7, stepGoalDays: 5, mindSessions: 3 });
    expect(petJournal({ ...pet, personality: 'savage' }, strong).owner).toContain("Don't let it go to your head");
    expect(petJournal({ ...pet, personality: 'sweet' }, strong).owner).toContain('proud of you');
    expect(petJournal({ ...pet, personality: undefined }, strong).owner).toBe('Great week. You made it look easy.');
  });

  it('says how the pet itself is, an ailment before a mood', () => {
    expect(petJournal({ ...pet, personality: 'chill', nutrition: 0, health: 80 }, recap()).status).toContain('hungry');
    expect(petJournal({ ...pet, personality: 'hype', mood: 'bright', nutrition: 90, energy: 90, happiness: 90, mind: 90, health: 90, charge: 90 }, recap()).status).toContain('INCREDIBLE');
  });
});
