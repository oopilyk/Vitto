import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import {

  type AchievementId,
  type TrophyId,  PET_BUILD_LABEL,
  type CareToast,
  type HealthEvent,
  type PetReaction,
  type PetState,
  assessCondition,
  bondFor,
  getPetBuild,
  hasEvolved,
  petVoice,
} from '@vitto/core';
import { LevelUpCelebration } from '../celebrations/LevelUpCelebration';
import { StreakCelebration } from '../celebrations/StreakCelebration';
import { AchievementUnlock } from '../celebrations/AchievementUnlock';
import type { CelebrationEvent } from '../celebrations/types';
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
  /** Unread things the pet has said; shown as a dot on the message button. */
  unreadMessages?: number;
  petSaid?: { id: string; text: string } | null;
  /** Opens the conversation with the pet. Absent offline, where there is no companion. */
  onOpenChat?: () => void;
  /** Opens the meal-capture modal — now the Kitchen's job to call, once the
   * user has actually chosen to pick food, not the top-level Feed tap. */
  onLogMeal: () => void;
  onLogWorkout: () => void;
  onSyncSteps: () => void;
  onTrainMind: () => void;
  onOpenProfile: () => void;
  /** Opens Settings from the account menu. Absent where the route is not wired up. */
  onOpenSettings?: () => void;
  /** Opens the full stat sheet — the level ring on the pet is the way in. */
  onOpenStats: () => void;
  /** Opens the day's detail (nutrition, care, movement, mind). */
  onOpenToday: () => void;
  /** Opens the friends list from the account menu. Absent when signed out/offline — see `PetWorldHud`. */
  onOpenFriends?: () => void;
  /** Letter shown in the account button — the signed-in email's initial. */
  accountInitial?: string;
  /**
   * Every pet the user cares for, and which one is on screen. Absent or single
   * for most accounts, which is what hides the switcher. Care moments feed all
   * of them either way — this only chooses what is displayed.
   */
  pets?: { id: string; name: string; own?: boolean }[];
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
  /**
   * Whether a night's sleep can reach the app at all (Apple Health, connected).
   * Changes what an exhausted pet asks for — see `AilmentAdvice`.
   */
  canLogSleep?: boolean;
  /** Trophies on the living-room shelf. Derived by App from the event history (or forced, in dev). */
  trophies?: readonly TrophyId[];
  /**
   * A full-screen reward moment to play over this screen (currently only a
   * level-up). Raised by `App.tsx` off the progression engine's own result —
   * see `detectLevelUp`. Null the rest of the time.
   */
  celebration?: CelebrationEvent | null;
  /** Tapped Continue on the celebration — clears it back in `App.tsx`. */
  onCelebrationComplete?: () => void;
  /**
   * The achievement to announce right now, if any. App holds the queue; this
   * shows one at a time and waits behind a level-up, which owns the screen.
   */
  achievementUnlock?: { id: AchievementId; trainingDaysPerWeek: number } | null;
  onAchievementUnlockComplete?: () => void;
}

export function DashboardScreen({
  pet,
  events,
  reaction,
  careToast,
  unreadMessages,
  petSaid,
  onOpenChat,
  onLogMeal,
  onLogWorkout,
  onSyncSteps,
  onTrainMind,
  onOpenProfile,
  onOpenSettings,
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
  canLogSleep,
  trophies,
  celebration,
  onCelebrationComplete,
  achievementUnlock,
  onAchievementUnlockComplete,
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

  // What the pet says over its head. Every log speaks: the reaction to it, in
  // this pet's own voice, goes in the bubble for free and at once. If the
  // companion then has something of its own to say about it, that arrives a
  // moment later and takes the bubble over — whichever is newest wins. Without
  // this the bubble was at the mercy of the companion's cooldown and daily cap,
  // and most logs were met with silence.
  const [said, setSaid] = useState<{ id: string; text: string } | null>(null);
  const reactionCount = useRef(0);
  useEffect(() => {
    if (!reaction) return;
    const line = reaction.authored ? reaction.message : (reaction.effects?.[0]?.reaction ?? reaction.message);
    // Only the conditions that change how it can speak at all (fading, foggy):
    // this is a reaction, not a complaint, so hunger must not restyle it as one.
    const ailments = assessCondition(pet).ailments.filter((ailment) => ailment === 'dying' || ailment === 'foggy');
    const bond = bondFor(events, new Date(), { adoptedAt: pet.adoptedAt });
    reactionCount.current += 1;
    setSaid({
      id: `reaction-${reactionCount.current}`,
      text: petVoice(line, { personality: pet.personality, ailments, bond: bond.stage }),
    });
    // The reaction object is the trigger; the pet and events are read as of then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reaction]);
  useEffect(() => {
    // Cleared (the conversation was opened): take the companion's line down, but
    // leave a reaction that is still up — on mount this runs with nothing to say,
    // right after the effect above may have spoken.
    setSaid((current) => petSaid ?? (current?.id.startsWith('reaction-') ? current : null));
  }, [petSaid]);

  // The underlying pet gives a little "huh?" bob just as the celebration veil
  // comes in — the "pet notices something is happening" beat of the sequence.
  // Once per celebration: `interaction.notice` is stable (see `usePetInteraction`).
  const celebrating = celebration?.kind === 'levelUp' || celebration?.kind === 'streak';
  const noticedCelebration = useRef(false);
  useEffect(() => {
    if (celebrating && !noticedCelebration.current) {
      noticedCelebration.current = true;
      interaction.notice();
    } else if (!celebrating) {
      noticedCelebration.current = false;
    }
  }, [celebrating, interaction.notice]);

  return (
    <View style={{ flex: 1 }}>
    <EnvironmentStage
      environment={environment}
      pet={pet}
      activityProps={toPetAvatarActivityProps(interaction.state)}
      atGym={atGym}
      onPetTap={interaction.notice}
      night={night}
      petSaid={said}
      onOpenChat={onOpenChat}
      hudOverlay={
        <PetWorldHud
          pet={pet}
          canLogSleep={canLogSleep}
          events={events}
          reaction={reaction}
          careToast={careToast}
          unreadMessages={unreadMessages}
          onOpenChat={onOpenChat}
          environment={environment}
          formLabel={formLabel}
          accountInitial={accountInitial}
          onOpenProfile={onOpenProfile}
          onOpenSettings={onOpenSettings}
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
        main: mainEnvironment({ onNavigate: navigate, trophies }),
        kitchen: kitchenEnvironment({ onChooseFood: onLogMeal, onNavigate: navigate }),
        gym: gymEnvironment({ onStartWorkout: onLogWorkout, onNavigate: navigate }),
        study: studyEnvironment({ onTrainMind, onNavigate: navigate }),
        outside: outsideEnvironment({ onSyncSteps, onNavigate: navigate }),
      }}
    />
      {celebration?.kind === 'levelUp' ? (
        <LevelUpCelebration
          pet={pet}
          level={celebration.level}
          night={night}
          onComplete={() => onCelebrationComplete?.()}
        />
      ) : celebration?.kind === 'streak' ? (
        <StreakCelebration
          pet={pet}
          streak={celebration.streak}
          night={night}
          onComplete={() => onCelebrationComplete?.()}
        />
      ) : achievementUnlock ? (
        <AchievementUnlock
          key={achievementUnlock.id}
          id={achievementUnlock.id}
          pet={pet}
          profile={{ trainingDaysPerWeek: achievementUnlock.trainingDaysPerWeek }}
          night={night}
          onComplete={() => onAchievementUnlockComplete?.()}
        />
      ) : null}
    </View>
  );
}
