import { describe, expect, it } from 'vitest';
import {
  AT_PLACE_RADIUS_METERS,
  WALKING_MIN_STEPS,
  WALKING_WINDOW_MS,
  distanceMeters,
  isAtPlace,
  isWalking,
  stepsInWindow,
  trimStepSamples,
} from './ambient';

const T = 1_000_000;

describe('isWalking', () => {
  it('is false with no samples', () => {
    expect(isWalking([], T)).toBe(false);
  });

  it('reads the step delta across the window, not the arrival of a step', () => {
    // 12 steps in the last 10s: walking. The count itself (200) is irrelevant.
    const samples = [
      { at: T - 11_000, steps: 188 },
      { at: T - 2_000, steps: 200 },
    ];
    expect(isWalking(samples, T)).toBe(true);
  });

  it('ignores a few steps — crossing a room is not a walk', () => {
    const samples = [
      { at: T - 11_000, steps: 100 },
      { at: T - 1_000, steps: 100 + WALKING_MIN_STEPS - 1 },
    ];
    expect(isWalking(samples, T)).toBe(false);
  });

  it('goes false once the last step is older than the window', () => {
    // Plenty of steps, but they all happened before the window opened.
    const samples = [
      { at: T - 40_000, steps: 0 },
      { at: T - WALKING_WINDOW_MS - 1, steps: 60 },
    ];
    expect(isWalking(samples, T)).toBe(false);
  });

  it('uses the count as it stood when the window opened as the baseline', () => {
    // 50 steps long ago, then only 4 inside the window: not walking now.
    const samples = [
      { at: T - 60_000, steps: 0 },
      { at: T - WALKING_WINDOW_MS - 500, steps: 50 },
      { at: T - 1_000, steps: 54 },
    ];
    expect(isWalking(samples, T)).toBe(false);
  });

  it('counts from the first sample when the subscription is younger than the window', () => {
    const samples = [
      { at: T - 5_000, steps: 0 },
      { at: T - 500, steps: WALKING_MIN_STEPS },
    ];
    expect(isWalking(samples, T)).toBe(true);
  });
});

describe('stepsInWindow', () => {
  it('reports the raw delta, so a quiet sensor is distinguishable from a denied one', () => {
    expect(stepsInWindow([], T)).toBe(0);
    expect(
      stepsInWindow([{ at: T - 11_000, steps: 188 }, { at: T - 2_000, steps: 200 }], T),
    ).toBe(12);
  });

  it('is zero once the newest step falls out of the window', () => {
    expect(stepsInWindow([{ at: T - WALKING_WINDOW_MS - 1, steps: 60 }], T)).toBe(0);
  });
});

describe('trimStepSamples', () => {
  it('drops old samples but keeps one as the baseline', () => {
    const samples = [
      { at: T - 50_000, steps: 0 },
      { at: T - 30_000, steps: 20 },
      { at: T - 5_000, steps: 40 },
      { at: T - 1_000, steps: 48 },
    ];
    expect(trimStepSamples(samples, T)).toEqual(samples.slice(1));
  });

  it('keeps only the newest sample when everything is stale', () => {
    const samples = [
      { at: T - 50_000, steps: 0 },
      { at: T - 30_000, steps: 20 },
    ];
    expect(trimStepSamples(samples, T)).toEqual([samples[1]]);
  });
});

describe('distanceMeters / isAtPlace', () => {
  const gym = { latitude: 51.5007, longitude: -0.1246 }; // Big Ben

  it('measures a known distance to within a few percent', () => {
    const eye = { latitude: 51.5033, longitude: -0.1196 }; // London Eye, ~450m away
    const d = distanceMeters(gym, eye);
    expect(d).toBeGreaterThan(400);
    expect(d).toBeLessThan(500);
  });

  it('is zero for the same point', () => {
    expect(distanceMeters(gym, gym)).toBe(0);
  });

  it('is at the place inside the radius and not outside it', () => {
    // ~0.001° of latitude is ~111m: inside 120m; ~0.002° is ~222m: outside.
    expect(isAtPlace({ latitude: gym.latitude + 0.001, longitude: gym.longitude }, gym)).toBe(true);
    expect(isAtPlace({ latitude: gym.latitude + 0.002, longitude: gym.longitude }, gym)).toBe(false);
  });

  it('is never at a place that is not set, or without a fix', () => {
    expect(isAtPlace(gym, null)).toBe(false);
    expect(isAtPlace(null, gym)).toBe(false);
    expect(isAtPlace(undefined, undefined)).toBe(false);
  });

  it('honours a custom radius', () => {
    const near = { latitude: gym.latitude + 0.0005, longitude: gym.longitude }; // ~55m
    expect(isAtPlace(near, gym, 30)).toBe(false);
    expect(isAtPlace(near, gym, AT_PLACE_RADIUS_METERS)).toBe(true);
  });
});
