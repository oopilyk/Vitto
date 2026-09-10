import { describe, expect, it } from 'vitest';
import type { HealthEvent } from './health';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, earnedAchievements, newlyUnlocked } from './achievements';
import { createPet } from './pet';
import { TROPHY_IDS } from './trophies';

const TODAY = new Date(2026, 8, 10, 12);
let seq = 0;
const at = (daysAgo: number): string => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
};
const event = (type: HealthEvent['type'], daysAgo = 0): HealthEvent =>
  ({ id: `e-${(seq += 1)}`, userId: 'u', occurredAt: at(daysAgo), type, source: 'manual', metadata: {} }) as HealthEvent;

const pet = createPet('u', 'Miso', 'dog');

describe('earnedAchievements', () => {
  it('starts empty, with no pet and no history', () => {
    expect(earnedAchievements({ events: [], pet: null, trophies: [], today: TODAY })).toEqual([]);
  });

  it('unlocks "Hello, world" and the matching first-time badge on the very first care moment', () => {
    const earned = earnedAchievements({ events: [event('MEAL')], pet, trophies: [], today: TODAY });
    expect(earned).toEqual(['first_care', 'first_meal']);
  });

  it('has a first-time badge for each kind of care', () => {
    for (const [type, id] of [
      ['STEP_ACTIVITY', 'first_walk'],
      ['WORKOUT', 'first_workout'],
      ['BRAIN_TRAINING', 'first_mind'],
    ] as const) {
      expect(earnedAchievements({ events: [event(type)], pet, trophies: [], today: TODAY })).toContain(id);
    }
  });

  it('awards streak badges for a streak that happened, even if it has since broken', () => {
    // Seven days in a row, ending ten days ago, then nothing.
    const events = Array.from({ length: 7 }, (_, n) => event('MEAL', 10 + n));
    const earned = earnedAchievements({ events, pet, trophies: [], today: TODAY });
    expect(earned).toContain('streak_7');
    expect(earned).not.toContain('streak_30');
  });

  it('counts care moments across every type', () => {
    const events = Array.from({ length: 50 }, (_, n) => event(n % 2 ? 'MEAL' : 'WORKOUT', n));
    expect(earnedAchievements({ events, pet, trophies: [], today: TODAY })).toContain('care_50');
  });

  it('reads level and evolution off the pet', () => {
    const grown = { ...pet, level: 12, endurance: 90, strength: 10, mind: 10 };
    const earned = earnedAchievements({ events: [], pet: grown, trophies: [], today: TODAY });
    expect(earned).toEqual(expect.arrayContaining(['level_5', 'level_10', 'evolved']));
  });

  it('includes trophies as given, so a dev override flows through unchanged', () => {
    const earned = earnedAchievements({ events: [], pet, trophies: ['book'], today: TODAY });
    expect(earned).toEqual(['book']);
  });

  it('returns display order regardless of what unlocked first', () => {
    const events = [event('BRAIN_TRAINING'), event('MEAL')];
    const earned = earnedAchievements({ events, pet, trophies: ['dumbbell'], today: TODAY });
    const order = ACHIEVEMENTS.map((a) => a.id);
    expect([...earned].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(earned);
  });
});

describe('newlyUnlocked', () => {
  it('is what has been earned but not yet shown, in display order', () => {
    expect(newlyUnlocked(['first_care', 'first_meal', 'level_5'], new Set(['first_care']))).toEqual([
      'first_meal',
      'level_5',
    ]);
  });

  it('is empty once everything has been seen', () => {
    expect(newlyUnlocked(['first_care'], new Set(['first_care', 'first_meal']))).toEqual([]);
  });
});

describe('ACHIEVEMENTS', () => {
  it('lists every trophy as an achievement too', () => {
    for (const id of TROPHY_IDS) expect(ACHIEVEMENT_BY_ID[id].kind).toBe('trophy');
  });

  it('describes trophies in the user\'s own weekly target', () => {
    expect(ACHIEVEMENT_BY_ID.dumbbell.describe({ trainingDaysPerWeek: 4 })).toContain('4 workouts a week');
  });

  it('has unique ids', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
