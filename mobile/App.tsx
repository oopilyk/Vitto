import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme, type Theme as NavigationTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { Session } from '@supabase/supabase-js';
import { type BodyProfile, type PetBreed, type BrainTrainingMetadata, type CareLogEntry, type HealthEvent, type MealAnalysis, type MealMetadata, PROFILE_SURVEY_DEFAULTS, PetHealthEngine, type ForcedPetForm, type ForcedPetStatus, type PetInvite, type PetMember, type PetReaction, type PetState, type ScreenTimeMetadata, type StepMetadata, SupabaseRepository, type WorkoutMetadata, DECAY_TICK_MS, activeMembers, applyForcedAilment, applyForcedForm, applyTimeDecay, createPet, errorMessage, getSession, inviteErrorMessage, isDevAccount, isSharedPet, memberDisplayName, mergeCareDiary, newId, onAuthStateChange, partnerEntriesSince, setIdGenerator, signOut, toDateKey, withSurveyDefaults, generateSeedEvents, SEED_SOURCE} from '@vitto/core';
import { type WordPuzzleProgress, LocalRepository } from './src/services/localRepository';
import { careConflictMessage, commitCareMomentForAll } from './src/services/careMoment';
import { applySharedRefresh, newestOccurredAt } from './src/services/sharedRefresh';
import type { HealthDataProvider } from './src/services/healthDataProvider';
import { MockHealthDataProvider } from './src/services/healthDataProvider';
import { HealthKitProvider, RECENT_SYNC_WINDOW_HOURS } from './src/services/healthKitProvider';
import { getKnownHealthKitExternalIds } from './src/services/healthKitMapping';
import { AndroidUsageStatsProvider } from './src/services/androidUsageStatsProvider';
import { findScreenTimeForDate, mapManualScreenTime } from './src/services/screenTimeMapping';
import { hasUsageAccess, isScreenTimeModuleAvailable, openUsageAccessSettings } from './modules/screen-time';
import { isSupabaseConfigured } from './src/services/supabaseClient';
import { playCelebrationSound, playMealSound, playMunchSound } from './src/services/mealFeedback';
import { PrimaryButton, TextButton } from './src/components/ui';
import { AuthScreen } from './src/screens/AuthScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { PetStatsScreen } from './src/screens/PetStatsScreen';
import { FriendsScreen } from './src/screens/FriendsScreen';
import { FriendPetScreen } from './src/screens/FriendPetScreen';
import { MealCaptureScreen } from './src/screens/MealCaptureScreen';
import { MindGymScreen } from './src/screens/MindGymScreen';
import { WordPuzzleScreen } from './src/screens/WordPuzzleScreen';
import { WorkoutScreen } from './src/screens/WorkoutScreen';
import { hasNativeUUID, randomUUID } from './src/services/uuid';
import { colors, fonts, layout } from './src/theme';

// Prefer the platform's crypto-backed ids, but keep the domain's pure fallback if
// this client has no native crypto module.
if (hasNativeUUID()) setIdGenerator(randomUUID);

const repository = new LocalRepository();
const remoteRepository = new SupabaseRepository();
const engine = new PetHealthEngine();
// iOS gets the real HealthKit-backed provider. Android gets the mock for
// everything except screen time, which it can actually read (see
// mobile/SCREENTIME.md); web-via-react-native-web stays on the mock until a
// Health Connect provider exists. See mobile/HEALTHKIT.md.
const stepsProvider: HealthDataProvider =
  Platform.OS === 'ios'
    ? new HealthKitProvider()
    : Platform.OS === 'android'
      ? new AndroidUsageStatsProvider()
      : new MockHealthDataProvider();

// The main app's screens, once a session exists and a pet has been adopted.
// Auth and Onboarding stay outside this tree — they're single-screen states
// with no back/forward navigation of their own.
type RootStackParamList = {
  Dashboard: undefined;
  // Reached from the dashboard's account button rather than a tab, so it pushes
  // and backs out the same way every other screen off the dashboard does.
  Profile: undefined;
  // A drill-down off the dashboard, so it pushes rather than presenting as a modal.
  PetStats: undefined;
  // Reached from Profile, same as Profile itself is reached from the dashboard.
  Friends: undefined;
  // The full ordered accepted-friends list, so the sequential browser can move
  // between friends without going back to `FriendsScreen`.
  FriendPet: { friendUserId: string; friendUserIds: string[] };
  MealCapture: undefined;
  Workout: undefined;
  MindGym: undefined;
  WordPuzzle: undefined;
};
const RootStack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme: NavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.paper,
    card: colors.card,
    text: colors.ink,
    border: colors.hairline,
    primary: colors.coral,
  },
};

const WORKOUT_ANIMATION_MS = 1100;
/**
 * How long to wait after the meal sheet is told to close before the food starts
 * flying. The sheet is dismissed before `startFeeding` runs, and an iOS pageSheet
 * takes about this long to slide away — without the wait the whole 880ms flight
 * plays behind it and is cleared just as the dashboard becomes visible.
 */
const SHEET_DISMISS_MS = Platform.OS === 'ios' ? 480 : 320;
const EXPLORE_ANIMATION_MS = 1100;
/**
 * How long a care moment's message stays up. It has to clear on its own: the
 * dashboard shows an ailment on the same line, so a reaction that never expires
 * would permanently hide "Miso is starving".
 */
const REACTION_VISIBLE_MS = 6000;
const SAVE_TIMEOUT_MESSAGE = 'Saving timed out. Check your connection.';

const DEFAULT_PROFILE: BodyProfile = {
  age: 30,
  sex: 'other',
  heightCm: 170,
  heightUnit: 'cm',
  weightKg: 70,
  weightUnit: 'kg',
  activity: 'moderate',
  goal: 'maintain',
  ...PROFILE_SURVEY_DEFAULTS,
};

const makeEvent = <T,>(userId: string, type: HealthEvent['type'], metadata: T): HealthEvent<T> => ({
  id: newId(),
  userId,
  occurredAt: new Date().toISOString(),
  type,
  source: 'manual',
  metadata,
});

const withTimeout = <T,>(promise: Promise<T>, message: string) =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), 10000)),
  ]);

/** A yes/no system dialog as a promise, so a confirmed action can still reject to its caller. */
const confirmDialog = (title: string, message: string, confirmLabel: string) =>
  new Promise<boolean>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  // Dev tool, display only — see `applyForcedAilment`. Never persisted, and reset
  // by a sign-out along with the rest of the session's state.
  const [forcedAilment, setForcedAilment] = useState<ForcedPetStatus | null>(null);
  // Same deal for which form is drawn — display only, never persisted.
  const [forcedForm, setForcedForm] = useState<ForcedPetForm | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [dataReady, setDataReady] = useState(false);
  /**
   * Every pet the user cares for: the one they adopted, and one shared with a
   * partner. `pet` below is the one on screen — derived rather than stored, so
   * there is no second copy to drift out of step with this list.
   */
  const [pets, setPets] = useState<PetState[]>([]);
  const [activePetId, setActivePetId] = useState<string | null>(null);
  const pet = useMemo(
    () => pets.find((candidate) => candidate.id === activePetId) ?? pets[0] ?? null,
    [pets, activePetId],
  );
  /**
   * Replaces one pet in the list, keeping the call sites that predate two pets
   * working unchanged. `null` clears everything, which is what signing out means.
   */
  const setPet = useCallback((next: PetState | null) => {
    setPets((current) => {
      if (!next) return [];
      const index = current.findIndex((candidate) => candidate.id === next.id);
      if (index === -1) return [...current, next];
      const updated = [...current];
      updated[index] = next;
      return updated;
    });
  }, []);
  // Distinguishes "this account has no pet yet" from "the pet could not be
  // loaded". Both leave `pet` null, but only the first one means onboarding:
  // offering adoption after a failed load asks an existing owner to replace a
  // pet they still have, and the unique index on pets(user_id) would reject the
  // adoption anyway, so it is a dead end as well as a lie.
  const [petLoadFailed, setPetLoadFailed] = useState(false);
  // Bumped by the retry button to re-run the loading effect.
  const [reloadToken, setReloadToken] = useState(0);
  // Bumped by every logged care moment. The dashboard watches it and scrolls back
  // to the pet, so the reaction and stat movement are never off-screen below
  // wherever the user happened to be reading.
  const [petFocusToken, setPetFocusToken] = useState(0);
  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [profile, setProfile] = useState<BodyProfile>(DEFAULT_PROFILE);
  const [reaction, setReaction] = useState<PetReaction | null>(null);
  // Care partners. All empty for a solo pet and in local mode; loaded once
  // after the pet, and refreshed only while there is a partner (or an open
  // invite one could be arriving through) — see `refreshShared`.
  const [members, setMembers] = useState<PetMember[]>([]);
  const [careLog, setCareLog] = useState<CareLogEntry[]>([]);
  const [invite, setInvite] = useState<PetInvite | null>(null);
  const [isPartnerBusy, setIsPartnerBusy] = useState(false);
  // The newest partner care-log row already shown, so a foreground refresh can
  // announce only what happened since. Null until the log has been read once.
  const lastSeenCareLogAt = useRef<string | null>(null);
  // A foreground refresh and a pet write (care moment, breed change) can both
  // `setPet`; the refresh yields while a write is pending and re-runs after it.
  const careMomentInFlight = useRef(false);
  const refreshPending = useRef(false);
  // Who is signed in right now, readable after an await: a refresh that started
  // for one user must not land its results on a signed-out (or different) app.
  const sessionUserRef = useRef<string | null>(null);
  const [name, setName] = useState('Miso');
  // Chosen at adoption; changeable later from the profile.
  const [breed, setBreed] = useState<PetBreed>('bichon');
  const [error, setError] = useState<string | null>(null);
  const [stepGoal, setStepGoal] = useState(10000);
  const [wordPuzzleProgress, setWordPuzzleProgress] = useState<WordPuzzleProgress | null>(null);

  const [isAnalyzingMeal, setIsAnalyzingMeal] = useState(false);
  const [isEating, setIsEating] = useState(false);
  const [feedingImage, setFeedingImage] = useState<string | null>(null);
  const [feedingGrade, setFeedingGrade] = useState<MealAnalysis['grade'] | null>(null);
  const [isCelebrating, setIsCelebrating] = useState(false);
  const [isWorkingOut, setIsWorkingOut] = useState(false);
  const [isExploring, setIsExploring] = useState(false);
  const [isAppleHealthConnected, setIsAppleHealthConnected] = useState(false);
  const [isSyncingAppleHealth, setIsSyncingAppleHealth] = useState(false);
  // Android only: whether Settings → Usage access has been granted. Re-read on
  // every return to the foreground, since granting it happens in Settings.
  const [hasScreenTimeAccess, setHasScreenTimeAccess] = useState(() => hasUsageAccess());
  const [isSyncingScreenTime, setIsSyncingScreenTime] = useState(false);
  // The clock the decay projection is read against. Stored state, not `new Date()`
  // inline, so a tick is what re-renders the pet rather than an unrelated update.
  const [now, setNow] = useState(() => new Date());

  const userId = session?.user.id ?? 'demo-user';
  sessionUserRef.current = session?.user.id ?? null;
  const shared = isSharedPet(members);
  const partner = activeMembers(members).find((member) => member.userId !== userId);
  const partnerName = partner ? memberDisplayName(members, partner.userId) : undefined;

  // The foreground listener is subscribed once; this ref carries whatever
  // refresh is appropriate for the current state (none, for a solo pet).
  const refreshOnForeground = useRef<(() => void) | null>(null);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), DECAY_TICK_MS);
    // RN throttles timers in the background, so an app resumed after a night away
    // would otherwise paint yesterday's stats until the next tick landed.
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNow(new Date());
        setHasScreenTimeAccess(hasUsageAccess());
        refreshOnForeground.current?.();
      }
    });
    return () => {
      clearInterval(tick);
      foreground.remove();
    };
  }, []);

  // Cleared on a timer, so the handle has to outlive the call that set it.
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
  }, []);

  const showReaction = (next: PetReaction | null) => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    setReaction(next);
    if (!next) return;
    reactionTimer.current = setTimeout(() => setReaction(null), REACTION_VISIBLE_MS);
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthReady(true);
      return;
    }
    getSession()
      .then(({ data }) => {
        setSession(data.session);
        setAuthReady(true);
      })
      .catch(() => {
        setError('Could not connect to Supabase.');
        setAuthReady(true);
      });
    const { data: listener } = onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  // Local storage is async on device, so the first load happens in an effect
  // rather than in a state initialiser the way the web build could.
  useEffect(() => {
    let cancelled = false;
    setDataReady(false);
    setPetLoadFailed(false);

    void (async () => {
      // Kept on the device either way: a half-finished board is local scratch state,
      // not account data, and it is only ever good for the day it was opened.
      const storedWordPuzzle = await repository.loadWordPuzzleProgress();
      if (cancelled) return;
      if (storedWordPuzzle && storedWordPuzzle.puzzleDate === toDateKey(new Date())) {
        setWordPuzzleProgress(storedWordPuzzle);
      } else {
        setWordPuzzleProgress(null);
        if (storedWordPuzzle) void repository.clearWordPuzzleProgress();
      }

      if (isSupabaseConfigured && session) {
        const [petResult, eventsResult, profileResult] = await Promise.allSettled([
          remoteRepository.loadPets(),
          remoteRepository.loadEvents(),
          remoteRepository.loadProfile(),
        ]);
        if (cancelled) return;

        setPetLoadFailed(petResult.status === 'rejected');
        if (petResult.status === 'fulfilled') {
          // The STORED pets, never the decayed projection: `applyTimeDecay` leaves
          // `lastEventAt` where it was, so holding its output in state makes the
          // next care moment replay the same elapsed window a second time.
          setPets(petResult.value);
        }
        if (eventsResult.status === 'fulfilled') setEvents(eventsResult.value);
        if (profileResult.status === 'fulfilled' && profileResult.value) {
          setProfile(profileResult.value);
        }

        const failure = [petResult, eventsResult, profileResult].find(
          (result) => result.status === 'rejected',
        );
        setError(
          failure && failure.status === 'rejected'
            ? errorMessage(failure.reason, 'Could not load your account data.')
            : null,
        );
        setDataReady(true);

        // Partner state, after the pet is on screen so it never delays it. A
        // failure here is not a failed pet load: a broken partner lookup must
        // not send an owner to the "could not reach your pet" screen, so it
        // only leaves the pet looking solo until the next refresh.
        // Sharing state (members, care log, invite) belongs to one pet, so it is
        // loaded for whichever is on screen. Switching pets refreshes it.
        const loadedPets = petResult.status === 'fulfilled' ? petResult.value : [];
        const loadedPet =
          loadedPets.find((candidate) => candidate.id === activePetId) ?? loadedPets[0] ?? null;
        if (!loadedPet) {
          setMembers([]);
          setCareLog([]);
          setInvite(null);
          lastSeenCareLogAt.current = null;
          return;
        }
        const [membersResult, careLogResult, inviteResult] = await Promise.allSettled([
          remoteRepository.loadPetMembers(loadedPet.id),
          remoteRepository.loadCareLog(loadedPet.id),
          remoteRepository.loadOpenInvite(loadedPet.id),
        ]);
        if (cancelled) return;
        const loadedLog = careLogResult.status === 'fulfilled' ? careLogResult.value : [];
        setMembers(membersResult.status === 'fulfilled' ? membersResult.value : []);
        setCareLog(loadedLog);
        setInvite(inviteResult.status === 'fulfilled' ? inviteResult.value : null);
        // Everything already in the log has been "seen": only rows that arrive
        // after this point are announced as partner activity.
        lastSeenCareLogAt.current = newestOccurredAt(partnerEntriesSince(loadedLog, null, session.user.id));
        return;
      }

      const [storedPet, storedEvents, storedProfile] = await Promise.all([
        repository.loadPet(),
        repository.loadEvents(),
        repository.loadProfile<Partial<BodyProfile>>(),
      ]);
      if (cancelled) return;
      // Raw, for the same reason as the remote branch above. Local mode has no
      // sharing, so there is only ever the one pet.
      setPets(storedPet ? [storedPet] : []);
      setEvents(storedEvents);
      if (storedProfile) setProfile(withSurveyDefaults({ ...DEFAULT_PROFILE, ...storedProfile }));
      setMembers([]);
      setCareLog([]);
      setInvite(null);
      lastSeenCareLogAt.current = null;
      setDataReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [session, reloadToken]);

  const persistProfile = async (next: BodyProfile) => {
    setProfile(next);
    if (isSupabaseConfigured && session) {
      await remoteRepository.saveProfile(next);
      return;
    }
    await repository.saveProfile(next);
  };

  const updateProfile = <K extends keyof BodyProfile>(key: K, value: BodyProfile[K]) => {
    setProfile((current) => {
      const next = { ...current, [key]: value };
      if (isSupabaseConfigured && session) {
        void remoteRepository.saveProfile(next).catch(() => undefined);
      } else {
        void repository.saveProfile(next);
      }
      return next;
    });
  };

  /**
   * Re-reads the shared pet after time away: the partner may have cared for it
   * since this device last looked. Reloads the pet (with its version, so the
   * next care moment writes against the right base), the members, the log and
   * the invite, and announces any partner moments not yet seen. Failures are
   * swallowed — this runs unprompted on foreground, and a flaky refresh is not
   * worth a banner. Only ever wired for a shared pet or an open invite.
   */
  /** Forgets the shared pet entirely; onboarding renders next, since `pet` is null and the load did not fail. */
  const clearPetState = () => {
    setPet(null);
    setMembers([]);
    setCareLog([]);
    setInvite(null);
    lastSeenCareLogAt.current = null;
  };

  const refreshShared = async () => {
    if (!isSupabaseConfigured || !session || !pet) return;
    if (careMomentInFlight.current) {
      refreshPending.current = true;
      return;
    }
    const startedFor = session.user.id;
    const [petResult, membersResult, careLogResult, inviteResult] = await Promise.allSettled([
      remoteRepository.loadPet(),
      remoteRepository.loadPetMembers(pet.id),
      remoteRepository.loadCareLog(pet.id),
      remoteRepository.loadOpenInvite(pet.id),
    ]);
    // Signed out, or a different account, while these were in flight: the
    // results belong to nobody on screen now.
    if (sessionUserRef.current !== startedFor) return;
    // A pet write that started while this was in flight owns the pet now.
    if (careMomentInFlight.current) {
      refreshPending.current = true;
      return;
    }
    const outcome = applySharedRefresh({
      petResult,
      membersResult,
      careLogResult,
      inviteResult,
      currentMembers: members,
      lastSeenCareLogAt: lastSeenCareLogAt.current,
      selfUserId: startedFor,
      petName: pet.name,
    });
    if (outcome.kind === 'gone') {
      clearPetState();
      return;
    }
    if (outcome.pet) setPet(outcome.pet);
    if (outcome.members) setMembers(outcome.members);
    if (outcome.invite !== undefined) setInvite(outcome.invite);
    if (outcome.careLog) setCareLog(outcome.careLog);
    lastSeenCareLogAt.current = outcome.lastSeenCareLogAt;
    if (!outcome.announcement) return;
    showReaction({ message: outcome.announcement, eventLabel: 'Care partner', delta: {} });
    setPetFocusToken((token) => token + 1);
  };

  /** Ends a pet write: lets refreshes through again, and runs the one that was deferred, if any. */
  const releasePetWrite = () => {
    careMomentInFlight.current = false;
    if (refreshPending.current) {
      refreshPending.current = false;
      void refreshShared();
    }
  };

  // Solo pets never refresh on foreground: no partner can have changed anything,
  // so there is nothing to fetch. An open invite counts as "could become shared
  // any moment", so the owner sees the join without restarting the app.
  useEffect(() => {
    refreshOnForeground.current =
      isSupabaseConfigured && session && (shared || invite) ? () => void refreshShared() : null;
  });

  // The dashboard's "Today's care" for a shared pet: own events plus the
  // partner's type-only shadows. Undefined for a solo pet, so the screen keeps
  // its solo rendering untouched.
  const careDiary = useMemo(
    () => (shared ? mergeCareDiary({ ownEvents: events, careLog, members, selfUserId: userId }) : undefined),
    [shared, events, careLog, members, userId],
  );

  const recordEvent = async (event: HealthEvent<unknown>) => {
    if (!pet) return;
    setPetFocusToken((token) => token + 1);
    careMomentInFlight.current = true;
    try {
      const remote = isSupabaseConfigured && session ? remoteRepository : undefined;
      // Decay, engine and bonuses all happen inside; with a remote, the write is
      // optimistic and re-planned from the fresh row if the partner got in first.
      // Fans out: one logged moment feeds every pet the user cares for. A person
      // eats one meal and walks one set of steps, so the moment is a fact about
      // them, not about a pet — and the shared pet never becomes a second chore.
      const fanOut = await withTimeout(
        commitCareMomentForAll({ pets, event, events, profile, engine, remote }),
        SAVE_TIMEOUT_MESSAGE,
      );
      // The reaction shown is the on-screen pet's; the others are fed quietly.
      const nextPet = fanOut.pets.find((candidate) => candidate.id === pet.id) ?? pet;
      const nextReaction =
        fanOut.results.find((result) => result.pet.id === pet.id)?.reaction ??
        fanOut.results[0]?.reaction;

      if (remote) {
        await withTimeout(remote.saveEvent(event), SAVE_TIMEOUT_MESSAGE);
        // The partner's view of this moment: a type and a time, nothing more.
        // Best effort, and only once there is a partner to see it — the log
        // starts at pairing, so nobody inherits a history they were not part of.
        if (isSharedPet(members)) {
          void remote
            .appendCareLog({ petId: pet.id, userId, type: event.type, occurredAt: event.occurredAt })
            .catch(() => undefined);
        }
      }
      await repository.savePet(nextPet);
      await repository.saveEvent(event);
      setPets(fanOut.pets);
      if (nextReaction) showReaction(nextReaction);
      setEvents((current) => [event, ...current]);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save this care moment.'));
      throw cause;
    } finally {
      releasePetWrite();
    }
  };

  const changeBreed = async (next: PetBreed) => {
    if (!pet) return;
    // `pet` is the stored pet, so this saves a breed change and nothing else —
    // it cannot bake a decay projection into the row on its way past.
    const nextPet = { ...pet, breed: next };
    setPet(nextPet);
    setBreed(next);
    // Held like a care moment: a foreground refresh landing between the
    // optimistic setPet above and the versioned save would flash the old breed.
    careMomentInFlight.current = true;
    try {
      if (isSupabaseConfigured && session) {
        // Versioned, not upserted: a partner may hold this pet without having
        // adopted it, and the insert half of an upsert is creator-only. One
        // retry on conflict, re-applied to the fresh row so the partner's care
        // in between is kept.
        let base = pet;
        let saved = await remoteRepository.savePetIfUnchanged(nextPet, base.version ?? 0);
        if (saved.status === 'conflict') {
          const fresh = await remoteRepository.loadPet();
          if (!fresh) throw new Error(`Could not reach ${pet.name}. Check your connection and try again.`);
          base = fresh;
          saved = await remoteRepository.savePetIfUnchanged({ ...fresh, breed: next }, fresh.version ?? 0);
          if (saved.status === 'conflict') throw new Error(careConflictMessage(pet.name));
        }
        const stored = { ...base, breed: next, version: saved.version };
        setPet(stored);
        await repository.savePet(stored);
        return;
      }
      await repository.savePet(nextPet);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not change your companion.'));
    } finally {
      releasePetWrite();
    }
  };

  // --- Care partner actions ------------------------------------------------
  // Each rejects with copy from `inviteErrorMessage`, and the screen that
  // raised it shows the message inline, beside the code field or the button.

  const runPartnerAction = async <T,>(action: () => Promise<T>): Promise<T> => {
    setIsPartnerBusy(true);
    try {
      const result = await action();
      setError(null);
      return result;
    } catch (cause) {
      throw new Error(inviteErrorMessage(cause));
    } finally {
      setIsPartnerBusy(false);
    }
  };

  const createInvite = () =>
    runPartnerAction(async () => {
      if (!pet) return;
      setInvite(await remoteRepository.createInvite(pet.id));
    });

  const revokeInvite = () =>
    runPartnerAction(async () => {
      if (!invite) return;
      await remoteRepository.revokeInvite(invite.id);
      setInvite(null);
    });

  /**
   * Joins a partner's pet. With a pet already, the server refuses unless the
   * user confirms leaving it (the old pet is kept, never deleted); from
   * onboarding, the profile is saved first so fuel targets work from day one.
   * Resolves true once joined (the normal load path then fetches the new pet)
   * and false when the user cancelled, so the screen keeps the typed code.
   */
  const redeemInvite = (code: string): Promise<boolean> =>
    runPartnerAction(async () => {
      let confirmLeave = false;
      if (pet) {
        const confirmed = await confirmDialog(
          "Join your partner's pet?",
          `${pet.name} stays as they are, but you'll stop caring for them.`,
          'Join',
        );
        if (!confirmed) return false;
        confirmLeave = true;
      } else {
        await persistProfile(profile);
      }
      await remoteRepository.redeemInvite(code, { confirmLeave });
      setReloadToken((token) => token + 1);
      return true;
    });

  /** Leaves the shared pet; the partner keeps it. */
  const leavePet = () =>
    runPartnerAction(async () => {
      if (!pet) return;
      const confirmed = await confirmDialog(
        `Leave ${pet.name}?`,
        `You'll stop caring for ${pet.name}. ${partnerName ?? 'Your partner'} keeps them, and you can adopt a new pet.`,
        'Leave',
      );
      if (!confirmed) return;
      await remoteRepository.leavePet();
      clearPetState();
    });

  const adopt = async () => {
    try {
      setError(null);
      if (profile.age < 13 || profile.age > 100) throw new Error('Age must be between 13 and 100.');
      if (profile.heightCm < 120 || profile.heightCm > 230)
        throw new Error('Height must be between 120 and 230 cm.');
      if (profile.weightKg < 30 || profile.weightKg > 300)
        throw new Error('Weight must be between 30 and 300 kg.');

      const nextPet = createPet(userId, name.trim() || 'Miso', 'dog', breed);
      if (isSupabaseConfigured && session) await remoteRepository.savePet(nextPet);
      await persistProfile(profile);
      await repository.savePet(nextPet);
      setPet(nextPet);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save your pet.'));
    }
  };

  const startFeeding = (imageUri: string | null, grade: MealAnalysis['grade']) => {
    setFeedingGrade(grade);
    // Waits out the sheet so the flight is actually on screen; see SHEET_DISMISS_MS.
    setTimeout(() => {
      setFeedingImage(imageUri);
      setIsEating(true);
      const munch = setInterval(playMunchSound, 420);
      setTimeout(() => {
        setFeedingImage(null);
        setTimeout(() => {
          clearInterval(munch);
          setIsEating(false);
          setIsCelebrating(true);
          playCelebrationSound();
          setTimeout(() => setIsCelebrating(false), 1500);
        }, 1900);
      }, 900);
    }, SHEET_DISMISS_MS);
  };

  const completeMeal = async (metadata: MealMetadata) => {
    playMealSound();
    await recordEvent(makeEvent<MealMetadata>(userId, 'MEAL', metadata));
  };

  const completeWorkout = async (metadata: WorkoutMetadata) => {
    setIsWorkingOut(true);
    setTimeout(() => setIsWorkingOut(false), WORKOUT_ANIMATION_MS);
    await recordEvent(makeEvent<WorkoutMetadata>(userId, 'WORKOUT', metadata));
  };

  const completeMindSession = async (metadata: BrainTrainingMetadata) => {
    await recordEvent(makeEvent<BrainTrainingMetadata>(userId, 'BRAIN_TRAINING', metadata));
  };

  /**
   * One screen-time log per day, like one night of sleep per day: a second
   * total for the same day is refused rather than stacked, so the pet cannot be
   * fed the same day twice. Refused, not replaced: neither repository has a
   * delete or update path for events (both only `saveEvent`/insert), so a
   * mistyped total cannot be corrected yet and the message says so plainly.
   */
  const assertTodayScreenTimeNotLogged = () => {
    const existing = findScreenTimeForDate(events, new Date());
    if (existing) {
      throw new Error(
        `Today's screen time is already logged (${existing.metadata.minutes} min) and can't be changed yet — try again tomorrow.`,
      );
    }
  };

  /**
   * Manual path (every platform): the number the user read off their phone's
   * own Screen Time page. The Profile screen owns the error for this path, so
   * the global banner `recordEvent` sets is cleared before rethrowing — the
   * same message must not show twice.
   */
  const logScreenTime = async (minutes: number, budgetMinutes?: number) => {
    assertTodayScreenTimeNotLogged();
    try {
      await recordEvent(mapManualScreenTime(userId, minutes, budgetMinutes) as HealthEvent<ScreenTimeMetadata>);
    } catch (cause) {
      setError(null);
      throw cause;
    }
  };

  /** Android path: read today's total from UsageStatsManager, routing to Settings first if access is missing. */
  const syncScreenTime = async (budgetMinutes?: number) => {
    if (!hasUsageAccess()) {
      if (!openUsageAccessSettings()) setError('Screen time sync is not available in this build.');
      return;
    }
    setIsSyncingScreenTime(true);
    try {
      assertTodayScreenTimeNotLogged();
      const event = await stepsProvider.getTodayScreenTime(userId, budgetMinutes);
      if (!event) {
        setError('Could not read screen time from this device.');
        return;
      }
      await recordEvent(event);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not sync screen time.'));
    } finally {
      setIsSyncingScreenTime(false);
    }
  };

  const saveWordPuzzleProgress = (progress: WordPuzzleProgress) => {
    setWordPuzzleProgress(progress);
    void repository.saveWordPuzzleProgress(progress).catch(() => undefined);
  };

  const clearWordPuzzleProgress = () => {
    setWordPuzzleProgress(null);
    void repository.clearWordPuzzleProgress().catch(() => undefined);
  };

  const syncSteps = async () => {
    try {
      if (!isAppleHealthConnected) {
        const granted = await stepsProvider.requestAuthorization();
        setIsAppleHealthConnected(granted);
        if (!granted) {
          setError('Connect Apple Health (in Profile) to sync steps.');
          return;
        }
      }
      setIsExploring(true);
      setTimeout(() => setIsExploring(false), EXPLORE_ANIMATION_MS);
      const event = await stepsProvider.getTodaySteps(userId);
      await recordEvent(event as HealthEvent<StepMetadata>);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not sync steps.'));
    }
  };

  const connectAppleHealth = async () => {
    try {
      const granted = await stepsProvider.requestAuthorization();
      setIsAppleHealthConnected(granted);
      if (!granted) {
        setError('Apple Health access was not granted.');
        return;
      }
      setError(null);
      await syncAppleHealth();
    } catch (cause) {
      setError(errorMessage(cause, 'Could not connect to Apple Health.'));
    }
  };

  /**
   * DEV ONLY. Writes ~90 days of synthetic history so the insights layer can be
   * seen working: its thresholds keep a real account silent for weeks, which
   * makes a broken insight and an unproven one look identical.
   *
   * Seeded events are written straight to the repository rather than through
   * `recordEvent`, on purpose. `recordEvent` replays each event through the pet
   * engine and moves `lastEventAt`, so pushing three months of history through it
   * would rewrite the pet's stats and wreck its decay anchor. The insights layer
   * reads the event log, not the pet, so the log is all that needs filling.
   */
  const seedTestData = async () => {
    if (!isSupabaseConfigured || !session) return;
    setIsSeeding(true);
    try {
      const seeded = generateSeedEvents(userId);
      await remoteRepository.saveEvents(seeded);
      setEvents(await remoteRepository.loadEvents());
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not seed test data.'));
    } finally {
      setIsSeeding(false);
    }
  };

  /** Sweeps out everything `seedTestData` wrote, keyed on its `mock` source. */
  const clearSeededData = async () => {
    if (!isSupabaseConfigured || !session) return;
    setIsSeeding(true);
    try {
      await remoteRepository.deleteEventsBySource(SEED_SOURCE);
      setEvents(await remoteRepository.loadEvents());
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not clear seeded data.'));
    } finally {
      setIsSeeding(false);
    }
  };

  const syncAppleHealth = async () => {
    if (!pet) return;
    setIsSyncingAppleHealth(true);
    try {
      // Never ask for anything older than this user's own newest event: anything
      // before it was already imported or deliberately skipped. The user's own
      // event, not the pet's `lastEventAt` — with a partner, the pet's anchor
      // moves whenever THEY care, and keying on it would silently skip this
      // user's workouts from before that. (Solo, the two are the same instant.)
      // The recent-window cap on top of that is a deliberate scope choice — see
      // RECENT_SYNC_WINDOW_HOURS in healthKitProvider.ts.
      const windowStart = Date.now() - RECENT_SYNC_WINDOW_HOURS * 60 * 60 * 1000;
      const ownNewest = newestOccurredAt(events);
      const ownNewestMs = ownNewest ? new Date(ownNewest).getTime() : windowStart;
      const since = new Date(Math.max(windowStart, ownNewestMs));
      const knownExternalIds = getKnownHealthKitExternalIds(events);

      const [workouts, meals, sleep] = await Promise.all([
        stepsProvider.getNewWorkouts(userId, since, knownExternalIds),
        stepsProvider.getNewMeals(userId, since, knownExternalIds),
        stepsProvider.getNewSleep(userId, since, knownExternalIds),
      ]);
      const importedInOrder = [...workouts, ...meals, ...sleep].sort((a, b) =>
        a.occurredAt.localeCompare(b.occurredAt),
      );
      for (const event of importedInOrder) {
        // Sequential and awaited on purpose: each recordEvent depends on the
        // previous one's updated pet state (decay anchors off lastEventAt).
        // eslint-disable-next-line no-await-in-loop
        await recordEvent(event);
      }
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not sync Apple Health.'));
    } finally {
      setIsSyncingAppleHealth(false);
    }
  };

  const logOut = () => {
    void signOut()
      .then(async () => {
        setSession(null);
        clearPetState();
        setEvents([]);
        setWordPuzzleProgress(null);
        setIsAppleHealthConnected(false);
        setForcedAilment(null);
        setForcedForm(null);
        await repository.clear();
      })
      .catch(() => setError('Could not sign out.'));
  };

  if (!authReady || !dataReady) {
    return (
      <View style={[layout.screen, styles.center]}>
          <ActivityIndicator color={colors.coral} />
      </View>
    );
  }

  if (isSupabaseConfigured && !session) {
    return (
      <View style={layout.screen}>
          <StatusBar barStyle="dark-content" />
          <AuthScreen />
      </View>
    );
  }

  // A failed load is not an empty account. Sending an owner to onboarding here
  // would invite them to replace a pet that still exists, so offer the retry the
  // situation actually calls for instead.
  if (petLoadFailed) {
    return (
      <View style={[layout.screen, styles.center, styles.loadFailed]}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.loadFailedTitle}>Could not reach your pet</Text>
        <Text style={styles.loadFailedBody}>
          {error ?? 'Your account data did not load. Check your connection and try again.'}
        </Text>
        <PrimaryButton label="Try again" onPress={() => setReloadToken((token) => token + 1)} />
        {isSupabaseConfigured && session ? <TextButton label="Sign out" onPress={logOut} /> : null}
      </View>
    );
  }

  // Gated on the STORED pet: a pet whose projection has bottomed out is still an
  // adopted pet, and must never be sent back through onboarding.
  if (!pet) {
    return (
      <View style={layout.screen}>
        <StatusBar barStyle="dark-content" />
        <OnboardingScreen
          name={name}
          onNameChange={setName}
          breed={breed}
          onBreedChange={setBreed}
          profile={profile}
          onUpdate={updateProfile}
          onAdopt={adopt}
          error={error}
          onSignOut={isSupabaseConfigured && session ? logOut : undefined}
          onRedeemInvite={isSupabaseConfigured && session ? redeemInvite : undefined}
        />
      </View>
    );
  }

  const isOnline = isSupabaseConfigured && Boolean(session);

  // What the screens draw: the stored pet projected forward to `now`. Derived on
  // every tick, stored nowhere.
  const isDev = isDevAccount(session?.user.email);
  // Applies to this projection only -- `recordEvent` decays from the STORED pet,
  // so a forced stat can never be written back. Gated again on `isDev` here so a
  // stale value could not survive switching to a non-dev account.
  const livePet = applyForcedForm(
    applyForcedAilment(applyTimeDecay(pet, now), isDev ? forcedAilment : null),
    isDev ? forcedForm : null,
  );

  return (
    <NavigationContainer theme={navigationTheme}>
      <StatusBar barStyle="dark-content" />
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Dashboard">
          {({ navigation }) => (
            <DashboardScreen
              pet={livePet}
              events={events}
              profile={profile}
              reaction={reaction}
              stepGoal={stepGoal}
              onStepGoalChange={setStepGoal}
              onLogMeal={() => navigation.navigate('MealCapture')}
              onLogWorkout={() => navigation.navigate('Workout')}
              onSyncSteps={() => void syncSteps()}
              onTrainMind={() => navigation.navigate('MindGym')}
              onOpenProfile={() => navigation.navigate('Profile')}
              onOpenStats={() => navigation.navigate('PetStats')}
              petFocusToken={petFocusToken}
              accountInitial={session?.user.email?.charAt(0)}
              forcedAilment={isDev ? forcedAilment : undefined}
              onForceAilment={isDev ? setForcedAilment : undefined}
              forcedForm={isDev ? forcedForm : undefined}
              onForceForm={isDev ? setForcedForm : undefined}
              pets={pets.map((candidate) => ({ id: candidate.id, name: candidate.name }))}
              activePetId={pet.id}
              onSelectPet={(petId) => {
                setActivePetId(petId);
                // Members, care log and invite all belong to one pet, so they are
                // refetched for whichever is now on screen.
                if (isSupabaseConfigured && session) void refreshShared();
              }}
              onSeedTestData={isDev ? () => void seedTestData() : undefined}
              onClearSeededData={isDev ? () => void clearSeededData() : undefined}
              isSeeding={isSeeding}
              isAnalyzingMeal={isAnalyzingMeal}
              isEating={isEating}
              feedingImage={feedingImage}
              feedingGrade={feedingGrade}
              isCelebrating={isCelebrating}
              isWorkingOut={isWorkingOut}
              isExploring={isExploring}
              careDiary={careDiary}
              partnerName={shared ? partnerName : undefined}
              onRefresh={isOnline && shared ? refreshShared : undefined}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Profile">
          {({ navigation }) => (
            <ProfileScreen
              profile={profile}
              breed={pet.breed}
              onBreedChange={(next) => void changeBreed(next)}
              events={events}
              onSave={persistProfile}
              onClose={() => navigation.goBack()}
              onSignOut={isSupabaseConfigured && session ? logOut : undefined}
              onOpenFriends={
                isSupabaseConfigured && session ? () => navigation.navigate('Friends') : undefined
              }
              appleHealthStatus={
                Platform.OS === 'ios'
                  ? isAppleHealthConnected
                    ? 'connected'
                    : 'disconnected'
                  : undefined
              }
              onConnectAppleHealth={() => void connectAppleHealth()}
              onSyncAppleHealth={() => void syncAppleHealth()}
              isSyncingAppleHealth={isSyncingAppleHealth}
              onLogScreenTime={logScreenTime}
              screenTimeAccess={
                Platform.OS === 'android' && isScreenTimeModuleAvailable()
                  ? {
                      granted: hasScreenTimeAccess,
                      onOpenSettings: () => void openUsageAccessSettings(),
                      onSync: (budgetMinutes) => void syncScreenTime(budgetMinutes),
                      syncing: isSyncingScreenTime,
                    }
                  : undefined
              }
              carePartner={
                isOnline
                  ? {
                      petName: pet.name,
                      selfUserId: userId,
                      members,
                      invite,
                      busy: isPartnerBusy,
                      onCreateInvite: createInvite,
                      onRevokeInvite: revokeInvite,
                      onRedeemInvite: redeemInvite,
                      onLeave: leavePet,
                    }
                  : undefined
              }
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="PetStats">
          {({ navigation }) => (
            <PetStatsScreen pet={livePet} events={events} onClose={() => navigation.goBack()} />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Friends">
          {({ navigation }) => (
            <FriendsScreen
              currentUserId={userId}
              onClose={() => navigation.goBack()}
              onOpenFriendPet={(friendUserId, friendUserIds) =>
                navigation.navigate('FriendPet', { friendUserId, friendUserIds })
              }
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="FriendPet">
          {({ navigation, route }) => (
            <FriendPetScreen
              friendUserIds={route.params.friendUserIds}
              initialFriendUserId={route.params.friendUserId}
              onClose={() => navigation.goBack()}
            />
          )}
        </RootStack.Screen>
        <RootStack.Group screenOptions={{ presentation: 'modal' }}>
          <RootStack.Screen name="MealCapture">
            {({ navigation }) => (
              <MealCaptureScreen
                // No navigation here: the screen calls `onFeedStart` and then
                // `onClose` itself, and closing twice raced the feed animation.
                onComplete={completeMeal}
                onFeedStart={startFeeding}
                onAnalyzingChange={setIsAnalyzingMeal}
                onClose={() => navigation.goBack()}
              />
            )}
          </RootStack.Screen>
          <RootStack.Screen name="Workout">
            {({ navigation }) => (
              <WorkoutScreen
                onFinish={async (metadata) => {
                  await completeWorkout(metadata);
                  navigation.goBack();
                }}
                onClose={() => navigation.goBack()}
              />
            )}
          </RootStack.Screen>
          <RootStack.Screen name="MindGym">
            {({ navigation }) => (
              <MindGymScreen
                events={events}
                onFinish={async (metadata) => {
                  await completeMindSession(metadata);
                  navigation.goBack();
                }}
                // `replace` swaps this sheet for the puzzle rather than stacking a
                // second modal on top of the one already presented.
                onOpenWordPuzzle={() => navigation.replace('WordPuzzle')}
                onClose={() => navigation.goBack()}
              />
            )}
          </RootStack.Screen>
          <RootStack.Screen name="WordPuzzle">
            {({ navigation }) => (
              <WordPuzzleScreen
                events={events}
                progress={wordPuzzleProgress}
                onSaveProgress={saveWordPuzzleProgress}
                onClearProgress={clearWordPuzzleProgress}
                onFinish={async (metadata) => {
                  await completeMindSession(metadata);
                  clearWordPuzzleProgress();
                }}
                onClose={() => navigation.goBack()}
              />
            )}
          </RootStack.Screen>
        </RootStack.Group>
      </RootStack.Navigator>

      {error ? (
        <View style={styles.banner} pointerEvents="none">
          <Text style={styles.bannerText}>{error}</Text>
        </View>
      ) : null}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  loadFailed: { paddingHorizontal: 32, gap: 12 },
  loadFailedTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.ink, textAlign: 'center' },
  loadFailedBody: { fontFamily: fonts.body, fontSize: 15, color: colors.inkSoft, textAlign: 'center' },
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 34,
    backgroundColor: '#f7e2dd',
    borderWidth: 1,
    borderColor: '#e0b3a8',
    borderRadius: 12,
    padding: 13,
  },
  bannerText: { fontFamily: fonts.mono, fontSize: 11, color: '#8c4433', lineHeight: 16 },
});
