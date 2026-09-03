import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme, type Theme as NavigationTheme } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { Session } from '@supabase/supabase-js';
import { type BodyProfile, type PetBreed, type BrainTrainingMetadata, type HealthEvent, type MealAnalysis, type MealMetadata, PROFILE_SURVEY_DEFAULTS, PetHealthEngine, type ForcedPetStatus, type PetReaction, type PetState, type StepMetadata, SupabaseRepository, type WorkoutMetadata, DECAY_TICK_MS, applyDelta, applyForcedAilment, applyTimeDecay, assessCondition, calculateStreaks, createPet, errorMessage, getEventsForDay, getSession, isDevAccount, newId, onAuthStateChange, setIdGenerator, signOut, toDateKey, withSurveyDefaults } from '@vitto/core';
import { type WordPuzzleProgress, LocalRepository } from './src/services/localRepository';
import type { HealthDataProvider } from './src/services/healthDataProvider';
import { MockHealthDataProvider } from './src/services/healthDataProvider';
import { HealthKitProvider, RECENT_SYNC_WINDOW_HOURS } from './src/services/healthKitProvider';
import { getKnownHealthKitExternalIds } from './src/services/healthKitMapping';
import { isSupabaseConfigured } from './src/services/supabaseClient';
import { playCelebrationSound, playMealSound, playMunchSound } from './src/services/mealFeedback';
import { PrimaryButton, TextButton } from './src/components/ui';
import { AuthScreen } from './src/screens/AuthScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { PetStatsScreen } from './src/screens/PetStatsScreen';
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
// iOS gets the real HealthKit-backed provider; every other platform (Android,
// web-via-react-native-web) falls back to the mock until a Health Connect
// provider exists. See mobile/HEALTHKIT.md.
const stepsProvider: HealthDataProvider =
  Platform.OS === 'ios' ? new HealthKitProvider() : new MockHealthDataProvider();

// The main app's screens, once a session exists and a pet has been adopted.
// Auth and Onboarding stay outside this tree — they're single-screen states
// with no back/forward navigation of their own.
type RootStackParamList = {
  Main: undefined;
  // A drill-down off the dashboard, so it pushes rather than presenting as a modal.
  PetStats: undefined;
  MealCapture: undefined;
  Workout: undefined;
  MindGym: undefined;
  WordPuzzle: undefined;
};
type MainTabParamList = {
  Dashboard: undefined;
  Profile: undefined;
};
const RootStack = createNativeStackNavigator<RootStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();

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
const EXPLORE_ANIMATION_MS = 1100;
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365];
const STREAK_MILESTONE_BONUS_XP = 25;
/**
 * How long a care moment's message stays up. It has to clear on its own: the
 * dashboard shows an ailment on the same line, so a reaction that never expires
 * would permanently hide "Miso is starving".
 */
const REACTION_VISIBLE_MS = 6000;
/**
 * One care moment has to visibly pull a pet back from `dying`, or the only thing
 * a returning user can do is watch it stay collapsed. Paid once, on the event
 * that finds the pet dying.
 */
const REVIVAL_BONUS = { health: 35, nutrition: 25, energy: 20, happiness: 20 } as const;

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

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  // Dev tool, display only — see `applyForcedAilment`. Never persisted, and reset
  // by a sign-out along with the rest of the session's state.
  const [forcedAilment, setForcedAilment] = useState<ForcedPetStatus | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [dataReady, setDataReady] = useState(false);
  const [pet, setPet] = useState<PetState | null>(null);
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
  // The clock the decay projection is read against. Stored state, not `new Date()`
  // inline, so a tick is what re-renders the pet rather than an unrelated update.
  const [now, setNow] = useState(() => new Date());

  const userId = session?.user.id ?? 'demo-user';

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), DECAY_TICK_MS);
    // RN throttles timers in the background, so an app resumed after a night away
    // would otherwise paint yesterday's stats until the next tick landed.
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
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
          remoteRepository.loadPet(),
          remoteRepository.loadEvents(),
          remoteRepository.loadProfile(),
        ]);
        if (cancelled) return;

        setPetLoadFailed(petResult.status === 'rejected');
        if (petResult.status === 'fulfilled') {
          // The STORED pet, never the decayed projection: `applyTimeDecay` leaves
          // `lastEventAt` where it was, so holding its output in state makes the
          // next care moment replay the same elapsed window a second time.
          setPet(petResult.value);
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
        return;
      }

      const [storedPet, storedEvents, storedProfile] = await Promise.all([
        repository.loadPet(),
        repository.loadEvents(),
        repository.loadProfile<Partial<BodyProfile>>(),
      ]);
      if (cancelled) return;
      // Raw, for the same reason as the remote branch above.
      setPet(storedPet);
      setEvents(storedEvents);
      if (storedProfile) setProfile(withSurveyDefaults({ ...DEFAULT_PROFILE, ...storedProfile }));
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

  const recordEvent = async (event: HealthEvent<unknown>) => {
    if (!pet) return;
    try {
      const eventDay = new Date(event.occurredAt);
      const wasActiveToday = getEventsForDay(events, eventDay).length > 0;
      const decayed = applyTimeDecay(pet, eventDay);
      // Read before the event lands: the point is whether this care moment is the
      // one that arrived at the brink, not where it left the pet afterwards.
      const wasDying = assessCondition(decayed).primary === 'dying';
      const result = engine.apply(decayed, event);
      let nextPet = result.pet;
      let nextReaction = result.reaction;

      if (!wasActiveToday) {
        const projected = calculateStreaks([...events, event], eventDay).currentStreak;
        if (STREAK_MILESTONES.includes(projected)) {
          const bonus = { xp: STREAK_MILESTONE_BONUS_XP, happiness: 10 };
          nextPet = applyDelta(nextPet, bonus, event.occurredAt);
          nextReaction = {
            message: `${pet.name} celebrates your ${projected}-day streak! +${STREAK_MILESTONE_BONUS_XP} bonus XP`,
            eventLabel: 'Streak milestone',
            delta: bonus,
          };
        }
      }

      // Last, so its message is the one shown: coming back from the brink outranks
      // both the event's own reaction and a streak milestone.
      if (wasDying) {
        nextPet = applyDelta(nextPet, REVIVAL_BONUS, event.occurredAt);
        nextReaction = {
          message: `${pet.name} was fading — that care moment brought them back.`,
          eventLabel: 'Back from the brink',
          delta: { ...REVIVAL_BONUS },
        };
      }

      if (isSupabaseConfigured && session) {
        await withTimeout(remoteRepository.savePet(nextPet), 'Saving timed out. Check your connection.');
        await withTimeout(remoteRepository.saveEvent(event), 'Saving timed out. Check your connection.');
      }
      await repository.savePet(nextPet);
      await repository.saveEvent(event);
      setPet(nextPet);
      showReaction(nextReaction);
      setEvents((current) => [event, ...current]);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save this care moment.'));
      throw cause;
    }
  };

  const changeBreed = async (next: PetBreed) => {
    if (!pet) return;
    // `pet` is the stored pet, so this saves a breed change and nothing else —
    // it cannot bake a decay projection into the row on its way past.
    const nextPet = { ...pet, breed: next };
    setPet(nextPet);
    setBreed(next);
    try {
      if (isSupabaseConfigured && session) await remoteRepository.savePet(nextPet);
      await repository.savePet(nextPet);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not change your companion.'));
    }
  };

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
    setFeedingImage(imageUri);
    setFeedingGrade(grade);
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

  const syncAppleHealth = async () => {
    if (!pet) return;
    setIsSyncingAppleHealth(true);
    try {
      // Never ask for anything older than the pet's current anchor: replaying an
      // event earlier than `lastEventAt` would rewind it, corrupting future
      // decay math. The recent-window cap on top of that is a deliberate scope
      // choice — see RECENT_SYNC_WINDOW_HOURS in healthKitProvider.ts.
      const windowStart = Date.now() - RECENT_SYNC_WINDOW_HOURS * 60 * 60 * 1000;
      const lastEventAtMs = pet.lastEventAt ? new Date(pet.lastEventAt).getTime() : windowStart;
      const since = new Date(Math.max(windowStart, lastEventAtMs));
      const knownExternalIds = getKnownHealthKitExternalIds(events);

      const [workouts, meals] = await Promise.all([
        stepsProvider.getNewWorkouts(userId, since, knownExternalIds),
        stepsProvider.getNewMeals(userId, since, knownExternalIds),
      ]);
      const importedInOrder = [...workouts, ...meals].sort((a, b) =>
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
        setPet(null);
        setEvents([]);
        setWordPuzzleProgress(null);
        setIsAppleHealthConnected(false);
        setForcedAilment(null);
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
        />
      </View>
    );
  }

  // What the screens draw: the stored pet projected forward to `now`. Derived on
  // every tick, stored nowhere.
  const isDev = isDevAccount(session?.user.email);
  // Applies to this projection only -- `recordEvent` decays from the STORED pet,
  // so a forced stat can never be written back. Gated again on `isDev` here so a
  // stale value could not survive switching to a non-dev account.
  const livePet = applyForcedAilment(applyTimeDecay(pet, now), isDev ? forcedAilment : null);

  return (
    <NavigationContainer theme={navigationTheme}>
      <StatusBar barStyle="dark-content" />
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Main">
          {() => (
            <MainTab.Navigator
              screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: colors.coral,
                tabBarInactiveTintColor: colors.muted,
                tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.hairline },
                tabBarLabelStyle: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.4 },
              }}
            >
              <MainTab.Screen name="Dashboard" options={{ tabBarLabel: 'My Pet' }}>
                {({ navigation }) => {
                  const rootNav = navigation.getParent() as NativeStackNavigationProp<RootStackParamList> | undefined;
                  return (
                    <DashboardScreen
                      pet={livePet}
                      events={events}
                      profile={profile}
                      reaction={reaction}
                      stepGoal={stepGoal}
                      onStepGoalChange={setStepGoal}
                      onLogMeal={() => rootNav?.navigate('MealCapture')}
                      onLogWorkout={() => rootNav?.navigate('Workout')}
                      onSyncSteps={() => void syncSteps()}
                      onTrainMind={() => rootNav?.navigate('MindGym')}
                      onOpenProfile={() => navigation.navigate('Profile')}
                      onOpenStats={() => rootNav?.navigate('PetStats')}
                      accountInitial={session?.user.email?.charAt(0)}
                      forcedAilment={isDev ? forcedAilment : undefined}
                      onForceAilment={isDev ? setForcedAilment : undefined}
                      isAnalyzingMeal={isAnalyzingMeal}
                      isEating={isEating}
                      feedingImage={feedingImage}
                      feedingGrade={feedingGrade}
                      isCelebrating={isCelebrating}
                      isWorkingOut={isWorkingOut}
                      isExploring={isExploring}
                    />
                  );
                }}
              </MainTab.Screen>
              <MainTab.Screen name="Profile">
                {({ navigation }) => (
                  <ProfileScreen
                    profile={profile}
                    breed={pet.breed}
                    onBreedChange={(next) => void changeBreed(next)}
                    events={events}
                    onSave={persistProfile}
                    onClose={() => navigation.navigate('Dashboard')}
                    onSignOut={isSupabaseConfigured && session ? logOut : undefined}
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
                  />
                )}
              </MainTab.Screen>
            </MainTab.Navigator>
          )}
        </RootStack.Screen>
        <RootStack.Screen name="PetStats">
          {({ navigation }) => (
            <PetStatsScreen pet={livePet} events={events} onClose={() => navigation.goBack()} />
          )}
        </RootStack.Screen>
        <RootStack.Group screenOptions={{ presentation: 'modal' }}>
          <RootStack.Screen name="MealCapture">
            {({ navigation }) => (
              <MealCaptureScreen
                onComplete={async (metadata) => {
                  await completeMeal(metadata);
                  navigation.goBack();
                }}
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
