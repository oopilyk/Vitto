import { describe, expect, it } from 'vitest';
import {
  AILMENT_MESSAGE,
  AILMENT_PRECEDENCE,
  AILMENT_THRESHOLDS,
  assessCondition,
  type PetAilment,
} from './petCondition';
import { createPet, type PetState } from './pet';

/** A pet with nothing wrong: every stat comfortably above every threshold. */
const healthyPet = (overrides: Partial<PetState> = {}): PetState => ({
  ...createPet('user-1', 'Miso'),
  health: 90,
  nutrition: 90,
  energy: 90,
  happiness: 90,
  mind: 90,
  ...overrides,
});

describe('assessCondition', () => {
  it('reports nothing wrong with a well-cared-for pet', () => {
    const condition = assessCondition(healthyPet());
    expect(condition.ailments).toEqual([]);
    expect(condition.primary).toBeNull();
    expect(condition.overlays).toEqual([]);
    expect(condition.severity).toBeCloseTo(0.1);
  });

  describe('threshold boundaries', () => {
    const cases: Array<[PetAilment, keyof PetState]> = [
      ['dying', 'health'],
      ['starving', 'nutrition'],
      ['exhausted', 'energy'],
      ['sad', 'happiness'],
      ['foggy', 'mind'],
    ];

    it.each(cases)('%s triggers at or below its threshold and not above', (ailment, stat) => {
      const threshold = AILMENT_THRESHOLDS[ailment];
      expect(assessCondition(healthyPet({ [stat]: threshold } as Partial<PetState>)).ailments).toContain(ailment);
      expect(assessCondition(healthyPet({ [stat]: threshold + 1 } as Partial<PetState>)).ailments).not.toContain(
        ailment,
      );
    });
  });

  it('orders ailments worst first and picks a single primary for the sprite', () => {
    const pet = healthyPet({ happiness: 10, nutrition: 10, mind: 5 });
    const condition = assessCondition(pet);
    expect(condition.ailments).toEqual(['starving', 'sad', 'foggy']);
    expect(condition.primary).toBe('starving');
  });

  it('lets `dying` win the sprite so a dying pet never renders as merely sad', () => {
    const pet = healthyPet({ health: 10, happiness: 5 });
    const condition = assessCondition(pet);
    expect(condition.primary).toBe('dying');
  });

  it('suppresses every overlay while dying', () => {
    const pet = healthyPet({ health: 1, nutrition: 0, energy: 0, happiness: 0, mind: 0 });
    const condition = assessCondition(pet);
    expect(condition.ailments).toEqual(AILMENT_PRECEDENCE.slice());
    expect(condition.primary).toBe('dying');
    expect(condition.overlays).toEqual([]);
  });

  it('caps overlays at two even when everything is wrong', () => {
    const pet = healthyPet({ nutrition: 0, energy: 0, happiness: 0, mind: 0 });
    const condition = assessCondition(pet);
    expect(condition.ailments).toEqual(['starving', 'exhausted', 'sad', 'foggy']);
    expect(condition.primary).toBe('starving');
    expect(condition.overlays).toEqual(['starving', 'exhausted']);
  });

  it('gives a lone ailment its own overlay, so one problem still shows particles', () => {
    const condition = assessCondition(healthyPet({ nutrition: 0 }));
    expect(condition.ailments).toEqual(['starving']);
    expect(condition.primary).toBe('starving');
    expect(condition.overlays).toEqual(['starving']);
  });

  it('keeps `foggy` last so a fresh pet with a seeded mind of 20 is not headline news', () => {
    const fresh = createPet('user-1', 'Miso');
    // Mind starts at 20 and only rises via the Mind Gym, so foggy arrives early.
    const foggyOnly = assessCondition({ ...fresh, mind: 5 });
    expect(foggyOnly.primary).toBe('foggy');
    // ...but anything else wrong takes the sprite away from it.
    const alsoSad = assessCondition({ ...fresh, mind: 5, happiness: 10 });
    expect(alsoSad.primary).toBe('sad');
    expect(alsoSad.overlays).toEqual(['sad', 'foggy']);
  });

  it('scores severity from the worst vital, ignoring mind', () => {
    expect(assessCondition(healthyPet({ mind: 0 })).severity).toBeCloseTo(0.1);
    expect(assessCondition(healthyPet({ energy: 25 })).severity).toBeCloseTo(0.75);
    expect(assessCondition(healthyPet({ health: 0, nutrition: 0, energy: 0, happiness: 0 })).severity).toBe(1);
  });

  it('has a message for every ailment that names the pet', () => {
    for (const ailment of AILMENT_PRECEDENCE) {
      expect(AILMENT_MESSAGE[ailment]('Miso')).toContain('Miso');
    }
  });

  it('never leaves the mood field behind: ailments are derived, not stored', () => {
    const pet = healthyPet({ nutrition: 0 });
    const condition = assessCondition(pet);
    expect(condition).not.toHaveProperty('mood');
    expect(pet.mood).toBe('content');
  });
});
