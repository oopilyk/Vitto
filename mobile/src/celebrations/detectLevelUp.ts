import type { PetState } from '@vitto/core';
import type { CelebrationEvent } from './types';

/**
 * The single, authoritative "the pet just levelled up" check.
 *
 * Called in `App.tsx`'s `recordEvent`, once the care moment has been run through
 * the real progression engine (`commitCareMomentForAll` → `planCareMoment` →
 * `applyDelta`) AND persisted. It compares the pet as it was before the moment
 * against the pet the engine produced — so it fires on the *transition*, not on
 * "a component rendered a bigger number", and never on a refresh, a navigation,
 * or app re-open (none of those re-run the engine).
 *
 * `before`/`after` are whatever `recordEvent` already has in hand: the stored
 * on-screen pet, and the same pet after the fan-out. Multi-level jumps (a
 * near-full XP bar plus a big delta, or a Health backfill) report the final
 * level reached, which is the one worth announcing.
 */
export function detectLevelUp(
  before: Pick<PetState, 'id' | 'level'>,
  after: Pick<PetState, 'level'>,
): Extract<CelebrationEvent, { kind: 'levelUp' }> | null {
  if (after.level <= before.level) return null;
  return { kind: 'levelUp', petId: before.id, level: after.level };
}
