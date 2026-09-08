import type { PetAvatarActivityProps, PetInteractionState } from './types';

/**
 * Everything false/null — what a pet doing nothing in particular looks like to
 * `PetAvatar`. Exported so a caller building its own partial override doesn't
 * have to retype the full shape.
 */
export const IDLE_ACTIVITY: PetAvatarActivityProps = {
  isAnalyzingMeal: false,
  isEating: false,
  feedingImage: null,
  feedingGrade: null,
  isCelebrating: false,
  isWorkingOut: false,
  isExploring: false,
};

/**
 * Bridges the new `PetInteractionState` down to the boolean/nullable props
 * `PetAvatar` has always taken, so `PetAvatar.tsx` itself — and the ~20 existing
 * tests pinned to its exact prop surface — need not change for this system to
 * exist.
 *
 * `noticing` and `walkingToFood` have no boolean of their own and fall through to
 * idle: PetAvatar has never had a "noticing" or "walking over" pose (there is no
 * such band in `petSprites.ts`'s fixed `PetAnimation` union), so this is the same
 * idle sprite the pre-existing SHEET_DISMISS_MS gap already showed while the meal
 * sheet was closing — ART GAP, not a regression. `sleeping` also falls through:
 * PetAvatar derives its own sleeping read from `pet.energy` (see `isSleeping` in
 * `PetAvatar.tsx`), so nothing here needs to force it.
 */
export function toPetAvatarActivityProps(state: PetInteractionState): PetAvatarActivityProps {
  switch (state.kind) {
    case 'analyzing':
      return { ...IDLE_ACTIVITY, isAnalyzingMeal: true };
    case 'eating':
      return {
        ...IDLE_ACTIVITY,
        isEating: true,
        feedingImage: state.feedingImage,
        feedingGrade: state.grade,
      };
    case 'celebrating':
      return { ...IDLE_ACTIVITY, isCelebrating: true, feedingGrade: state.grade };
    case 'workingOut':
      return { ...IDLE_ACTIVITY, isWorkingOut: true };
    case 'exploring':
      return { ...IDLE_ACTIVITY, isExploring: true };
    case 'idle':
    case 'noticing':
    case 'walkingToFood':
    case 'sleeping':
      return IDLE_ACTIVITY;
  }
}
