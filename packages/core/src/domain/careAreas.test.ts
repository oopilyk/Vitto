import { describe, expect, it } from 'vitest';
import { NEUTRAL_NEED, applyCareAreas, toggleCareArea, untrackedNeeds } from './careAreas';
import { DECAY_PERIOD_MS, applyTimeDecay } from './decay';
import { createPet } from './pet';
import { assessCondition } from './petCondition';

const DAY = DECAY_PERIOD_MS;

describe('care areas', () => {
  it('holds steady the needs nothing the person chose feeds', () => {
    expect(untrackedNeeds(['nutrition', 'training', 'movement', 'mind'])).toEqual([]);
    expect(untrackedNeeds(['training', 'movement', 'mind'])).toEqual(['nutrition']);
    // Energy is fed by workouts or steps: it only stops counting with both off.
    expect(untrackedNeeds(['nutrition', 'mind', 'movement'])).toEqual([]);
    expect(untrackedNeeds(['nutrition', 'mind'])).toEqual(['energy']);
    // Nothing set means everything, as before.
    expect(untrackedNeeds([])).toEqual([]);
    expect(untrackedNeeds(undefined)).toEqual([]);
  });

  it('never lets someone switch every area off', () => {
    expect(toggleCareArea(['mind'], 'mind')).toEqual(['mind']);
    expect(toggleCareArea(['nutrition', 'mind'], 'nutrition')).toEqual(['mind']);
    // Switched back on in the canonical order.
    expect(toggleCareArea(['mind'], 'nutrition')).toEqual(['nutrition', 'mind']);
  });

  it('lifts an untracked need to comfortable, and never lowers it', () => {
    const hungry = { ...createPet('u', 'Miso'), nutrition: 5, energy: 90 };
    const seen = applyCareAreas(hungry, ['training', 'movement', 'mind']);
    expect(seen.nutrition).toBe(NEUTRAL_NEED);
    expect(seen.energy).toBe(90);
    expect(seen.mood).not.toBe('hungry');
  });

  it('a week without food logs starves a food tracker, and leaves everyone else fine', () => {
    const pet = { ...createPet('u', 'Miso'), lastEventAt: new Date(0).toISOString() };
    const later = new Date(7 * DAY);

    const tracker = applyTimeDecay(pet, later);
    expect(tracker.nutrition).toBe(0);
    expect(assessCondition(tracker).ailments).toContain('starving');

    const notTracking = applyTimeDecay(pet, later, ['training', 'movement', 'mind']);
    expect(notTracking.nutrition).toBe(NEUTRAL_NEED);
    expect(assessCondition(notTracking).ailments).not.toContain('starving');
    // And hunger costs no health: the only drain left is the needs they do track.
    expect(notTracking.health).toBeGreaterThan(tracker.health);
  });

  it('follows the pet\'s own setting when none is passed', () => {
    const pet = { ...createPet('u', 'Miso'), careAreas: ['training' as const], lastEventAt: new Date(0).toISOString() };
    expect(applyTimeDecay(pet, new Date(7 * DAY)).nutrition).toBe(NEUTRAL_NEED);
  });
});
