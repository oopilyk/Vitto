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

/**
 * How long the pet runs after steps are logged.
 *
 * Was 1100ms, inherited from the old `EXPLORE_ANIMATION_MS`. Every sheet's `move`
 * band is 4 to 8 frames at `FRAME_MS.move` (90ms), so a full stride cycle takes
 * 360-720ms and the old value gave some pets barely one and a half of them --
 * long enough to register as a twitch, not as the pet going for a run with you.
 * Three seconds is at least four cycles on the shortest band, which is what makes
 * it read as running.
 *
 * One number rather than one per sheet on purpose: this is how long the ACTION
 * lasts, not how fast a particular animal's legs move. Pace belongs in
 * `FRAME_MS.move`, and per-sheet exceptions belong in that sheet's `frameMs`.
 */
export const EXPLORE_DURATION_MS = 3000;

/**
 * New: how long a "noticing" reaction holds before the pet settles back to idle.
 * There was no equivalent state before this system, so there was nothing to
 * reuse — picked to read as a quick acknowledgement, not a pause.
 */
export const NOTICE_MS = 900;

/**
 * How long the crossfade between environments takes -- the background-colour
 * blend, the content fade-swap and the settle-pulse all run for this long.
 * Longer than the original 380ms so the room change eases rather than snaps.
 */
export const ENVIRONMENT_TRANSITION_MS = 560;

/**
 * How long the pet runs when a scene button is tapped -- a short dash that reads
 * as the pet running from one room to the next, then it settles back to idle in
 * the new room. Shorter than a step-sync `EXPLORE_DURATION_MS` run: this is a
 * transition flourish, not "went for a run with you".
 */
export const TRAVEL_DURATION_MS = 850;
