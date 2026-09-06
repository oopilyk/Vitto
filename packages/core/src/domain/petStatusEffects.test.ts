import { describe, expect, it } from 'vitest';
import { getStatusEffects } from './petStatusEffects';
import { createPet } from './pet';
import { CRITICAL_NEED, HEALTH_DRAIN_PER_CRITICAL_NEED_PER_DAY, THRIVING_NEED } from './decay';
import { SLEEPY_ENERGY_THRESHOLD } from './petHealthEngine';

const pet = (over: Partial<ReturnType<typeof createPet>> = {}) => ({
  ...createPet('user-1', 'Blue', 'cat'),
  health: 80,
  nutrition: 80,
  energy: 80,
  happiness: 80,
  mind: 80,
  ...over,
});

const ids = (p: ReturnType<typeof pet>) => getStatusEffects(p).map((effect) => effect.id);

describe('getStatusEffects', () => {
  it('lists every ailment at once, not just the worst one', () => {
    // The sprite and headline only ever show the highest-precedence ailment, so a
    // pet with three things wrong looks identical to one with a single problem.
    expect(ids(pet({ nutrition: 10, happiness: 10, mind: 5 }))).toEqual(
      expect.arrayContaining(['starving', 'sad', 'foggy']),
    );
  });

  it('orders debuffs worst first', () => {
    const order = ids(pet({ health: 10, nutrition: 10, mind: 5 }));
    expect(order.indexOf('dying')).toBeLessThan(order.indexOf('starving'));
    expect(order.indexOf('starving')).toBeLessThan(order.indexOf('foggy'));
  });

  it('reports the health drain only when the need is low enough to cause one', () => {
    // `sad` fires at happiness 25 but health only drains at 20, so the copy must
    // not promise a cost that the engine is not applying.
    const draining = getStatusEffects(pet({ happiness: CRITICAL_NEED - 5 }));
    const notDraining = getStatusEffects(pet({ happiness: CRITICAL_NEED + 3 }));
    expect(draining.find((e) => e.id === 'sad')?.detail).toContain(
      `${HEALTH_DRAIN_PER_CRITICAL_NEED_PER_DAY} health a day`,
    );
    expect(notDraining.find((e) => e.id === 'sad')?.detail).not.toContain('Costing');
  });

  it('shows sleepy on its own, since nothing else marks a winding-down pet', () => {
    expect(ids(pet({ energy: SLEEPY_ENERGY_THRESHOLD - 5 }))).toContain('sleepy');
  });

  it('suppresses sleepy once the pet is properly exhausted', () => {
    const effects = ids(pet({ energy: 10 }));
    expect(effects).toContain('exhausted');
    expect(effects).not.toContain('sleepy');
  });

  it('reports thriving only when every vital clears the regen line', () => {
    expect(ids(pet({ nutrition: THRIVING_NEED, energy: THRIVING_NEED, happiness: THRIVING_NEED })))
      .toContain('thriving');
    expect(ids(pet({ nutrition: THRIVING_NEED - 1 }))).not.toContain('thriving');
  });

  it('says nothing about a pet that is neither thriving nor ailing', () => {
    // A middling pet should show an empty tray, not a row of "you are fine" chips.
    expect(ids(pet({ nutrition: 45, energy: 45, happiness: 45, mind: 45 }))).toEqual([]);
  });

  it('puts buffs after debuffs', () => {
    const effects = getStatusEffects(pet({ mind: 5 }));
    const kinds = effects.map((effect) => effect.kind);
    expect(kinds).toEqual([...kinds].sort((a, b) => (a === 'debuff' ? -1 : 1) - (b === 'debuff' ? -1 : 1)));
  });
});
