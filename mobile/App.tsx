import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme, type Theme as NavigationTheme } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { Session } from '@supabase/supabase-js';
import { type BodyProfile, type PetBreed, type BrainTrainingMetadata, type HealthEvent, type MealAnalysis, type MealMetadata, PROFILE_SURVEY_DEFAULTS, PetHealthEngine, type PetReaction, type PetState, type StepMetadata, SupabaseRepository, type WorkoutMetadata, applyDelta, applyTimeDecay, calculateStreaks, createPet, errorMessage, getEventsForDay, getSession, newId, onAuthStateChange, setIdGenerator, signOut, withSurveyDefaults } from '@vitto/core';
import { LocalRepository } from './src/services/localRepository';
import type { HealthDataProvider } from './src/services/healthDataProvider';
import { MockHealthDataProvider } from './src/services/healthDataProvider';
import { HealthKitProvider, RECENT_SYNC_WINDOW_HOURS } from './src/services/healthKitProvider';
import { getKnownHealthKitExternalIds } from './src/services/healthKitMapping';
import { isSupabaseConfigured } from './src/services/supabaseClient';
import { playCelebrationSound, playMealSound, playMunchSound } from './src/services/mealFeedback';
import { AuthScreen } from './src/screens/AuthScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { MealCaptureScreen } from './src/screens/MealCaptureScreen';
import { MindGymScreen } from './src/screens/MindGymScreen';
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
  MealCapture: undefined;
  Workout: undefined;
  MindGym: undefined;
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
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [dataReady, setDataReady] = useState(false);
  const [pet, setPet] = useState<PetState | null>(null);
  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [profile, setProfile] = useState<BodyProfile>(DEFAULT_PROFILE);
  const [reaction, setReaction] = useState<PetReaction | null>(null);
  const [name, setName] = useState('Miso');
  // Chosen at adoption; changeable later from the profile.
  const [breed, setBreed] = useState<PetBreed>('bichon');
  const [error, setError] = useState<string | null>(null);
  const [stepGoal, setStepGoal] = useState(10000);

  const [isAnalyzingMeal, setIsAnalyzingMeal] = useState(false);
  const [isEating, setIsEating] = useState(false);
  const [feedingImage, setFeedingImage] = useState<string | null>(null);
  const [feedingGrade, setFeedingGrade] = useState<MealAnalysis['grade'] | null>(null);
  const [isCelebrating, setIsCelebrating] = useState(false);
  const [isWorkingOut, setIsWorkingOut] = useState(false);
  const [isExploring, setIsExploring] = useState(false);
  const [isAppleHealthConnected, setIsAppleHealthConnected] = useState(false);
  const [isSyncingAppleHealth, setIsSyncingAppleHealth] = useState(false);

  const userId = session?.user.id ?? 'demo-user';

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

    void (async () => {
      if (isSupabaseConfigured && session) {
        const [petResult, eventsResult, profileResult] = await Promise.allSettled([
          remoteRepository.loadPet(),
          remoteRepository.loadEvents(),
          remoteRepository.loadProfile(),
        ]);
        if (cancelled) return;

        if (petResult.status === 'fulfilled') {
          setPet(petResult.value ? applyTimeDecay(petResult.value, new Date()) : null);
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
      setPet(storedPet ? applyTimeDecay(storedPet, new Date()) : null);
      setEvents(storedEvents);
      if (storedProfile) setProfile(withSurveyDefaults({ ...DEFAULT_PROFILE, ...storedProfile }));
      setDataReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

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

      if (isSupabaseConfigured && session) {
        await withTimeout(remoteRepository.savePet(nextPet), 'Saving timed out. Check your connection.');
        await withTimeout(remoteRepository.saveEvent(event), 'Saving timed out. Check your connection.');
      }
      await repository.savePet(nextPet);
      await repository.saveEvent(event);
      setPet(nextPet);
      setReaction(nextReaction);
      setEvents((current) => [event, ...current]);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save this care moment.'));
      throw cause;
    }
  };

  const changeBreed = async (next: PetBreed) => {
    if (!pet) return;
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

  const syncSteps = async () => {
    setIsExploring(true);
    setTimeout(() => setIsExploring(false), EXPLORE_ANIMATION_MS);
    const event = await stepsProvider.getTodaySteps(userId);
    await recordEvent(event as HealthEvent<StepMetadata>);
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
        setIsAppleHealthConnected(false);
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
                      pet={pet}
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
                      accountInitial={session?.user.email?.charAt(0)}
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
                onFinish={async (metadata) => {
                  await completeMindSession(metadata);
                  navigation.goBack();
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
