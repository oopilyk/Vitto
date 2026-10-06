import { FOCUS_AREAS, type FocusArea } from './macroTargets';
import type { PetState } from './pet';
import { determineMood } from './petHealthEngine';

/**
 * What affects the pet: the person's own choice of care areas.
 *
 * Someone who has no interest in tracking food should still be able to raise a
 * pet, without it starving. So each need belongs to the care areas that feed
 * it, and a need none of the person's chosen areas feeds stops mattering:
 *
 *   nutrition  <- food ('nutrition')
 *   energy     <- training or movement (workouts, steps)
 *   mind       <- mind games ('mind')
 *   happiness  <- everything, so it always counts
 *
 * "Stops mattering" is done in one place, by holding that need at a
 * comfortable level instead of letting it decay. Health, mood, ailments, the
 * pet's lines and the companion all read the needs, so they follow without
 * any special case: a pet whose person doesn't track food is simply never
 * hungry.
 *
 * The choice belongs to the pet (`PetState.careAreas`, `pets.care_areas`):
 * a shared pet has one set of rules, its owner's, and only the owner can
 * change them.
 */
export type CareArea = FocusArea;
export const CARE_AREAS: readonly CareArea[] = FOCUS_AREAS;

/** The needs a care area can switch off. Happiness is fed by everything, so it always counts. */
export type OptionalNeed = 'nutrition' | 'energy' | 'mind';

/** Where a switched-off need is held: comfortably above every threshold that would ail or slow the pet. */
export const NEUTRAL_NEED = 80;

/** Every area on, the default: the pet works exactly as it always has. */
const allAreas = (areas: readonly CareArea[] | null | undefined): readonly CareArea[] =>
  areas && areas.length > 0 ? areas : CARE_AREAS;

/** The needs nothing the person chose feeds, so they are held steady. */
export const untrackedNeeds = (areas: readonly CareArea[] | null | undefined): OptionalNeed[] => {
  const chosen = new Set(allAreas(areas));
  const untracked: OptionalNeed[] = [];
  if (!chosen.has('nutrition')) untracked.push('nutrition');
  if (!chosen.has('training') && !chosen.has('movement')) untracked.push('energy');
  if (!chosen.has('mind')) untracked.push('mind');
  return untracked;
};

/** Whether the person has chosen this care area (all of them, when nothing is set). */
export const tracksArea = (areas: readonly CareArea[] | null | undefined, area: CareArea): boolean =>
  allAreas(areas).includes(area);

/**
 * The pet as this person sees it: every untracked need lifted to NEUTRAL_NEED
 * (never lowered, so a well-fed pet stays well fed), and its mood re-read.
 */
export const applyCareAreas = (pet: PetState, areas: readonly CareArea[] | null | undefined): PetState => {
  const untracked = untrackedNeeds(areas);
  if (untracked.length === 0) return pet;
  const next = { ...pet };
  for (const need of untracked) next[need] = Math.max(next[need], NEUTRAL_NEED);
  return { ...next, mood: determineMood(next.energy, next.nutrition, next.happiness) };
};

/** Turning areas on and off: at least one always stays on, or nothing would care for the pet. */
export const toggleCareArea = (areas: readonly CareArea[] | null | undefined, area: CareArea): CareArea[] => {
  const current = [...allAreas(areas)];
  if (current.includes(area)) {
    return current.length > 1 ? current.filter((candidate) => candidate !== area) : current;
  }
  // Kept in the canonical order, whatever order they were switched on in.
  return CARE_AREAS.filter((candidate) => candidate === area || current.includes(candidate));
};
