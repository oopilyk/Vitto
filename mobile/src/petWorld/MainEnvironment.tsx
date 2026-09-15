import type { TrophyId } from '@vitto/core';
import type { EnvironmentDressing } from './EnvironmentStage';
import { EnvironmentActionRow } from './EnvironmentActionRow';
import { EnvironmentBackdrop } from './EnvironmentBackdrop';
import { TrophyShelf } from './TrophyShelf';
import { isNightTime } from './timeOfDay';
import type { EnvironmentId } from './types';

/**
 * The default/"bedroom" environment. Idle, tired and asleep are already
 * covered without any new code here: `PetAvatar` derives all three from
 * `pet.mood`/`pet.energy` (see `isSleeping` in `PetAvatar.tsx`), so this
 * environment's only job is to be the plain, calm scene they play out in.
 * Dressed with the product owner's own day/night room art, swapped by
 * `isNightTime` -- `require` needs a static path per variant, so both are
 * bundled and picked between rather than loaded from one dynamic path.
 */

const MAIN_DAY = require('../../assets/environments/main-day.png');
const MAIN_NIGHT = require('../../assets/environments/main-night.png');

/**
 * The art's own top-edge tone. Doubles as the crossfade underlay and as the band
 * above the art, which is fitted to full width rather than cropped —
 * see `EnvironmentBackdrop`.
 */
// Re-sampled for the redrawn room (the one with the empty shelf).
const DAY_TINT = '#b1a07f';
export const NIGHT_TINT = '#6f5265';

/**
 * Raised a little (see `EnvironmentBackdrop`) so the room sits higher on the
 * screen and less of it hides behind the action row; the strip that uncovers
 * along the bottom is painted in the art's own floor tone so it reads as the
 * rug's floor continuing. Was -0.04 (lowered to meet the pet's feet on the rug)
 * before the product owner asked for the room to sit higher.
 */
const MAIN_LIFT = 0.03;

/** The art's own bottom-edge floor, sampled from the PNGs, for the strip the lift uncovers. */
const DAY_FLOOR = '#c28d73';
const NIGHT_FLOOR = '#473a6d';

interface MainControlsProps {
  /** Walks the pet into the tapped scene. */
  onNavigate: (id: EnvironmentId) => void;
  /** Earned trophies, shown on the wall shelf — see `TrophyShelf`. */
  trophies?: readonly TrophyId[];
}

export function mainEnvironment({ onNavigate, trophies = [] }: MainControlsProps): EnvironmentDressing {
  const night = isNightTime();
  return {
    // The shelf rides inside the backdrop so its positions are art-relative.
    background: (
      <EnvironmentBackdrop
        source={night ? MAIN_NIGHT : MAIN_DAY}
        lift={MAIN_LIFT}
        floorColor={night ? NIGHT_FLOOR : DAY_FLOOR}
      >
        <TrophyShelf trophies={trophies} night={night} />
      </EnvironmentBackdrop>
    ),
    backgroundColor: night ? NIGHT_TINT : DAY_TINT,
    controls: <EnvironmentActionRow current="main" onNavigate={onNavigate} night={night} />,
  };
}
