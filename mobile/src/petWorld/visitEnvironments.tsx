import type { SocialPetPlace } from '@vitto/core';
import type { EnvironmentDressing } from './EnvironmentStage';
import { gymEnvironment } from './GymEnvironment';
import { kitchenEnvironment } from './KitchenEnvironment';
import { mainEnvironment } from './MainEnvironment';
import { outsideEnvironment } from './OutsideEnvironment';
import { studyEnvironment } from './StudyEnvironment';
import type { EnvironmentId } from './types';

/**
 * A friend's rooms, for visiting.
 *
 * The same five scenes the user's own pet lives in — same art, same lift, same
 * day/night tints — built through the existing factories so a room can never
 * look different when it is someone else's. The one change is that every
 * scene's `controls` are stripped: visiting is looking, not doing, so there is
 * no hotbar to walk between rooms and no "Log meal" over the pet. You see the
 * room their pet is in, and that is the whole point.
 *
 * The factories take callbacks for the actions their controls would fire; with
 * the controls removed those callbacks can never run, so they are inert.
 */
const noop = () => {};

export const visitEnvironments = (): Record<EnvironmentId, EnvironmentDressing> => {
  const quiet = (dressing: EnvironmentDressing): EnvironmentDressing => ({ ...dressing, controls: null });
  return {
    // No trophies: those derive from the OWNER's event history, which a
    // visitor cannot read (health_events is author-only by design).
    main: quiet(mainEnvironment({ onNavigate: noop })),
    kitchen: quiet(kitchenEnvironment({ onChooseFood: noop, onNavigate: noop })),
    gym: quiet(gymEnvironment({ onStartWorkout: noop, onNavigate: noop })),
    outside: quiet(outsideEnvironment({ onSyncSteps: noop, onNavigate: noop })),
    study: quiet(studyEnvironment({ onTrainMind: noop, onNavigate: noop })),
  };
};

/**
 * Which room to show a friend's pet in. `SocialPetStatus.place` is inferred
 * from their latest LIVE activity and is `home` whenever nothing is happening,
 * so a friend mid-workout is found in the gym and everyone else in the living
 * room — the same rooms, named the way the social layer names them.
 */
export const placeToEnvironment = (place: SocialPetPlace): EnvironmentId => {
  switch (place) {
    case 'kitchen':
      return 'kitchen';
    case 'gym':
      return 'gym';
    case 'outdoors':
      return 'outside';
    case 'study':
      return 'study';
    case 'home':
    default:
      return 'main';
  }
};
