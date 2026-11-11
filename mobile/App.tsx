import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Jersey10_400Regular, useFonts } from '@expo-google-fonts/jersey-10';
import { ActivityIndicator, Alert, AppState, Platform, StatusBar, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
  createNavigationContainerRef,
  type NavigationState,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import { AppearanceContext, useAppearance, useAppearanceState } from './src/appearance';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { Session } from '@supabase/supabase-js';
import {  assessCondition, birthYearToSave, withCurrentAge, buildDailyRecap, dayGoals,CARE_AREAS, type CareArea, buildLifeContext, newPersonalRecords, toCompanionEvent, withMeasurementSystem, type MeasurementSystem, type WorkoutTemplate, removeTemplate, upsertTemplate, measurementSystemOf, waterMlOf, lastSetsByExercise, repeatableMeals, loggedFoodNames, liveEvents, markRemoved, restoreRemoved, liftingUnit, weighIns, type WeightMetadata, copyableSlot, MEAL_SLOT_LABEL, type MealSlot, type BodyProfile, type PetBreed, type BrainTrainingMetadata, type CareLogEntry, type HealthEvent, type MealMetadata, type HydrationMetadata, waterReachesGoal, PROFILE_SURVEY_DEFAULTS, PetHealthEngine, type ForcedPetForm, type ForcedPetStatus, type PetInvite, type PetMember, type PetPersonality, type PersonalityDials, type PetReaction, type PetState, type PetVoice, type CareToast, careToast, type Reminder, type ScreenTimeMetadata, type StepMetadata, SupabaseRepository, type WorkoutMetadata, type Weekday, type TrophyId, TROPHY_IDS, earnedTrophies, type AchievementId, earnedAchievements, newlyUnlocked, DECAY_TICK_MS, activeMembers, applyForcedAilment, canJoinAnotherPet, isOwnPet, applyForcedForm, applyTimeDecay, createPet, errorMessage, getSession, inviteErrorMessage, isDevAccount, setDevFreezeGrant, scheduleDayOn, reconcileSchedule, type TrainingSchedule, isSharedPet, memberDisplayName, mergeCareDiary, newId, normalizeReminderLabel, proposalProblem, onAuthStateChange, partnerEntriesSince, setIdGenerator, signOut, toDateKey, isSameDay, applyDelta, withSurveyDefaults, chooseForm, type PetForm, breedSwitchCost, switchBreed, ownedBreedsOf, coinsOf, BREED_CHANGE_COST, NotEnoughCoinsError, generateSeedEvents, SEED_SOURCE, normalizeUsername, usernameError, type companion} from '@vitto/core';
import { type WordPuzzleProgress, LocalRepository } from './src/services/localRepository';
import { billingService } from './src/services/billingService';
import { listenForAuthLinks } from './src/services/authLinks';
import { loadAffirmationsEnabled, saveAffirmationsEnabled, syncAffirmations } from './src/services/affirmations';
import { loadMusicEnabled, pauseMusic, playMusic, saveMusicEnabled } from './src/services/music';
import { discardVoice, preparePreviews, previewVoice, voiceOf, isVoiceReady, loadVoiceEnabled, prepareVoice, saveVoiceEnabled, speakAsPet, stopPetVoice, VOICE_DOWNLOAD_BYTES } from './src/services/petVoice';
import { careConflictMessage, commitCareMomentForAll, stepSyncTopUp } from './src/services/careMoment';
import { applySharedRefresh, newestOccurredAt } from './src/services/sharedRefresh';
import { saveWithRetry } from './src/services/saveWithRetry';
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
import { AuthScreen, HAS_SIGNED_IN_KEY } from './src/screens/AuthScreen';
import { clearOnboardingDraft, loadOnboardingDraft, saveOnboardingDraft, type OnboardingProgress } from './src/services/onboardingDraft';
import { TourProvider, petSwitchTip, tourSteps } from './src/tour/FirstRunTour';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { detectLevelUp } from './src/celebrations/detectLevelUp';
import type { CelebrationEvent } from './src/celebrations/types';
import {
  type NotificationPermission,
  reminderPermissionStatus,
  requestReminderPermission,
  syncScheduledReminders,
} from './src/services/reminders';
import { cancelWeeklyRecap, forgetThisDevice, installNotificationHandler, scheduleWeeklyRecap, onNotificationTap, registerForPush, setPushEnabled as setDevicePush } from './src/services/pushService';
import { canShowIsland, clearPetIsland, islandSignature, syncPetIsland } from './src/services/petIsland';
import { buildWidgetSnapshot, clearPetWidget, drainWidgetWater, syncPetWidget } from './src/services/petWidget';
import { clearWorkoutDraft } from './src/services/workoutDraft';
import { UndoToast, type UndoOffer } from './src/components/UndoToast';
import { logName } from './src/screens/ActivityHistoryScreen';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
import { ProfileScreen } from './src/screens/ProfileScreen';
import { PetStatsScreen } from './src/screens/PetStatsScreen';
import { ShareCardScreen } from './src/screens/ShareCardScreen';
import { FriendsScreen } from './src/screens/FriendsScreen';
import { FriendPetScreen } from './src/screens/FriendPetScreen';
import { type ForcedTrophies, TodayScreen } from './src/screens/TodayScreen';
import { MealCaptureScreen } from './src/screens/MealCaptureScreen';
import { FourCornersScreen } from './src/screens/FourCornersScreen';
import { CompanionChatScreen, proposalTitle } from './src/screens/CompanionChatScreen';
import { CompanionDebugScreen } from './src/screens/CompanionDebugScreen';
import { companionService, loadCompanionTier, type CompanionProposal } from './src/services/companionService';
import { PetJeopardyScreen } from './src/screens/PetJeopardyScreen';
import { MindGymScreen } from './src/screens/MindGymScreen';
import { PlusScreen } from './src/screens/PlusScreen';
import { ChooseCompanionScreen } from './src/screens/ChooseCompanionScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { PreferencesScreen } from './src/screens/PreferencesScreen';
import { friendsService } from './src/services/friendsService';
import { EditProfileScreen } from './src/screens/EditProfileScreen';
import { ScreenTimeScreen } from './src/screens/ScreenTimeScreen';
import { RemindersScreen } from './src/screens/RemindersScreen';
import { AppleHealthScreen } from './src/screens/AppleHealthScreen';
import { ActivityHistoryScreen } from './src/screens/ActivityHistoryScreen';
import { EditMealScreen } from './src/screens/EditMealScreen';
import { WeightScreen } from './src/screens/WeightScreen';
import { WeeklyRecapScreen } from './src/screens/WeeklyRecapScreen';
import { LiftProgressScreen } from './src/screens/LiftProgressScreen';
import { FoodTrendsScreen } from './src/screens/FoodTrendsScreen';
import { StepTrendsScreen } from './src/screens/StepTrendsScreen';
import { PersonalityScreen } from './src/screens/PersonalityScreen';
import { CompanionMemoriesScreen } from './src/screens/CompanionMemoriesScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { CareAreasScreen } from './src/screens/CareAreasScreen';
import { DeleteAccountScreen } from './src/screens/DeleteAccountScreen';
import { APPEARANCE_LABEL, AppearanceScreen } from './src/screens/AppearanceScreen';
import { PetVoiceScreen } from './src/screens/PetVoiceScreen';
import { WordPuzzleScreen } from './src/screens/WordPuzzleScreen';
import { WorkoutScreen } from './src/screens/WorkoutScreen';
import { deviceMeasurementSystem } from './src/services/deviceLocale';
import { hasNativeUUID, randomUUID } from './src/services/uuid';
import { lockWebViewport } from './src/web/lockWebViewport';
import { colors, fonts, getColorScheme, layout, setActiveColorScheme, themedStyles } from './src/theme';

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
/** The stock line for the day's step goal; the companion's own line replaces it when online. */
const STEP_GOAL_LINE = 'We hit our step goal today! I loved every step of it.';

/** Set once Apple Health is connected on this phone, so later launches reconnect quietly. */
const HEALTH_CONNECTED_KEY = 'vitto.appleHealthConnected';
/** How often steps re-sync while the app is open. */
const STEP_AUTO_SYNC_MS = 5 * 60 * 1000;
/** How long one step read may take before it is abandoned (see syncSteps). */
const STEP_SYNC_TIMEOUT_MS = 20_000;
/** How many days before today get their step count put right (see correctPastSteps). */
const PAST_STEP_DAYS = 7;

/** The age sign-up stored (see checkBirthYear), if it is a sane one. */
const signUpAge = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 13 && value <= 120 ? value : undefined;

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
  // The body profile form -- about you, goal, training -- pushed from Profile's top bar.
  Settings: { from?: 'Pet' } | undefined;
  // A drill-down off the dashboard, so it pushes rather than presenting as a modal.
  PetStats: undefined;
  // The pet as one shareable image. Pushed from PetStats' top bar.
  ShareCard: undefined;
  // Reached from the dashboard's account menu. `join` opens the care-partner
  // code field straight away (the card moved here from Profile).
  Friends: { join?: boolean } | undefined;
  // The full ordered accepted-friends list, so the sequential browser can move
  // between friends without going back to `FriendsScreen`.
  FriendPet: { friendUserId: string; friendUserIds: string[] };
  // The day's detail — nutrition, care, movement, mind — which used to sit under
  // the pet. Pushed like PetStats, so the dashboard stays the pet and nothing else.
  Today: undefined;
  // Talking to the pet. Pushed from the message button on the dashboard.
  Companion: undefined;
  // DEV ONLY, reached from Today's dev panel: what the pet is about to be told.
  CompanionDebug: undefined;
  // Vitto Plus: the perks and (test mode) the purchase. From Settings and the chat's limit.
  Plus: undefined;
  // Switching the pet's animal, for coins. Pushed from Settings.
  ChooseCompanion: undefined;
  // Profile's own pages, each pushed from its row there.
  EditProfile: undefined;
  ScreenTime: undefined;
  Reminders: undefined;
  AppleHealth: undefined;
  ActivityHistory: undefined;
  LiftProgress: { from?: 'Today' } | undefined;
  // The Today cards' "Trends & averages".
  FoodTrends: undefined;
  StepTrends: undefined;
  // Settings' own pages, each pushed from its row there.
  Preferences: undefined;
  CareAreas: undefined;
  /** `welcome`: arrived straight from buying Plus, to choose who the pet is. */
  /** `fromTour`: opened by the first-run tour, over the main screen, so back reads as going home. */
  Personality: { welcome?: boolean; fromTour?: boolean } | undefined;
  Notifications: undefined;
  /** What the pet remembers about them, each deletable. */
  CompanionMemories: undefined;
  DeleteAccount: undefined;
  Appearance: undefined;
  /** Which voice the pet speaks in. */
  PetVoice: undefined;
  MealCapture: undefined;
  /** `cardio` opens it on the runs-and-rides list (Outdoors' "Log a run"). */
  Workout: { cardio?: boolean; editId?: string } | undefined;
  EditMeal: { id: string };
  Weight: { editId?: string } | undefined;
  WeeklyRecap: undefined;
  MindGym: undefined;
  WordPuzzle: undefined;
  // A mind game with its own full-screen play area (the pet stands in the middle
  // of it), so it is a route of its own rather than a stage inside MindGym --
  // the same call the daily word puzzle already makes.
  FourCorners: undefined;
  // Same call again: a board, a wager step and a final question do not fit as a
  // stage inside MindGym's sheet, so Pet Jeopardy is a route of its own.
  PetJeopardy: undefined;
};
const RootStack = createNativeStackNavigator<RootStackParamList>();
/** Lets a notification tap reach the navigator from outside the tree. */
const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Set once, at import: a notification can arrive before any component mounts.
installNotificationHandler();

const navigationTheme = (): NavigationTheme => ({
  ...(getColorScheme() === 'dark' ? DarkTheme : DefaultTheme),
  colors: {
    ...(getColorScheme() === 'dark' ? DarkTheme : DefaultTheme).colors,
    background: colors.paper,
    card: colors.card,
    text: colors.ink,
    border: colors.hairline,
    primary: colors.coral,
  },
});

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
/** How long typing can go on before the profile is written. */
const PROFILE_SAVE_DEBOUNCE_MS = 600;
const SAVE_TIMEOUT_MESSAGE = 'Saving timed out. Check your connection.';
/** Only a moment logged about now is worth the pet remarking on. */
const COMPANION_FRESH_MS = 6 * 60 * 60 * 1000;


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
/**
 * A yes/no the caller can await. Native gets a real `Alert`; the web build gets
 * `window.confirm`.
 *
 * The web branch is not a nicety. `Alert.alert` on react-native-web is
 * literally `static alert() {}` — an empty function — so the promise below
 * never settled and every confirming action (leaving a pet, deleting an
 * account) looked like a dead button. `window.confirm` cannot show a custom
 * button label, so the label is folded into the prompt text instead.
 */
const confirmDialog = (title: string, message: string, confirmLabel: string, destructive = true): Promise<boolean> => {
  if (Platform.OS === 'web') {
    const ask = typeof window !== 'undefined' ? window.confirm : undefined;
    // No `confirm` at all (SSR, a locked-down embed): refuse rather than
    // silently treating it as agreement.
    if (!ask) return Promise.resolve(false);
    return Promise.resolve(ask(`${title}\n\n${message}\n\nOK to ${confirmLabel.toLowerCase()}.`));
  }
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
};

/**
 * The app, in the appearance the user picked. The scheme is set before
 * anything below renders, so every colour read and every themed sheet in this
 * pass answers in it; see `setActiveColorScheme`.
 */
/** More newly earned achievements than this at once are recorded quietly (see the announcer). */
const MAX_ANNOUNCED_AT_ONCE = 3;

export default function App() {
  // The pet world's pixel face (fonts.pixel). Nothing waits on it: text falls
  // back to the platform font for the moment it takes to load.
  useFonts({ Jersey10_400Regular });
  const appearance = useAppearanceState();
  setActiveColorScheme(appearance.scheme);
  return (
    <AppearanceContext.Provider value={appearance}>
      <VittoApp />
    </AppearanceContext.Provider>
  );
}

function VittoApp() {
  const { scheme, preference, setPreference } = useAppearance();
  const statusBarStyle = scheme === 'dark' ? 'light-content' : 'dark-content';
  // Where the user is, kept so the navigator can re-mount in a new scheme
  // (every screen then re-reads its styles) without losing their place.
  const navigationState = useRef<NavigationState | undefined>(undefined);
  const [session, setSession] = useState<Session | null>(null);
  // Dev tool, display only — see `applyForcedAilment`. Never persisted, and reset
  // by a sign-out along with the rest of the session's state.
  const [forcedAilment, setForcedAilment] = useState<ForcedPetStatus | null>(null);
  // Same deal for which form is drawn — display only, never persisted.
  const [forcedForm, setForcedForm] = useState<ForcedPetForm | null>(null);
  // Dev-only: put trophies on the shelf without the month of logging.
  const [forcedTrophies, setForcedTrophies] = useState<ForcedTrophies | null>(null);
  // Dev-only: streak freezes to test with, granted as of a week ago so a day
  // missed this week shows one spent. Never saved (see setDevFreezeGrant).
  const [forcedFreezes, setForcedFreezes] = useState<number | null>(null);
  const forceFreezes = useCallback((count: number | null) => {
    setDevFreezeGrant(count ? { count, from: new Date(Date.now() - 7 * 86_400_000) } : null);
    setForcedFreezes(count);
  }, []);

  /**
   * Personal reminders ("take creatine at 8am"). Device-local: the list lives
   * in AsyncStorage and the OS owns the alarms, so
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
  /** Saved workout routines — device-local, like reminders. */
  const [workoutTemplates, setWorkoutTemplates] = useState<WorkoutTemplate[]>([]);
  // The routines in order, looped, with rest days: what today is for (trainingSchedule.ts).
  const [trainingSchedule, setTrainingSchedule] = useState<TrainingSchedule | null>(null);
  /** Both loaded, so the rotation can be squared with the routines without overwriting either. */
  const [routinesReady, setRoutinesReady] = useState(false);

  /**
   * Which account the "already announced" list belongs to. Signed out is its own
   * scope rather than nobody's, so a local pet's unlocks are remembered too.
   */
  const achievementScope = session?.user.id ?? 'local';

  /**
   * Re-read on every account change, not once on mount.
   *
   * Read once, the list was seeded from whatever was on screen at launch — and
   * at launch you are signed OUT, so it seeded from an empty history. Signing in
   * then found every achievement the account had ever earned "new" and popped
   * the lot. Setting it back to null first is what makes the announcer wait
   * rather than compare the incoming account against the outgoing one's list.
   */
  useEffect(() => {
    let cancelled = false;
    setSeenAchievements(null);
    setUnlockQueue([]);
    seenEverStored.current = false;
    void repository
      .loadSeenAchievements(achievementScope)
      .then((stored) => {
        if (cancelled) return;
        seenEverStored.current = stored !== null;
        setSeenAchievements(new Set(stored ?? []));
      })
      .catch(() => {
        if (!cancelled) setSeenAchievements(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [achievementScope]);
  useEffect(() => {
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
  /** Which pet is on screen, for async work that must not land on the other one. */
  const petOnScreen = useRef<string | null>(null);
  petOnScreen.current = pet?.id ?? null;
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
  // Everything logged, removed entries included (see removedEvents): the engine
  // reads this, so the meal-XP cap still counts a meal that was taken back.
  // Screens get `events`, the live ones only.
  const [eventLog, setEvents] = useState<HealthEvent[]>([]);
  const events = useMemo(() => liveEvents(eventLog), [eventLog]);
  // For Undo, which runs seconds later than the render that offered it.
  const eventLogRef = useRef(eventLog);
  eventLogRef.current = eventLog;
  const [undoOffer, setUndoOffer] = useState<UndoOffer | null>(null);
  /** Each exercise's sets from last time, for the workout screen's Previous column. */
  const lastSets = useMemo(() => lastSetsByExercise(events), [events]);
  /** Meals to log again in a tap, at the top of the meal sheet. */
  // More than the screen lists: it leads with the meal being logged (forSlot), then trims.
  const mealsToRepeat = useMemo(() => repeatableMeals(events, new Date(), 20), [events]);
  const knownFoods = useMemo(() => loggedFoodNames(events), [events]);
  const [profile, setProfile] = useState<BodyProfile>(DEFAULT_PROFILE);
  // The unit they lift in, which can differ from their profile's (see liftingUnit).
  const liftUnit = useMemo(() => liftingUnit(events, profile.weightUnit), [events, profile.weightUnit]);
  const [reaction, setReaction] = useState<PetReaction | null>(null);
  const [toast, setToast] = useState<CareToast | null>(null);
  /**
   * Things the pet has said unprompted and that have not been read yet. Only the
   * count is kept: the messages themselves are stored by the edge function and
   * read in the conversation, and putting several sentences on the pet's plaque
   * buried the scene behind them.
   */
  const [unreadCompanion, setUnreadCompanion] = useState(0);
  // What the pet last said unprompted, for the bubble on the home screen. The
  // id is what lets the bubble tell a new message from a re-render of an old one.
  const [companionSaid, setCompanionSaid] = useState<{ id: string; text: string } | null>(null);
  /** True while the pet is being asked what it thinks of something just logged. */
  const [awaitingPetLine, setAwaitingPetLine] = useState(false);
  /** Something said to the pet out loud, its reply not back yet (see talkToPet). */
  const [talkingToPet, setTalkingToPet] = useState(false);
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
  const [personality, setPersonality] = useState<PetPersonality>('sweet');
  const [persona, setPersona] = useState('');
  const [dials, setDials] = useState<PersonalityDials | undefined>(undefined);
  // Personalities are a Plus feature. Loaded per account; the dev account counts
  // as Plus. Only decides what the app shows -- the edge functions enforce the
  // tier themselves, whatever the app sends.
  const [companionTier, setCompanionTier] = useState<'free' | 'plus'>('free');
  useEffect(() => {
    if (!session) {
      setCompanionTier('free');
      return;
    }
    if (isDevAccount(session.user.email)) {
      setCompanionTier('plus');
      return;
    }
    let cancelled = false;
    void loadCompanionTier().then((tier) => {
      if (!cancelled) setCompanionTier(tier);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user.id, session?.user.email]);
  const canCustomise = companionTier === 'plus';
  // Character changes left this month, from the server (it caps them at 30).
  // Null: not known, or not limited (the dev account) -- nothing is shown.
  const [personalityChangesLeft, setPersonalityChangesLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!pet?.id || !session || !isSupabaseConfigured || isDevAccount(session.user.email)) {
      setPersonalityChangesLeft(null);
      return;
    }
    let cancelled = false;
    void remoteRepository
      .personalityChangesLeft(pet.id)
      .then((left) => {
        if (!cancelled) setPersonalityChangesLeft(left);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pet?.id, session?.user.id]);
  // null until the server has answered; Settings hides the control until then.
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  /** The pet's affirmations (local notifications). Null where notifications cannot work (web). */
  const [affirmationsEnabled, setAffirmationsEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void loadAffirmationsEnabled().then(setAffirmationsEnabled);
  }, []);
  // Keeps the queue topped up: on launch, when the toggle or the pet's name
  // changes, and once notifications are allowed.
  const affirmingPetId = pet?.id;
  const affirmingPetName = pet?.name;
  // The Sunday recap, named for the pet; only scheduled where notifications are on.
  useEffect(() => {
    if (pet?.name) void scheduleWeeklyRecap(pet.name);
  }, [pet?.name]);
  useEffect(() => {
    if (affirmationsEnabled === null || !affirmingPetId || !affirmingPetName) return;
    void syncAffirmations({ enabled: affirmationsEnabled, petId: affirmingPetId, petName: affirmingPetName });
  }, [affirmationsEnabled, affirmingPetId, affirmingPetName, reminderPermission]);
  // The background music. On until switched off; plays only while the app is on
  // screen, and picks up where it stopped when it comes back.
  const [musicEnabled, setMusicEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    void loadMusicEnabled().then(setMusicEnabled);
  }, []);
  useEffect(() => {
    if (!musicEnabled) {
      pauseMusic();
      return;
    }
    // On a cold launch iOS can still report 'unknown' or 'inactive' here, and
    // the 'active' change may already have fired before this listener exists:
    // waiting for it left the music silent until something nudged the app
    // state. Only a backgrounded app stays quiet.
    if (AppState.currentState !== 'background') void playMusic();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void playMusic();
      else pauseMusic();
    });
    return () => {
      foreground.remove();
      pauseMusic();
    };
  }, [musicEnabled]);
  // The pet's voice: what goes up in the room's bubble is said out loud. Off
  // until switched on, since on means downloading the model; quiet the moment
  // the app leaves the screen.
  const [voiceEnabled, setVoiceEnabled] = useState<boolean | null>(null);
  /** The download, 0-1, while it runs; or why it failed. */
  const [voiceProgress, setVoiceProgress] = useState<number | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const getVoiceReady = (sayHello = false) => {
    setVoiceError(null);
    if (!isVoiceReady()) setVoiceProgress(0);
    void prepareVoice(setVoiceProgress, pet ?? undefined)
      // Just switched on: the pet says hello, so they know it worked.
      .then(() => {
        if (sayHello && pet) void speakAsPet(`Hi! It's me, ${pet.name}. Can you hear me?`, pet);
      })
      .catch((cause: unknown) => setVoiceError(errorMessage(cause, 'The voice did not download. Try again on Wi-Fi.')))
      .finally(() => setVoiceProgress(null));
  };
  useEffect(() => {
    void loadVoiceEnabled().then((on) => {
      setVoiceEnabled(on);
      // Switched on before, and the model is missing (or just not loaded yet).
      if (on) getVoiceReady();
    });
  }, []);
  // The voice is Plus. Switched on and then lapsed, it stays quiet (the model
  // stays too, so coming back to Plus is not another download).
  const voiceActive = voiceEnabled === true && canCustomise;
  useEffect(() => {
    if (!voiceActive) {
      stopPetVoice();
      return;
    }
    const leaving = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stopPetVoice();
    });
    return () => leaving.remove();
  }, [voiceActive]);
  // Each new line in the bubble, said once. Not the "…" while it thinks, and
  // not an error, which is ours, not the pet's.
  const voicePetId = pet?.id;
  const voicePetVoice = pet?.voice;
  useEffect(() => {
    if (!voiceActive || !voicePetId || !companionSaid) return;
    if (companionSaid.id.startsWith('listening-') || companionSaid.id.startsWith('talk-error-')) return;
    void speakAsPet(companionSaid.text, { id: voicePetId, voice: voicePetVoice });
    // Not on a voice change: that is not a new line to say.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companionSaid, voiceActive, voicePetId]);
  // The Dynamic Island. On until switched off; the choice is kept on the device.
  const [islandEnabled, setIslandEnabled] = useState(true);
  useEffect(() => {
    void repository.loadIslandEnabled().then((stored) => { if (stored !== null) setIslandEnabled(stored); });
  }, []);
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
  /** Whether the open mind game has logged a session; see `closeMindGame`. */
  const mindLogged = useRef(false);
  const interaction = usePetInteraction({
    onMunch: playMunchSound,
    onEatingFinished: playCelebrationSound,
  });
  const [isAppleHealthConnected, setIsAppleHealthConnected] = useState(false);
  const stepSyncInFlight = useRef(false);
  /** The day the week before it was last put right from Apple Health (see correctPastSteps). */
  const pastStepsCorrectedOn = useRef<string | null>(null);
  const [isSyncingAppleHealth, setIsSyncingAppleHealth] = useState(false);
  // Android only: whether Settings → Usage access has been granted. Re-read on
  // every return to the foreground, since granting it happens in Settings.
  const [hasScreenTimeAccess, setHasScreenTimeAccess] = useState(() => hasUsageAccess());
  const [isSyncingScreenTime, setIsSyncingScreenTime] = useState(false);
  // The clock the decay projection is read against. Stored state, not `new Date()`
  // inline, so a tick is what re-renders the pet rather than an unrelated update.
  const [now, setNow] = useState(() => new Date());

  const userId = session?.user.id ?? 'demo-user';

  /**
   * Onboarding part way through, kept on the phone (see onboardingDraft) so
   * closing the app does not start it over. `undefined` until it has been
   * looked for; onboarding is not shown before then, or it would open on the
   * first page and jump.
   */
  const [onboardingResume, setOnboardingResume] = useState<OnboardingProgress | null | undefined>(undefined);
  const onboardingProgress = useRef<OnboardingProgress | null>(null);
  const [onboardingTick, setOnboardingTick] = useState(0);
  const needsOnboarding = dataReady && !pet;
  useEffect(() => {
    setOnboardingResume(undefined);
    onboardingProgress.current = null;
  }, [userId]);
  useEffect(() => {
    if (!needsOnboarding || onboardingResume !== undefined) return;
    let cancelled = false;
    void loadOnboardingDraft(userId).then((draft) => {
      if (cancelled) return;
      if (draft) {
        setName(draft.name);
        setBreed(draft.breed);
        setPersonality(draft.personality);
        setPersona(draft.persona);
        setDials(draft.dials);
        // Over what the server had: the draft is the newer of the two.
        setProfile((current) => withSurveyDefaults({ ...current, ...draft.profile }));
        onboardingProgress.current = draft.progress;
      }
      setOnboardingResume(draft?.progress ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [needsOnboarding, onboardingResume, userId]);
  const saveDraftNow = () => {
    const progress = onboardingProgress.current;
    if (!needsOnboarding || onboardingResume === undefined || !progress) return;
    void saveOnboardingDraft(userId, { version: 1, progress, name, breed, personality, persona, dials, profile });
  };
  const saveDraftRef = useRef(saveDraftNow);
  saveDraftRef.current = saveDraftNow;
  // Saved a moment after each change, and at once when the app is put away:
  // closing the app goes through the background first.
  useEffect(() => {
    const timer = setTimeout(() => saveDraftRef.current(), 300);
    return () => clearTimeout(timer);
  }, [onboardingTick, name, breed, personality, persona, dials, profile]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') saveDraftRef.current();
    });
    return () => subscription.remove();
  }, []);
  /**
   * The first-run tour of the main screen (see FirstRunTour): shown once per
   * account on this phone, after adoption, and remembered when finished or
   * skipped. Existing accounts see it once too.
   */
  const tourKey = `vitto.tourDone.${userId}`;
  /** Null until it is known: the achievement announcer waits on it (see below). */
  const [tourPending, setTourPending] = useState<boolean | null>(null);
  useEffect(() => {
    if (!dataReady || !pet) return;
    let cancelled = false;
    void AsyncStorage.getItem(tourKey)
      .then((value) => {
        if (!cancelled) setTourPending(value !== '1');
      })
      .catch(() => {
        if (!cancelled) setTourPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dataReady, Boolean(pet), tourKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const finishTour = () => {
    setTourPending(false);
    void AsyncStorage.setItem(tourKey, '1').catch(() => undefined);
  };

  /**
   * The first time there are two pets (a care partner's joint pet joined, or
   * one adopted together), one tip after the tour: tap the name at the top to
   * switch. Remembered per account on this phone, like the tour.
   */
  const switchTipKey = `vitto.petSwitchTipDone.${userId}`;
  const [switchTipPending, setSwitchTipPending] = useState(false);
  const hasTwoPets = pets.length > 1;
  useEffect(() => {
    if (!hasTwoPets) return;
    let cancelled = false;
    void AsyncStorage.getItem(switchTipKey)
      .then((value) => {
        if (!cancelled) setSwitchTipPending(value !== '1');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hasTwoPets, switchTipKey]);
  const finishSwitchTip = () => {
    setSwitchTipPending(false);
    void AsyncStorage.setItem(switchTipKey, '1').catch(() => undefined);
  };

  // Adopted: the draft has done its job.
  useEffect(() => {
    if (pet) void clearOnboardingDraft(userId);
  }, [Boolean(pet), userId]); // eslint-disable-line react-hooks/exhaustive-deps
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

  // Remembered once anyone signs in here, so the next launch after a sign-out
  // opens on sign-in rather than on the first-time welcome (see AuthScreen).
  useEffect(() => {
    if (session?.user.id) void AsyncStorage.setItem(HAS_SIGNED_IN_KEY, '1').catch(() => undefined);
  }, [session?.user.id]);

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
    // A confirmation email opened on this phone signs straight in (see authLinks).
    const stopAuthLinks = listenForAuthLinks();
    return () => {
      listener.subscription.unsubscribe();
      stopAuthLinks();
    };
  }, []);

  // Local storage is async on device, so the first load happens in an effect
  // rather than in a state initialiser the way the web build could.
  useEffect(() => {
    // Not until the session is known. This effect used to run on mount with
    // `session` still null — before `getSession` had restored it — take the
    // local branch, and flip `dataReady` with an empty pet list. The moment the
    // session then landed, one render saw "ready, signed in, no pet" and drew
    // onboarding for ~100ms before the real load reset the gate. Every launch
    // flashed "Step 1 of 8" at an account that had a pet.
    if (!authReady) return;
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
        if (profileResult.status === 'fulfilled') {
          // Reset when this account has no stored profile yet, rather than
          // leaving the PREVIOUS account's name, handle, bio and body metrics on
          // screen. `loadProfile` returns null for a row that has not been
          // through onboarding, and signing into such an account used to inherit
          // whoever was signed in before.
          //
          // The username is the exception: it was chosen at sign-up and is
          // already on the profile row, but `loadProfile` drops a row that has
          // not been through onboarding. The signup metadata carries the same
          // value, so onboarding doesn't ask for it a second time.
          const signedUpAs = session.user.user_metadata?.username;
          setProfile(
            profileResult.value ??
              (typeof signedUpAs === 'string' && !usernameError(signedUpAs)
                ? { ...DEFAULT_PROFILE, username: normalizeUsername(signedUpAs) }
                : DEFAULT_PROFILE),
          );
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
      // Aged from its birth year, as the remote load does (see withCurrentAge).
      if (storedProfile) setProfile(withCurrentAge(withSurveyDefaults({ ...DEFAULT_PROFILE, ...storedProfile })));
      setMembers([]);
      setCareLog([]);
      setInvite(null);
      lastSeenCareLogAt.current = null;
      setDataReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, session, reloadToken]);

  /**
   * Workout routines, with the account when signed in. They used to live only
   * on the phone, so signing out (which wipes the phone's copy), a reinstall or
   * a new phone lost them. Signed in, the account's list wins; an account that
   * has never saved any keeps this phone's and uploads them, so nobody loses
   * routines made before they were synced. Offline, the phone's copy stands in.
   */
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    void (async () => {
      setRoutinesReady(false);
      const onPhone = await repository.loadWorkoutTemplates().catch(() => [] as WorkoutTemplate[]);
      const scheduleOnPhone = await repository.loadTrainingSchedule().catch(() => null);
      if (!(isSupabaseConfigured && session)) {
        if (cancelled) return;
        setTrainingSchedule(scheduleOnPhone);
        setWorkoutTemplates(onPhone);
        setRoutinesReady(true);
        return;
      }
      // The account's rotation wins when it has a say; undefined leaves the phone's.
      const scheduleInAccount = await remoteRepository.loadTrainingSchedule().catch(() => undefined);
      if (cancelled) return;
      setTrainingSchedule(scheduleInAccount === undefined ? scheduleOnPhone : scheduleInAccount);
      if (scheduleInAccount !== undefined) void repository.saveTrainingSchedule(scheduleInAccount).catch(() => undefined);
      let inAccount: WorkoutTemplate[] | null | undefined;
      try {
        inAccount = await remoteRepository.loadWorkoutTemplates();
      } catch {
        inAccount = undefined;
      }
      if (cancelled) return;
      if (inAccount === undefined) {
        setWorkoutTemplates(onPhone);
      } else if (inAccount === null) {
        setWorkoutTemplates(onPhone);
        if (onPhone.length > 0) void remoteRepository.saveWorkoutTemplates(onPhone).catch(() => undefined);
      } else {
        setWorkoutTemplates(inAccount);
        void repository.saveWorkoutTemplates(inAccount).catch(() => undefined);
      }
      setRoutinesReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // The account, not the session object: a token refresh is not a new person.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, session?.user.id]);

  const persistProfile = async (edited: BodyProfile) => {
    // The birth year follows an edited age, so the age keeps going up from it.
    const next = { ...edited, birthYear: birthYearToSave(edited) };
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

  /**
   * Profile writes are coalesced: the survey saved on every keystroke, so one
   * pass through onboarding was a dozen PATCHes and typing "28" into Age was
   * two. State updates immediately (the UI never waits); only the save trails,
   * and any pending save is flushed when the profile is next read back.
   */
  const profileSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProfile = useRef<BodyProfile | null>(null);
  const flushProfileSave = () => {
    if (profileSaveTimer.current) clearTimeout(profileSaveTimer.current);
    profileSaveTimer.current = null;
    const next = pendingProfile.current;
    pendingProfile.current = null;
    if (!next) return;
    if (isSupabaseConfigured && session) {
      void remoteRepository.saveProfile(next).catch(() => undefined);
    } else {
      void repository.saveProfile(next);
    }
  };
  const queueProfileSave = (next: BodyProfile) => {
    pendingProfile.current = next;
    if (profileSaveTimer.current) clearTimeout(profileSaveTimer.current);
    profileSaveTimer.current = setTimeout(flushProfileSave, PROFILE_SAVE_DEBOUNCE_MS);
  };
  useEffect(() => () => flushProfileSave(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateProfile = <K extends keyof BodyProfile>(key: K, value: BodyProfile[K]) => {
    setProfile((current) => {
      const next = { ...current, [key]: value };
      queueProfileSave(next);
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

  const refreshShared = async (target: PetState | null = pet) => {
    if (!isSupabaseConfigured || !session || !target) return;
    if (careMomentInFlight.current) {
      refreshPending.current = true;
      return;
    }
    const startedFor = session.user.id;
    const [petResult, membersResult, careLogResult, inviteResult] = await Promise.allSettled([
      // By id, not `loadPet()`: that returns the FIRST pet, which is the wrong
      // one whenever the joint pet is the one on screen.
      remoteRepository.loadPetById(target.id),
      remoteRepository.loadPetMembers(target.id),
      remoteRepository.loadCareLog(target.id),
      remoteRepository.loadOpenInvite(target.id),
    ]);
    // Signed out, or a different account, while these were in flight: the
    // results belong to nobody on screen now.
    if (sessionUserRef.current !== startedFor) return;
    // Switched to the other pet while these were in flight: they are that
    // pet's members and log no longer, and would show on the wrong card.
    if (petOnScreen.current !== target.id) return;
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
      petName: target.name,
    });
    if (outcome.kind === 'gone') {
      // This pet is no longer ours (left on another device, or the owner
      // removed us). Drop just it; the other pet, if any, carries on.
      const remaining = pets.filter((candidate) => candidate.id !== target.id);
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

  /**
   * Lets the AI companion perceive something the person just logged, then asks
   * whether it has anything to say about it.
   *
   * Strictly best-effort and never awaited by the save: the moment is already
   * recorded and the pet already fed. If this fails the only thing lost is a
   * remark. Old events are not forwarded at all — a Health backfill replays days
   * of history through `recordEvent`, and the pet reacting to each one would be
   * both nonsense and a bill.
   */
  const tellCompanion = async (event: HealthEvent<unknown>, fedPet: PetState, levelledUp: boolean) => {
    const age = Date.now() - Date.parse(event.occurredAt);
    if (!(age >= 0 && age < COMPANION_FRESH_MS)) return;
    const history = events;
    const stepsBefore = history
      .filter((past) => past.type === 'STEP_ACTIVITY' && isSameDay(past.occurredAt, new Date()))
      .reduce((most, past) => Math.max(most, (past.metadata as StepMetadata).steps ?? 0), 0);
    const perceived = toCompanionEvent(event as HealthEvent, {
      stepGoal,
      previousSteps: stepsBefore,
      personalRecords: event.type === 'WORKOUT' ? newPersonalRecords(history, event as HealthEvent, profile.weightUnit) : undefined,
      reachedWaterGoal: event.type === 'HYDRATION' ? waterReachesGoal(history, event as HealthEvent) : undefined,
    });
    if (!perceived) return;
    try {
      const life = buildLifeContext({ pet: fedPet, events: [event as HealthEvent, ...history], profile, stepGoal });
      await companionService.record(fedPet.id, life, perceived);
      if (levelledUp) await companionService.record(fedPet.id, life, { type: 'LEVEL_UP', metadata: { level: fedPet.level } });
      const { message } = await companionService.checkIn(fedPet.id, life);
      if (message) {
        setUnreadCompanion((count) => count + 1);
        setCompanionSaid({ id: message.id, text: message.content });
      }
    } catch {
      // Nothing to surface: the care moment itself succeeded.
    }
  };

  /**
   * `quiet` saves without a word: no reaction, no toast, no cheer. For a cup of
   * water short of the goal, or one taken back, where the tracker filling or
   * emptying is acknowledgement enough; and for Apple Health steps, which
   * arrive by themselves rather than because anyone did anything.
   */
  const recordEvent = async (event: HealthEvent<unknown>, { quiet = false }: { quiet?: boolean } = {}) => {
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
        commitCareMomentForAll({ pets, event, events: eventLog, profile, engine, remote }),
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
        // The pet is already written above. Retried here, same id, so a gateway
        // blip on this one row does not send the user back to "Save" and pay
        // the pet a second time (see saveWithRetry).
        await saveWithRetry(() => withTimeout(remote.saveEvent(storedEvent), SAVE_TIMEOUT_MESSAGE));
        // The partner's view of this moment: a type and a time, nothing more.
        // Best effort, and only once there is a partner to see it — the log
        // starts at pairing, so nobody inherits a history they were not part of.
        // A cup taken back is a correction, not a drink, so the partner hears
        // nothing of it.
        const takenBack = event.type === 'HYDRATION' && waterMlOf(event as HealthEvent) < 0;
        if (isSharedPet(members) && !takenBack) {
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
          current?.kind === 'levelUp'
            ? { ...current, level: Math.max(current.level, levelUp.level), coins: current.coins + levelUp.coins }
            : levelUp,
        );
      }

      // A level-up is the one thing worth taking over the screen for. A new
      // streak day used to as well, and was cut: it fired on the first log of
      // every single day, which is the most routine moment in the app, and the
      // flame on the HUD plaque already carries the count. The toast below
      // still acknowledges it.
      //
      // The celebration is the acknowledgement for a level-up, so the
      // banner/toast would only stack behind it and then flash on dismissal.
      // The pet's own remark is on its way: the bubble waits for it rather than
      // saying the stock line first and then being talked over.
      if (remote && !quiet) setAwaitingPetLine(true);
      if (!levelUp) {
        if (nextReaction && !quiet) showReaction(nextReaction);
        // Every logged moment is acknowledged, reaction or not — that is the
        // whole point of the toast being separate from the pet's mood line.
        if (!quiet) showCareToast(careToast(event, nextReaction?.delta ?? {}, nextReaction?.effects));
      }
      setEvents((current) => [storedEvent, ...current]);
      setError(null);
      // Every log gets a cheer, except steps: those sync in the background
      // and already have the pet go exploring.
      if (event.type !== 'STEP_ACTIVITY' && !quiet) interaction.celebrate();
      if (remote && !quiet) {
        void tellCompanion(storedEvent, nextPet, detectLevelUp(pet, nextPet) !== null).finally(() => setAwaitingPetLine(false));
      }
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save this care moment.'));
      throw cause;
    } finally {
      releasePetWrite();
    }
  };

  /**
   * DEV ONLY. Re-rolls the pet's temperament in place so all eight can be heard
   * without adopting a new pet. Saved exactly like a breed change — versioned,
   * one conflict retry — because it is the same column family on the same row.
   * The companion's already-drifted traits are deliberately left alone: the
   * temperament is the baseline it started from, not a reset button (the debug
   * screen's "forget everything" is the reset).
   */
  const refreshPersonalityChangesLeft = async (petId: string) => {
    if (!isSupabaseConfigured || !session || isDevAccount(session.user.email)) {
      setPersonalityChangesLeft(null);
      return;
    }
    setPersonalityChangesLeft(await remoteRepository.personalityChangesLeft(petId).catch(() => null));
  };

  /**
   * Saves a new character and makes sure it is really there: the pet is read
   * back from the server afterwards and compared, because the monthly change
   * limit keeps the old character rather than failing the save. Resolves to
   * null when the character is in place, or to what went wrong.
   */
  /**
   * What affects the pet (Settings > What affects …). Saved on the pet, so a
   * shared pet has one set of rules; only its owner reaches this (the page is
   * read-only for a partner, and the database undoes anyone else's change).
   */
  const changeCareAreas = async (areas: CareArea[]) => {
    if (!pet) return;
    const before = pet;
    const nextPet = { ...pet, careAreas: areas };
    setPet(nextPet);
    try {
      if (isSupabaseConfigured && session) {
        let saved = await remoteRepository.savePetIfUnchanged(nextPet, pet.version ?? 0);
        let base: PetState = nextPet;
        if (saved.status === 'conflict') {
          // The partner cared for the pet meanwhile: apply the change to what is there now.
          const fresh = await remoteRepository.loadPet();
          if (!fresh) throw new Error(`Could not reach ${pet.name}. Check your connection and try again.`);
          base = { ...fresh, careAreas: areas };
          saved = await remoteRepository.savePetIfUnchanged(base, fresh.version ?? 0);
          if (saved.status === 'conflict') throw new Error(careConflictMessage(pet.name));
        }
        const stored = { ...base, version: saved.version };
        setPet(stored);
        await repository.savePet(stored);
        return;
      }
      await repository.savePet(nextPet);
    } catch (cause) {
      setPet(before);
      setError(errorMessage(cause, 'Could not save that change.'));
    }
  };

  const changePersonality = async (next: PetPersonality, persona?: string, dials?: PersonalityDials): Promise<string | null> => {
    if (!pet) return 'There is no pet to change.';
    // The server would keep the old character anyway; say so instead.
    if (personalityChangesLeft === 0) {
      const message = `No character changes left this month for ${pet.name}. They reset on the 1st.`;
      setError(message);
      return message;
    }
    // Notes ride on any base now, so they are kept across a base change unless
    // new ones are given; the sliders are whatever the caller settled on.
    const wearing = { personality: next, persona: persona === undefined ? pet.persona : persona.trim() || undefined, dials: dials ?? pet.dials };
    const nextPet = { ...pet, ...wearing };
    setPet(nextPet);
    setPersonality(next);
    careMomentInFlight.current = true;
    try {
      if (isSupabaseConfigured && session) {
        let base = pet;
        let saved = await remoteRepository.savePetIfUnchanged(nextPet, base.version ?? 0);
        if (saved.status === 'conflict') {
          const fresh = await remoteRepository.loadPet();
          if (!fresh) throw new Error(`Could not reach ${pet.name}. Check your connection and try again.`);
          base = fresh;
          saved = await remoteRepository.savePetIfUnchanged({ ...fresh, ...wearing }, fresh.version ?? 0);
          if (saved.status === 'conflict') throw new Error(careConflictMessage(pet.name));
        }
        // Read it back: what the server holds is the only proof it saved.
        const check = await remoteRepository.loadPet();
        const sameDials = (a?: PersonalityDials, b?: PersonalityDials) =>
          JSON.stringify(a ?? null) === JSON.stringify(b ?? null) ||
          (!!a && !!b && (Object.keys(a) as (keyof PersonalityDials)[]).every((key) => Math.abs(a[key] - b[key]) < 1e-6));
        if (
          check &&
          check.id === pet.id &&
          (check.personality !== wearing.personality ||
            (check.persona ?? undefined) !== (wearing.persona ?? undefined) ||
            !sameDials(check.dials, wearing.dials))
        ) {
          setPet(check);
          await repository.savePet(check);
          void refreshPersonalityChangesLeft(pet.id);
          throw new Error(`${pet.name}'s character did not change on the server. You may be out of changes this month.`);
        }
        const stored = check && check.id === pet.id ? check : { ...base, ...wearing, version: saved.version };
        setPet(stored);
        await repository.savePet(stored);
        void refreshPersonalityChangesLeft(pet.id);
        return null;
      }
      await repository.savePet(nextPet);
      return null;
    } catch (cause) {
      const message = errorMessage(cause, 'Could not change their character.');
      setError(message);
      return message;
    } finally {
      releasePetWrite();
    }
  };

  const changeBreed = async (next: PetBreed) => {
    if (!pet || next === pet.breed) return;
    // A new animal costs coins and joins the ones the pet owns; one it already
    // owns is free to go back to (the dev account switches free, to test the
    // art). Charged against whichever copy of the pet is actually saved.
    const freeSwitch = isDevAccount(session?.user.email);
    const cost = breedSwitchCost(pet, next, freeSwitch);
    // `pet` is the stored pet, so this saves a breed change and nothing else —
    // it cannot bake a decay projection into the row on its way past.
    const nextPet = switchBreed(pet, next, freeSwitch);
    if (!nextPet) {
      setError(`A new animal costs ${cost} coins, and ${pet.name} has ${coinsOf(pet)}.`);
      return;
    }
    setPet(nextPet);
    setBreed(next);
    // Held like a care moment: a foreground refresh landing between the
    // optimistic setPet above and the versioned save would flash the old breed.
    careMomentInFlight.current = true;
    try {
      if (isSupabaseConfigured && session) {
        // The server checks ownership, spends any coins and switches in one step
        // (`switch_pet_breed`); an ordinary save cannot change the breed. What
        // it returns is the truth, including the version it bumped.
        try {
          const result = await remoteRepository.switchBreed(pet.id, next);
          const stored = {
            ...pet,
            breed: result.breed as PetBreed,
            ownedBreeds: [...new Set([...ownedBreedsOf(pet), result.breed as PetBreed])],
            coins: result.coins,
            version: result.version,
          };
          setPet(stored);
          setBreed(stored.breed ?? next);
          await repository.savePet(stored);
        } catch (cause) {
          // Put the old animal back, with the server's word on the balance.
          setPet(pet);
          setBreed(pet.breed ?? next);
          if (cause instanceof NotEnoughCoinsError) {
            setPet({ ...pet, coins: cause.coins });
            throw new Error(`A new animal costs ${BREED_CHANGE_COST} coins, and ${pet.name} has ${cause.coins}.`);
          }
          throw cause;
        }
        return;
      }
      await repository.savePet(nextPet);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not change your companion.'));
    } finally {
      releasePetWrite();
    }
  };

  /**
   * Whose voice the pet speaks in. Saved on the pet, so a care partner hears
   * the same one; versioned with a retry, like `changeForm`. It says a line in
   * the new voice, so the choice can be heard.
   */
  const changePetVoice = async (next: PetVoice) => {
    if (!pet) return;
    const withVoice = (p: PetState): PetState => ({ ...p, voice: next });
    const nextPet = withVoice(pet);
    // Said on every tap, the one already picked too: the page is also where
    // a voice is heard again.
    if (voiceActive) void previewVoice(pet, next);
    if (pet.voice === next) return;
    setPet(nextPet);
    careMomentInFlight.current = true;
    try {
      if (isSupabaseConfigured && session) {
        let base = pet;
        let saved = await remoteRepository.savePetIfUnchanged(nextPet, base.version ?? 0);
        if (saved.status === 'conflict') {
          const fresh = await remoteRepository.loadPetById(pet.id);
          if (!fresh) throw new Error(`Could not reach ${pet.name}. Check your connection and try again.`);
          base = fresh;
          saved = await remoteRepository.savePetIfUnchanged(withVoice(fresh), fresh.version ?? 0);
          if (saved.status === 'conflict') throw new Error(careConflictMessage(pet.name));
        }
        const stored = { ...withVoice(base), version: saved.version };
        setPet(stored);
        await repository.savePet(stored);
        return;
      }
      await repository.savePet(nextPet);
    } catch (cause) {
      setError(errorMessage(cause, "Could not change your pet's voice."));
    } finally {
      releasePetWrite();
    }
  };

  /** Wears another form: the base look, or any evolution earned (`chooseForm`). */
  const changeForm = async (next: PetForm) => {
    if (!pet) return;
    const nextPet = chooseForm(pet, next);
    if (nextPet === pet) return;
    setPet(nextPet);
    careMomentInFlight.current = true;
    try {
      if (isSupabaseConfigured && session) {
        // Versioned, with one retry re-applied to the fresh row, like changeBreed.
        let base = pet;
        let saved = await remoteRepository.savePetIfUnchanged(nextPet, base.version ?? 0);
        if (saved.status === 'conflict') {
          // By id: with a second (shared) pet, "the first pet" may be the other one.
          const fresh = await remoteRepository.loadPetById(pet.id);
          if (!fresh) throw new Error(`Could not reach ${pet.name}. Check your connection and try again.`);
          base = fresh;
          saved = await remoteRepository.savePetIfUnchanged(chooseForm(fresh, next), fresh.version ?? 0);
          if (saved.status === 'conflict') throw new Error(careConflictMessage(pet.name));
        }
        const stored = { ...chooseForm(base, next), version: saved.version };
        setPet(stored);
        await repository.savePet(stored);
        return;
      }
      await repository.savePet(nextPet);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not change form.'));
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

  /**
   * The owner removes their care partner from the pet on screen. The pet and
   * its history stay; the partner's app finds it gone on its next refresh.
   */
  const removePartner = () =>
    runPartnerAction(async () => {
      if (!pet || !partner) return;
      const name = partnerName ?? 'your partner';
      const confirmed = await confirmDialog(
        `Remove ${name}?`,
        `${name} will stop caring for ${pet.name}. ${pet.name} and everything you have done together stay with you.`,
        'Remove',
      );
      if (!confirmed) return;
      await remoteRepository.removePetMember(pet.id, partner.userId);
      void refreshShared();
    });

  /**
   * DEV: the pet says a neglect check-in now, from the pet as shown -- so a
   * forced status is what it feels. The line lands in the room's bubble.
   */
  const devCheckIn = async (kind: companion.DevCheckIn) => {
    if (!livePet) return;
    const life = buildLifeContext({ pet: livePet, events, profile, stepGoal, now: new Date() });
    const { message } = await companionService.checkIn(livePet.id, life, kind);
    if (!message) throw new Error('The pet had nothing to say. Is the companion function deployed?');
    setCompanionSaid({ id: message.id, text: message.content });
  };

  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  /**
   * Deletes the account for good, after two confirmations — this is the one
   * irreversible action in the app, and the second prompt names what goes.
   *
   * The local cache is cleared before the sign-out so nothing from the deleted
   * account is left on the device; the auth listener then returns the app to
   * the sign-in screen on its own.
   */
  const deleteAccount = async () => {
    const shared = pets.filter((candidate) => !isOwnPet(candidate, userId)).length > 0;
    const first = await confirmDialog(
      'Delete your account?',
      'This removes your account, your pet and everything you have logged. It cannot be undone.',
      'Continue',
    );
    if (!first) return;
    const second = await confirmDialog(
      'Really delete everything?',
      shared
        ? 'Your own pet and all your history will be gone for good, for your care partner too. A pet you joined stays with its owner.'
        : 'Your pet and all your history will be gone for good, for your care partner too if you have one.',
      'Delete forever',
    );
    if (!second) return;

    setIsDeletingAccount(true);
    try {
      await remoteRepository.deleteAccount();
      await repository.clear();
      // Local only: the server-side user is already gone, and a global sign-out
      // would ask it to revoke a session for a user that no longer exists (403).
      await signOut('local');
    } catch (cause) {
      setError(errorMessage(cause, 'Could not delete your account.'));
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const adopt = async () => {
    try {
      setError(null);
      if (profile.age < 13 || profile.age > 100) throw new Error('Age must be between 13 and 100.');
      if (profile.heightCm < 90 || profile.heightCm > 230)
        throw new Error('Height must be between 90 and 230 cm.');
      if (profile.weightKg < 30 || profile.weightKg > 300)
        throw new Error('Weight must be between 30 and 300 kg.');

      // A free pet is adopted without a character; choosing one is Plus.
      const created = canCustomise
        ? createPet(userId, name.trim() || 'Miso', 'dog', breed, personality, undefined, persona, dials)
        : createPet(userId, name.trim() || 'Miso', 'dog', breed);
      // What should affect the pet, as chosen in onboarding (carried on the
      // profile until now). Every area is the default, stored as no setting.
      const chosen = profile.focusAreas;
      const nextPet = chosen.length > 0 && chosen.length < CARE_AREAS.length ? { ...created, careAreas: chosen } : created;
      if (isSupabaseConfigured && session) await remoteRepository.savePet(nextPet);
      await persistProfile(profile);
      await repository.savePet(nextPet);
      setPet(nextPet);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save your pet.'));
    }
  };

  /**
   * Writes a changed log over the old one, everywhere it is kept. Used for an
   * edit, for taking a log back and for Undo; none of them touch the pet.
   */
  const writeEvent = async (next: HealthEvent) => {
    if (isSupabaseConfigured && session) await withTimeout(remoteRepository.replaceEvent(next), SAVE_TIMEOUT_MESSAGE);
    await repository.replaceEvent(next);
    setEvents((current) => current.map((candidate) => (candidate.id === next.id ? next : candidate)));
  };

  const offerUndo = (message: string, undo: () => Promise<void>) =>
    setUndoOffer({ message, undo: () => undo().catch((cause) => setError(errorMessage(cause, 'Could not undo that.'))), key: newId() });

  /** Takes a log back, with a few seconds to change their mind. */
  const removeEvent = async (event: HealthEvent) => {
    const removed = markRemoved(event);
    try {
      await writeEvent(removed);
      offerUndo(`${capitalize(logName(event))} deleted`, () => writeEvent(restoreRemoved(removed)));
    } catch (cause) {
      setError(errorMessage(cause, 'Could not delete that.'));
    }
  };

  /** A log as it was meant to be: same id, time unless changed, XP it earned. */
  const editEvent = async (event: HealthEvent, metadata: Record<string, unknown>, occurredAt = event.occurredAt) => {
    const before = event;
    const after: HealthEvent = {
      ...event,
      occurredAt,
      metadata: { ...(event.metadata as Record<string, unknown>), ...metadata, xpAwarded: (event.metadata as { xpAwarded?: number }).xpAwarded ?? 0 },
    };
    await writeEvent(after);
    offerUndo(`${capitalize(logName(event))} updated`, () => writeEvent(before));
  };

  /**
   * A weigh-in: saved straight to the log, not through the pet engine (it is
   * body data, not care). The profile's weight follows the newest one, so the
   * calorie targets do too.
   */
  const logWeight = async (kg: number) => {
    const event = makeEvent<WeightMetadata>(userId, 'BODY_WEIGHT', { kg: Math.round(kg * 100) / 100 });
    if (isSupabaseConfigured && session) await withTimeout(remoteRepository.saveEvent(event), SAVE_TIMEOUT_MESSAGE);
    await repository.saveEvent(event);
    setEvents((current) => [event, ...current]);
    const before = profile.weightKg;
    updateProfile('weightKg', event.metadata.kg);
    offerUndo('Weigh-in logged', async () => {
      await writeEvent(markRemoved(event));
      updateProfile('weightKg', before);
    });
  };

  const editWeight = async (event: HealthEvent, kg: number) => {
    await editEvent(event, { kg: Math.round(kg * 100) / 100 });
    const newest = weighIns(eventLogRef.current).at(-1);
    if (newest?.id === event.id) updateProfile('weightKg', Math.round(kg * 100) / 100);
  };

  /**
   * "Copy yesterday's breakfast": each of those meals again, now, in the slot,
   * as logs of their own. The pet reacts once, to the last.
   */
  const copyMeals = async (meals: readonly HealthEvent<MealMetadata>[], slot: MealSlot) => {
    const copies = meals.map((meal) => {
      const { externalId: _external, imageUrl: _image, ...metadata } = meal.metadata as MealMetadata & { xpAwarded?: number; removedAt?: string };
      const { xpAwarded: _xp, removedAt: _removed, ...clean } = metadata as typeof metadata & { xpAwarded?: number; removedAt?: string };
      return makeEvent<MealMetadata>(userId, 'MEAL', { ...clean, loggedVia: 'manual', slot });
    });
    playMealSound();
    for (const [index, copy] of copies.entries()) {
      // eslint-disable-next-line no-await-in-loop -- in order: each meal's XP depends on the ones before it
      await recordEvent(copy, { quiet: index < copies.length - 1 });
    }
  };

  /** Opens a log on the screen that changes it. */
  const openEdit = (event: HealthEvent) => {
    if (!navigationRef.isReady()) return;
    if (event.type === 'MEAL') navigationRef.navigate('EditMeal', { id: event.id });
    else if (event.type === 'WORKOUT') navigationRef.navigate('Workout', { editId: event.id });
    else if (event.type === 'BODY_WEIGHT') navigationRef.navigate('Weight', { editId: event.id });
  };

  // A new log offers no Undo popup: it sat over the pet's reaction and the
  // level-up. A mistake is taken back from Today's activity (tap the log).
  const completeMeal = async (metadata: MealMetadata) => {
    playMealSound();
    const event = makeEvent<MealMetadata>(userId, 'MEAL', metadata);
    await recordEvent(event);
  };

  // No "working out" scene first: it has no pose of its own and borrowed the
  // run, so a finished workout read as the pet running off. `recordEvent`
  // cheers it like every other log.
  const completeWorkout = async (metadata: WorkoutMetadata) => {
    const event = makeEvent<WorkoutMetadata>(userId, 'WORKOUT', metadata);
    await recordEvent(event);
  };

  /**
   * A drink from the water tracker on Today's Food card, or (negative) a cup
   * taken back. Silent, except for the drink that reaches the day's goal: that
   * one the pet reacts to, in its own voice.
   */
  const logWater = async (ml: number, at?: Date) => {
    const event = {
      ...makeEvent<HydrationMetadata>(userId, 'HYDRATION', { ml: Math.round(ml) }),
      ...(at ? { occurredAt: at.toISOString() } : {}),
    };
    await recordEvent(event, { quiet: !waterReachesGoal(events, event) });
  };

  const completeMindSession = async (metadata: BrainTrainingMetadata) => {
    mindLogged.current = true;
    await recordEvent(makeEvent<BrainTrainingMetadata>(userId, 'BRAIN_TRAINING', metadata));
  };

  /**
   * Leaving a mind game. One that logged a session goes back to the pet, like a
   * meal or a workout, so the cheer is seen — even when it was opened from Today.
   * One left without playing just goes back to wherever it came from.
   */
  const closeMindGame = (navigation: { goBack: () => void; popTo: (name: 'Dashboard') => void }) => {
    const logged = mindLogged.current;
    mindLogged.current = false;
    if (logged) navigation.popTo('Dashboard');
    else navigation.goBack();
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

  /**
   * Today's steps from Apple Health into the day's one STEP_ACTIVITY row. Runs
   * on its own (see below) and with "Sync now", so it never asks for access
   * and never shows an error: nobody pressed anything, and the next sync is a
   * few minutes away. One at a time, or two syncs at once would both find no
   * row for today and log the day twice.
   */
  /**
   * The one thing the pet says about steps: reaching the day's goal. Steps
   * themselves sync in silence, so this is called by syncSteps the first time
   * the day's count crosses the goal. Online, the companion writes the line in
   * the pet's own voice (it already knows STEP_GOAL_REACHED) and the bubble
   * waits for it; the stock line is what shows if it does not come.
   */
  const announceStepGoal = (event: HealthEvent<StepMetadata>) => {
    if (!pet) return;
    const remote = isSupabaseConfigured && session;
    if (remote) setAwaitingPetLine(true);
    showReaction({ message: STEP_GOAL_LINE, eventLabel: 'Step goal', delta: {} });
    // Stamped now: the day's step row is dated midnight, which the companion
    // would take for old news and stay quiet about.
    const reached = { ...event, occurredAt: new Date().toISOString() };
    if (remote) void tellCompanion(reached, pet, false).finally(() => setAwaitingPetLine(false));
  };

  /**
   * What a sync found, for the Today card's own "Sync steps": the count, or
   * why there is none. The automatic syncs ignore it.
   */
  type StepSyncResult = { status: 'synced'; steps: number } | { status: 'busy' } | { status: 'off' } | { status: 'failed'; message: string };

  /**
   * Puts the last week's step counts right, from Apple Health's final total for
   * each day. Steps are only read while Vitto is open, so a day last synced at
   * 9am had kept its 9am count in every trend, average and streak since. The
   * day's row is corrected in place (or made, for a day never synced); no XP,
   * since that day is over and was settled when it was lived.
   */
  const correctPastSteps = async () => {
    if (!stepsProvider.getPastDaysSteps) return;
    const days = await stepsProvider.getPastDaysSteps(userId, PAST_STEP_DAYS);
    const known = liveEvents(eventLogRef.current);
    for (const day of days) {
      const steps = day.metadata.steps ?? 0;
      const existing = known
        .filter((candidate) => candidate.type === 'STEP_ACTIVITY' && candidate.source === 'healthkit' && isSameDay(candidate.occurredAt, new Date(day.occurredAt)) && (candidate.userId === undefined || candidate.userId === userId))
        .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0];
      if (existing) {
        const had = (existing.metadata as StepMetadata).steps ?? 0;
        if (steps === had) continue;
        const corrected: HealthEvent<StepMetadata> = {
          ...(existing as HealthEvent<StepMetadata>),
          userId,
          metadata: {
            ...(existing.metadata as StepMetadata),
            steps,
            ...(typeof day.metadata.caloriesBurned === 'number' ? { caloriesBurned: day.metadata.caloriesBurned } : {}),
          },
        };
        // eslint-disable-next-line no-await-in-loop -- a handful of days, in order
        await writeEvent(corrected);
      } else if (steps > 0) {
        if (isSupabaseConfigured && session) {
          // eslint-disable-next-line no-await-in-loop
          await withTimeout(remoteRepository.saveEvent(day), SAVE_TIMEOUT_MESSAGE);
        }
        // eslint-disable-next-line no-await-in-loop
        await repository.saveEvent(day);
        setEvents((current) => [day, ...current]);
      }
    }
  };

  const syncSteps = async (): Promise<StepSyncResult> => {
    if (!isAppleHealthConnected || !pet) return { status: 'off' };
    if (stepSyncInFlight.current) return { status: 'busy' };
    stepSyncInFlight.current = true;
    try {
      // Given up on after a while: a read that never answers would otherwise
      // hold `stepSyncInFlight` forever, and every sync after it would skip.
      const event = (await Promise.race([
        stepsProvider.getTodaySteps(userId),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Apple Health took too long to answer.')), STEP_SYNC_TIMEOUT_MS)),
      ])) as HealthEvent<StepMetadata>;
      const newSteps = event.metadata.steps ?? 0;

      // One STEP_ACTIVITY per day: the first sync is a real care moment (engine,
      // XP, "Went exploring"); every re-sync after that just corrects the count
      // on that same row, no second XP and no second diary line. The LATEST
      // Apple Health row if a day somehow has two: it is the one the day's
      // total reads (countedStepRows), so it is the one to keep current.
      const today = new Date();
      const existing = events
        .filter((candidate) => candidate.type === 'STEP_ACTIVITY' && candidate.source === 'healthkit' && isSameDay(candidate.occurredAt, today) && (candidate.userId === undefined || candidate.userId === userId))
        .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0];
      if (existing) {
        const had = (existing.metadata as StepMetadata).steps ?? 0;
        // Apple Health is the truth for steps, so the day's count follows it
        // down as well as up: a count that only ever rose kept an over-count
        // (the iPhone and Watch once both being added up) for the rest of the
        // day. Only a rise pays XP, below, so a correction never takes any.
        // The most steps already paid for today, so a count corrected down and
        // then climbing again is not rewarded twice for the same ground.
        const rewarded = Math.max(had, (existing.metadata as StepMetadata).rewardedSteps ?? 0);
        if (newSteps !== had) {
          // Once a day: `rewarded` is the most the count has stood at, so a
          // count corrected down and climbing back past the goal stays quiet.
          const reachedGoal = rewarded < stepGoal && newSteps >= stepGoal;
          const fresh = event.metadata as StepMetadata;
          const updated: HealthEvent<StepMetadata> = {
            ...(existing as HealthEvent<StepMetadata>),
            // Always this account's: the database only takes a row its owner
            // saves, and a row read back without its owner was refused.
            userId,
            occurredAt: today.toISOString(),
            metadata: {
              ...(existing.metadata as StepMetadata),
              steps: newSteps,
              rewardedSteps: Math.max(rewarded, newSteps),
              ...(typeof fresh.caloriesBurned === 'number' ? { caloriesBurned: fresh.caloriesBurned } : {}),
            },
          };

          // The first sync of the day already ran the full engine once,
          // against whatever the count was at that moment -- often too low to
          // register a milestone the day's steps go on to reach. Top up just
          // the difference, via the SAME formula, so reaching 8,000 steps at
          // 4pm counts the same as it would have at 9am, without re-paying
          // the reward already granted at the first sync.
          if (pet && newSteps > rewarded) {
            const topUp = stepSyncTopUp(engine, pet, updated, rewarded, {
              history: events,
              bodyWeightKg: profile.weightKg,
            });
            if (topUp.xp) {
              const toppedUpPet = applyDelta(pet, topUp, today.toISOString());
              if (isSupabaseConfigured && session) {
                const outcome = await remoteRepository.savePetIfUnchanged(toppedUpPet, pet.version ?? 0);
                if (outcome.status === 'saved') setPet({ ...toppedUpPet, version: outcome.version });
              } else {
                await repository.savePet(toppedUpPet);
                setPet(toppedUpPet);
              }
              updated.metadata.xpAwarded =
                ((existing.metadata as { xpAwarded?: number }).xpAwarded ?? 0) + (topUp.xp ?? 0);
            }
          }

          if (isSupabaseConfigured && session) await remoteRepository.replaceEvent(updated);
          await repository.replaceEvent(updated);
          setEvents((current) =>
            current.map((candidate) => (candidate.id === existing.id ? updated : candidate)),
          );
          if (reachedGoal) announceStepGoal(updated);
        }
      } else {
        // Steps come in on their own every few minutes, so the pet says
        // nothing about them, only about reaching the goal (announceStepGoal).
        // The XP and stats still land.
        await recordEvent(event, { quiet: true });
        // The day's first sync can already be past the goal (an evening open).
        if (newSteps >= stepGoal) announceStepGoal(event);
      }
      // Once a day, the days before it too: a day whose last sync was in the
      // morning kept its morning count for good. Best effort, never failing the sync.
      const todayKey = toDateKey(today);
      if (pastStepsCorrectedOn.current !== todayKey) {
        await correctPastSteps().then(
          () => {
            pastStepsCorrectedOn.current = todayKey;
          },
          (cause) => console.warn('[steps] past days not corrected', cause),
        );
      }
      return { status: 'synced', steps: newSteps };
    } catch (cause) {
      // Quiet on screen for the automatic syncs (the next one tries again), but
      // never invisible: a sync that keeps failing has to show up somewhere.
      console.warn('[steps] sync failed', cause);
      return { status: 'failed', message: errorMessage(cause, 'Apple Health did not answer.') };
    } finally {
      stepSyncInFlight.current = false;
    }
  };

  /**
   * The Today card's "Sync steps": the same sync, run now, said out loud.
   * Apple Health never says when Vitto may not read steps, it just answers 0,
   * so a 0 points at the setting that is usually why.
   */
  const syncStepsNow = async (): Promise<string> => {
    const result = await syncSteps();
    if (result.status === 'busy') return 'Already syncing. Give it a second.';
    if (result.status === 'off') return 'Connect Apple Health first.';
    if (result.status === 'failed') return `Couldn't read Apple Health: ${result.message}`;
    if (result.steps === 0) {
      return 'Apple Health has 0 steps for today. If that is wrong, let Vitto read Steps: Settings → Health → Data Access & Devices → Vitto.';
    }
    return `Synced: ${result.steps.toLocaleString()} steps from Apple Health.`;
  };

  // Steps keep themselves up to date: synced on open, on every return to the
  // app, and every few minutes while it is on screen. Apple Health only hands
  // them over while Vitto is running, so this is as live as they get without
  // background delivery.
  const syncStepsRef = useRef(syncSteps);
  syncStepsRef.current = syncSteps;
  useEffect(() => {
    if (!dataReady || Platform.OS !== 'ios' || isAppleHealthConnected) return;
    // A connection made on an earlier launch, picked back up without asking.
    // Remembered here once connected; for a connection from before that was
    // remembered, iOS's own "already asked" answer stands in.
    let cancelled = false;
    void (async () => {
      const remembered = (await AsyncStorage.getItem(HEALTH_CONNECTED_KEY).catch(() => null)) === '1';
      const restored = remembered
        ? await stepsProvider.requestAuthorization().catch(() => false)
        : await stepsProvider.restoreAuthorization();
      if (restored && !remembered) await AsyncStorage.setItem(HEALTH_CONNECTED_KEY, '1').catch(() => undefined);
      if (!cancelled && restored) setIsAppleHealthConnected(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [dataReady, isAppleHealthConnected]);
  useEffect(() => {
    if (!dataReady || !isAppleHealthConnected || !pet?.id) return;
    const sync = () => void syncStepsRef.current();
    sync();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') sync();
    }, STEP_AUTO_SYNC_MS);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => {
      clearInterval(timer);
      foreground.remove();
    };
  }, [dataReady, isAppleHealthConnected, pet?.id]);

  const connectAppleHealth = async () => {
    try {
      const granted = await stepsProvider.requestAuthorization();
      setIsAppleHealthConnected(granted);
      if (!granted) {
        setError('Apple Health access was not granted.');
        return;
      }
      // Remembered on this phone, so every later launch reconnects on its own.
      await AsyncStorage.setItem(HEALTH_CONNECTED_KEY, '1').catch(() => undefined);
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
      // Swept first: seeded ids are derived from the account and the seed, so
      // they are the same every run. Without this a second press collides on
      // the primary key instead of replacing the history it already wrote.
      await remoteRepository.deleteEventsBySource(SEED_SOURCE);
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

  /**
   * A change the pet proposed in the chat, confirmed by a tap on its card.
   * Applied exactly as Settings would apply it: the profile through
   * `persistProfile` (the signed-in person's own row, under RLS), a reminder
   * through `addReminder`. Checked again first, against this person's real
   * profile, whatever the server already decided. Throws the reason when it
   * cannot, which the card shows.
   */
  const applyCompanionProposal = async (proposal: CompanionProposal) => {
    const problem = proposalProblem(proposal, { profile, reminderCount: reminders.length });
    if (problem) throw new Error(problem);
    if (proposal.kind === 'reminder') {
      await addReminder({ label: proposal.label, hour: proposal.hour, minute: proposal.minute, days: proposal.days as Weekday[] });
      return;
    }
    // An edit still waiting in the debounce is already in `profile`, so this
    // save carries it. Dropped rather than flushed: flushed, that older copy
    // could land after this one and put the old goal back.
    if (profileSaveTimer.current) clearTimeout(profileSaveTimer.current);
    profileSaveTimer.current = null;
    pendingProfile.current = null;
    await persistProfile({ ...profile, [proposal.setting]: proposal.value });
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

      await syncSteps();
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
    // Before the session goes: this phone should stop hearing from, or showing,
    // a pet it no longer has. Neither blocks the sign-out.
    void forgetThisDevice();
    void cancelWeeklyRecap();
    void clearPetIsland();
    void clearPetWidget();
    // A half-logged workout is theirs, not the next person's to pick up.
    void clearWorkoutDraft();
    // The App Store account stays signed in to the phone; RevenueCat's does not,
    // or the next person to sign in here would be looked up as this one.
    void billingService.signOut();
    void signOut()
      .then(async () => {
        setSession(null);
        clearPetState();
        // Identity goes with the session. Left behind, the next account to sign
        // in on this device sees the last one's name and @handle until its own
        // profile loads — and keeps them for good if it has none yet.
        setProfile(DEFAULT_PROFILE);
        setEvents([]);
        setWordPuzzleProgress(null);
        setIsAppleHealthConnected(false);
        setForcedAilment(null);
        setForcedForm(null);
        setForcedTrophies(null);
        forceFreezes(null);
        setUnlockQueue([]);
        setWorkoutTemplates([]);
        setTrainingSchedule(null);
        // `seenAchievements` and the unlock queue are reset by the scope effect
        // above, which re-runs as the session drops back to 'local'.
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

  // How much of today's goals are done, for the TODAY button on the main
  // screen: the same figure the Today page leads with. Above the early returns
  // for the same reason `trophiesNow` is.
  // With it, what is left of today for the tokens under the pet's line.
  const { todayProgress, todayGoals } = useMemo(() => {
    if (!pet) return { todayProgress: undefined, todayGoals: undefined };
    const recap = buildDailyRecap({ events, profile, pet, stepGoal, day: now });
    const rotation = scheduleDayOn(trainingSchedule, workoutTemplates, now);
    return { todayProgress: recap.dailyProgress, todayGoals: dayGoals(recap, { events, profile, pet, day: now, rotation }) };
  }, [events, profile, pet, stepGoal, now, trainingSchedule, workoutTemplates]);

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
    // Not before it is known whether the first-run tour is about to open.
    if (pet && tourPending === null) return;

    // First run on this device: record what is already earned, silently, and
    // do it whether or not that is anything. This used to happen only when the
    // first pass found something new — so on a fresh account (nothing earned
    // yet) nothing was stored, the seed never "happened", and the very first
    // real unlock was then swallowed as the seed instead of announced.
    if (!seenEverStored.current) {
      seenEverStored.current = true;
      const seeded = new Set(achievementsNow);
      setSeenAchievements(seeded);
      void repository.saveSeenAchievements(achievementScope, [...seeded]).catch(() => undefined);
      return;
    }

    const fresh = newlyUnlocked(achievementsNow, seenAchievements);
    if (fresh.length === 0) return;
    const next = new Set([...seenAchievements, ...fresh]);
    setSeenAchievements(next);
    void repository.saveSeenAchievements(achievementScope, [...next]).catch(() => undefined);
    // Real progress unlocks one or two at a time. A pile at once means the
    // record was lost or the history arrived late, not a moment worth a
    // parade: remember them quietly rather than announce them all again.
    if (fresh.length > MAX_ANNOUNCED_AT_ONCE) return;
    // Whatever was earned getting here (adopting, day one) is not paraded over
    // the tour, or in the moment before it opens.
    if (tourPending) return;
    setUnlockQueue((queue) => [...queue, ...fresh]);
    // `repository` is a stable module-level instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady, achievementsNow, seenAchievements, achievementScope, tourPending, Boolean(pet)]);

  /** Saves (or replaces by name) a routine, then persists the list. */
  /** Kept on the phone, and with the account when signed in (see the routines effect). */
  const storeWorkoutTemplates = async (next: WorkoutTemplate[]) => {
    setWorkoutTemplates(next);
    await repository.saveWorkoutTemplates(next);
    if (!(isSupabaseConfigured && session)) return;
    try {
      await remoteRepository.saveWorkoutTemplates(next);
    } catch {
      setError("Saved on this phone, but couldn't back your routines up to your account. Check your connection.");
    }
  };

  const saveWorkoutTemplate = async (template: WorkoutTemplate) => {
    const next = upsertTemplate(workoutTemplates, template);
    await storeWorkoutTemplates(next);
  };

  /** Kept on the phone, and with the account when signed in, like the routines. */
  const storeTrainingSchedule = async (next: TrainingSchedule | null) => {
    setTrainingSchedule(next);
    await repository.saveTrainingSchedule(next);
    if (!(isSupabaseConfigured && session)) return;
    try {
      await remoteRepository.saveTrainingSchedule(next);
    } catch {
      setError("Saved on this phone, but couldn't back your rotation up to your account. Check your connection.");
    }
  };

  // The routine list is the rotation: a routine made or deleted joins or leaves it.
  useEffect(() => {
    if (!routinesReady) return;
    const { schedule: next, changed } = reconcileSchedule(trainingSchedule, workoutTemplates);
    if (changed) void storeTrainingSchedule(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routinesReady, trainingSchedule, workoutTemplates]);

  const deleteWorkoutTemplate = async (id: string) => {
    const next = removeTemplate(workoutTemplates, id);
    await storeWorkoutTemplates(next);
  };

  /** Dev: forget what has been shown, so every earned unlock pops again. */
  const replayAchievements = () => {
    seenEverStored.current = true;
    setSeenAchievements(new Set());
    void repository.saveSeenAchievements(achievementScope, [], true).catch(() => undefined);
  };

  // When the app opens on an account, ask the companion whether it has anything
  // to say: it may have been left alone for days, or be waiting to ask how an
  // interview went. Usually a rule says no and no model is called at all. Read
  // through a ref so the day's numbers ticking does not re-ask; once per account
  // and pet is the point.
  const companionInputs = useRef({ pet, events, profile, stepGoal });
  companionInputs.current = { pet, events, profile, stepGoal };
  const companionPetId = pet?.id;
  const companionUserId = isSupabaseConfigured ? session?.user.id : undefined;
  useEffect(() => {
    if (!dataReady || !companionUserId || !companionPetId) return;
    let cancelled = false;
    const { pet: current, events: history, profile: body, stepGoal: goal } = companionInputs.current;
    if (!current) return;
    const at = new Date();
    const life = buildLifeContext({ pet: applyTimeDecay(current, at), events: history, profile: body, stepGoal: goal, now: at });
    void companionService
      .record(current.id, life, { type: 'USER_OPENED_APP' })
      .then(() => companionService.checkIn(current.id, life))
      .then(({ message }) => {
        if (!cancelled && message) {
          setUnreadCompanion((count) => count + 1);
          setCompanionSaid({ id: message.id, text: message.content });
        }
        // Warms the chat: `load` keeps a copy on the phone, so opening the
        // chat later shows the conversation at once. No model call.
        return companionService.load(current.id, life);
      })
      .catch(() => undefined); // offline, or the function is not deployed yet: the pet just says nothing
    return () => {
      cancelled = true;
    };
  }, [dataReady, companionUserId, companionPetId]);

  // Told where to reach this phone, once there is a pet worth being notified
  // about. Asking at first launch, before anyone has met their pet, is asking
  // for a "no" that iOS then makes permanent.
  useEffect(() => {
    if (!dataReady || !companionUserId || !companionPetId) return;
    let cancelled = false;
    void registerForPush().then(({ status, enabled }) => {
      if (!cancelled && status === 'ready') setPushEnabled(enabled ?? true);
    });
    return () => { cancelled = true; };
  }, [dataReady, companionUserId, companionPetId]);

  // The pet on the Dynamic Island. Re-sent only when something the Island
  // cannot work out for itself changes (a log, a mood, a new form) and on
  // foreground; the bars between those moments slide on the Island's own clock.
  // Decayed to the moment it is sent, from the STORED pet: the Island's bars
  // are anchored on "the value right now", and a dev-forced ailment or form
  // (which only ever exists in the on-screen projection) has no business there.
  const island = pet ? islandSignature(pet) : null;
  const islandPet = useRef(pet);
  islandPet.current = pet;
  const sendIsland = useCallback((enabled: boolean) => {
    const current = islandPet.current;
    if (!current) return;
    const at = new Date();
    void syncPetIsland(applyTimeDecay(current, at), enabled, at.getTime(), current.careAreas);
  }, []);
  useEffect(() => {
    if (!dataReady || !island) return;
    const timer = setTimeout(() => sendIsland(islandEnabled), 400);
    return () => clearTimeout(timer);
  }, [dataReady, island, islandEnabled, sendIsland]);
  useEffect(() => {
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') sendIsland(islandEnabled);
    });
    return () => foreground.remove();
  }, [islandEnabled, sendIsland]);
  // The pet on the Home Screen widget, with today's food and steps. Rewritten
  // when the pet or the day's log changes and on foreground; unchanged
  // snapshots are dropped in syncPetWidget, so this can run freely.
  const widgetInput = useRef({ events, profile, stepGoal, schedule: trainingSchedule, templates: workoutTemplates });
  widgetInput.current = { events, profile, stepGoal, schedule: trainingSchedule, templates: workoutTemplates };
  const sendWidget = useCallback(() => {
    const current = islandPet.current;
    if (!current) return;
    const at = new Date();
    void syncPetWidget(buildWidgetSnapshot({ pet: applyTimeDecay(current, at), ...widgetInput.current }, at));
  }, []);
  useEffect(() => {
    if (!dataReady || !island) return;
    const timer = setTimeout(sendWidget, 800);
    return () => clearTimeout(timer);
  }, [dataReady, island, events, profile, stepGoal, trainingSchedule, workoutTemplates, sendWidget]);
  useEffect(() => {
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') sendWidget();
    });
    return () => foreground.remove();
  }, [sendWidget]);
  // Cups added from the widget's + while the app was closed: logged now, at
  // the times they were tapped, once the pet is loaded to drink them.
  const logWaterRef = useRef(logWater);
  logWaterRef.current = logWater;
  const takeWidgetWater = useCallback(async () => {
    for (const cup of await drainWidgetWater()) {
      // eslint-disable-next-line no-await-in-loop -- in order, like the taps
      await logWaterRef.current(cup.ml, cup.at).catch(() => undefined);
    }
  }, []);
  useEffect(() => {
    if (!dataReady || !pet) return undefined;
    void takeWidgetWater();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void takeWidgetWater();
    });
    return () => foreground.remove();
  }, [dataReady, pet?.id, takeWidgetWater]); // eslint-disable-line react-hooks/exhaustive-deps
  // No pet here (signed out, or none adopted yet): nothing for the Island to
  // show, so any activity still up is ended. One could outlive its pet: a
  // session that expired rather than signing out never ran logOut's clear, and
  // an activity an older build started is drawn as a bare spinner on the Lock
  // Screen until the app updates it, which with no pet it never would.
  useEffect(() => {
    if (!authReady || pet) return;
    if (session && !dataReady) return;
    void clearPetIsland();
    void clearPetWidget();
  }, [authReady, session, dataReady, pet]);

  // Tapping the pet's notification opens the conversation it came from, rather
  // than dropping the person on the dashboard to go looking for it.
  useEffect(() => {
    return onNotificationTap((data) => {
      if (data.screen === 'weekly' && navigationRef.isReady()) {
        navigationRef.navigate('WeeklyRecap');
        return;
      }
      if (data.screen !== 'companion' || !navigationRef.isReady()) return;
      setUnreadCompanion(0);
      setCompanionSaid(null);
      navigationRef.navigate('Companion');
    });
  }, []);

  // The saved place only exists so a theme change can re-mount the navigator
  // without losing the screen. Whenever the main app is not on screen (loading,
  // signed out, onboarding), it is stale: the next time the app shows, it
  // starts on the Dashboard, not wherever the last account left off.
  if (!authReady || !dataReady || (isSupabaseConfigured && !session) || petLoadFailed || !pet) {
    navigationState.current = undefined;
  }

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
          <StatusBar barStyle={statusBarStyle} />
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
        <StatusBar barStyle={statusBarStyle} />
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
    // Until any saved progress has been read: a blank screen, not page one.
    if (onboardingResume === undefined) return <View style={layout.screen} />;
    return (
      <View style={layout.screen}>
        <StatusBar barStyle={statusBarStyle} />
        <OnboardingScreen
          resume={onboardingResume}
          onProgress={(progress) => {
            onboardingProgress.current = progress;
            setOnboardingTick((tick) => tick + 1);
          }}
          knownAge={signUpAge(session?.user.user_metadata?.age)}
          name={name}
          onNameChange={setName}
          breed={breed}
          onBreedChange={setBreed}
          canCustomise={canCustomise}
          paywall={session ? { onTierChange: (tier) => { if (!isDevAccount(session.user.email)) setCompanionTier(tier); }, isDevAccount: isDevAccount(session.user.email) } : undefined}
          personality={personality}
          onPersonalityChange={setPersonality}
          persona={persona}
          onPersonaChange={setPersona}
          dials={dials}
          onDialsChange={setDials}
          stepGoal={stepGoal}
          onStepGoalChange={setStepGoal}
          profile={profile}
          onUpdate={updateProfile}
          onSetUnits={setMeasurementSystem}
          onAdopt={adopt}
          error={error}
          onSignOut={isSupabaseConfigured && session ? logOut : undefined}
          onRedeemInvite={isSupabaseConfigured && session ? redeemInvite : undefined}
          onClaimUsername={
            isSupabaseConfigured && session
              ? async (username) => {
                  await friendsService.setMyUsername(username);
                  // Local only: friendsService has already written it.
                  setProfile((current) => ({ ...current, username }));
                }
              : undefined
          }
          onConnectHealth={
            Platform.OS === 'ios'
              ? async () => {
                  // Only the permission here: there is no pet to sync into yet.
                  // Once it is adopted, the usual reconnect and step sync pick it up.
                  const granted = await stepsProvider.requestAuthorization().catch(() => false);
                  if (granted) {
                    setIsAppleHealthConnected(true);
                    await AsyncStorage.setItem(HEALTH_CONNECTED_KEY, '1').catch(() => undefined);
                  }
                  return granted;
                }
              : undefined
          }
          onEnableNotifications={
            Platform.OS === 'web' || !session
              ? undefined
              : async () => {
                  const status = await setDevicePush(true);
                  setPushEnabled(status === 'ready');
                  return status === 'ready';
                }
          }
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
  // Form first, ailment last: the form rewrites mind, and `foggy` IS low mind,
  // so the other way round a previewed form silently cured a forced `foggy`.
  const projected = applyForcedAilment(
    applyForcedForm(applyTimeDecay(pet, now), isDev ? forcedForm : null),
    isDev ? forcedAilment : null,
  );
  // A free pet shows and speaks in the default voice. Display only, like the
  // rest of this projection: the stored pet keeps its character for an upgrade.
  const livePet: PetState = canCustomise
    ? projected
    : { ...projected, personality: undefined, persona: undefined, dials: undefined };
  // A forced cue (dev-only) wins over the sensors, the same way a forced status
  // wins over the pet's real stats above.

  /**
   * Said out loud from the room (PetMicButton): sent exactly as a typed chat
   * message is, so it counts the same and is in the conversation afterwards,
   * and the reply goes up in the speech bubble. A failure is said there too,
   * plainly, since that is where they are looking.
   */
  const talkToPet = async (text: string) => {
    if (!isOnline || talkingToPet) return;
    setTalkingToPet(true);
    setCompanionSaid({ id: `listening-${Date.now()}`, text: '…' });
    try {
      const life = buildLifeContext({ pet: livePet, events, profile, stepGoal });
      const result = await companionService.send(livePet.id, life, text);
      setCompanionSaid({ id: result.reply.id, text: result.reply.content });
      // Asked for a change ("set my calories to 1,900"): the chat shows a card
      // to confirm it; from the room there is no card, so the same question
      // comes up as a dialog. Nothing changes without the tap either way.
      const proposal = result.proposal;
      if (proposal) {
        const from = proposal.kind === 'setting' ? (proposal.setting === 'calorieGoal' ? life.today.calorieTarget : life.today.stepGoal) : null;
        const adding = proposal.kind === 'reminder';
        const agreed = await confirmDialog(
          proposalTitle({ proposal, from }),
          adding ? `${livePet.name} can add this reminder for you.` : `${livePet.name} can change this for you.`,
          adding ? 'Add' : 'Change',
          false,
        );
        if (agreed) {
          try {
            await applyCompanionProposal(proposal);
          } catch (cause) {
            setCompanionSaid({ id: `talk-error-${Date.now()}`, text: errorMessage(cause, 'That did not save. Try again.') });
          }
        }
      }
    } catch (cause) {
      setCompanionSaid({ id: `talk-error-${Date.now()}`, text: errorMessage(cause, 'That did not reach me. Try again.') });
    } finally {
      setTalkingToPet(false);
    }
  };

  return (
    <NavigationContainer
      key={scheme}
      ref={navigationRef}
      theme={navigationTheme()}
      initialState={navigationState.current}
      onStateChange={(state) => {
        navigationState.current = state;
      }}
    >
      <StatusBar barStyle={statusBarStyle} />
      {/* Around every screen, so the first-run tour can point at a page it opens (Personality). */}
      <TourProvider>
      <RootStack.Navigator
        initialRouteName="Dashboard"
        // iOS's own push, with the back swipe from anywhere on the page rather than the edge alone.
        screenOptions={{ headerShown: false, fullScreenGestureEnabled: true }}
      >
        <RootStack.Screen name="Dashboard">
          {({ navigation }) => (
            <DashboardScreen
              pet={livePet}
              events={events}
              reaction={reaction}
              careToast={toast}
              unreadMessages={unreadCompanion}
              petSaid={companionSaid}
              awaitingPetLine={awaitingPetLine}
              onOpenChat={isOnline ? () => navigation.navigate('Companion') : undefined}
              onOpenShop={() => navigation.navigate('ChooseCompanion')}
              onTalkToPet={isOnline ? (text) => void talkToPet(text) : undefined}
              talkingToPet={talkingToPet}
              onLogMeal={() => navigation.navigate('MealCapture')}
              onLogWorkout={() => navigation.navigate('Workout')}
              onLogRun={() => navigation.navigate('Workout', { cardio: true })}
              onTrainMind={() => navigation.navigate('MindGym')}
              onOpenProfile={() => navigation.navigate('Profile')}
              onOpenSettings={() => navigation.navigate('Settings', { from: 'Pet' })}
              onOpenStats={() => navigation.navigate('PetStats')}
              onOpenToday={() => navigation.navigate('Today')}
              todayProgress={todayProgress}
              todayGoals={todayGoals}
              onOpenFriends={isOnline ? () => navigation.navigate('Friends') : undefined}
              // Sleep has no manual entry: a SLEEP event is only ever created by
              // the HealthKit import. Telling an exhausted pet's owner to "get
              // some rest" anywhere else asks for the one thing they cannot do.
              // And connected is not enough: most iPhones record no sleep
              // without a watch or a tracker, so the pet only asks for sleep once
              // a night has actually come in this past week; a meal otherwise.
              canLogSleep={
                Platform.OS === 'ios' &&
                isAppleHealthConnected &&
                events.some((event) => event.type === 'SLEEP' && Date.now() - Date.parse(event.occurredAt) < 7 * 86_400_000)
              }
              trophies={trophiesNow}
              accountInitial={session?.user.email?.charAt(0)}
              pets={pets.map((candidate) => ({
                id: candidate.id,
                name: candidate.name,
                own: isOwnPet(candidate, userId),
              }))}
              activePetId={pet.id}
              onSelectPet={(petId) => {
                const next = pets.find((candidate) => candidate.id === petId) ?? null;
                if (!next || next.id === pet.id) return;
                setActivePetId(petId);
                // Members, care log and invite all belong to one pet: the old
                // pet's are dropped at once, and the new one's fetched -- for
                // `next`, since `pet` here is still the one being left.
                setMembers([]);
                setCareLog([]);
                setInvite(null);
                // Nothing already in the new pet's log is news.
                lastSeenCareLogAt.current = new Date().toISOString();
                if (isSupabaseConfigured && session) void refreshShared(next);
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
              tour={
                tourPending === true
                  ? {
                      steps: tourSteps(livePet.name, canCustomise),
                      onDone: finishTour,
                      // The Plus personality step is shown on its page; a step
                      // after one comes back here. Finishing there leaves them
                      // on it to choose, and its back button returns here.
                      onPage: (page) => (page === 'personality' ? navigation.navigate('Personality', { fromTour: true }) : navigation.popTo('Dashboard')),
                    }
                  : tourPending === false && switchTipPending && hasTwoPets
                    ? {
                        steps: petSwitchTip(
                          livePet.name,
                          pets.find((candidate) => candidate.id !== livePet.id)?.name ?? 'your other pet',
                        ),
                        onDone: finishSwitchTip,
                        intro: false,
                      }
                    : null
              }
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Profile">
          {({ navigation }) => (
            <ProfileScreen
              achievements={achievementsNow}
              profile={profile}
              events={events}
              onClose={() => navigation.goBack()}
              onOpenSettings={() => navigation.navigate('Settings')}
              onEditProfile={() => navigation.navigate('EditProfile')}
              onOpenFriends={isOnline ? () => navigation.navigate('Friends') : undefined}
              onSignOut={isSupabaseConfigured && session ? logOut : undefined}
              onOpenScreenTime={() => navigation.navigate('ScreenTime')}
              reminders={reminders}
              onOpenReminders={() => navigation.navigate('Reminders')}
              appleHealthStatus={Platform.OS === 'ios' ? (isAppleHealthConnected ? 'connected' : 'disconnected') : undefined}
              onOpenAppleHealth={() => navigation.navigate('AppleHealth')}
              onOpenHistory={() => navigation.navigate('ActivityHistory')}
              onOpenWeight={() => navigation.navigate('Weight')}
              onOpenLiftProgress={() => navigation.navigate('LiftProgress')}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="EditProfile">
          {({ navigation }) => (
            <EditProfileScreen
              profile={profile}
              onSave={persistProfile}
              onClose={() => navigation.goBack()}
              onOpenFriends={isOnline ? () => navigation.navigate('Friends') : undefined}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="ScreenTime">
          {({ navigation }) => (
            <ScreenTimeScreen
              profile={profile}
              events={events}
              onSave={persistProfile}
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
              onClose={() => navigation.goBack()}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Reminders">
          {({ navigation }) => (
            <RemindersScreen
              reminders={{
                items: reminders,
                permission: reminderPermission,
                onAdd: addReminder,
                onToggle: toggleReminder,
                onRemove: removeReminder,
              }}
              onClose={() => navigation.goBack()}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="AppleHealth">
          {({ navigation }) => (
            <AppleHealthScreen
              status={isAppleHealthConnected ? 'connected' : 'disconnected'}
              onConnect={() => void connectAppleHealth()}
              onSync={() => void syncAppleHealth()}
              syncing={isSyncingAppleHealth}
              onClose={() => navigation.goBack()}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="LiftProgress">
          {({ navigation, route }) => (
            <LiftProgressScreen
              backLabel={route.params?.from === 'Today' ? 'Today' : 'Profile'}
              profile={profile}
              events={events}
              locked={!canCustomise}
              onOpenPlus={() => navigation.navigate('Plus')}
              onClose={() => navigation.goBack()}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="FoodTrends">
          {({ navigation }) => <FoodTrendsScreen events={events} profile={profile} onClose={() => navigation.goBack()} />}
        </RootStack.Screen>
        <RootStack.Screen name="StepTrends">
          {({ navigation }) => (
            <StepTrendsScreen
              events={events}
              stepGoal={stepGoal}
              petName={livePet?.name ?? 'Your pet'}
              miles={profile.weightUnit === 'lb'}
              onClose={() => navigation.goBack()}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="ActivityHistory">
          {({ navigation }) => (
            <ActivityHistoryScreen
              events={events}
              system={measurementSystemOf(profile)}
              onClose={() => navigation.goBack()}
              onEdit={openEdit}
              onDelete={(event) => void removeEvent(event)}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Settings">
          {({ navigation, route }) => (
            <SettingsScreen
              profile={profile}
              backLabel={route.params?.from === 'Pet' ? 'Pet' : 'Profile'}
              onClose={() => navigation.goBack()}
              breed={pet.breed}
              onBreedChange={(next) => void changeBreed(next)}
              coins={coinsOf(pet)}
              breedChangeCost={isDev ? 0 : BREED_CHANGE_COST}
              pet={livePet}
              canCustomise={canCustomise}
              isPlus={canCustomise}
              notificationsOn={
                typeof pushEnabled === 'boolean' || canShowIsland() || typeof affirmationsEnabled === 'boolean'
                  ? pushEnabled === true || (canShowIsland() && islandEnabled === true) || affirmationsEnabled === true
                  : null
              }
              onOpenPlus={() => navigation.navigate('Plus')}
              onOpenChooseCompanion={() => navigation.navigate('ChooseCompanion')}
              onOpenPersonality={() => navigation.navigate('Personality')}
              onOpenMemories={isOnline ? () => navigation.navigate('CompanionMemories') : undefined}
              onOpenNotifications={() => navigation.navigate('Notifications')}
              onOpenPreferences={() => navigation.navigate('Preferences')}
              onOpenCareAreas={() => navigation.navigate('CareAreas')}
              appearanceLabel={
                preference === 'system' ? `System · ${scheme === 'dark' ? 'Dark' : 'Light'}` : APPEARANCE_LABEL[preference]
              }
              onOpenAppearance={() => navigation.navigate('Appearance')}
              musicOn={musicEnabled ?? undefined}
              onMusicChange={(next) => {
                setMusicEnabled(next);
                void saveMusicEnabled(next);
              }}
              // Native only: the voice runs on the phone (see voice/kokoro.web.ts).
              voiceOn={Platform.OS === 'web' ? undefined : voiceEnabled ?? undefined}
              voiceLocked={!canCustomise}
              petVoice={pet ? voiceOf(pet) : undefined}
              onOpenPetVoice={
                pet
                  ? () => {
                      // Each voice's line is made while they look, so a tap plays at once.
                      if (voiceActive) preparePreviews(pet);
                      navigation.navigate('PetVoice');
                    }
                  : undefined
              }
              voiceStatus={
                voiceProgress !== null
                  ? `Downloading the voice… ${Math.round(voiceProgress * 100)}%`
                  : voiceError ?? (voiceEnabled ? undefined : `Turning it on downloads the voice (${Math.round(VOICE_DOWNLOAD_BYTES / 1e6)} MB, once).`)
              }
              onVoiceChange={(next) => {
                setVoiceEnabled(next);
                void saveVoiceEnabled(next);
                if (next) getVoiceReady(true);
                else {
                  discardVoice();
                  setVoiceError(null);
                }
              }}
              onOpenDeleteAccount={isOnline ? () => navigation.navigate('DeleteAccount') : undefined}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Appearance">
          {({ navigation }) => (
            <AppearanceScreen preference={preference} scheme={scheme} onChange={setPreference} onClose={() => navigation.goBack()} />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="PetVoice">
          {({ navigation }) => (
            <PetVoiceScreen
              petName={livePet.name}
              voice={voiceOf(livePet)}
              onChange={(next) => void changePetVoice(next)}
              onClose={() => navigation.goBack()}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="CareAreas">
          {({ navigation }) => (
            <CareAreasScreen
              petName={livePet.name}
              areas={livePet.careAreas}
              onChange={(areas) => void changeCareAreas(areas)}
              // Only the owner chooses; on a shared pet the partner sees it read-only.
              canEdit={!isSupabaseConfigured || !session || isOwnPet(livePet, userId)}
              onClose={() => navigation.goBack()}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Preferences">
          {({ navigation }) => (
            <PreferencesScreen profile={profile} onSave={persistProfile} onClose={() => navigation.goBack()} />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Personality">
          {({ navigation, route }) => (
            <PersonalityScreen
              pet={livePet}
              age={profile.age}
              welcome={route.params?.welcome === true}
              fromTour={route.params?.fromTour === true}
              onSave={async (next) => {
                const problem = await changePersonality(next.personality, next.persona, next.dials);
                // Arrived from the upgrade: once they've chosen, they're done here.
                if (problem === null && route.params?.welcome) navigation.goBack();
                return problem;
              }}
              canCustomise={canCustomise}
              onOpenPlus={() => navigation.navigate('Plus')}
              changesLeft={personalityChangesLeft}
              onClose={() => navigation.goBack()}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="CompanionMemories">
          {({ navigation }) => (
            <CompanionMemoriesScreen
              petId={livePet.id}
              petName={livePet.name}
              confirm={confirmDialog}
              onClose={() => navigation.goBack()}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Notifications">
          {({ navigation }) => (
            <NotificationsScreen
              petName={livePet.name}
              pushEnabled={pushEnabled}
              onPushEnabledChange={(next) => {
                setPushEnabled(next); // optimistic: the control must answer the tap
                void setDevicePush(next).then((status) => {
                  if (status !== 'ready') setPushEnabled((current) => (current === next ? !next : current));
                });
              }}
              islandEnabled={canShowIsland() ? islandEnabled : null}
              onIslandEnabledChange={(next) => {
                setIslandEnabled(next);
                void repository.saveIslandEnabled(next);
              }}
              affirmationsEnabled={affirmationsEnabled}
              onAffirmationsEnabledChange={(next) => {
                setAffirmationsEnabled(next);
                void saveAffirmationsEnabled(next);
                // Asked here, in the moment someone wants them, never at launch.
                if (next && reminderPermission !== 'granted') {
                  void requestReminderPermission().then(setReminderPermission);
                }
              }}
              onClose={() => navigation.goBack()}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="DeleteAccount">
          {({ navigation }) => (
            <DeleteAccountScreen
              onDeleteAccount={deleteAccount}
              deleting={isDeletingAccount}
              onClose={() => navigation.goBack()}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="PetStats">
          {({ navigation }) => (
            <PetStatsScreen
              pet={livePet}
              events={events}
              onClose={() => navigation.goBack()}
              onShare={() => navigation.navigate('ShareCard')}
              onChooseForm={(next) => void changeForm(next)}
              wordPuzzleStarted={
                wordPuzzleProgress?.puzzleDate === toDateKey(new Date()) &&
                wordPuzzleProgress.guesses.some((round) => round.length > 0)
              }
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="ShareCard">
          {({ navigation }) => (
            <ShareCardScreen pet={livePet} events={events} onClose={() => navigation.goBack()} />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Friends">
          {({ navigation, route }) => (
            <FriendsScreen
              currentUserId={userId}
              onClose={() => navigation.goBack()}
              // Local only: friendsService has already written it. This just
              // stops the Profile card showing a stale handle until a reload.
              onUsernameChange={(username) => setProfile((current) => ({ ...current, username }))}
              onOpenFriendPet={(friendUserId, friendUserIds) =>
                navigation.navigate('FriendPet', { friendUserId, friendUserIds })
              }
              openJoin={route.params?.join === true}
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
                      onRemovePartner: removePartner,
                    }
                  : undefined
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
        <RootStack.Screen name="ChooseCompanion">
          {({ navigation }) => (
            <ChooseCompanionScreen
              breed={pet.breed}
              owned={ownedBreedsOf(pet)}
              coins={coinsOf(pet)}
              cost={isDev ? 0 : BREED_CHANGE_COST}
              onChoose={(next) => void changeBreed(next)}
              onClose={() => navigation.goBack()}
              pet={livePet}
              onChooseForm={(next) => void changeForm(next)}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Plus">
          {({ navigation }) => (
            <PlusScreen
              isDevAccount={isDev}
              onTierChange={(tier) => {
                // The dev account stays Plus whatever the store says.
                if (!isDev) setCompanionTier(tier);
              }}
              // Plus's headline is choosing who the pet is, and a free pet has
              // only ever had the default voice. Straight there, so the upgrade
              // is felt at once (back to that page if it is what sent them here).
              onPurchased={() => navigation.popTo('Personality', { welcome: true })}
              onClose={() => navigation.goBack()}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Companion">
          {({ navigation }) => (
            <CompanionChatScreen
              pet={livePet}
              life={buildLifeContext({ pet: livePet, events, profile, stepGoal })}
              onOpenPlus={canCustomise ? undefined : () => navigation.navigate('Plus')}
              onApplyProposal={applyCompanionProposal}
              onClose={() => {
                // Opening the conversation is reading it.
                setUnreadCompanion(0);
                setCompanionSaid(null);
                navigation.goBack();
              }}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="CompanionDebug">
          {({ navigation }) => (
            <CompanionDebugScreen
              pet={livePet}
              events={events}
              profile={profile}
              stepGoal={stepGoal}
              onChangePersonality={(next, persona, dials) => void changePersonality(next, persona, dials)}
              onOpenChat={() => navigation.replace('Companion')}
              onClose={() => navigation.goBack()}
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Today">
          {({ navigation }) => (
            <TodayScreen
              insightsUnlocked={canCustomise}
              onOpenPlus={() => navigation.navigate('Plus')}
              pet={livePet}
              events={events}
              profile={profile}
              stepGoal={stepGoal}
              onStepGoalChange={setStepGoal}
              onLogWater={logWater}
              onTrainMind={() => navigation.navigate('MindGym')}
              onOpenFoodTrends={() => navigation.navigate('FoodTrends')}
              onOpenStepTrends={() => navigation.navigate('StepTrends')}
              onOpenLiftProgress={() => navigation.navigate('LiftProgress', { from: 'Today' })}
              onOpenWeight={() => navigation.navigate('Weight')}
              onOpenWeek={() => navigation.navigate('WeeklyRecap')}
              onEditLog={openEdit}
              onDeleteLog={(event) => void removeEvent(event)}
              onOpenWordPuzzle={() => navigation.navigate('WordPuzzle')}
              onOpenProfile={() => navigation.navigate('Profile')}
              onOpenHistory={() => navigation.navigate('ActivityHistory')}
              onClose={() => navigation.goBack()}
              careDiary={careDiary}
              onRefresh={isOnline && shared ? () => refreshShared() : undefined}
              forcedAilment={isDev ? forcedAilment : undefined}
              onForceAilment={isDev ? setForcedAilment : undefined}
              forcedForm={isDev ? forcedForm : undefined}
              onForceForm={isDev ? setForcedForm : undefined}
              onSeedTestData={isDev ? () => void seedTestData() : undefined}
              onClearSeededData={isDev ? () => void clearSeededData() : undefined}
              isSeeding={isSeeding}
              onConnectHealth={Platform.OS === 'ios' && !isAppleHealthConnected ? () => void connectAppleHealth() : undefined}
              onSyncSteps={Platform.OS === 'ios' && isAppleHealthConnected ? syncStepsNow : undefined}
              forcedTrophies={isDev ? forcedTrophies : undefined}
              onForceTrophies={isDev ? setForcedTrophies : undefined}
              forcedFreezes={isDev ? forcedFreezes : undefined}
              onForceFreezes={isDev ? forceFreezes : undefined}
              onReplayAchievements={isDev ? replayAchievements : undefined}
              onOpenCompanionDebug={isDev && isOnline ? () => navigation.navigate('CompanionDebug') : undefined}
              onDevCheckIn={
                isDev && isOnline
                  ? async (kind) => {
                      await devCheckIn(kind);
                      navigation.goBack();
                    }
                  : undefined
              }
            />
          )}
        </RootStack.Screen>
        {/* The navigator's sheet is these screens' only sheet: each draws a
            SheetPage, never a Modal of its own (a sheet inside a sheet left a
            blank page sliding away after it closed). Swiping down closes the
            quick ones; a workout or game in progress closes from its own
            button, so a stray swipe cannot throw it away. */}
        <RootStack.Group screenOptions={{ presentation: 'modal' }}>
          <RootStack.Screen name="WeeklyRecap">
            {({ navigation }) => (
              <WeeklyRecapScreen pet={livePet} events={events} profile={profile} stepGoal={stepGoal} onClose={() => navigation.goBack()} />
            )}
          </RootStack.Screen>
          <RootStack.Screen name="Weight">
            {({ navigation, route }) => (
              <WeightScreen
                events={events}
                unit={profile.weightUnit}
                goalKg={profile.goal !== 'maintain' ? profile.targetWeightKg : undefined}
                editId={route.params?.editId}
                onLog={logWeight}
                onEdit={editWeight}
                onDelete={(event) => void removeEvent(event)}
                onClose={() => navigation.goBack()}
              />
            )}
          </RootStack.Screen>
          <RootStack.Screen name="EditMeal">
            {({ navigation, route }) => {
              const meal = events.find((event) => event.id === route.params.id);
              return meal ? (
                <EditMealScreen
                  meal={meal as HealthEvent<MealMetadata>}
                  onSave={(metadata) => editEvent(meal, metadata as Record<string, unknown>)}
                  onClose={() => navigation.goBack()}
                />
              ) : null;
            }}
          </RootStack.Screen>
          <RootStack.Screen name="MealCapture">
            {({ navigation }) => (
              <MealCaptureScreen
                // No navigation here: the screen calls `onFeedStart` and then
                // `onClose` itself, and closing twice raced the feed animation.
                onComplete={completeMeal}
                // Photo macro tracking is Plus; the paywall opens once this modal is gone.
                canScanPhotos={canCustomise}
                repeatable={mealsToRepeat}
                knownFoods={knownFoods}
                copyableFor={(slot) => copyableSlot(events, slot)}
                onCopy={copyMeals}
                onOpenPlus={() => {
                  navigation.goBack();
                  navigation.navigate('Plus');
                }}
                petContext={
                  livePet
                    ? {
                        name: livePet.name,
                        personality: livePet.personality,
                        mood: livePet.mood,
                        ailments: assessCondition(livePet).ailments,
                      }
                    : undefined
                }
                onFeedStart={interaction.startFeeding}
                onAnalyzingChange={(analyzing) =>
                  analyzing ? interaction.startAnalyzing() : interaction.stopAnalyzing()
                }
                onClose={() => navigation.goBack()}
              />
            )}
          </RootStack.Screen>
          <RootStack.Screen name="Workout" options={{ gestureEnabled: false }}>
            {({ navigation, route }) => (
              (() => {
                const edited = route.params?.editId ? events.find((event) => event.id === route.params?.editId) : undefined;
                return edited ? (
                  <WorkoutScreen
                    weightUnit={liftUnit}
                    editing={edited.metadata as WorkoutMetadata}
                    onSaveEdit={(metadata) => editEvent(edited, metadata as unknown as Record<string, unknown>)}
                    onFinish={completeWorkout}
                    onClose={() => navigation.goBack()}
                  />
                ) : (
                  <WorkoutScreen
                    startWithCardio={route.params?.cardio === true}
                    weightUnit={liftUnit}
                    templates={workoutTemplates}
                    lastSets={lastSets}
                    history={events}
                    onSaveTemplate={saveWorkoutTemplate}
                    onDeleteTemplate={deleteWorkoutTemplate}
                    schedule={trainingSchedule}
                    onSaveSchedule={storeTrainingSchedule}
                    // No navigation here: the screen closes itself (`onClose`) once
                    // the workout and its routine are saved. Going back here as
                    // well closed it twice, and the second went back past it.
                    onFinish={completeWorkout}
                    onClose={() => navigation.goBack()}
                  />
                );
              })()
            )}
          </RootStack.Screen>
          <RootStack.Screen name="MindGym" options={{ gestureEnabled: false }}>
            {({ navigation }) => (
              <MindGymScreen
                // The hub shows the real pet, the same renderer every game
                // screen uses -- see `MindTodayPanel`.
                pet={livePet}
                events={events}
                // The sheet closes itself the moment this resolves, so the save is
                // not awaited: the reaction and the care toast land on the dashboard
                // when the write does, and holding a "Saving..." spinner open on two
                // network round trips gained nothing. A failure still shows in the
                // app's error banner (recordEvent sets it before rethrowing), which
                // is why it is swallowed here rather than left as an unhandled rejection.
                onFinish={async (metadata) => {
                  void completeMindSession(metadata).catch(() => undefined);
                }}
                // `replace` swaps this sheet for the puzzle rather than stacking a
                // second modal on top of the one already presented.
                onOpenWordPuzzle={() => navigation.replace('WordPuzzle')}
                onOpenFourCorners={() => navigation.replace('FourCorners')}
                onOpenPetJeopardy={() => navigation.replace('PetJeopardy')}
                onClose={() => closeMindGame(navigation)}
              />
            )}
          </RootStack.Screen>
          <RootStack.Screen name="FourCorners" options={{ gestureEnabled: false }}>
            {({ navigation }) => (
              <FourCornersScreen
                pet={livePet}
                // One BRAIN_TRAINING event per round, recorded through the same
                // path every other mind game uses -- the screen guards against
                // calling this twice, so nothing here needs to.
                onFinish={completeMindSession}
                onClose={() => closeMindGame(navigation)}
              />
            )}
          </RootStack.Screen>
          <RootStack.Screen name="PetJeopardy" options={{ gestureEnabled: false }}>
            {({ navigation }) => (
              <PetJeopardyScreen
                pet={livePet}
                // One BRAIN_TRAINING event per game, through the same path every
                // other mind game uses. The screen guards against calling this
                // twice, so nothing here needs to -- and because the metadata
                // carries an explicit `xpAwarded`, the wager's result reaches the
                // pet engine as that one number rather than a second award call.
                onFinish={completeMindSession}
                onClose={() => closeMindGame(navigation)}
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
                // Saved means done: straight back to the pet, like every other log.
                onFinish={async (metadata) => {
                  await completeMindSession(metadata);
                  clearWordPuzzleProgress();
                  closeMindGame(navigation);
                }}
                onClose={() => closeMindGame(navigation)}
              />
            )}
          </RootStack.Screen>
        </RootStack.Group>
      </RootStack.Navigator>
      </TourProvider>

      {error ? (
        <View style={styles.banner} pointerEvents="none">
          <Text style={styles.bannerText}>{error}</Text>
        </View>
      ) : null}
      {/* The Done bar over iOS's number pads, for every screen's number fields. */}
      <UndoToast offer={undoOffer} onDone={() => setUndoOffer(null)} />
    </NavigationContainer>
  );
}

const styles = themedStyles(() => ({
  center: { alignItems: 'center', justifyContent: 'center' },
  loadFailed: { paddingHorizontal: 32, gap: 12 },
  loadFailedTitle: { fontFamily: fonts.ui, fontSize: 22, color: colors.ink, textAlign: 'center' },
  loadFailedBody: { fontFamily: fonts.ui, fontSize: 17, color: colors.inkSoft, textAlign: 'center' },
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 34,
    backgroundColor: colors.coralWash,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: 12,
    padding: 13,
  },
  bannerText: { fontFamily: fonts.ui, fontSize: 12, color: colors.coralDeep, lineHeight: 17 },
}));
