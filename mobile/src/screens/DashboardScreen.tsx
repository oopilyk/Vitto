import { useEffect, useRef, useState } from 'react';
import {
  PET_BUILD_LABEL,
  type CareToast,
  type HealthEvent,
  type PetReaction,
  type PetState,
  getPetBuild,
  hasEvolved,
} from '@vitto/core';
import { EnvironmentStage } from '../petWorld/EnvironmentStage';
import { PetWorldHud } from '../petWorld/PetWorldHud';
import { mainEnvironment } from '../petWorld/MainEnvironment';
import { kitchenEnvironment } from '../petWorld/KitchenEnvironment';
import { gymEnvironment } from '../petWorld/GymEnvironment';
import { outsideEnvironment } from '../petWorld/OutsideEnvironment';
import { studyEnvironment } from '../petWorld/StudyEnvironment';
import { toPetAvatarActivityProps } from '../petWorld/toPetAvatarActivityProps';
import { isNightTime } from '../petWorld/timeOfDay';
import type { EnvironmentId } from '../petWorld/types';
import type { UsePetInteractionResult } from '../petWorld/usePetInteraction';

interface Props {
  pet: PetState;
  events: HealthEvent[];
  reaction: PetReaction | null;
  /** Confirmation of the care moment just logged — see `CareToastBanner`. */
  careToast?: CareToast | null;
  /** Opens the meal-capture modal — now the Kitchen's job to call, once the
   * user has actually chosen to pick food, not the top-level Feed tap. */
  onLogMeal: () => void;
  onLogWorkout: () => void;
  onSyncSteps: () => void;
  onTrainMind: () => void;
  onOpenProfile: () => void;
  /** Opens the full stat sheet — the level ring on the pet is the way in. */
  onOpenStats: () => void;
  /** Opens the day's detail (nutrition, care, movement, mind). */
  onOpenToday: () => void;
  /** Opens the friends list. Absent when signed out/offline — see `PetWorldHud`. */
  onOpenFriends?: () => void;
  /** Letter shown in the account button — the signed-in email's initial. */
  accountInitial?: string;
  /**
   * Every pet the user cares for, and which one is on screen. Absent or single
   * for most accounts, which is what hides the switcher. Care moments feed all
   * of them either way — this only chooses what is displayed.
   */
  pets?: { id: string; name: string }[];
  activePetId?: string | null;
  onSelectPet?: (petId: string) => void;
  /** What the pet is doing right now, and the actions that drive it — owned by
   * `App.tsx`'s `usePetInteraction()` so the Kitchen's meal-capture modal
   * (a sibling stack screen, not a child of this one) can drive the same
   * state machine. */
  interaction: UsePetInteractionResult;
  /** Named under the kicker: "Raised with Alex". Absent for a solo pet. */
  partnerName?: string;
  /**
   * Ambient signals, live and foreground-only (see mobile/AMBIENT.md). Already
   * resolved by `App.tsx` — a dev override (see `TodayScreen`'s "Dev · force
   * ambient" panel) wins over the live sensors before either prop reaches here,
   * the same way `pet` arrives with `forcedAilment`/`forcedForm` already baked
   * in rather than threaded down as separate override props.
   *
   * `isWalking` feeds `usePetInteraction`'s state machine as a new input (see
   * `setAmbientWalking`) so it folds into the same `exploring` sprite band a
   * button-triggered explore uses. `atGym` stays a passive prop straight
   * through to `PetAvatar` — being at the gym says where the user is, not what
   * the pet is doing, so it must not change the animation band.
   */
  isWalking?: boolean;
  atGym?: boolean;
}

export function DashboardScreen({
  pet,
  events,
  reaction,
  careToast,
  onLogMeal,
  onLogWorkout,
  onSyncSteps,
  onTrainMind,
  onOpenProfile,
  onOpenStats,
  onOpenToday,
  onOpenFriends,
  accountInitial,
  pets,
  activePetId,
  onSelectPet,
  interaction,
  partnerName,
  isWalking,
  atGym,
}: Props) {
  const [environment, setEnvironment] = useState<EnvironmentId>('main');

  // The pet notices the world opening, same as it notices a tap.
  const noticed = useRef(false);
  useEffect(() => {
    if (noticed.current) return;
    noticed.current = true;
    interaction.notice();
    // Only ever fires once per mount — `interaction.notice` is stable across
    // renders (see `usePetInteraction`), so this isn't re-run by its identity.
  }, [interaction]);

  // The live "is the user walking right now" cue, re-asserted on every render
  // where it or the interaction state changes — see `setAmbientWalking` for why
  // this needs to run again once a higher-priority activity (feeding, workout)
  // finishes and hands the state back to idle while the user is still walking.
  useEffect(() => {
    interaction.setAmbientWalking(Boolean(isWalking));
    // `interaction.setAmbientWalking` is stable (see `usePetInteraction`);
    // `interaction.state.kind` is the real second dependency, so this fires
    // again once a higher-priority activity hands control back to idle while
    // the user is still walking, rather than only on `isWalking` itself
    // changing — see the doc comment on `setAmbientWalking`.
  }, [isWalking, interaction.state.kind, interaction.setAmbientWalking]);

  const formLabel = hasEvolved(pet) ? PET_BUILD_LABEL[getPetBuild(pet)] : `Level ${pet.level}`;

  // One move for every scene change — a row button, or "Living room" back out of
  // a scene. The pet runs a short dash (see `startTravel`) as it "moves" between
  // rooms, then settles into the new scene.
  const navigate = (id: EnvironmentId) => {
    // Tapping the room you are already standing in does nothing. `setEnvironment`
    // would bail on an unchanged value by itself, but `startTravel` would not:
    // the pet would dash on the spot, having gone nowhere. Guarded here rather
    // than only in the row so it holds for every caller.
    if (id === environment) return;
    interaction.startTravel();
    setEnvironment(id);
  };

  const night = isNightTime();

  return (
    <EnvironmentStage
      environment={environment}
      pet={pet}
      activityProps={toPetAvatarActivityProps(interaction.state)}
      atGym={atGym}
      onPetTap={interaction.notice}
      night={night}
      hudOverlay={
        <PetWorldHud
          pet={pet}
          events={events}
          reaction={reaction}
          careToast={careToast}
          environment={environment}
          formLabel={formLabel}
          accountInitial={accountInitial}
          onOpenProfile={onOpenProfile}
          onOpenStats={onOpenStats}
          onOpenToday={onOpenToday}
          onOpenFriends={onOpenFriends}
          pets={pets}
          activePetId={activePetId}
          onSelectPet={onSelectPet}
          partnerName={partnerName}
          night={night}
        />
      }
      environments={{
        main: mainEnvironment({ onNavigate: navigate }),
        kitchen: kitchenEnvironment({ onChooseFood: onLogMeal, onNavigate: navigate }),
        gym: gymEnvironment({ onStartWorkout: onLogWorkout, onNavigate: navigate }),
        study: studyEnvironment({ onTrainMind, onNavigate: navigate }),
        outside: outsideEnvironment({ onSyncSteps, onNavigate: navigate }),
      }}
    />
  );
}
