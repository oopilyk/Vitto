import { describe, expect, it } from 'vitest';
import { getScreenTimeBand, SCREEN_TIME_BANDS, SCREEN_TIME_THRESHOLD_MINUTES } from './screenTime';

describe('getScreenTimeBand', () => {
  it('grades the day by the hours asked for', () => {
    expect(getScreenTimeBand(90).id).toBe('light');
    expect(getScreenTimeBand(200).id).toBe('moderate');
    expect(getScreenTimeBand(330).id).toBe('heavy');
    expect(getScreenTimeBand(600).id).toBe('excessive');
  });

  it('puts each boundary in the gentler band, not the harsher one', () => {
    // Exactly two hours is "a good day", not the start of "fine". A user who
    // aimed at a round number and hit it should not be bumped down for it.
    expect(getScreenTimeBand(120).id).toBe('light');
    expect(getScreenTimeBand(121).id).toBe('moderate');
    expect(getScreenTimeBand(240).id).toBe('moderate');
    expect(getScreenTimeBand(360).id).toBe('heavy');
  });

  it('never falls off the end, however large the total', () => {
    expect(getScreenTimeBand(60 * 25).id).toBe('excessive');
    expect(getScreenTimeBand(Number.MAX_SAFE_INTEGER).id).toBe('excessive');
  });

  it('treats unusable input as zero rather than picking a band at random', () => {
    expect(getScreenTimeBand(Number.NaN).id).toBe('light');
    expect(getScreenTimeBand(-30).id).toBe('light');
  });

  it('keeps the bands ordered, since lookup is first-match', () => {
    const ceilings = SCREEN_TIME_BANDS.map((band) => band.ceilingMinutes);
    expect([...ceilings]).toEqual([...ceilings].sort((a, b) => a - b));
  });

  it('registers a threshold at every band boundary', () => {
    // The iOS ladder has to line up with the bands or a crossing cannot be
    // mapped onto one.
    for (const band of SCREEN_TIME_BANDS) {
      if (Number.isFinite(band.ceilingMinutes)) {
        expect(SCREEN_TIME_THRESHOLD_MINUTES).toContain(band.ceilingMinutes);
      }
    }
  });
});
