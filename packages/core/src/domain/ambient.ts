/**
 * Ambient signals: what the user is doing *right now*, read while the app is
 * open, so the pet can react in the moment — walk alongside a walk, pick up a
 * dumbbell at the gym.
 *
 * Pure. The platform edges (pedometer, location) live in the mobile package;
 * this is the arithmetic they feed, kept here so it is unit-tested without a
 * device and so both platforms agree on what "walking" means.
 *
 * Nothing here is stored. These are live booleans derived from a rolling window
 * of step deltas and a single saved coordinate — no movement history, no
 * location trail. See mobile/AMBIENT.md.
 */

export interface StepSample {
  /** Wall-clock ms when the pedometer reported this cumulative count. */
  at: number;
  /** Cumulative steps since the subscription began, as the pedometer reports it. */
  steps: number;
}

/** How far back a cadence check looks. */
export const WALKING_WINDOW_MS = 12_000;
/**
 * Steps inside the window before the user counts as walking. A brisk walk is
 * ~100 steps/min, so 12 seconds is ~20; the floor sits well under that so a
 * stroll qualifies, and well over the handful of steps crossing a room gives.
 */
export const WALKING_MIN_STEPS = 10;

/**
 * Steps taken inside the cadence window.
 *
 * Reads the delta across the window rather than "did a step arrive": the
 * pedometer emits on every step, so any single event says nothing about pace,
 * and a sustained delta is what separates walking from shuffling to the kettle.
 * Pass `now` explicitly — it is compared against `sample.at`, and a hidden
 * `Date.now()` would make this untestable.
 *
 * Exported in its own right so the dev readout can show the raw number: "0 steps
 * in the window" and "permission denied" look identical from the outside
 * otherwise.
 */
export const stepsInWindow = (
  samples: readonly StepSample[],
  now: number,
  windowMs: number = WALKING_WINDOW_MS,
): number => {
  if (samples.length === 0) return 0;
  const cutoff = now - windowMs;
  const latest = samples[samples.length - 1];
  // Stale subscription: the last step was before the window opened.
  if (latest.at < cutoff) return 0;
  // The count as it stood when the window opened: the newest sample at or
  // before the cutoff, or the oldest sample if the subscription is younger
  // than the window.
  let baseline = samples[0];
  for (const sample of samples) {
    if (sample.at <= cutoff) baseline = sample;
    else break;
  }
  return latest.steps - baseline.steps;
};

/** Whether that delta clears the walking floor. */
export const isWalking = (
  samples: readonly StepSample[],
  now: number,
  windowMs: number = WALKING_WINDOW_MS,
  minSteps: number = WALKING_MIN_STEPS,
): boolean => stepsInWindow(samples, now, windowMs) >= minSteps;

/** Drops samples older than the window, keeping one earlier sample as the baseline. */
export const trimStepSamples = (
  samples: readonly StepSample[],
  now: number,
  windowMs: number = WALKING_WINDOW_MS,
): StepSample[] => {
  const cutoff = now - windowMs;
  let firstInside = samples.findIndex((sample) => sample.at > cutoff);
  if (firstInside === -1) return samples.length ? [samples[samples.length - 1]] : [];
  // Keep the last sample before the window so the delta has something to start from.
  return samples.slice(Math.max(0, firstInside - 1));
};

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * How close counts as "at" the gym. Wide enough to absorb a phone's ordinary
 * ~20–50m position error and a gym that is one unit of a bigger building, tight
 * enough not to fire from the car park across the road.
 */
export const AT_PLACE_RADIUS_METERS = 120;

const EARTH_RADIUS_METERS = 6_371_000;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance (haversine). Fine at any range that matters here. */
export const distanceMeters = (a: GeoPoint, b: GeoPoint): number => {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
};

export const isAtPlace = (
  here: GeoPoint | null | undefined,
  place: GeoPoint | null | undefined,
  radiusMeters: number = AT_PLACE_RADIUS_METERS,
): boolean => {
  if (!here || !place) return false;
  return distanceMeters(here, place) <= radiusMeters;
};
