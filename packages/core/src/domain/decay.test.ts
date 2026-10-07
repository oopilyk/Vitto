import { describe, expect, it } from 'vitest';
import {
  DECAY_FAST_ENV_KEY,
  DECAY_PERIOD_MS,
  DECAY_PER_DAY,
  DECAY_TICK_MS,
  IS_TEST_DECAY_PERIOD,
  MAX_DECAY_DAYS,
  MIN_LIVING_HEALTH,
  ONE_DAY_MS,
  ONE_MINUTE_MS,
  applyTimeDecay,
  isDecayFastMode,
  resolveDecayPeriodMs,
} from './decay';
import { MEAL_POINTS_DEFAULT, mealPoints, nextHungryAt } from './hunger';
import { createPet } from './pet';
import { determineMood } from './petHealthEngine';

/**
 * Tests are written in decay-days, not wall-clock time, so they exercise the real
 * production curve no matter what `DECAY_PERIOD_MS` is compressed to.
 */
const daysAfter = (pet: { adoptedAt: string }, days: number) =>
  new Date(new Date(pet.adoptedAt).getTime() + days * DECAY_PERIOD_MS);


describe('applyTimeDecay', () => {
  it('leaves a freshly cared-for pet unchanged', () => {
    const pet = createPet('user-1', 'Miso');
    const decayed = applyTimeDecay(pet, new Date(pet.adoptedAt));
    expect(decayed.energy).toBe(pet.energy);
    expect(decayed.nutrition).toBe(pet.nutrition);
    expect(decayed.happiness).toBe(pet.happiness);
    expect(decayed.health).toBe(pet.health);
  });

  it('treats an `asOf` before the anchor as a no-op rather than healing the pet', () => {
    const pet = createPet('user-1', 'Miso');
    expect(applyTimeDecay(pet, daysAfter(pet, -5))).toBe(pet);
  });

  it('reduces needs-based stats proportionally to elapsed time, never below zero', () => {
    const pet = { ...createPet('user-1', 'Miso'), energy: 20, nutrition: 10, happiness: 15 };
    const decayed = applyTimeDecay(pet, daysAfter(pet, 10));
    expect(decayed.energy).toBe(0);
    expect(decayed.nutrition).toBe(0);
    expect(decayed.happiness).toBe(0);
  });

  it('applies the published per-day rates', () => {
    const pet = { ...createPet('user-1', 'Miso'), nutrition: 100, energy: 100, happiness: 100, mind: 100 };
    const decayed = applyTimeDecay(pet, daysAfter(pet, 1));
    expect(decayed.energy).toBe(100 - DECAY_PER_DAY.energy);
    expect(decayed.happiness).toBe(100 - DECAY_PER_DAY.happiness);
    expect(decayed.mind).toBe(100 - DECAY_PER_DAY.mind);
  });

  it('never mutates lastEventAt, so re-decaying from the same stored pet is idempotent-safe', () => {
    const pet = createPet('user-1', 'Miso');
    const decayed = applyTimeDecay(pet, daysAfter(pet, 2));
    expect(decayed.lastEventAt).toBe(pet.lastEventAt);
    expect(decayed.adoptedAt).toBe(pet.adoptedAt);
    expect(applyTimeDecay(pet, daysAfter(pet, 2))).toEqual(decayed);
  });

  it('compounds if the result is fed back in, which is why callers must decay from the stored pet', () => {
    const pet = { ...createPet('user-1', 'Miso'), energy: 100 };
    const once = applyTimeDecay(pet, daysAfter(pet, 1));
    // `once` still carries the original anchor, so decaying it again re-applies
    // the very same elapsed day. This is the bug the contract forbids, captured
    // here so nobody "fixes" a call site by chaining decays.
    const twice = applyTimeDecay(once, daysAfter(pet, 1));
    expect(once.energy).toBe(100 - DECAY_PER_DAY.energy);
    expect(twice.energy).toBe(100 - 2 * DECAY_PER_DAY.energy);
    expect(twice.energy).not.toBe(once.energy);
  });

  it('keeps decayed stats whole, since they are stored in integer columns', () => {
    const pet = createPet('user-1', 'Miso');
    const decayed = applyTimeDecay(pet, daysAfter(pet, 0.225));
    expect(Number.isInteger(decayed.energy)).toBe(true);
    expect(Number.isInteger(decayed.nutrition)).toBe(true);
    expect(Number.isInteger(decayed.happiness)).toBe(true);
    expect(Number.isInteger(decayed.health)).toBe(true);
  });

  it('lets a sharp mind fade when nothing is logged', () => {
    const pet = { ...createPet('user-1', 'Miso'), mind: 40 };
    expect(applyTimeDecay(pet, daysAfter(pet, 5)).mind).toBe(15);
    expect(applyTimeDecay(pet, daysAfter(pet, 90)).mind).toBe(0);
  });

  it('marks a pet hungry once nutrition drops low enough', () => {
    const pet = { ...createPet('user-1', 'Miso'), nutrition: 40 };
    expect(applyTimeDecay(pet, daysAfter(pet, 2)).mood).toBe('hungry');
  });

  describe('health, which is a consequence rather than a rate', () => {
    it('regenerates while every need is still comfortable', () => {
      // A pet from before calorie hunger: what it had reads as one meal at its
      // last care, which keeps it full for a day. Half a day in, all thriving.
      const pet = { ...createPet('user-1', 'Miso'), health: 50, nutrition: 100, energy: 100, happiness: 100 };
      expect(applyTimeDecay(pet, daysAfter(pet, 0.5)).health).toBe(clampedRegen(50, 0.5));
      expect(applyTimeDecay(pet, daysAfter(pet, 0.5)).health).toBeGreaterThan(pet.health);
    });

    it('stops regenerating once the first need leaves the comfort zone', () => {
      // Two half-day meals, the first eaten half a day before the last care: at
      // half a day it wears off and hunger drops to 50, out of comfort but not critical.
      const base = createPet('user-1', 'Miso');
      const anchor = Date.parse(base.adoptedAt);
      const pet = {
        ...base,
        health: 50,
        nutrition: 100,
        energy: 100,
        happiness: 100,
        recentMeals: [
          { at: new Date(anchor - 0.5 * DECAY_PERIOD_MS).toISOString(), points: 50 },
          { at: base.adoptedAt, points: 50 },
        ],
      };
      const atComfortEdge = applyTimeDecay(pet, daysAfter(pet, 0.5)).health;
      expect(applyTimeDecay(pet, daysAfter(pet, 0.5)).nutrition).toBe(50);
      // Later, but before the second meal wears off: no further gain.
      expect(applyTimeDecay(pet, daysAfter(pet, 0.9)).health).toBe(atComfortEdge);
    });

    it('starts draining only once a need actually crosses 20', () => {
      // Hunger held (not tracked), so only energy and happiness move.
      // Energy 32 reaches 20 after exactly 1 day; happiness sits high.
      const notFood = ['training', 'movement', 'mind'] as const;
      const pet = { ...createPet('user-1', 'Miso'), health: 90, energy: 32, happiness: 100 };
      expect(applyTimeDecay(pet, daysAfter(pet, 1), notFood).health).toBe(90);
      // One further day with exactly one need critical costs 4 health.
      expect(applyTimeDecay(pet, daysAfter(pet, 2), notFood).health).toBe(86);
      // Two needs critical drains twice as fast.
      const two = { ...pet, happiness: 30 }; // happiness hits 20 after 1 day as well
      expect(applyTimeDecay(two, daysAfter(two, 2), notFood).health).toBe(82);
    });

    it('drains once everything eaten has worn off', () => {
      const pet = { ...createPet('user-1', 'Miso'), health: 90, nutrition: 100, energy: 100, happiness: 100 };
      const emptied = applyTimeDecay(pet, daysAfter(pet, 1)).health;
      expect(applyTimeDecay(pet, daysAfter(pet, 1)).nutrition).toBe(0);
      // A further day with hunger empty (and nothing else critical) costs 4.
      expect(applyTimeDecay(pet, daysAfter(pet, 2)).health).toBe(emptied - 4);
    });

    it('ignores mind entirely, because a dull mind does not kill the dog', () => {
      const sharp = { ...createPet('user-1', 'Miso'), health: 60, mind: 100, nutrition: 10, energy: 10, happiness: 10 };
      const dull = { ...sharp, mind: 0 };
      expect(applyTimeDecay(sharp, daysAfter(sharp, 3)).health).toBe(
        applyTimeDecay(dull, daysAfter(dull, 3)).health,
      );
    });

    it('never falls below MIN_LIVING_HEALTH, so a bar of 1 still reads as alive', () => {
      const pet = { ...createPet('user-1', 'Miso'), health: 100, nutrition: 0, energy: 0, happiness: 0 };
      expect(applyTimeDecay(pet, daysAfter(pet, MAX_DECAY_DAYS)).health).toBe(MIN_LIVING_HEALTH);
      expect(applyTimeDecay(pet, daysAfter(pet, 500)).health).toBeGreaterThanOrEqual(MIN_LIVING_HEALTH);
    });
  });

  describe('hunger, which is the last day of eating', () => {
    const fedAt = (offsetsAndPoints: [number, number][]) => {
      const base = createPet('user-1', 'Miso');
      const anchor = Date.parse(base.adoptedAt);
      return {
        ...base,
        recentMeals: offsetsAndPoints.map(([days, points]) => ({ at: new Date(anchor + days * DECAY_PERIOD_MS).toISOString(), points })),
      };
    };

    it('adds up the meals still feeding the pet, and steps down as each wears off', () => {
      // 40 points six hours before the last care, 30 at it.
      const pet = { ...fedAt([[-0.25, 40], [0, 30]]), nutrition: 70 };
      expect(applyTimeDecay(pet, daysAfter(pet, 0.5)).nutrition).toBe(70);
      expect(applyTimeDecay(pet, daysAfter(pet, 0.8)).nutrition).toBe(30);
      expect(applyTimeDecay(pet, daysAfter(pet, 1)).nutrition).toBe(0);
      expect(applyTimeDecay(pet, daysAfter(pet, 1)).mood).toBe('hungry');
    });

    it('caps the bar at 100, however much was eaten', () => {
      const pet = { ...fedAt([[0, 80], [0, 90]]), nutrition: 100 };
      expect(applyTimeDecay(pet, daysAfter(pet, 0.1)).nutrition).toBe(100);
    });

    it('reads a pet from before calorie hunger as one meal at its last care', () => {
      const pet = { ...createPet('user-1', 'Miso'), nutrition: 70 };
      expect(pet.recentMeals).toBeUndefined();
      expect(applyTimeDecay(pet, daysAfter(pet, 0.9)).nutrition).toBe(70);
      expect(applyTimeDecay(pet, daysAfter(pet, 1)).nutrition).toBe(0);
    });

    it('never gets hungry when food is not one of the care areas', () => {
      const pet = { ...createPet('user-1', 'Miso'), nutrition: 90 };
      expect(applyTimeDecay(pet, daysAfter(pet, 3), ['training', 'movement', 'mind']).nutrition).toBe(90);
    });

    it('says when the pet will next be hungry, if nothing else is eaten', () => {
      const pet = { ...fedAt([[-0.25, 40], [0, 30]]), nutrition: 70 };
      const anchor = Date.parse(pet.adoptedAt);
      // At 0.75 the first meal goes, leaving 30: still fed. At 1 the second goes.
      expect(nextHungryAt(pet, anchor)).toBe(anchor + DECAY_PERIOD_MS);
      expect(nextHungryAt({ ...pet, nutrition: 0, recentMeals: [] }, anchor)).toBeNull();
    });

    it('turns calories into bar points against maintenance', () => {
      expect(mealPoints(700, 2800)).toBe(25);
      expect(mealPoints(2800, 2800)).toBe(100);
      expect(mealPoints(9000, 2800)).toBe(100);
      expect(mealPoints(undefined, 2800)).toBe(MEAL_POINTS_DEFAULT);
    });
  });
  it('caps any single settle at MAX_DECAY_DAYS, so a hundred days away lands like fourteen', () => {
    const pet = { ...createPet('user-1', 'Miso'), health: 100, nutrition: 90, energy: 90, happiness: 90, mind: 90 };
    const capped = applyTimeDecay(pet, daysAfter(pet, MAX_DECAY_DAYS));
    expect(applyTimeDecay(pet, daysAfter(pet, 100))).toEqual(capped);
    expect(capped.mind).toBe(90 - MAX_DECAY_DAYS * DECAY_PER_DAY.mind);
  });
});

/** Mirrors the regen half of the health formula for the all-thriving case. */
const clampedRegen = (health: number, days: number) => Math.round(health + 3 * days);

describe('decay cadence', () => {
  it('ships production cadence by default: one decline day is one real day', () => {
    expect(DECAY_PERIOD_MS).toBe(ONE_DAY_MS);
    expect(IS_TEST_DECAY_PERIOD).toBe(false);
  });

  it('keeps the UI tick at a sane 60s under production cadence', () => {
    expect(DECAY_TICK_MS).toBe(60_000);
  });

  it('maps the fast-mode flag to the compressed ~11-minute clock', () => {
    expect(resolveDecayPeriodMs(false)).toBe(ONE_DAY_MS);
    expect(resolveDecayPeriodMs(true)).toBe(ONE_MINUTE_MS);
  });

  it('only turns the fast clock on for an explicit opt-in value', () => {
    expect(isDecayFastMode({})).toBe(false);
    expect(isDecayFastMode({ [DECAY_FAST_ENV_KEY]: undefined })).toBe(false);
    expect(isDecayFastMode({ [DECAY_FAST_ENV_KEY]: '0' })).toBe(false);
    expect(isDecayFastMode({ [DECAY_FAST_ENV_KEY]: 'false' })).toBe(false);
    expect(isDecayFastMode({ [DECAY_FAST_ENV_KEY]: '1' })).toBe(true);
    expect(isDecayFastMode({ [DECAY_FAST_ENV_KEY]: 'true' })).toBe(true);
  });

  it('exercises the same curve regardless of cadence, since tests scale by DECAY_PERIOD_MS', () => {
    // This is the guarantee that flipping cadence did not move the rates: a full
    // decline day still costs exactly DECAY_PER_DAY on every need.
    const pet = { ...createPet('user-1', 'Miso'), nutrition: 100, energy: 100, happiness: 100 };
    const oneDay = new Date(new Date(pet.adoptedAt).getTime() + DECAY_PERIOD_MS);
    const decayed = applyTimeDecay(pet, oneDay);
    expect(decayed.energy).toBe(100 - DECAY_PER_DAY.energy);
    expect(decayed.happiness).toBe(100 - DECAY_PER_DAY.happiness);
  });
});

describe('Energy and Vitality, split', () => {
  it('lets Energy fall on its own clock, and holds it when food is not tracked', () => {
    const pet = { ...createPet('user-1', 'Miso'), charge: 80 };
    expect(applyTimeDecay(pet, daysAfter(pet, 1)).charge).toBe(80 - DECAY_PER_DAY.charge);
    expect(applyTimeDecay(pet, daysAfter(pet, 3), ['training', 'movement', 'mind']).charge).toBe(80);
  });

  it('reads a pet from before Energy as comfortable, not sleepy', () => {
    const { charge: _charge, ...legacy } = createPet('user-1', 'Miso');
    expect(applyTimeDecay(legacy, daysAfter(legacy, 0.1)).mood).not.toBe('sleepy');
  });

  it('makes low Energy sleepy and low Vitality sluggish, hungry first', () => {
    const base = { energy: 70, nutrition: 70, happiness: 70, charge: 70 };
    expect(determineMood({ ...base, charge: 30 })).toBe('sleepy');
    expect(determineMood({ ...base, energy: 30 })).toBe('sluggish');
    expect(determineMood({ ...base, energy: 30, charge: 30 })).toBe('sleepy');
    expect(determineMood({ ...base, nutrition: 10, charge: 30 })).toBe('hungry');
    expect(determineMood(base)).toBe('bright');
  });
});
