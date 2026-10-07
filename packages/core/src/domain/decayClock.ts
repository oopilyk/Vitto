/**
 * How long one "day" of decline lasts, on its own so anything can read the
 * clock without importing the decay engine (and the engine's imports with it).
 * decay.ts re-exports all of it.
 */

export const ONE_MINUTE_MS = 60 * 1000;
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The env var that opts a build into the compressed QA clock. Any other value
 * (including unset) runs the real one-day-per-day cadence. `EXPO_PUBLIC_` so
 * Expo inlines it into the mobile bundle at build time, matching the rest of the
 * app's env conventions.
 */
export const DECAY_FAST_ENV_KEY = 'EXPO_PUBLIC_DECAY_FAST';

/** The values that turn the fast clock on. Everything else leaves it off. */
const DECAY_FAST_ENABLED_VALUES: ReadonlySet<string> = new Set(['1', 'true']);

/** `process` is absent in some RN/web runtimes; never throw while reading it. */
const readProcessEnv = (): Readonly<Record<string, string | undefined>> =>
  typeof process !== 'undefined' && process.env ? process.env : {};

/**
 * Whether the given environment asks for the compressed decay clock. Pure and
 * env-injected so a test can exercise both modes without reloading the module.
 */
export const isDecayFastMode = (
  env: Readonly<Record<string, string | undefined>> = readProcessEnv(),
): boolean => DECAY_FAST_ENABLED_VALUES.has(env[DECAY_FAST_ENV_KEY] ?? '');

/**
 * Maps the fast-mode flag to the length of one decline "day".
 * Exported so the cadence choice is unit-testable on its own.
 */
export const resolveDecayPeriodMs = (fastMode: boolean): number =>
  fastMode ? ONE_MINUTE_MS : ONE_DAY_MS;

/**
 * How much wall-clock time one "day" of decline represents. THE ONE TUNABLE.
 * Testing compresses the clock, never the rates -- so a test run exercises the
 * real curve, just faster. The whole ladder is observable in ~11 minutes.
 *
 * Production cadence (`ONE_DAY_MS`) is the default. Set EXPO_PUBLIC_DECAY_FAST=1
 * for the ~11-minute QA clock. IS_TEST_DECAY_PERIOD drives a loud in-app banner
 * so a fast build cannot ship unnoticed.
 */
export const DECAY_PERIOD_MS = resolveDecayPeriodMs(isDecayFastMode());

export const IS_TEST_DECAY_PERIOD = DECAY_PERIOD_MS !== ONE_DAY_MS;

/** UI refresh cadence. Follows the period: 5s in test, 60s in production. */
export const DECAY_TICK_MS = Math.min(60_000, Math.max(5_000, DECAY_PERIOD_MS / 12));
