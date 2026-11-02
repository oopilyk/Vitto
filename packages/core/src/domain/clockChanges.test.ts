import { it, expect } from 'vitest';
import * as core from '../index';

/**
 * Every day-by-day calculation the home screen runs, on 40 straight days of
 * history, with "now" placed around every real clock change of 2025-2027 in
 * zones that change by an hour, by half an hour (Lord Howe), and at midnight
 * itself (Chile, Cuba, Lebanon), so that midnight does not exist. Each must
 * finish quickly and count all 40 days: on 1 Nov 2026 a 24-hour step in the
 * trophy walk never ended, and every US account with older history froze on
 * the loading spinner.
 */

const ZONES = ['America/New_York', 'America/Los_Angeles', 'Europe/London', 'America/Santiago', 'Australia/Lord_Howe', 'Australia/Sydney', 'America/Havana', 'Asia/Beirut'];
const profile = { ...core.PROFILE_SURVEY_DEFAULTS, age: 30, sex: 'male', heightCm: 175, heightUnit: 'cm', weightKg: 70, weightUnit: 'kg', activity: 'moderate', goal: 'maintain', trainingDaysPerWeek: 3 } as core.BodyProfile;

it('every history calculation survives every clock change', () => {
  const original = process.env.TZ;
  let checks = 0;
  const problems: string[] = [];
  for (const zone of ZONES) {
    process.env.TZ = zone;
    // Each local day 2025-2027 whose length is not 24h is a clock change.
    const changes: Date[] = [];
    for (let d = new Date(2025, 0, 1, 12); d.getFullYear() < 2028; d.setDate(d.getDate() + 1)) {
      const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const b = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      if (b - a !== 86_400_000) changes.push(new Date(d));
    }
    if (changes.length < 4) problems.push(`${zone}: only ${changes.length} changes found`);
    for (const change of changes) {
      for (const offsetDays of [0, 1, 2]) for (const hour of [0, 12, 23]) {
        const now = new Date(change.getFullYear(), change.getMonth(), change.getDate() + offsetDays, hour, 30);
        const events = Array.from({ length: 40 }, (_, n) => {
          const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, n === 0 ? Math.min(hour, 0) : 18, 0);
          if (at.getTime() > now.getTime()) at.setTime(now.getTime() - 60_000);
          return [
            { id: `s${n}`, userId: 'u', occurredAt: at.toISOString(), type: 'STEP_ACTIVITY', source: 'manual', metadata: { steps: 12_000 } },
            { id: `m${n}`, userId: 'u', occurredAt: at.toISOString(), type: 'BRAIN_TRAINING', source: 'manual', metadata: { game: 'reading', xpAwarded: 5 } },
          ] as core.HealthEvent[];
        }).flat();
        const label = `${zone} ${now.toString()}`;
        const started = Date.now();
        const trophies = core.earnedTrophies(events, profile, now);
        const streaks = core.calculateStreaks(events, now);
        core.buildDailyRecap({ events, profile, pet: core.createPet('u', 'P'), stepGoal: 8000, day: now } as never);
        core.earnedAchievements({ events, pet: null, trophies, today: now });
        const bond = core.bondFor(events, now, { adoptedAt: events[events.length - 1]!.occurredAt });
        core.calculateInsights(events, now);
        core.calculateStreakStatus(events, now);
        const took = Date.now() - started;
        checks += 1;
        if (took > 500) problems.push(`${label}: took ${took}ms`);
        if (!trophies.includes('shoe') || !trophies.includes('book')) problems.push(`${label}: trophies ${trophies.join(',')}`);
        if (streaks.currentStreak !== 40 || streaks.longestStreak !== 40) problems.push(`${label}: streak ${streaks.currentStreak}/${streaks.longestStreak}`);
        if (bond.silentDays !== 0) problems.push(`${label}: silentDays ${bond.silentDays}`);
      }
    }
  }
  process.env.TZ = original;
  expect(checks).toBeGreaterThan(300);
  expect(problems.slice(0, 15)).toEqual([]);
}, 600_000);
