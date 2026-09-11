import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme, type Theme as NavigationTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { Session } from '@supabase/supabase-js';
import {  withMeasurementSystem, type MeasurementSystem,type BodyProfile, type GeoPoint, type PetBreed, type BrainTrainingMetadata, type CareLogEntry, type HealthEvent, type MealMetadata, PROFILE_SURVEY_DEFAULTS, PetHealthEngine, type ForcedPetForm, type ForcedPetStatus, type PetInvite, type PetMember, type PetPersonality, type PetReaction, type PetState, type CareToast, careToast, type Reminder, type ScreenTimeMetadata, type StepMetadata, SupabaseRepository, type WorkoutMetadata, type Weekday, type TrophyId, TROPHY_IDS, earnedTrophies, type AchievementId, earnedAchievements, newlyUnlocked, DECAY_TICK_MS, activeMembers, applyForcedAilment, canJoinAnotherPet, isOwnPet, applyForcedForm, applyTimeDecay, createPet, errorMessage, getSession, inviteErrorMessage, isDevAccount, isSharedPet, memberDisplayName, mergeCareDiary, newId, normalizeReminderLabel, onAuthStateChange, partnerEntriesSince, setIdGenerator, signOut, toDateKey, isSameDay, withSurveyDefaults, generateSeedEvents, SEED_SOURCE} from '@vitto/core';
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
import { usePetInteraction } from './src/petWorld/usePetInteraction';
import { AuthScreen } from './src/screens/AuthScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { detectLevelUp } from './src/celebrations/detectLevelUp';
import type { CelebrationEvent } from './src/celebrations/types';
import { readCurrentLocation, useAtGym, useWalking } from './src/services/ambient';
import {
  type NotificationPermission,
  reminderPermissionStatus,
  requestReminderPermission,
  syncScheduledReminders,
} from './src/services/reminders';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { PetStatsScreen } from './src/screens/PetStatsScreen';
import { FriendsScreen } from './src/screens/FriendsScreen';
import { FriendPetScreen } from './src/screens/FriendPetScreen';
import {  type ForcedTrophies,TodayScreen, type ForcedAmbient } from './src/screens/TodayScreen';
import { MealCaptureScreen } from './src/screens/MealCaptureScreen';
import { MindGymScreen } from './src/screens/MindGymScreen';
import { WordPuzzleScreen } from './src/screens/WordPuzzleScreen';
import { WorkoutScreen } from './src/screens/WorkoutScreen';
import { deviceMeasurementSystem } from './src/services/deviceLocale';
import { hasNativeUUID, randomUUID } from './src/services/uuid';
import { lockWebViewport } from './src/web/lockWebViewport';
import { colors, fonts, layout } from './src/theme';

// Prefer the platform's crypto-backed ids, but keep the domain's pure fallback if
// this client has no native crypto module.
if (hasNativeUUID()) setIdGenerator(randomUUID);

// Pin the web build to a fixed, non-zoomable viewport so it behaves like the
// mobile app it is rather than a pannable web page. No-op on native.
lockWebViewport();

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
  /** `join` opens the care-partner code field straight away — the "+" tile's destination. */
  Profile: { join?: boolean } | undefined;
  // A drill-down off the dashboard, so it pushes rather than presenting as a modal.
  PetStats: undefined;
  // Reached from Profile, same as Profile itself is reached from the dashboard.
  Friends: undefined;
  // The full ordered accepted-friends list, so the sequential browser can move
  // between friends without going back to `FriendsScreen`.
  FriendPet: { friendUserId: string; friendUserIds: string[] };
  // The day's detail — nutrition, care, movement, mind — which used to sit under
  // the pet. Pushed like PetStats, so the dashboard stays the pet and nothing else.
  Today: undefined;
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

/**
 * How long a care moment's message stays up. It has to clear on its own: the
 * dashboard shows an ailment on the same line, so a reaction that never expires
 * would permanently hide "Miso is starving".
 */
const REACTION_VISIBLE_MS = 6000;

/**
 * How long the "logged" confirmation stays up. Shorter than the reaction: it
 * states a fact the user already knows they caused, so it only has to be seen,
 * and it sits over the scene rather than in a line of its own.
 */
const CARE_TOAST_VISIBLE_MS = 3200;
const SAVE_TIMEOUT_MESSAGE = 'Saving timed out. Check your connection.';

/**
 * Units start from the device's locale, so an American phone opens the survey on
 * pounds and feet without anyone touching the toggle. Read once at module load;
 * it is only a starting point, and the survey's Units choice overrides it.
 *
 * The body values are metric regardless — that is how they are stored — and are
 * onboarding-v2's more realistic starting figures rather than round numbers.
 */
const DEFAULT_PROFILE: BodyProfile = withMeasurementSystem(
  {
    age: 30,
    sex: 'other',
    heightCm: 173, // 5'8"
    weightKg: 73, // ~160 lb
    heightUnit: 'cm',
    weightUnit: 'kg',
    activity: 'moderate',
    goal: 'maintain',
    ...PROFILE_SURVEY_DEFAULTS,
  } as BodyProfile,
  deviceMeasurementSystem(),
);

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
  // Same deal for the ambient cues: forced from the "Dev · force ambient" panel
  // on the Today screen, resolved below into `walkingNow`/`atGymNow` the same
  // way `livePet` bakes in `forcedAilment`/`forcedForm` before anything
  // downstream sees it.
  const [forcedAmbient, setForcedAmbient] = useState<ForcedAmbient | null>(null);
  // Dev-only: put trophies on the shelf without the month of logging.
  const [forcedTrophies, setForcedTrophies] = useState<ForcedTrophies | null>(null);
  /**
   * Ambient cues (mobile/AMBIENT.md). The saved gym is one coordinate held on
   * this device; the two hooks read live sensors while the app is open and keep
   * nothing. Both resolve false anywhere they cannot run, so they are wired
   * unconditionally.
   */
  const [gym, setGym] = useState<GeoPoint | null>(null);
  const [gymBusy, setGymBusy] = useState(false);
  const [gymError, setGymError] = useState<string | null>(null);
  const walkingState = useWalking();
  const gymState = useAtGym(gym);

  /**
   * Personal reminders ("take creatine at 8am"). Device-local like the gym
   * coordinate: the list lives in AsyncStorage and the OS owns the alarms, so
   * nothing about them reaches the server.
   */
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [reminderPermission, setReminderPermission] = useState<NotificationPermission>('unknown');
  /**
   * Achievement unlocks the user has already been shown. `null` until loaded,
   * and `seenEverStored` says whether the key existed at all — on a device with
   * history but no record, the current set is seeded silently rather than
   * announcing every milestone the account has ever passed in one burst.
   */
  const [seenAchievements, setSeenAchievements] = useState<Set<string> | null>(null);
  const seenEverStored = useRef(false);
  /** Unlocks waiting to be announced, oldest first; the dashboard shows the head. */
  const [unlockQueue, setUnlockQueue] = useState<AchievementId[]>([]);
  useEffect(() => {
    void repository
      .loadSeenAchievements()
      .then((stored) => {
        seenEverStored.current = stored !== null;
        setSeenAchievements(new Set(stored ?? []));
      })
      .catch(() => setSeenAchievements(new Set()));
    void repository.loadGymLocation().then(setGym).catch(() => setGym(null));
    void repository
      .loadReminders()
      .then((saved) => {
        setReminders(saved);
        // The OS forgets nothing, but a reinstall or a revoked permission can
        // leave the schedule out of step with the list. Resyncing on launch is
        // cheap and makes the saved list the single source of truth.
        void syncScheduledReminders(saved);
      })
      .catch(() => setReminders([]));
    void reminderPermissionStatus().then(setReminderPermission);
  }, []);
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
  const pet = useMemo(() => {
    const chosen = pets.find((candidate) => candidate.id === activePetId);
    if (chosen) return chosen;
    // No explicit choice yet: the world screen is YOUR pet, not the joint one.
    // `pets[0]` can be the joint pet depending on load order, which is what
    // made the HUD show the partner's animal by default.
    const own = pets.find((candidate) => isOwnPet(candidate, session?.user.id ?? 'demo-user'));
    return own ?? pets[0] ?? null;
  }, [pets, activePetId, session?.user.id]);
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
  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [profile, setProfile] = useState<BodyProfile>(DEFAULT_PROFILE);
  const [reaction, setReaction] = useState<PetReaction | null>(null);
  const [toast, setToast] = useState<CareToast | null>(null);
  /**
   * A full-screen reward moment (currently only a level-up). Presentation only,
   * never persisted: raised by `recordEvent` off the engine's own result, and
   * cleared when the user taps Continue. Refresh / navigation / re-open never
   * re-run the engine, so none of them can replay it.
   */
  const [celebration, setCelebration] = useState<CelebrationEvent | null>(null);
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
  const [personality, setPersonality] = useState<PetPersonality>('supportive');
  const [error, setError] = useState<string | null>(null);
  // Persisted on `profiles` now (onboarding-v2). Derived rather than its own
  // state so a `loadProfile` after sign-in is what fills it. `updateProfile`
  // saves it optimistically, same as every other profile field.
  const stepGoal = profile.stepGoal ?? 10000;
  const setStepGoal = (next: number) => updateProfile('stepGoal', next);
  const [wordPuzzleProgress, setWordPuzzleProgress] = useState<WordPuzzleProgress | null>(null);

  // What the pet is doing on screen, and the choreography (walk to food, eat,
  // celebrate, ...) that drives it. Replaces the seven booleans plus nested
  // setTimeout chain this used to be — see `src/petWorld/usePetInteraction.ts`.
  const interaction = usePetInteraction({
    onMunch: playMunchSound,
    onEatingFinished: playCelebrationSound,
  });
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
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const showReaction = (next: PetReaction | null) => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    setReaction(next);
    if (!next) return;
    reactionTimer.current = setTimeout(() => setReaction(null), REACTION_VISIBLE_MS);
  };

  /**
   * Re-shows from scratch on every log: clearing first means logging twice in a
   * row replays the animation with the new number, rather than the second toast
   * silently swapping the text of one already on screen.
   */
  const showCareToast = (next: CareToast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), CARE_TOAST_VISIBLE_MS);
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
          loadedPets.find((candidate) => candidate.id === activePetId) ??
          loadedPets.find((candidate) => isOwnPet(candidate, session?.user.id ?? 'demo-user')) ??
          loadedPets[0] ??
          null;
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

  /**
   * Both unit fields in ONE update. Setting them with two `updateProfile` calls
   * fired two saves, the first carrying the old height unit — harmless for the
   * final state but a pointless race, and the stale write could land last.
   */
  const setMeasurementSystem = (system: MeasurementSystem) => {
    setProfile((current) => {
      const next = withMeasurementSystem(current, system);
      if (isSupabaseConfigured && session) {
        void remoteRepository.saveProfile(next).catch(() => undefined);
      } else {
        void repository.saveProfile(next);
      }
      return next;
    });
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
      // By id, not `loadPet()`: that returns the FIRST pet, which is the wrong
      // one whenever the joint pet is the one on screen.
      remoteRepository.loadPetById(pet.id),
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
      // This pet is no longer ours (left on another device, or the owner
      // removed us). Drop just it; the other pet, if any, carries on.
      const remaining = pets.filter((candidate) => candidate.id !== pet.id);
      if (remaining.length === 0) {
        clearPetState();
        return;
      }
      setPets(remaining);
      setActivePetId(remaining[0].id);
      setMembers([]);
      setCareLog([]);
      setInvite(null);
      lastSeenCareLogAt.current = null;
      return;
    }
    if (outcome.pet) setPet(outcome.pet);
    if (outcome.members) setMembers(outcome.members);
    if (outcome.invite !== undefined) setInvite(outcome.invite);
    if (outcome.careLog) setCareLog(outcome.careLog);
    lastSeenCareLogAt.current = outcome.lastSeenCareLogAt;
    if (!outcome.announcement) return;
    showReaction({ message: outcome.announcement, eventLabel: 'Care partner', delta: {} });
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
      const nextResult = fanOut.results.find((result) => result.pet.id === pet.id) ?? fanOut.results[0];
      const nextReaction = nextResult?.reaction;

      // Stamp the XP this moment actually granted onto the persisted event, so
      // the Today recap can total the day's XP from the real log instead of
      // keeping its own counter. `xpGranted` is the pet's real before/after xp
      // difference (see careMoment.ts) — not `reaction.delta.xp`, which only
      // carries the *last* bonus when a streak milestone or the revival bonus
      // overrides the shown message, and would otherwise under-stamp the rest.
      // Read back with `?? 0` for older events, logged before this existed.
      const storedEvent: HealthEvent<unknown> = {
        ...event,
        metadata: {
          ...(event.metadata as Record<string, unknown>),
          xpAwarded: nextResult?.xpGranted ?? 0,
        },
      };

      if (remote) {
        await withTimeout(remote.saveEvent(storedEvent), SAVE_TIMEOUT_MESSAGE);
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
      await repository.saveEvent(storedEvent);
      setPets(fanOut.pets);

      // The one place a level-up can originate in normal play: a care moment,
      // already run through the engine and persisted above. The celebration is
      // pure presentation off that fact — if it never shows, the level is still
      // saved. A multi-level jump (near-full bar + big delta, or a Health
      // backfill looping through here) keeps climbing to the real final level
      // rather than restarting a celebration that is already on screen.
      const levelUp = detectLevelUp(pet, nextPet);
      if (levelUp) {
        setCelebration((current) =>
          current ? { ...current, level: Math.max(current.level, levelUp.level) } : levelUp,
        );
      }

      // The celebration is the acknowledgement for a level-up moment, so the
      // banner/toast would only stack behind it and then flash on dismissal.
      if (!levelUp) {
        if (nextReaction) showReaction(nextReaction);
        // Every logged moment is acknowledged, reaction or not — that is the
        // whole point of the toast being separate from the pet's mood line.
        showCareToast(careToast(event, nextReaction?.delta ?? {}));
      }
      setEvents((current) => [storedEvent, ...current]);
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
   * Joins a partner's pet as a SECOND pet. The one already in hand is untouched:
   * this used to confirm "you'll stop caring for {pet}" and pass
   * `confirmLeave`, which is why joint care replaced your pet instead of adding
   * one. With the joint slot already taken the server refuses with
   * `HAS_JOINT_PET`, and the screen shows that copy -- leaving is its own,
   * explicit action.
   *
   * From onboarding the profile is saved first so fuel targets work from day
   * one. Resolves true once joined; the load path then fetches both pets. The
   * world screen stays on YOUR pet — the joint one is a tab away, not the
   * default — so `activePetId` is deliberately left where it is.
   */
  const redeemInvite = (code: string): Promise<boolean> =>
    runPartnerAction(async () => {
      if (!pet) await persistProfile(profile);
      await remoteRepository.redeemInvite(code);
      setReloadToken((token) => token + 1);
      return true;
    });

  /**
   * Leaves the pet on screen -- which is only ever offered for the joint one.
   * The other pet stays, and the view moves to it. Only when nothing is left
   * (an account that joined from onboarding and never adopted) does this fall
   * back to a full clear, which sends them to adoption.
   */
  const leavePet = () =>
    runPartnerAction(async () => {
      if (!pet) return;
      const confirmed = await confirmDialog(
        `Leave ${pet.name}?`,
        `You'll stop caring for ${pet.name}. ${partnerName ?? 'Your partner'} keeps them, and your joint slot is free again.`,
        'Leave',
      );
      if (!confirmed) return;
      await remoteRepository.leavePet(pet.id);
      const remaining = pets.filter((candidate) => candidate.id !== pet.id);
      if (remaining.length === 0) {
        clearPetState();
        return;
      }
      setPets(remaining);
      setActivePetId(remaining[0].id);
      setMembers([]);
      setCareLog([]);
      setInvite(null);
      lastSeenCareLogAt.current = null;
      void refreshShared();
    });

  const adopt = async () => {
    try {
      setError(null);
      if (profile.age < 13 || profile.age > 100) throw new Error('Age must be between 13 and 100.');
      if (profile.heightCm < 120 || profile.heightCm > 230)
        throw new Error('Height must be between 120 and 230 cm.');
      if (profile.weightKg < 30 || profile.weightKg > 300)
        throw new Error('Weight must be between 30 and 300 kg.');

      const nextPet = createPet(userId, name.trim() || 'Miso', 'dog', breed, personality);
      if (isSupabaseConfigured && session) await remoteRepository.savePet(nextPet);
      await persistProfile(profile);
      await repository.savePet(nextPet);
      setPet(nextPet);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save your pet.'));
    }
  };

  const completeMeal = async (metadata: MealMetadata) => {
    playMealSound();
    await recordEvent(makeEvent<MealMetadata>(userId, 'MEAL', metadata));
  };

  const completeWorkout = async (metadata: WorkoutMetadata) => {
    interaction.startWorkout();
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
      interaction.startExploring();
      const event = (await stepsProvider.getTodaySteps(userId)) as HealthEvent<StepMetadata>;
      const newSteps = event.metadata.steps ?? 0;

      // One STEP_ACTIVITY per day: the first sync is a real care moment (engine,
      // XP, "Went exploring"); every re-sync after that just corrects the count
      // on that same row, no second XP and no second diary line.
      const today = new Date();
      const existing = events.find(
        (candidate) => candidate.type === 'STEP_ACTIVITY' && isSameDay(candidate.occurredAt, today),
      );
      if (existing) {
        const had = (existing.metadata as StepMetadata).steps ?? 0;
        if (newSteps > had) {
          const updated: HealthEvent<StepMetadata> = {
            ...(existing as HealthEvent<StepMetadata>),
            occurredAt: today.toISOString(),
            metadata: { ...(existing.metadata as StepMetadata), steps: newSteps },
          };
          if (isSupabaseConfigured && session) await remoteRepository.replaceEvent(updated);
          await repository.replaceEvent(updated);
          setEvents((current) =>
            current.map((candidate) => (candidate.id === existing.id ? updated : candidate)),
          );
        }
      } else {
        await recordEvent(event);
      }
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

  const setGymHere = async () => {
    setGymBusy(true);
    setGymError(null);
    try {
      const here = await readCurrentLocation();
      await repository.saveGymLocation(here);
      setGym(here);
    } catch (cause) {
      setGymError(errorMessage(cause, 'Could not read your location.'));
    } finally {
      setGymBusy(false);
    }
  };

  const clearGym = async () => {
    await repository.clearGymLocation();
    setGym(null);
    setGymError(null);
  };

  /** Saves the list, then makes the OS schedule match it. */
  const commitReminders = async (next: Reminder[]) => {
    setReminders(next);
    await repository.saveReminders(next);
    await syncScheduledReminders(next);
  };

  const addReminder = async (draft: {
    label: string;
    hour: number;
    minute: number;
    days: Weekday[];
  }) => {
    // Ask the first time someone actually wants an alert, not at launch.
    if (reminderPermission !== 'granted') {
      setReminderPermission(await requestReminderPermission());
    }
    await commitReminders([
      ...reminders,
      {
        id: newId(),
        label: normalizeReminderLabel(draft.label),
        hour: draft.hour,
        minute: draft.minute,
        days: draft.days,
        enabled: true,
      },
    ]);
  };

  const toggleReminder = (id: string) => {
    void commitReminders(
      reminders.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item)),
    );
  };

  const removeReminder = (id: string) => {
    void commitReminders(reminders.filter((item) => item.id !== id));
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
        setForcedTrophies(null);
        setUnlockQueue([]);
        setSeenAchievements(new Set());
        seenEverStored.current = false;
        await repository.clear();
      })
      .catch(() => setError('Could not sign out.'));
  };

  // Trophies are derived from history, never stored — see `earnedTrophies`.
  // A dev override replaces the whole set, gated on the dev account like the
  // other overrides.
  //
  // ABOVE the early returns below, and deliberately so: hooks must run in the
  // same order on every render, and a `useMemo` placed after them only ran once
  // a pet existed — which is what broke the app with "rendered more hooks than
  // during the previous render". `isDevAccount` is recomputed here rather than
  // reusing the `isDev` const, which is itself declared below those returns.
  const trophiesNow: readonly TrophyId[] = useMemo(() => {
    const forced = isDevAccount(session?.user.email) ? forcedTrophies : null;
    if (forced === 'all') return TROPHY_IDS;
    if (forced === 'none') return [];
    if (forced) return [forced];
    return earnedTrophies(events, profile, now);
  }, [session, forcedTrophies, events, profile, now]);

  // Everything earned, badges and trophies, in display order. Above the early
  // returns for the same reason `trophiesNow` is.
  const achievementsNow: readonly AchievementId[] = useMemo(
    () => earnedAchievements({ events, pet, trophies: trophiesNow, today: now }),
    [events, pet, trophiesNow, now],
  );

  // Announce what is newly earned. Only once the data is in (otherwise an empty
  // event list would "seed" nothing and the real history would then pop
  // everything), and only the additions since the stored set — the stored set
  // is then extended so each unlock is shown exactly once.
  useEffect(() => {
    if (!dataReady || seenAchievements === null) return;

    // First run on this device: record what is already earned, silently, and
    // do it whether or not that is anything. This used to happen only when the
    // first pass found something new — so on a fresh account (nothing earned
    // yet) nothing was stored, the seed never "happened", and the very first
    // real unlock was then swallowed as the seed instead of announced.
    if (!seenEverStored.current) {
      seenEverStored.current = true;
      const seeded = new Set(achievementsNow);
      setSeenAchievements(seeded);
      void repository.saveSeenAchievements([...seeded]).catch(() => undefined);
      return;
    }

    const fresh = newlyUnlocked(achievementsNow, seenAchievements);
    if (fresh.length === 0) return;
    const next = new Set([...seenAchievements, ...fresh]);
    setSeenAchievements(next);
    void repository.saveSeenAchievements([...next]).catch(() => undefined);
    setUnlockQueue((queue) => [...queue, ...fresh]);
    // `repository` is a stable module-level instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady, achievementsNow, seenAchievements]);

  /** Dev: forget what has been shown, so every earned unlock pops again. */
  const replayAchievements = () => {
    seenEverStored.current = true;
    setSeenAchievements(new Set());
    void repository.saveSeenAchievements([]).catch(() => undefined);
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
          personality={personality}
          onPersonalityChange={setPersonality}
          stepGoal={stepGoal}
          onStepGoalChange={setStepGoal}
          profile={profile}
          onUpdate={updateProfile}
          onSetUnits={setMeasurementSystem}
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
  // A forced cue (dev-only) wins over the sensors, the same way a forced status
  // wins over the pet's real stats above.
  const activeForcedAmbient = isDev ? forcedAmbient : null;
  const walkingNow = activeForcedAmbient ? activeForcedAmbient === 'walking' : walkingState.walking;
  const atGymNow = activeForcedAmbient ? activeForcedAmbient === 'gym' : gymState.atGym;

  return (
    <NavigationContainer theme={navigationTheme}>
      <StatusBar barStyle="dark-content" />
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Dashboard">
          {({ navigation }) => (
            <DashboardScreen
              pet={livePet}
              events={events}
              reaction={reaction}
              careToast={toast}
              onLogMeal={() => navigation.navigate('MealCapture')}
              onLogWorkout={() => navigation.navigate('Workout')}
              onSyncSteps={() => void syncSteps()}
              onTrainMind={() => navigation.navigate('MindGym')}
              onOpenProfile={() => navigation.navigate('Profile')}
              onOpenStats={() => navigation.navigate('PetStats')}
              onOpenToday={() => navigation.navigate('Today')}
              onOpenFriends={isOnline ? () => navigation.navigate('Friends') : undefined}
              isWalking={walkingNow}
              atGym={atGymNow}
              trophies={trophiesNow}
              accountInitial={session?.user.email?.charAt(0)}
              pets={pets.map((candidate) => ({
                id: candidate.id,
                name: candidate.name,
                own: isOwnPet(candidate, userId),
              }))}
              activePetId={pet.id}
              onSelectPet={(petId) => {
                setActivePetId(petId);
                // Members, care log and invite all belong to one pet, so they are
                // refetched for whichever is now on screen.
                if (isSupabaseConfigured && session) void refreshShared();
              }}
              interaction={interaction}
              partnerName={shared ? partnerName : undefined}
              celebration={celebration}
              onCelebrationComplete={() => setCelebration(null)}
              achievementUnlock={
                unlockQueue.length > 0
                  ? { id: unlockQueue[0], trainingDaysPerWeek: profile.trainingDaysPerWeek }
                  : null
              }
              onAchievementUnlockComplete={() => setUnlockQueue((queue) => queue.slice(1))}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Profile">
          {({ navigation, route }) => (
            <ProfileScreen
              openJoin={route.params?.join === true}
              achievements={achievementsNow}
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
              reminders={{
                items: reminders,
                permission: reminderPermission,
                onAdd: addReminder,
                onToggle: toggleReminder,
                onRemove: removeReminder,
              }}
              gym={
                Platform.OS === 'web'
                  ? undefined
                  : {
                      saved: gym !== null,
                      busy: gymBusy,
                      error: gymError,
                      onSetHere: () => void setGymHere(),
                      onClear: () => void clearGym(),
                    }
              }
              carePartner={
                isOnline
                  ? {
                      petName: pet.name,
                      selfUserId: userId,
                      isOwnPet: isOwnPet(pet, userId),
                      canJoin: canJoinAnotherPet(pets, userId),
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
        <RootStack.Screen name="Today">
          {({ navigation }) => (
            <TodayScreen
              pet={livePet}
              events={events}
              profile={profile}
              stepGoal={stepGoal}
              onStepGoalChange={setStepGoal}
              onTrainMind={() => navigation.navigate('MindGym')}
              onOpenWordPuzzle={() => navigation.navigate('WordPuzzle')}
              onOpenProfile={() => navigation.navigate('Profile')}
              onClose={() => navigation.goBack()}
              careDiary={careDiary}
              onRefresh={isOnline && shared ? refreshShared : undefined}
              forcedAilment={isDev ? forcedAilment : undefined}
              onForceAilment={isDev ? setForcedAilment : undefined}
              forcedForm={isDev ? forcedForm : undefined}
              onForceForm={isDev ? setForcedForm : undefined}
              onSeedTestData={isDev ? () => void seedTestData() : undefined}
              onClearSeededData={isDev ? () => void clearSeededData() : undefined}
              isSeeding={isSeeding}
              forcedAmbient={isDev ? forcedAmbient : undefined}
              onForceAmbient={isDev ? setForcedAmbient : undefined}
              forcedTrophies={isDev ? forcedTrophies : undefined}
              onForceTrophies={isDev ? setForcedTrophies : undefined}
              onReplayAchievements={isDev ? replayAchievements : undefined}
              ambientDebug={
                isDev
                  ? {
                      walkingPermission: walkingState.permission,
                      steps: walkingState.steps,
                      gymPermission: gymState.permission,
                      gymSaved: gym !== null,
                      distance: gymState.distance,
                    }
                  : undefined
              }
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
                onFeedStart={interaction.startFeeding}
                onAnalyzingChange={(analyzing) =>
                  analyzing ? interaction.startAnalyzing() : interaction.stopAnalyzing()
                }
                onClose={() => navigation.goBack()}
              />
            )}
          </RootStack.Screen>
          <RootStack.Screen name="Workout">
            {({ navigation }) => (
              <WorkoutScreen
                weightUnit={profile.weightUnit}
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
