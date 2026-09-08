import { IDLE_STATE, type PetInteractionEvent, type PetInteractionState } from './types';

/**
 * Pure state transition for what the pet is doing. No timers, no side effects —
 * `usePetInteraction` owns the choreography (the setTimeout chain that used to
 * live in `App.tsx`'s `startFeeding`/`completeWorkout`/`syncSteps`) and dispatches
 * events here one at a time, which is what makes this testable without mocking
 * the clock.
 *
 * An event that doesn't apply to the current state is ignored (returns `state`
 * unchanged) rather than throwing — a stray `FOOD_CONSUMED` arriving after the
 * pet was reset to idle (a fast re-tap, say) should not corrupt the state.
 */
export function petInteractionReducer(
  state: PetInteractionState,
  event: PetInteractionEvent,
): PetInteractionState {
  switch (event.type) {
    case 'PET_NOTICED':
      // Noticing is allowed to interrupt idle/sleeping only — it must not cut a
      // meal or workout short just because the pet was tapped mid-moment.
      return state.kind === 'idle' || state.kind === 'sleeping' ? { kind: 'noticing' } : state;
    case 'NOTICE_CLEARED':
      return state.kind === 'noticing' ? IDLE_STATE : state;

    case 'MEAL_ANALYSIS_STARTED':
      return { kind: 'analyzing' };
    case 'MEAL_ANALYSIS_STOPPED':
      return state.kind === 'analyzing' ? IDLE_STATE : state;

    case 'FEEDING_STARTED':
      return { kind: 'walkingToFood', grade: event.grade };
    case 'FOOD_REACHED_PET':
      return state.kind === 'walkingToFood'
        ? { kind: 'eating', feedingImage: event.feedingImage, grade: state.grade }
        : state;
    case 'FOOD_CONSUMED':
      return state.kind === 'eating' ? { ...state, feedingImage: null } : state;
    case 'EATING_FINISHED':
      return state.kind === 'eating' ? { kind: 'celebrating', grade: state.grade } : state;
    case 'CELEBRATION_FINISHED':
      return state.kind === 'celebrating' ? IDLE_STATE : state;

    case 'WORKOUT_STARTED':
      return { kind: 'workingOut' };
    case 'WORKOUT_FINISHED':
      return state.kind === 'workingOut' ? IDLE_STATE : state;

    case 'EXPLORE_STARTED':
      return { kind: 'exploring' };
    case 'EXPLORE_FINISHED':
      return state.kind === 'exploring' ? IDLE_STATE : state;

    case 'SLEEP_STARTED':
      return state.kind === 'idle' ? { kind: 'sleeping' } : state;
    case 'SLEEP_ENDED':
      return state.kind === 'sleeping' ? IDLE_STATE : state;

    case 'RESET':
      return IDLE_STATE;

    default:
      return state;
  }
}
