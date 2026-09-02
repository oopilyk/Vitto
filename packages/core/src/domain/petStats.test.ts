import { describe, expect, it } from 'vitest';
import { PET_STAT_DESCRIPTORS, careCountsByType, daysWithPet, statValue } from './petStats';
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
