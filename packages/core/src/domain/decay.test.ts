import { describe, expect, it } from 'vitest';
import { applyTimeDecay } from './decay';
import { createPet } from './pet';

describe('applyTimeDecay', () => {
  it('leaves a freshly cared-for pet unchanged', () => {
    const pet = createPet('user-1', 'Miso');
    const decayed = applyTimeDecay(pet, new Date(pet.adoptedAt));
    expect(decayed.energy).toBe(pet.energy);
    expect(decayed.nutrition).toBe(pet.nutrition);
    expect(decayed.happiness).toBe(pet.happiness);
  });

  it('reduces needs-based stats proportionally to elapsed time, never below zero', () => {
    const pet = { ...createPet('user-1', 'Miso'), energy: 20, nutrition: 10, happiness: 15 };
    const tenDaysLater = new Date(new Date(pet.adoptedAt).getTime() + 10 * 24 * 60 * 60 * 1000);
    const decayed = applyTimeDecay(pet, tenDaysLater);
    expect(decayed.energy).toBe(0);
    expect(decayed.nutrition).toBe(0);
    expect(decayed.happiness).toBe(0);
  });

  it('never mutates lastEventAt, so re-decaying from the same stored pet is idempotent-safe', () => {
    const pet = createPet('user-1', 'Miso');
    const later = new Date(new Date(pet.adoptedAt).getTime() + 2 * 24 * 60 * 60 * 1000);
    const decayed = applyTimeDecay(pet, later);
    expect(decayed.lastEventAt).toBe(pet.lastEventAt);
    expect(decayed.adoptedAt).toBe(pet.adoptedAt);
  });

  it('keeps decayed stats whole, since they are stored in integer columns', () => {
    const pet = createPet('user-1', 'Miso');
    const partialDay = new Date(new Date(pet.adoptedAt).getTime() + 5.4 * 60 * 60 * 1000);
    const decayed = applyTimeDecay(pet, partialDay);
    expect(Number.isInteger(decayed.energy)).toBe(true);
    expect(Number.isInteger(decayed.nutrition)).toBe(true);
    expect(Number.isInteger(decayed.happiness)).toBe(true);
  });

  it('lets a sharp mind fade when nothing is logged', () => {
    const pet = { ...createPet('user-1', 'Miso'), mind: 40 };
    const fiveDaysLater = new Date(new Date(pet.adoptedAt).getTime() + 5 * 24 * 60 * 60 * 1000);
    expect(applyTimeDecay(pet, fiveDaysLater).mind).toBe(30);
    const muchLater = new Date(new Date(pet.adoptedAt).getTime() + 90 * 24 * 60 * 60 * 1000);
    expect(applyTimeDecay(pet, muchLater).mind).toBe(0);
  });

  it('marks a pet hungry once nutrition drops low enough', () => {
    const pet = { ...createPet('user-1', 'Miso'), nutrition: 40 };
    const later = new Date(new Date(pet.adoptedAt).getTime() + 2 * 24 * 60 * 60 * 1000);
    expect(applyTimeDecay(pet, later).mood).toBe('hungry');
  });
});
