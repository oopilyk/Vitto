import { Platform } from 'react-native';

/**
 * Every number here except `NOTICE_MS` and `ENVIRONMENT_TRANSITION_MS` existed
 * in `App.tsx` before this system did (as bare literals inside the old
 * `startFeeding`/`completeWorkout`/`syncSteps`) — moved here rather than
 * reinvented, so the choreography `usePetInteraction` now runs is byte-for-byte
 * the same timing the old boolean-plus-setTimeout version ran.
 */

/**
 * How long to wait after the meal sheet is told to close before the food starts
 * flying. The sheet is dismissed before feeding starts, and an iOS pageSheet
 * takes about this long to slide away — without the wait the flight plays behind
 * it and is cleared just as the dashboard becomes visible. Formerly
 * `SHEET_DISMISS_MS` in `App.tsx`.
 */
export const SHEET_DISMISS_MS = Platform.OS === 'ios' ? 480 : 320;

/** How long the plate stays on screen once it arrives, before it's cleared. */
export const FOOD_CONSUMED_DELAY_MS = 900;

/** How long the pet keeps eating (munch sound ticking) after the plate is gone. */
export const EATING_DURATION_MS = 1900;

/** How long the celebration (confetti, hearts) plays once eating finishes. */
export const CELEBRATION_DURATION_MS = 1500;

/** Cadence of the munch sound while `eating`. Formerly inline in `startFeeding`. */
export const MUNCH_INTERVAL_MS = 420;

/** Formerly `WORKOUT_ANIMATION_MS` in `App.tsx`. */
export const WORKOUT_DURATION_MS = 1100;

/** Formerly `EXPLORE_ANIMATION_MS` in `App.tsx`. */
export const EXPLORE_DURATION_MS = 1100;

/**
 * New: how long a "noticing" reaction holds before the pet settles back to idle.
 * There was no equivalent state before this system, so there was nothing to
 * reuse — picked to read as a quick acknowledgement, not a pause.
 */
export const NOTICE_MS = 900;

/**
 * New: how long the crossfade between environments (Main <-> Kitchen) takes.
 * Also new — the dashboard never changed "scenes" before this system.
 */
export const ENVIRONMENT_TRANSITION_MS = 380;
