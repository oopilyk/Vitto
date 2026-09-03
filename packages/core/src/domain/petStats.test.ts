import { describe, expect, it } from 'vitest';
import {
  PET_STAT_DESCRIPTORS,
  careCountsByType,
  daysWithPet,
  statValue,
  type PetStatKey,
} from './petStats';
import { applyForcedForm, getEvolutionStage, getPetBuild, hasEvolved } from './pet';
import { DECAY_PER_DAY } from './decay';
import type { HealthEvent, HealthEventType } from './health';
import { createPet, type PetState } from './pet';

const basePet = (overrides: Partial<PetState> = {}): PetState => ({
  ...createPet('user-1', 'Miso'),
  adoptedAt: '2026-08-01T09:00:00.000Z',
  ...overrides,
});

const makeEvent = (occurredAt: string, type: HealthEventType = 'MEAL'): HealthEvent => ({
  id: `${type}-${occurredAt}`,
  userId: 'user-1',
  occurredAt,
  type,
  source: 'manual',
  metadata: {},
});

describe('PET_STAT_DESCRIPTORS', () => {
  it('covers every stat exactly once', () => {
    const keys = PET_STAT_DESCRIPTORS.map((descriptor) => descriptor.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(11);
  });

  it('groups the stats the way the screen lays them out', () => {
    const groups = PET_STAT_DESCRIPTORS.reduce<Record<string, string[]>>((acc, descriptor) => {
      (acc[descriptor.group] ??= []).push(descriptor.key);
      return acc;
    }, {});
    expect(groups.condition).toEqual(['health', 'energy', 'happiness', 'nutrition']);
    expect(groups.body).toEqual([
      'strength',
      'pushingStrength',
      'pullingStrength',
      'legStrength',
      'endurance',
      'recovery',
    ]);
    expect(groups.mind).toEqual(['mind']);
  });

  it('gives every stat a way to raise it', () => {
    for (const descriptor of PET_STAT_DESCRIPTORS) {
      expect(descriptor.label.length).toBeGreaterThan(0);
      expect(descriptor.hint.length).toBeGreaterThan(0);
    }
  });

  const hintFor = (key: PetStatKey): string => {
    const descriptor = PET_STAT_DESCRIPTORS.find((entry) => entry.key === key);
    if (!descriptor) throw new Error(`no descriptor for ${key}`);
    return descriptor.hint;
  };

  // These assert the hint is *derived* from DECAY_PER_DAY, not that it says any
  // particular number: retuning the engine must never leave the copy behind.
  it.each(['energy', 'happiness', 'nutrition', 'mind'] as const)(
    'quotes the live decay rate in the %s hint',
    (key) => {
      expect(hintFor(key)).toContain(`${String(DECAY_PER_DAY[key])} a day`);
    },
  );

  it('describes health as a consequence of the other needs, not a timed decline', () => {
    const hint = hintFor('health');
    for (const need of ['nutrition', 'energy', 'happiness']) {
      expect(hint).toContain(need);
    }
    // Health has no DECAY_PER_DAY entry, so it must not claim a daily fall.
    expect(hint).not.toMatch(/a day/);
    expect(hint).not.toMatch(/\bmind\b/i);
  });
});

describe('statValue', () => {
  it('reads a stat straight off the pet', () => {
    expect(statValue(basePet({ energy: 61 }), 'energy')).toBe(61);
  });

  it('caps legacy rows that were written before the engine clamped them', () => {
    // strength and endurance have no upper bound in the database, so a value
    // above 100 would otherwise overflow a percentage-width bar.
    expect(statValue(basePet({ strength: 140 }), 'strength')).toBe(100);
    expect(statValue(basePet({ endurance: 220 }), 'endurance')).toBe(100);
  });

  it('never reports a negative stat', () => {
    expect(statValue(basePet({ recovery: -12 }), 'recovery')).toBe(0);
  });

  it('rounds fractional stats the same way the engine does', () => {
    expect(statValue(basePet({ mind: 47.6 }), 'mind')).toBe(48);
  });
});

describe('daysWithPet', () => {
  it('counts adoption day itself as day one', () => {
    const pet = basePet({ adoptedAt: '2026-08-01T09:00:00.000Z' });
    expect(daysWithPet(pet, new Date('2026-08-01T21:00:00.000Z'))).toBe(1);
  });

  it('counts each further elapsed day', () => {
    const pet = basePet({ adoptedAt: '2026-08-01T09:00:00.000Z' });
    expect(daysWithPet(pet, new Date('2026-08-08T09:00:00.000Z'))).toBe(8);
  });

  it('never drops below day one, even with a clock skewed backwards', () => {
    const pet = basePet({ adoptedAt: '2026-08-10T09:00:00.000Z' });
    expect(daysWithPet(pet, new Date('2026-08-01T09:00:00.000Z'))).toBe(1);
  });
});

describe('careCountsByType', () => {
  const asOf = new Date(2026, 7, 28, 12, 0, 0);

  it('counts each type inside the window', () => {
    const counts = careCountsByType(
      [
        makeEvent('2026-08-28T08:00:00', 'MEAL'),
        makeEvent('2026-08-28T18:00:00', 'MEAL'),
        makeEvent('2026-08-27T08:00:00', 'WORKOUT'),
        makeEvent('2026-08-24T08:00:00', 'BRAIN_TRAINING'),
      ],
      7,
      asOf,
    );
    expect(counts.MEAL).toBe(2);
    expect(counts.WORKOUT).toBe(1);
    expect(counts.BRAIN_TRAINING).toBe(1);
    expect(counts.STEP_ACTIVITY).toBe(0);
  });

  it('counts today as the first of the days, so 7 days reaches back six', () => {
    const events = [makeEvent('2026-08-22T08:00:00'), makeEvent('2026-08-21T08:00:00')];
    expect(careCountsByType(events, 7, asOf).MEAL).toBe(1);
    expect(careCountsByType(events, 30, asOf).MEAL).toBe(2);
  });

  it('returns a zero for every type when nothing was logged', () => {
    expect(careCountsByType([], 30, asOf)).toEqual({
      STEP_ACTIVITY: 0,
      WORKOUT: 0,
      MEAL: 0,
      BRAIN_TRAINING: 0,
      SLEEP: 0,
      SCREEN_TIME: 0,
      HYDRATION: 0,
      MANUAL_ACTIVITY: 0,
    });
  });

  it('ignores an unparseable timestamp rather than counting it', () => {
    expect(careCountsByType([makeEvent('not-a-date')], 7, asOf).MEAL).toBe(0);
  });
});

describe('getPetBuild', () => {
  const base = createPet('user-1', 'Blue', 'cat');

  it('leaves a new pet balanced rather than reading its starting stats as a build', () => {
    expect(getPetBuild(base)).toBe('balanced');
  });

  it('calls a pet a runner once endurance is high and clearly ahead of strength', () => {
    expect(getPetBuild({ ...base, endurance: 60, strength: 20 })).toBe('runner');
  });

  it('needs endurance to be substantial, not merely ahead', () => {
    expect(getPetBuild({ ...base, endurance: 30, strength: 2 })).toBe('balanced');
  });

  it('needs a clear lead, so even training stays balanced', () => {
    expect(getPetBuild({ ...base, endurance: 60, strength: 55 })).toBe('balanced');
  });
});

describe('hasEvolved', () => {
  const runner = { level: 1, endurance: 60, strength: 20 };

  it('holds the evolution back until the pet is past baby', () => {
    expect(hasEvolved(runner)).toBe(false);
    expect(hasEvolved({ ...runner, level: 11 })).toBe(true);
  });

  it('stays false for a grown pet with no specialism', () => {
    expect(hasEvolved({ level: 40, endurance: 20, strength: 20 })).toBe(false);
  });
});

describe('applyForcedForm', () => {
  const pet = createPet('user-1', 'Blue', 'cat');

  it('is a no-op without a form, so it is safe to leave in the render path', () => {
    expect(applyForcedForm(pet, null)).toBe(pet);
  });

  it('forces a runner that reads as evolved', () => {
    const forced = applyForcedForm(pet, 'runner');
    expect(getPetBuild(forced)).toBe('runner');
    expect(hasEvolved(forced)).toBe(true);
  });

  it('previews a real runner as unevolved when a balanced form is asked for', () => {
    const realRunner = { ...pet, level: 40, endurance: 90, strength: 5 };
    expect(hasEvolved(applyForcedForm(realRunner, 'adult'))).toBe(false);
  });

  it('maps each stage to a level that lands in it', () => {
    expect(getEvolutionStage(applyForcedForm(pet, 'baby').level)).toBe('baby');
    expect(getEvolutionStage(applyForcedForm(pet, 'teen').level)).toBe('teen');
    expect(getEvolutionStage(applyForcedForm(pet, 'adult').level)).toBe('adult');
  });
});
