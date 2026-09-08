import type { MealAnalysis } from '@vitto/core';

/**
 * Which scene the pet's world is showing right now. Deliberately a flat union
 * rather than a registry/plugin system — with two environments a switch is the
 * whole "system"; a third (`'gym'` etc.) is one more union member and one more
 * switch arm, not a new abstraction.
 */
export type EnvironmentId = 'main' | 'kitchen';

/**
 * What the pet is doing, independent of which environment is on screen. This is
 * the thing `App.tsx` used to represent as seven loose booleans
 * (`isAnalyzingMeal`, `isEating`, ...) threaded straight into `PetAvatar`. A
 * discriminated union instead of booleans means a state that only makes sense
 * with data attached (what's on the plate, what grade it was) carries that data
 * with it, and states that shouldn't coexist (eating and celebrating) can't.
 *
 * `noticing` and `walkingToFood` are new: there was no boolean for either before.
 * Both map to the existing `idle`/`move` sprite bands (see
 * `interactionAnimation.ts`) — this is a presentation-state model, not new sprite
 * art, per the fixed `PetAnimation` union in `petSprites.ts`.
 */
export type PetInteractionState =
  | { kind: 'idle' }
  /** A brief acknowledgement: the world was just opened, or the pet was tapped. */
  | { kind: 'noticing' }
  | { kind: 'analyzing' }
  /** Between the food being chosen and it actually arriving — see `usePetInteraction`. */
  | { kind: 'walkingToFood'; grade: MealAnalysis['grade'] }
  | { kind: 'eating'; feedingImage: string | null; grade: MealAnalysis['grade'] }
  /** `grade` rides along from `eating` so the heart-stream overlay can key off it. */
  | { kind: 'celebrating'; grade: MealAnalysis['grade'] | null }
  | { kind: 'workingOut' }
  | { kind: 'exploring' }
  /** Distinct from `idle`: a true sleep read, driven by energy rather than an action. */
  | { kind: 'sleeping' };

/**
 * The boolean/nullable surface `PetAvatar` has always taken. Kept as its own type
 * so `toPetAvatarActivityProps` has a name for what it returns, without pulling in
 * `PetAvatar`'s full prop list (pet, children, stageStyle) which callers already
 * have their own opinions about.
 */
export interface PetAvatarActivityProps {
  isAnalyzingMeal: boolean;
  isEating: boolean;
  feedingImage: string | null;
  feedingGrade: MealAnalysis['grade'] | null;
  isCelebrating: boolean;
  isWorkingOut: boolean;
  isExploring: boolean;
}

/** What actually drives a state transition. Kept separate from the state shape
 * itself so the reducer can stay a plain `(state, event) => state` function. */
export type PetInteractionEvent =
  | { type: 'PET_NOTICED' }
  | { type: 'NOTICE_CLEARED' }
  | { type: 'MEAL_ANALYSIS_STARTED' }
  | { type: 'MEAL_ANALYSIS_STOPPED' }
  | { type: 'FEEDING_STARTED'; grade: MealAnalysis['grade'] }
  | { type: 'FOOD_REACHED_PET'; feedingImage: string | null }
  | { type: 'FOOD_CONSUMED' }
  | { type: 'EATING_FINISHED' }
  | { type: 'CELEBRATION_FINISHED' }
  | { type: 'WORKOUT_STARTED' }
  | { type: 'WORKOUT_FINISHED' }
  | { type: 'EXPLORE_STARTED' }
  | { type: 'EXPLORE_FINISHED' }
  | { type: 'SLEEP_STARTED' }
  | { type: 'SLEEP_ENDED' }
  | { type: 'RESET' };

export const IDLE_STATE: PetInteractionState = { kind: 'idle' };
