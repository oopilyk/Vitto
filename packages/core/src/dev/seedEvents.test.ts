import { describe, expect, it } from 'vitest';
import { generateSeedEvents, isSeededEvent, SEED_SOURCE } from './seedEvents';
import { calculateInsights, MIN_PAIRED_DAYS } from '../domain/insights';

const NOW = new Date('2026-09-05T12:00:00Z');

describe('generateSeedEvents', () => {
  it('produces a history that makes every insight fire', () => {
    // The whole point of the seed: without it the insight thresholds keep a real
    // account silent for weeks, so there is no way to see the copy or confirm the
    // maths end to end.
    const insights = calculateInsights(generateSeedEvents('user-1', { now: NOW }), NOW);
    expect(insights.map((insight) => insight.kind).sort()).toEqual([
      'protein-volume',
      'sleep-mind',
      'steps-mind',
    ]);
  });

  it('reports the planted directions, not the opposite ones', () => {
    const insights = calculateInsights(generateSeedEvents('user-1', { now: NOW }), NOW);
    const byKind = Object.fromEntries(insights.map((insight) => [insight.kind, insight]));
    // `direction` always describes the UNDER-threshold group relative to the
    // over-threshold one, so every planted effect reads as 'lower': short nights
    // score worse, quiet days score worse, and lighter-protein days are followed
    // by smaller sessions. A 'higher' here would mean the seed — or the
    // comparison — had the relationship backwards.
    expect(byKind['sleep-mind'].direction).toBe('lower');
    expect(byKind['steps-mind'].direction).toBe('lower');
    expect(byKind['protein-volume'].direction).toBe('lower');
  });

  it('plants effects comfortably clear of the reporting floor', () => {
    // Sized so a small refactor of the maths does not silently drop an insight
    // below MIN_RELATIVE_EFFECT and leave the seed looking broken.
    const insights = calculateInsights(generateSeedEvents('user-1', { now: NOW }), NOW);
    for (const insight of insights) {
      expect(Math.abs(insight.effectSize)).toBeGreaterThan(0.15);
    }
  });

  it('clears the sample gates with room to spare', () => {
    const insights = calculateInsights(generateSeedEvents('user-1', { now: NOW }), NOW);
    for (const insight of insights) {
      expect(insight.sampleDays).toBeGreaterThanOrEqual(MIN_PAIRED_DAYS);
    }
  });

  it('is deterministic, so a change in output means a change in code', () => {
    const first = generateSeedEvents('user-1', { now: NOW });
    const second = generateSeedEvents('user-1', { now: NOW });
    expect(second).toEqual(first);
  });

  it('gives every event a real UUID, because health_events.id is a uuid column', () => {
    // Readable `seed-<n>` ids were rejected by Postgres outright (22P02), so
    // seeding failed on its very first insert and the dev panel just showed the
    // driver's error.
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const events = generateSeedEvents('user-1', { now: NOW });
    for (const event of events) expect(event.id).toMatch(uuid);
    // Unique, or the batch insert collides with itself.
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
  });

  it('keeps two accounts from claiming the same event ids', () => {
    // The ids are stable per account on purpose, but `health_events.id` is a
    // primary key across every user — deriving it from the seed alone would make
    // the second account to seed collide with the first.
    const mine = generateSeedEvents('user-1', { now: NOW }).map((event) => event.id);
    const theirs = generateSeedEvents('user-2', { now: NOW }).map((event) => event.id);
    expect(mine).toEqual(generateSeedEvents('user-1', { now: NOW }).map((event) => event.id));
    expect(mine.filter((id) => theirs.includes(id))).toEqual([]);
  });

  it('tags everything it makes so a seeded account can be swept clean', () => {
    const events = generateSeedEvents('user-1', { now: NOW });
    expect(events.every(isSeededEvent)).toBe(true);
    expect(events.every((event) => event.source === SEED_SOURCE)).toBe(true);
  });

  it('leaves gaps rather than logging a perfect streak', () => {
    // A history with no missing days would hide bugs in code that has to tell an
    // absent day from a zero one.
    const events = generateSeedEvents('user-1', { now: NOW });
    const sleepDays = events.filter((event) => event.type === 'SLEEP').length;
    expect(sleepDays).toBeGreaterThan(60);
    expect(sleepDays).toBeLessThan(90);
  });
});
