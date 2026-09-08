import type { PetAilment, PetCondition, PetState } from '@vitto/core';
import type { PetAnimation } from '../components/petSprites';
import type { PetInteractionState } from './types';

/**
 * Mirrors `PetAvatar.tsx`'s private `ANIMATION_BY_AILMENT`. Duplicated rather
 * than imported: `PetAvatar.tsx` is left untouched on purpose (it is pinned by
 * ~20 existing tests), so this is the cost of that — a second five-entry table
 * that has to be kept in sync by hand if the sheets ever grow a real sleeping or
 * dizzy pose. `petInteractionAnimation.test.tsx` cross-checks the two tables
 * agree on every ailment, so a drift breaks the test suite instead of shipping.
 */
const ANIMATION_BY_AILMENT: Record<PetAilment, PetAnimation> = {
  dying: 'faint',
  starving: 'sad',
  exhausted: 'rest',
  sad: 'sad',
  foggy: 'unwell',
};

/**
 * The `PetInteractionState` equivalent of `PetAvatar.tsx`'s `animationFor`, down
 * to the same fixed `PetAnimation` union (`petSprites.ts` allows no others).
 * Keeps the same precedence rule: what the pet is doing outranks what's wrong
 * with it whenever the doing is itself a care moment in progress (eating,
 * celebrating, working out, exploring, walking to food) — otherwise a starving
 * pet mid-bite would flash its "starving" pose between frames of eating, which
 * reads as the meal having done nothing. `analyzing` and `noticing` are left out
 * of that set on purpose, same as before: nothing has actually been given to the
 * pet yet, so the ailment stays visible under a thought bubble.
 *
 * `walkingToFood` reuses `move` (no dedicated walking pose exists — see
 * `toPetAvatarActivityProps`'s note on the same gap).
 */
export function animationForInteraction(
  state: PetInteractionState,
  mood: PetState['mood'],
  condition: PetCondition,
): PetAnimation {
  if (state.kind === 'celebrating' || state.kind === 'eating') return 'cheer';
  if (state.kind === 'workingOut' || state.kind === 'exploring' || state.kind === 'walkingToFood') {
    return 'move';
  }
  if (condition.primary) return ANIMATION_BY_AILMENT[condition.primary];
  if (state.kind === 'analyzing' || state.kind === 'noticing') return 'idle';
  return state.kind === 'sleeping' || mood === 'sleepy' ? 'rest' : 'idle';
}

export { ANIMATION_BY_AILMENT };
