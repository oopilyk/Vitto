import { describe, expect, it } from 'vitest';
import {
  DECAY_PERIOD_MS,
  DECAY_PER_DAY,
  MAX_DECAY_DAYS,
  MIN_LIVING_HEALTH,
  applyTimeDecay,
} from './decay';
import { createPet } from './pet';

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
    expect(decayed.nutrition).toBe(100 - DECAY_PER_DAY.nutrition);
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
    const pet = { ...createPet('user-1', 'Miso'), nutrition: 100 };
    const once = applyTimeDecay(pet, daysAfter(pet, 1));
    // `once` still carries the original anchor, so decaying it again re-applies
    // the very same elapsed day. This is the bug the contract forbids, captured
    // here so nobody "fixes" a call site by chaining decays.
    const twice = applyTimeDecay(once, daysAfter(pet, 1));
    expect(once.nutrition).toBe(100 - DECAY_PER_DAY.nutrition);
    expect(twice.nutrition).toBe(100 - 2 * DECAY_PER_DAY.nutrition);
    expect(twice.nutrition).not.toBe(once.nutrition);
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
      // All three needs start at 100, so the first one to leave the comfort zone
      // is nutrition at (100 - 60) / 18 = 2.22 days. Half a day in, all thriving.
      const pet = { ...createPet('user-1', 'Miso'), health: 50, nutrition: 100, energy: 100, happiness: 100 };
      expect(applyTimeDecay(pet, daysAfter(pet, 0.5)).health).toBe(clampedRegen(50, 0.5));
      expect(applyTimeDecay(pet, daysAfter(pet, 0.5)).health).toBeGreaterThan(pet.health);
    });

    it('stops regenerating once the first need leaves the comfort zone', () => {
      const pet = { ...createPet('user-1', 'Miso'), health: 50, nutrition: 100, energy: 100, happiness: 100 };
      const atComfortEdge = applyTimeDecay(pet, daysAfter(pet, 40 / DECAY_PER_DAY.nutrition)).health;
      // Well past the edge but before anything turns critical: no further gain.
      const later = applyTimeDecay(pet, daysAfter(pet, 3)).health;
      expect(later).toBe(atComfortEdge);
    });

    it('starts draining only once a need actually crosses 20', () => {
      // Nutrition 38 reaches 20 after exactly 1 day; energy and happiness sit high.
      const pet = { ...createPet('user-1', 'Miso'), health: 90, nutrition: 38, energy: 100, happiness: 100 };
      expect(applyTimeDecay(pet, daysAfter(pet, 1)).health).toBe(90);
      // One further day with exactly one need critical costs 4 health.
      expect(applyTimeDecay(pet, daysAfter(pet, 2)).health).toBe(86);
      // Two needs critical drains twice as fast.
      const two = { ...pet, energy: 32 }; // energy hits 20 after 1 day as well
      expect(applyTimeDecay(two, daysAfter(two, 2)).health).toBe(82);
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

  it('caps any single settle at MAX_DECAY_DAYS, so a hundred days away lands like fourteen', () => {
    const pet = { ...createPet('user-1', 'Miso'), health: 100, nutrition: 90, energy: 90, happiness: 90, mind: 90 };
    const capped = applyTimeDecay(pet, daysAfter(pet, MAX_DECAY_DAYS));
    expect(applyTimeDecay(pet, daysAfter(pet, 100))).toEqual(capped);
    expect(capped.mind).toBe(90 - MAX_DECAY_DAYS * DECAY_PER_DAY.mind);
  });
});

/** Mirrors the regen half of the health formula for the all-thriving case. */
const clampedRegen = (health: number, days: number) => Math.round(health + 3 * days);
