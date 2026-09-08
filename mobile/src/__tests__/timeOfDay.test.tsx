import { isNightTime } from '../petWorld/timeOfDay';

describe('isNightTime', () => {
  it('reads as day at midday', () => {
    expect(isNightTime(new Date('2026-06-15T12:00:00'))).toBe(false);
  });

  it('reads as night right after the evening cutoff', () => {
    expect(isNightTime(new Date('2026-06-15T19:00:00'))).toBe(true);
  });

  it('reads as day just before the evening cutoff', () => {
    expect(isNightTime(new Date('2026-06-15T18:59:00'))).toBe(false);
  });

  it('reads as night in the early hours before the morning cutoff', () => {
    expect(isNightTime(new Date('2026-06-15T03:00:00'))).toBe(true);
  });

  it('reads as day right at the morning cutoff', () => {
    expect(isNightTime(new Date('2026-06-15T06:00:00'))).toBe(false);
  });
});
