import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { MealAnalysis } from '@vitto/core';
import { CELEBRATES_FROM, petInteractionReducer } from './petInteractionReducer';
import {
  CELEBRATION_DURATION_MS,
  EATING_DURATION_MS,
  EXPLORE_DURATION_MS,
  FOOD_CONSUMED_DELAY_MS,
  LOG_CELEBRATION_MS,
  MUNCH_INTERVAL_MS,
  NOTICE_MS,
  SHEET_DISMISS_MS,
  TRAVEL_DURATION_MS,
  WORKOUT_DURATION_MS,
} from './timing';
import { IDLE_STATE, type PetInteractionState } from './types';

/**
 * Side effects the choreography passes back out at the moments the old
 * `App.tsx` used to fire them inline — sound is not this hook's concern (it
 * already lived in `src/services/mealFeedback.ts`), so the caller still owns
 * exactly when each sound plays, just triggered from here instead of a
 * hand-rolled setTimeout chain.
 */
export interface PetInteractionCallbacks {
  /** Fires once per munch tick while the pet is eating. */
  onMunch?: () => void;
  /** Fires the instant eating ends and celebrating begins. */
  onEatingFinished?: () => void;
  /** Fires once the celebration ends and the pet is back to idle. */
  onCelebrationFinished?: () => void;
}

export interface UsePetInteractionResult {
  state: PetInteractionState;
  /** A brief acknowledgement — call on mount and on a pet tap. */
  notice: () => void;
  startAnalyzing: () => void;
  stopAnalyzing: () => void;
  /**
   * Runs the full feed choreography: wait for the sheet to close, walk to the
   * food, eat it, celebrate, settle back to idle. Timing matches the old
   * `App.tsx` `startFeeding` exactly (see `timing.ts`).
   */
  startFeeding: (imageUri: string | null, grade: MealAnalysis['grade']) => void;
  startWorkout: () => void;
  /**
   * A cheer for a logged moment. Waits out the log's sheet so it is on screen,
   * then plays only if the pet is not in the middle of something that has its
   * own ending (a meal ends in its own cheer, a workout chains into one).
   */
  celebrate: () => void;
  startExploring: () => void;
  /** A short timed dash for a room change — the pet runs, then settles into the
   *  new scene. Only takes over an idle/noticing pet (see the reducer). */
  startTravel: () => void;
  /**
   * Live ambient walking cue (see mobile/AMBIENT.md), not a timed one-shot like
   * `startExploring`: the caller re-asserts this on every render with the
   * current live value (`useEffect` keyed on the signal and on `state.kind` —
   * see `DashboardScreen`), so it starts, stops, and resumes exactly in step
   * with the sensor rather than on any timer of its own.
   */
  setAmbientWalking: (walking: boolean) => void;
  reset: () => void;
}

export function usePetInteraction(callbacks: PetInteractionCallbacks = {}): UsePetInteractionResult {
  const [state, dispatch] = useReducer(petInteractionReducer, IDLE_STATE);
  // Read when a delayed cheer fires, to decide whether it plays at all.
  const stateRef = useRef(state);
  stateRef.current = state;
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Every timer/interval this hook has started, so unmounting mid-sequence (a
  // fast sign-out during a meal, say) cannot dispatch into a dead component.
  const pending = useRef<{ timeouts: ReturnType<typeof setTimeout>[]; intervals: ReturnType<typeof setInterval>[] }>({
    timeouts: [],
    intervals: [],
  });
  const after = useCallback((ms: number, run: () => void) => {
    const id = setTimeout(run, ms);
    pending.current.timeouts.push(id);
    return id;
  }, []);
  const everyTick = useCallback((ms: number, run: () => void) => {
    const id = setInterval(run, ms);
    pending.current.intervals.push(id);
    return id;
  }, []);
  useEffect(
    () => () => {
      pending.current.timeouts.forEach(clearTimeout);
      pending.current.intervals.forEach(clearInterval);
    },
    [],
  );

  const notice = useCallback(() => {
    dispatch({ type: 'PET_NOTICED' });
    after(NOTICE_MS, () => dispatch({ type: 'NOTICE_CLEARED' }));
  }, [after]);

  const startAnalyzing = useCallback(() => dispatch({ type: 'MEAL_ANALYSIS_STARTED' }), []);
  const stopAnalyzing = useCallback(() => dispatch({ type: 'MEAL_ANALYSIS_STOPPED' }), []);

  const startFeeding = useCallback(
    (imageUri: string | null, grade: MealAnalysis['grade']) => {
      dispatch({ type: 'FEEDING_STARTED', grade });
      // Waits out the sheet so the flight is actually on screen; see SHEET_DISMISS_MS.
      after(SHEET_DISMISS_MS, () => {
        dispatch({ type: 'FOOD_REACHED_PET', feedingImage: imageUri });
        const munch = everyTick(MUNCH_INTERVAL_MS, () => callbacksRef.current.onMunch?.());
        after(FOOD_CONSUMED_DELAY_MS, () => {
          dispatch({ type: 'FOOD_CONSUMED' });
          after(EATING_DURATION_MS, () => {
            clearInterval(munch);
            dispatch({ type: 'EATING_FINISHED' });
            callbacksRef.current.onEatingFinished?.();
            after(CELEBRATION_DURATION_MS, () => {
              dispatch({ type: 'CELEBRATION_FINISHED' });
              callbacksRef.current.onCelebrationFinished?.();
            });
          });
        });
      });
    },
    [after, everyTick],
  );

  /** Starts a cheer now and ends it on its own timer. */
  const cheer = useCallback(() => {
    dispatch({ type: 'CELEBRATION_STARTED' });
    after(LOG_CELEBRATION_MS, () => dispatch({ type: 'CELEBRATION_FINISHED' }));
  }, [after]);

  const celebrate = useCallback(() => {
    after(SHEET_DISMISS_MS, () => {
      // Checked here rather than left to the reducer alone: a cheer that does
      // not start must not schedule a finish, which would cut short whichever
      // celebration IS on screen (the end of a meal).
      if (CELEBRATES_FROM.has(stateRef.current.kind)) cheer();
    });
  }, [after, cheer]);

  // A workout ends in a cheer of its own, so the log's `celebrate` (which
  // arrives while the pet is still lifting) has nothing to add.
  const startWorkout = useCallback(() => {
    dispatch({ type: 'WORKOUT_STARTED' });
    after(WORKOUT_DURATION_MS, () => {
      dispatch({ type: 'WORKOUT_FINISHED' });
      cheer();
    });
  }, [after, cheer]);

  const startExploring = useCallback(() => {
    dispatch({ type: 'EXPLORE_STARTED' });
    after(EXPLORE_DURATION_MS, () => dispatch({ type: 'EXPLORE_FINISHED' }));
  }, [after]);

  const startTravel = useCallback(() => {
    dispatch({ type: 'TRAVEL_STARTED' });
    after(TRAVEL_DURATION_MS, () => dispatch({ type: 'TRAVEL_FINISHED' }));
  }, [after]);

  const setAmbientWalking = useCallback(
    (walking: boolean) =>
      dispatch({ type: walking ? 'AMBIENT_WALKING_STARTED' : 'AMBIENT_WALKING_STOPPED' }),
    [],
  );

  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return {
    state,
    notice,
    startAnalyzing,
    stopAnalyzing,
    startFeeding,
    startWorkout,
    celebrate,
    startExploring,
    startTravel,
    setAmbientWalking,
    reset,
  };
}
