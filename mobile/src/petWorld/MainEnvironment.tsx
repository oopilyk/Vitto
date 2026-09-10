import type { EnvironmentDressing } from './EnvironmentStage';
import { EnvironmentActionRow } from './EnvironmentActionRow';
import { EnvironmentBackdrop } from './EnvironmentBackdrop';
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
const DAY_TINT = '#c1a693';
export const NIGHT_TINT = '#434280';

/**
 * The living-room art's round rug sits a touch higher than the pet stands on the
 * stage, so the pet read as standing just in front of it. A small negative lift
 * (see `EnvironmentBackdrop`) lowers the art until the rug meets the pet's feet.
 */
const MAIN_LIFT = -0.04;

interface MainControlsProps {
  /** Walks the pet into the tapped scene. */
  onNavigate: (id: EnvironmentId) => void;
}

export function mainEnvironment({ onNavigate }: MainControlsProps): EnvironmentDressing {
  const night = isNightTime();
  return {
    background: <EnvironmentBackdrop source={night ? MAIN_NIGHT : MAIN_DAY} lift={MAIN_LIFT} />,
    backgroundColor: night ? NIGHT_TINT : DAY_TINT,
    controls: <EnvironmentActionRow current="main" onNavigate={onNavigate} night={night} />,
  };
}
