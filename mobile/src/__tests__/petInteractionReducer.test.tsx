import { petInteractionReducer } from '../petWorld/petInteractionReducer';
import { IDLE_STATE, type PetInteractionState } from '../petWorld/types';

describe('petInteractionReducer', () => {
  it('starts idle and stays idle for an event that does not apply', () => {
    const result = petInteractionReducer(IDLE_STATE, { type: 'FOOD_CONSUMED' });

    expect(result).toEqual(IDLE_STATE);
  });

  it('notices on a tap or an app open, and clears back to idle on its own', () => {
    const noticing = petInteractionReducer(IDLE_STATE, { type: 'PET_NOTICED' });
    expect(noticing).toEqual({ kind: 'noticing' });

    const cleared = petInteractionReducer(noticing, { type: 'NOTICE_CLEARED' });
    expect(cleared).toEqual(IDLE_STATE);
  });

  it('does not let a notice interrupt a meal or workout already in progress', () => {
    const eating: PetInteractionState = { kind: 'eating', feedingImage: null, grade: 'A' };
    const workingOut: PetInteractionState = { kind: 'workingOut' };

    expect(petInteractionReducer(eating, { type: 'PET_NOTICED' })).toEqual(eating);
    expect(petInteractionReducer(workingOut, { type: 'PET_NOTICED' })).toEqual(workingOut);
  });

  it('notices from sleeping too, not just idle', () => {
    const sleeping: PetInteractionState = { kind: 'sleeping' };

    expect(petInteractionReducer(sleeping, { type: 'PET_NOTICED' })).toEqual({ kind: 'noticing' });
  });

  it('starts and stops analyzing a meal photo', () => {
    const analyzing = petInteractionReducer(IDLE_STATE, { type: 'MEAL_ANALYSIS_STARTED' });
    expect(analyzing).toEqual({ kind: 'analyzing' });

    const stopped = petInteractionReducer(analyzing, { type: 'MEAL_ANALYSIS_STOPPED' });
    expect(stopped).toEqual(IDLE_STATE);
  });

  it('ignores MEAL_ANALYSIS_STOPPED unless a meal is actually being analyzed', () => {
    const result = petInteractionReducer(IDLE_STATE, { type: 'MEAL_ANALYSIS_STOPPED' });

    expect(result).toEqual(IDLE_STATE);
  });

  it('runs the full feed sequence in order: walking to food, eating, celebrating, idle', () => {
    let state = petInteractionReducer(IDLE_STATE, { type: 'FEEDING_STARTED', grade: 'B' });
    expect(state).toEqual({ kind: 'walkingToFood', grade: 'B' });

    state = petInteractionReducer(state, { type: 'FOOD_REACHED_PET', feedingImage: 'file:///plate.jpg' });
    expect(state).toEqual({ kind: 'eating', feedingImage: 'file:///plate.jpg', grade: 'B' });

    // The plate is cleared partway through the bite, but the grade and the
    // "eating" state both carry through — `feedingGrade` is what the
    // celebration overlay keys off, not the (by-now-gone) plate image.
    state = petInteractionReducer(state, { type: 'FOOD_CONSUMED' });
    expect(state).toEqual({ kind: 'eating', feedingImage: null, grade: 'B' });

    state = petInteractionReducer(state, { type: 'EATING_FINISHED' });
    expect(state).toEqual({ kind: 'celebrating', grade: 'B' });

    state = petInteractionReducer(state, { type: 'CELEBRATION_FINISHED' });
    expect(state).toEqual(IDLE_STATE);
  });

  it('runs the sequence with no plate image at all when the meal was logged without a photo', () => {
    // `onFeedStart` passes `null` for a search/barcode-logged meal — the
    // walk-to-food and eating beats still happen, just with nothing to fly in.
    let state = petInteractionReducer(IDLE_STATE, { type: 'FEEDING_STARTED', grade: 'C' });
    state = petInteractionReducer(state, { type: 'FOOD_REACHED_PET', feedingImage: null });

    expect(state).toEqual({ kind: 'eating', feedingImage: null, grade: 'C' });
  });

  it('ignores a stray FOOD_REACHED_PET/FOOD_CONSUMED once the pet is back to idle', () => {
    // A fast re-tap landing after the sequence already finished must not
    // resurrect an eating state out of nowhere.
    expect(petInteractionReducer(IDLE_STATE, { type: 'FOOD_REACHED_PET', feedingImage: 'x' })).toEqual(
      IDLE_STATE,
    );
    expect(petInteractionReducer(IDLE_STATE, { type: 'FOOD_CONSUMED' })).toEqual(IDLE_STATE);
  });

  it('runs the workout and exploring sequences independently of feeding', () => {
    const workingOut = petInteractionReducer(IDLE_STATE, { type: 'WORKOUT_STARTED' });
    expect(workingOut).toEqual({ kind: 'workingOut' });
    expect(petInteractionReducer(workingOut, { type: 'WORKOUT_FINISHED' })).toEqual(IDLE_STATE);

    const exploring = petInteractionReducer(IDLE_STATE, { type: 'EXPLORE_STARTED' });
    expect(exploring).toEqual({ kind: 'exploring' });
    expect(petInteractionReducer(exploring, { type: 'EXPLORE_FINISHED' })).toEqual(IDLE_STATE);
  });

  it('only sleeps from idle, and only wakes from sleeping', () => {
    const sleeping = petInteractionReducer(IDLE_STATE, { type: 'SLEEP_STARTED' });
    expect(sleeping).toEqual({ kind: 'sleeping' });
    expect(petInteractionReducer(sleeping, { type: 'SLEEP_ENDED' })).toEqual(IDLE_STATE);

    // A workout in progress does not get quietly swapped for a nap.
    const workingOut: PetInteractionState = { kind: 'workingOut' };
    expect(petInteractionReducer(workingOut, { type: 'SLEEP_STARTED' })).toEqual(workingOut);
  });

  it('resets to idle from any state', () => {
    const celebrating: PetInteractionState = { kind: 'celebrating', grade: 'A' };

    expect(petInteractionReducer(celebrating, { type: 'RESET' })).toEqual(IDLE_STATE);
  });
});
