import { describe, expect, it } from 'vitest';
import type { HealthEvent } from './health';
import { BOND_WINDOW_DAYS, bondFor, bondStage } from './bond';

const NOW = new Date(2026, 8, 16, 15, 0); // local 3pm
const DAY = 86_400_000;
const at = (daysAgo: number, hour = 9): HealthEvent => ({
  id: `e-${daysAgo}-${hour}`, userId: 'u', type: 'MEAL', source: 'manual',
  occurredAt: new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo, hour).toISOString(),
  metadata: { protein: true, vegetables: true, fruit: false, wholeGrains: false, fiber: false, treats: false },
});
const daily = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => at(from + i));
const adoptedDaysAgo = (n: number) => ({ adoptedAt: new Date(NOW.getTime() - n * DAY).toISOString() });

describe('bondFor', () => {
  it('is devoted after a fortnight of daily care, and sulking after a fortnight of silence', () => {
    expect(bondFor(daily(0, 13), NOW, adoptedDaysAgo(30))).toMatchObject({ score: 100, stage: 'devoted', silentDays: 0 });
    expect(bondFor([], NOW, adoptedDaysAgo(30))).toMatchObject({ score: 0, stage: 'sulking' });
  });

  it('starts neutral: a brand-new pet is not devoted after one good day', () => {
    const dayOne = bondFor([at(0)], NOW, adoptedDaysAgo(0));
    expect(dayOne.stage).toBe('neutral');
    expect(dayOne.score).toBeLessThan(60);
    // And a day-one owner who has not logged yet is not sulked at either.
    expect(bondFor([], NOW, adoptedDaysAgo(0)).stage).toBe('neutral');
  });

  it('never counts today against the owner — the morning is not neglect', () => {
    const cared = daily(1, 13);
    const beforeToday = bondFor(cared, NOW, adoptedDaysAgo(30));
    const afterToday = bondFor([...cared, at(0)], NOW, adoptedDaysAgo(30));
    expect(beforeToday.stage).toBe('devoted');
    expect(afterToday.score).toBeGreaterThanOrEqual(beforeToday.score);
  });

  it('cools with silence, recent days weighing most', () => {
    const steady = bondFor(daily(0, 13), NOW, adoptedDaysAgo(30)).score;
    const missedRecent = bondFor(daily(4, 13), NOW, adoptedDaysAgo(30)).score;
    const missedOld = bondFor([...daily(0, 9)], NOW, adoptedDaysAgo(30)).score;
    expect(missedRecent).toBeLessThan(steady);
    expect(missedOld).toBeLessThan(steady);
    // Four silent days just now hurt more than four silent days a fortnight back.
    expect(missedRecent).toBeLessThan(missedOld);
  });

  it('is won back within days of showing up again, and bottoms out at sulking rather than worse', () => {
    const neglected = bondFor([], NOW, adoptedDaysAgo(60));
    expect(neglected.stage).toBe('sulking');
    expect(neglected.score).toBe(0);
    const backFiveDays = bondFor(daily(0, 4), NOW, adoptedDaysAgo(60));
    expect(backFiveDays.score).toBeGreaterThan(40);
    expect(['neutral', 'warm']).toContain(backFiveDays.stage);
  });

  it('reports how long the pet has been left alone', () => {
    expect(bondFor([at(3)], NOW, adoptedDaysAgo(30)).silentDays).toBe(3);
    expect(bondFor([at(0, 8)], NOW, adoptedDaysAgo(30)).silentDays).toBe(0);
    expect(bondFor([], NOW, adoptedDaysAgo(30)).silentDays).toBe(BOND_WINDOW_DAYS);
  });

  it('ignores events from the future and unreadable dates', () => {
    const future = { ...at(0), occurredAt: new Date(NOW.getTime() + DAY).toISOString() };
    const junk = { ...at(0), occurredAt: 'not a date' };
    expect(bondFor([future, junk], NOW, adoptedDaysAgo(30)).stage).toBe('sulking');
  });

  it('maps the score onto five stages with sulking as the floor', () => {
    expect([100, 80, 79, 60, 59, 40, 39, 20, 19, 0].map(bondStage)).toEqual([
      'devoted', 'devoted', 'warm', 'warm', 'neutral', 'neutral', 'wary', 'wary', 'sulking', 'sulking',
    ]);
  });
});
