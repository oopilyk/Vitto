jest.mock('@react-native-async-storage/async-storage', () => ({}));

import { resumedStartedAt } from '../services/workoutDraft';

const MIN = 60_000;

describe('resumedStartedAt', () => {
  it('skips the time a session spent kept for later', () => {
    // Started at 0, 20 min in when put away, picked up 2 hours later.
    const now = 20 * MIN + 120 * MIN;
    expect(resumedStartedAt({ startedAt: 0, pausedAt: 20 * MIN }, now)).toBe(120 * MIN);
    // So the clock reads 20 minutes, not 140.
    expect(now - (resumedStartedAt({ startedAt: 0, pausedAt: 20 * MIN }, now) as number)).toBe(20 * MIN);
  });

  it('keeps the start as it was when the session was never put away', () => {
    expect(resumedStartedAt({ startedAt: 5 * MIN }, 60 * MIN)).toBe(5 * MIN);
    expect(resumedStartedAt({ startedAt: 5 * MIN, pausedAt: null }, 60 * MIN)).toBe(5 * MIN);
  });

  it('has no start to move when the clock never started', () => {
    expect(resumedStartedAt({ startedAt: null, pausedAt: 10 * MIN }, 60 * MIN)).toBeNull();
  });
});
