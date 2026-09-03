import { describe, expect, it } from '@jest/globals';
import { assessCondition, createPet, type PetState } from '@vitto/core';
import { NAP_ENERGY, animationFor, isSleeping, mixHex } from '../components/PetAvatar';

const petWith = (overrides: Partial<PetState>): PetState => ({
  ...createPet('user-1', 'Miso'),
  health: 90,
  energy: 90,
  nutrition: 90,
  happiness: 90,
  mind: 90,
  ...overrides,
});

describe('isSleeping', () => {
  it('naps when idle, nothing is wrong, and energy has drifted low', () => {
    const pet = petWith({ energy: NAP_ENERGY });
    expect(isSleeping(pet.energy, assessCondition(pet), 'idle')).toBe(true);
  });

  it('does not nap while energy is still high', () => {
    const pet = petWith({ energy: NAP_ENERGY + 1 });
    expect(isSleeping(pet.energy, assessCondition(pet), 'idle')).toBe(false);
  });

  it('yields to exhausted: a collapsed pet is an ailment, not a nap', () => {
    // energy 20 trips the `exhausted` threshold, which becomes condition.primary.
    const pet = petWith({ energy: 20 });
    const condition = assessCondition(pet);
    expect(condition.primary).toBe('exhausted');
    expect(isSleeping(pet.energy, condition, 'idle')).toBe(false);
  });

  it('yields to any worse ailment even when energy is in the nap band', () => {
    const pet = petWith({ energy: NAP_ENERGY, nutrition: 0 });
    expect(isSleeping(pet.energy, assessCondition(pet), 'idle')).toBe(false);
  });

  it('never naps mid-activity', () => {
    const pet = petWith({ energy: NAP_ENERGY });
    expect(isSleeping(pet.energy, assessCondition(pet), 'eating')).toBe(false);
  });
});

describe('animationFor precedence with sleep', () => {
  it('keeps exhausted on the rest pose via the ailment path', () => {
    const pet = petWith({ energy: 15 });
    const condition = assessCondition(pet);
    expect(animationFor('idle', pet.mood, condition)).toBe('rest');
  });

  it('lets an activity outrank a low-energy nap', () => {
    const pet = petWith({ energy: NAP_ENERGY });
    expect(animationFor('workout', pet.mood, assessCondition(pet))).toBe('move');
  });
});

describe('mixHex', () => {
  it('returns the endpoints at t = 0 and t = 1', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
  });

  it('blends halfway and clamps out-of-range t', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#000000', '#ffffff', -1)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 2)).toBe('#ffffff');
  });
});
