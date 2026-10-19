import { useEffect, useRef, useState } from 'react';
import { useScreenFocused } from '../hooks/useScreenFocused';
import { FirstRunTour, TourProvider, type TourPage, type TourStep } from '../tour/FirstRunTour';
import { Platform, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {

  type AchievementId,
  type TrophyId,  PET_BUILD_LABEL,
  type CareToast,
  type HealthEvent,
  type PetReaction,
  type PetState,
  getPetBuild,
  hasEvolved,
} from '@vitto/core';
import { LevelUpCelebration } from '../celebrations/LevelUpCelebration';
import { AchievementUnlock } from '../celebrations/AchievementUnlock';
import type { CelebrationEvent } from '../celebrations/types';
import { EnvironmentActionRow } from '../petWorld/EnvironmentActionRow';
import { EnvironmentStage } from '../petWorld/EnvironmentStage';
import { PetWorldHud } from '../petWorld/PetWorldHud';
import { reactionLine } from '../petWorld/reactionLine';
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
  /**
   * The pet is being asked what it thinks of what was just logged. The stock
   * reaction waits for it, and is said only if the pet has nothing of its own.
   */
  awaitingPetLine?: boolean;
  /** Opens the conversation with the pet. Absent offline, where there is no companion. */
  onOpenChat?: () => void;
  /** Opens the meal-capture modal — now the Kitchen's job to call, once the
   * user has actually chosen to pick food, not the top-level Feed tap. */
  onLogMeal: () => void;
  onLogWorkout: () => void;
  /** Outdoors' action: opens the workout logger on its runs-and-rides list. */
  onLogRun: () => void;
  onTrainMind: () => void;
  onOpenProfile: () => void;
  /** Opens Settings from the account menu. Absent where the route is not wired up. */
  onOpenSettings?: () => void;
  /** Opens the full stat sheet — the level ring on the pet is the way in. */
  onOpenStats: () => void;
  /** Opens the day's detail (nutrition, care, movement, mind). */
  onOpenToday: () => void;
  /** How much of today's goals are done, 0-100, for the TODAY button. */
  todayProgress?: number;
  /** Until Today has been opened once: the plaque says it can be tapped. */
  showTodayHint?: boolean;
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
  /** The first-run tour, while it is still to be seen (see FirstRunTour). */
  tour?: { steps: TourStep[]; onDone: () => void; onPage?: (page: TourPage | null) => void } | null;
}

/** How long the bubble waits for the pet's own remark before saying the stock line. */
const PET_LINE_WAIT_MS = 6000;

export function DashboardScreen({
  pet,
  events,
  reaction,
  careToast,
  unreadMessages,
  petSaid,
  awaitingPetLine = false,
  onOpenChat,
  onLogMeal,
  onLogWorkout,
  onLogRun,
  onTrainMind,
  onOpenProfile,
  onOpenSettings,
  onOpenStats,
  onOpenToday,
  todayProgress,
  showTodayHint,
  onOpenFriends,
  accountInitial,
  pets,
  activePetId,
  onSelectPet,
  interaction,
  partnerName,
  canLogSleep,
  trophies,
  celebration,
  onCelebrationComplete,
  achievementUnlock,
  onAchievementUnlockComplete,
  tour,
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

  const formLabel = hasEvolved(pet) ? PET_BUILD_LABEL[getPetBuild(pet)] : `Level ${pet.level}`;

  // One move for every scene change — a row button, or "Living room" back out of
  // a scene. The pet is simply in the new room: no dash between them.
  const navigate = (id: EnvironmentId) => {
    if (id === environment) return;
    // The selection tick iOS gives a tab switch, so the room change is felt
    // as well as seen. Only on a real change: the button fires on touch-down
    // and again on release, and the second call returns above.
    if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
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
  /** The stock line, held while the pet's own remark is on its way. */
  const held = useRef<string | null>(null);
  const awaiting = useRef(awaitingPetLine);
  awaiting.current = awaitingPetLine;
  const sayReaction = (text: string) => {
    reactionCount.current += 1;
    setSaid({ id: `reaction-${reactionCount.current}`, text });
  };
  useEffect(() => {
    if (!reaction) return;
    const line = reactionLine(reaction, pet, events);
    if (awaiting.current) held.current = line;
    else sayReaction(line);
    // The reaction object is the trigger; the pet and events are read as of then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reaction]);
  // The pet answered, or had nothing to say: say the held line only in the second case.
  useEffect(() => {
    if (awaitingPetLine || !held.current) return;
    const line = held.current;
    held.current = null;
    sayReaction(line);
  }, [awaitingPetLine]);
  // Never left waiting: a slow answer gets the stock line after a few seconds.
  useEffect(() => {
    if (!awaitingPetLine) return undefined;
    const timer = setTimeout(() => {
      if (!held.current) return;
      const line = held.current;
      held.current = null;
      sayReaction(line);
    }, PET_LINE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [awaitingPetLine]);
  useEffect(() => {
    // The pet's own line arrived: it is the one said, and the held one is dropped.
    if (petSaid) held.current = null;
    // Cleared (the conversation was opened): take the companion's line down, but
    // leave a reaction that is still up — on mount this runs with nothing to say,
    // right after the effect above may have spoken.
    setSaid((current) => petSaid ?? (current?.id.startsWith('reaction-') ? current : null));
  }, [petSaid]);

  // The underlying pet gives a little "huh?" bob just as the celebration veil
  // comes in — the "pet notices something is happening" beat of the sequence.
  // Once per celebration: `interaction.notice` is stable (see `usePetInteraction`).
  const celebrating = celebration?.kind === 'levelUp';
  const noticedCelebration = useRef(false);
  useEffect(() => {
    if (celebrating && !noticedCelebration.current) {
      noticedCelebration.current = true;
      interaction.notice();
    } else if (!celebrating) {
      noticedCelebration.current = false;
    }
  }, [celebrating, interaction.notice]);

  // Out of sight under Today, Settings or a chat: the pet holds still.
  const focused = useScreenFocused();

  return (
    <TourProvider>
    <View style={{ flex: 1 }}>
    <EnvironmentStage
      paused={!focused}
      environment={environment}
      pet={pet}
      activityProps={toPetAvatarActivityProps(interaction.state)}
      onPetTap={interaction.notice}
      night={night}
      petSaid={said}
      onOpenChat={onOpenChat}
      hudOverlay={
        <PetWorldHud
          pet={pet}
          todayProgress={todayProgress}
          showTodayHint={showTodayHint}
          canLogSleep={canLogSleep}
          events={events}
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
      navBar={<EnvironmentActionRow current={environment} onNavigate={navigate} night={night} />}
      environments={{
        main: mainEnvironment({ trophies }),
        kitchen: kitchenEnvironment({ onChooseFood: onLogMeal }),
        gym: gymEnvironment({ onStartWorkout: onLogWorkout }),
        study: studyEnvironment({ onTrainMind }),
        outside: outsideEnvironment({ onLogRun }),
      }}
    />
      {celebration?.kind === 'levelUp' ? (
        <LevelUpCelebration
          pet={pet}
          level={celebration.level}
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
      ) : tour ? (
        // After any celebration, never on top of one.
        <FirstRunTour steps={tour.steps} onDone={tour.onDone} onPage={tour.onPage} speaker={pet.name} />
      ) : null}
    </View>
    </TourProvider>
  );
}
