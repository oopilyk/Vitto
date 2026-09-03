import { Fragment, useEffect, useState, type ReactNode } from "react";
import { type BodyProfile, type BrainTrainingMetadata, EVOLUTION_STAGE_LABEL, FOCUS_AREAS, type FocusArea, type HealthEvent, type MealAnalysis, type MealMetadata, PROFILE_SURVEY_DEFAULTS, PetHealthEngine, type PetReaction, type PetState, SupabaseRepository, type WorkoutMetadata, applyDelta, applyTimeDecay, calculateMacroTargets, calculateStreaks, createPet, errorMessage, estimateCaloriesBurned, getEventsForDay, getEvolutionStage, getMealsForDay, getSession, mindScoreLabel, onAuthStateChange, signInWithEmail, signOut, signUpWithEmail, sumMealMacros, withSurveyDefaults } from '@vitto/core';
import { MockHealthDataProvider } from "./services/healthDataProvider";
import { LocalRepository } from "./services/localRepository";
import { MealCapture } from "./components/MealCapture";
import { PetAvatar } from "./components/PetAvatar";
import { NutrientRing } from "./components/NutrientRing";
import { MealDiaryRow } from "./components/MealDiaryRow";
import { isSupabaseConfigured } from "./services/supabaseClient";
import { ProfilePage } from "./components/ProfilePage";
import { WorkoutFlow } from "./components/WorkoutFlow";
import { Onboarding } from "./components/Onboarding";
import { MindGym } from "./components/MindGym";
import { playCelebrationSound, playMealSound, playMunchSound } from "./services/mealFeedback";

const repository = new LocalRepository();
const engine = new PetHealthEngine();
const stepsProvider = new MockHealthDataProvider();
const remoteRepository = new SupabaseRepository();
const WORKOUT_ANIMATION_MS = 1100;
const EXPLORE_ANIMATION_MS = 1100;
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365];
const STREAK_MILESTONE_BONUS_XP = 25;
const CARE_EVENT_LABEL: Partial<Record<HealthEvent["type"], string>> = {
  WORKOUT: "Trained together",
  STEP_ACTIVITY: "Went exploring",
  BRAIN_TRAINING: "Trained your mind",
};
const withTimeout = <T,>(promise: Promise<T>, message: string) => Promise.race([
  promise,
  new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(message)), 10000)),
]);

const makeEvent = <T,>(
  userId: string,
  type: HealthEvent["type"],
  metadata: T,
): HealthEvent<T> => ({
  id: crypto.randomUUID(),
  userId,
  occurredAt: new Date().toISOString(),
  type,
  source: "manual",
  metadata,
});

function App() {
  const [session, setSession] =
    useState<Awaited<ReturnType<typeof getSession>>["data"]["session"]>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  // Raw stored pet: never a decayed projection. Decay is derived at render
  // time as `livePet`; storing the projection would re-apply the same elapsed
  // window on every pass (`lastEventAt` does not move) and persist the loss.
  const [pet, setPet] = useState<PetState | null>(() => repository.loadPet());
  const [events, setEvents] = useState(() => repository.loadEvents());
  const [reaction, setReaction] = useState<PetReaction | null>(null);
  const [name, setName] = useState("Miso");
  const [profile, setProfile] = useState<BodyProfile>({
    age: 30,
    sex: "other",
    heightCm: 170,
    heightUnit: "cm",
    weightKg: 70,
    weightUnit: "kg",
    activity: "moderate",
    goal: "maintain",
    ...PROFILE_SURVEY_DEFAULTS,
  });
  const [showMealCapture, setShowMealCapture] = useState(false);
  const [view, setView] = useState<"pet" | "profile">("pet");
  const [showWorkout, setShowWorkout] = useState(false);
  const [showMindGym, setShowMindGym] = useState(false);
  const [stepGoal, setStepGoal] = useState(10000);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountDataReady, setAccountDataReady] =
    useState(!isSupabaseConfigured);
  const [isEating, setIsEating] = useState(false);
  const [feedingImage, setFeedingImage] = useState<string | null>(null);
  const [feedingGrade, setFeedingGrade] = useState<MealAnalysis["grade"] | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isAnalyzingMeal, setIsAnalyzingMeal] = useState(false);
  const [isWorkingOut, setIsWorkingOut] = useState(false);
  const [isExploring, setIsExploring] = useState(false);
  const userId = session?.user.id ?? "demo-user";

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    getSession()
      .then(({ data }) => {
        setSession(data.session);
        setAuthReady(true);
      })
      .catch(() => {
        setAuthError("Could not connect to Supabase.");
        setAuthReady(true);
      });
    const { data: listener } = onAuthStateChange((_event, nextSession) =>
      setSession(nextSession),
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (isSupabaseConfigured && session) {
      setAccountDataReady(false);
      setPet(null);
      setEvents([]);
      setView("pet");
      void (async () => {
        const [petResult, eventsResult, profileResult] = await Promise.allSettled([
          remoteRepository.loadPet(),
          remoteRepository.loadEvents(),
          remoteRepository.loadProfile(),
        ]);
        if (cancelled) return;

        if (petResult.status === "fulfilled") {
          setPet(petResult.value ?? null);
        }
        if (eventsResult.status === "fulfilled") {
          setEvents(eventsResult.value);
        }
        if (profileResult.status === "fulfilled" && profileResult.value) {
          setProfile(profileResult.value);
        }

        const firstFailure = [petResult, eventsResult, profileResult].find(
          (result) => result.status === "rejected",
        );
        if (firstFailure && firstFailure.status === "rejected") {
          const reason = firstFailure.reason;
          setAuthError(
            reason instanceof Error
              ? reason.message
              : "Could not load your account data.",
          );
        } else {
          setAuthError(null);
        }
        setAccountDataReady(true);
      })();
      return () => {
        cancelled = true;
      };
    }
    setAccountDataReady(true);
    const savedProfile = localStorage.getItem("vitto.profile");
    if (savedProfile)
      setProfile(
        withSurveyDefaults({
          heightUnit: "cm",
          weightUnit: "kg",
          ...(JSON.parse(savedProfile) as Partial<BodyProfile>),
        }),
      );
  }, [session]);

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    setAuthMessage(null);
    try {
      const result =
        authMode === "sign-in"
          ? await signInWithEmail(authEmail, authPassword)
          : await signUpWithEmail(authEmail, authPassword, authName);
      if (result.error) throw result.error;
      if (authMode === "sign-up" && !result.data.session)
        setAuthMessage("Check your email to confirm your account.");
    } catch (cause) {
      setAuthError(
        cause instanceof Error ? cause.message : "Authentication failed.",
      );
    }
  };

  const saveProfile = async (nextProfile: BodyProfile) => {
    setProfile(nextProfile);
    if (isSupabaseConfigured && session)
      await remoteRepository.saveProfile(nextProfile);
    else localStorage.setItem("vitto.profile", JSON.stringify(nextProfile));
  };

  const updateProfile = <K extends keyof BodyProfile>(key: K, value: BodyProfile[K]) => {
    setProfile((current) => {
      const nextProfile = { ...current, [key]: value };
      if (isSupabaseConfigured && session) {
        void remoteRepository.saveProfile(nextProfile).catch(() => undefined);
        return nextProfile;
      }
      localStorage.setItem("vitto.profile", JSON.stringify(nextProfile));
      return nextProfile;
    });
  };

  const adopt = async () => {
    try {
      setAuthError(null);
      if (profile.age < 13 || profile.age > 100) {
        throw new Error("Age must be between 13 and 100.");
      }
      if (profile.heightCm < 120 || profile.heightCm > 230) {
        throw new Error("Height must be between 120 and 230 cm.");
      }
      if (profile.weightKg < 30 || profile.weightKg > 300) {
        throw new Error("Weight must be between 30 and 300 kg.");
      }
      const nextPet = createPet(userId, name.trim() || "Miso");
      if (isSupabaseConfigured && session)
        await remoteRepository.savePet(nextPet);
      await saveProfile(profile);
      repository.savePet(nextPet);
      setPet(nextPet);
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : typeof cause === "object" &&
              cause &&
              "message" in cause &&
              typeof (cause as { message: unknown }).message === "string"
            ? (cause as { message: string }).message
            : "Could not save your pet.";
      setAuthError(message);
    }
  };

  const recordEvent = async (event: HealthEvent<unknown>) => {
    if (!pet) return;
    try {
      const eventDay = new Date(event.occurredAt);
      const wasActiveToday = getEventsForDay(events, eventDay).length > 0;
      // `pet` is the raw stored pet, so this is the one legitimate decay ->
      // delta -> new `lastEventAt` sequence; `nextPet` is raw again and safe to persist.
      const decayedPet = applyTimeDecay(pet, eventDay);
      // Strength is scored against recent training, so hand the engine the
      // history it needs plus body weight for bodyweight-exercise volume.
      const result = engine.apply(decayedPet, event, { history: events, bodyWeightKg: profile.weightKg });
      let nextPet = result.pet;
      let reaction = result.reaction;

      if (!wasActiveToday) {
        const projectedStreak = calculateStreaks([...events, event], eventDay).currentStreak;
        if (STREAK_MILESTONES.includes(projectedStreak)) {
          const bonusDelta = { xp: STREAK_MILESTONE_BONUS_XP, happiness: 10 };
          nextPet = applyDelta(nextPet, bonusDelta, event.occurredAt);
          reaction = {
            message: `${pet.name} celebrates your ${projectedStreak}-day streak! +${STREAK_MILESTONE_BONUS_XP} bonus XP`,
            eventLabel: "Streak milestone",
            delta: bonusDelta,
          };
        }
      }

      if (isSupabaseConfigured && session) {
        await withTimeout(remoteRepository.savePet(nextPet), "Saving timed out. Check your Supabase connection.");
        await withTimeout(remoteRepository.saveEvent(event), "Saving timed out. Check your Supabase connection.");
      }
      repository.savePet(nextPet);
      repository.saveEvent(event);
      setPet(nextPet);
      setReaction(reaction);
      setEvents(repository.loadEvents());
    } catch (cause) {
      setAuthError(errorMessage(cause, "Could not save this care moment."));
      throw cause;
    }
  };

  const logWorkout = () => setShowWorkout(true);
  const completeWorkout = async (metadata: WorkoutMetadata) => {
    setIsWorkingOut(true);
    window.setTimeout(() => setIsWorkingOut(false), WORKOUT_ANIMATION_MS);
    await recordEvent(makeEvent<WorkoutMetadata>(userId, "WORKOUT", metadata));
  };
  const logMeal = () => setShowMealCapture(true);
  const completeMeal = async (metadata: MealMetadata) => {
    playMealSound();
    await recordEvent(makeEvent<MealMetadata>(userId, "MEAL", metadata));
    setShowMealCapture(false);
  };
  const trainMind = () => setShowMindGym(true);
  const completeMindSession = async (metadata: BrainTrainingMetadata) => {
    await recordEvent(makeEvent<BrainTrainingMetadata>(userId, "BRAIN_TRAINING", metadata));
    setShowMindGym(false);
  };
  const startFeeding = (imageUrl: string | null, grade: MealAnalysis["grade"]) => {
    setFeedingImage(imageUrl);
    setFeedingGrade(grade);
    setIsEating(true);
    const munchTimer = window.setInterval(playMunchSound, 420);
    window.setTimeout(() => {
      setFeedingImage(null);
      window.setTimeout(() => {
        window.clearInterval(munchTimer);
        setIsEating(false);
        setShowConfetti(true);
        playCelebrationSound();
        window.setTimeout(() => setShowConfetti(false), 1500);
      }, 1900);
    }, 1050);
  };
  const logSteps = async () => {
    const alreadySynced = events.some((event) => event.type === "STEP_ACTIVITY" && new Date(event.occurredAt).toDateString() === new Date().toDateString());
    if (alreadySynced) return;
    setIsExploring(true);
    window.setTimeout(() => setIsExploring(false), EXPLORE_ANIMATION_MS);
    await recordEvent(await stepsProvider.getTodaySteps(userId));
  };
  const todaySteps = events.find((event) => event.type === "STEP_ACTIVITY" && new Date(event.occurredAt).toDateString() === new Date().toDateString());
  const steps = todaySteps ? (todaySteps.metadata as { steps: number }).steps : 0;
  const targets = calculateMacroTargets(profile);
  const today = new Date();
  const todaysEvents = getEventsForDay(events, today);
  const todaysMeals = getMealsForDay(events, today);
  const todaysNonMealEvents = todaysEvents.filter((event) => event.type !== "MEAL");
  const todaysMindSessions = todaysEvents.filter(
    (event): event is HealthEvent<BrainTrainingMetadata> => event.type === "BRAIN_TRAINING",
  );
  const bestMindScore = todaysMindSessions.reduce(
    (best, event) => Math.max(best, event.metadata.score),
    0,
  );
  const consumed = sumMealMacros(todaysMeals);
  const burned = estimateCaloriesBurned(todaysEvents);
  const remaining = targets.calories - consumed.calories + burned;
  const streaks = calculateStreaks(events, today);

  if (!authReady || !accountDataReady)
    return (
      <main className="auth-screen">
        <p className="kicker">VITTO / CONNECTING</p>
      </main>
    );
  if (isSupabaseConfigured && !session)
    return (
      <main className="auth-screen">
        <div className="auth-card">
          <p className="kicker">VITTO / YOUR LIFE, THEIR STORY</p>
          <h1>
            {authMode === "sign-in" ? "Welcome back." : "Start your story."}
          </h1>
          <p className="intro">
            Sign in to save your pet and analyze meals privately.
          </p>
          <form onSubmit={submitAuth}>
            {authMode === "sign-up" && (
              <input
                value={authName}
                onChange={(event) => setAuthName(event.target.value)}
                placeholder="Your name"
                required
              />
            )}
            <input
              type="email"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              placeholder="Email"
              required
            />
            <input
              type="password"
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              placeholder="Password"
              minLength={6}
              required
            />
            <button className="primary" type="submit">
              {authMode === "sign-in" ? "Sign in" : "Create account"}{" "}
              <span>→</span>
            </button>
          </form>
          {authError && <p className="form-error">{authError}</p>}
          {authMessage && <p className="auth-message">{authMessage}</p>}
          <button
            className="text-button"
            onClick={() => {
              setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in");
              setAuthError(null);
            }}
          >
            {authMode === "sign-in"
              ? "Need an account?"
              : "Already have an account?"}
          </button>
        </div>
      </main>
    );

  if (!pet) {
    return (
      <Onboarding
        name={name}
        onNameChange={setName}
        profile={profile}
        onUpdate={updateProfile}
        onAdopt={adopt}
        error={authError}
        onSignOut={
          isSupabaseConfigured && session
            ? () => {
                signOut()
                  .then(() => {
                    setSession(null);
                    setPet(null);
                    setEvents([]);
                  })
                  .catch(() => setAuthError("Could not sign out."));
              }
            : undefined
        }
      />
    );
  }

  // Display projection only -- derived on every render from the raw pet above.
  // Never write this back into state or into a repository.
  const livePet = applyTimeDecay(pet, today);

  if (view === "profile")
    return (
      <ProfilePage
        profile={profile}
        events={events}
        onSave={saveProfile}
        onClose={() => setView("pet")}
      />
    );

  const progress = livePet.xp;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const daysSinceAdoption = Math.max(1, Math.floor((today.getTime() - new Date(livePet.adoptedAt).getTime()) / ONE_DAY_MS) + 1);
  const focusSections: Record<FocusArea, ReactNode> = {
    nutrition: (
      <Fragment key="nutrition">
          <div className="ring-row">
            <NutrientRing
              value={consumed.calories}
              percent={(consumed.calories / targets.calories) * 100}
              label="Consumed"
              color="#d85d45"
            />
            <NutrientRing
              value={burned}
              percent={(burned / targets.calories) * 100}
              label="Burned"
              color="#78a598"
            />
            <NutrientRing
              value={remaining}
              percent={(Math.abs(remaining) / targets.calories) * 100}
              label={remaining < 0 ? "Over" : "Remaining"}
              color={remaining < 0 ? "#b34e3e" : "#9c8dba"}
              emphasis={remaining < 0}
            />
          </div>
          <div className="macro-breakdown">
            <div className="macro-breakdown-row">
              <span>Protein</span>
              <i><em style={{ width: `${Math.min(100, (consumed.proteinGrams / targets.proteinGrams) * 100)}%` }} /></i>
              <b>{consumed.proteinGrams}g <small>/ {targets.proteinGrams}g</small></b>
            </div>
            <div className="macro-breakdown-row">
              <span>Carbs</span>
              <i><em style={{ width: `${Math.min(100, (consumed.carbsGrams / targets.carbsGrams) * 100)}%` }} /></i>
              <b>{consumed.carbsGrams}g <small>/ {targets.carbsGrams}g</small></b>
            </div>
            <div className="macro-breakdown-row">
              <span>Fat</span>
              <i><em style={{ width: `${Math.min(100, (consumed.fatGrams / targets.fatGrams) * 100)}%` }} /></i>
              <b>{consumed.fatGrams}g <small>/ {targets.fatGrams}g</small></b>
            </div>
          </div>
          <div className="diary-section">
            <div className="recent-heading">
              <h3>Today's diary</h3>
            </div>
            {todaysMeals.length === 0 ? (
              <p className="empty">Nothing logged yet today — add a meal to get started.</p>
            ) : (
              todaysMeals.map((event) => <MealDiaryRow event={event} key={event.id} />)
            )}
          </div>
      </Fragment>
    ),
    training: (
      <Fragment key="training">
          <div className="recent">
            <div className="recent-heading">
              <h3>Today's care</h3>
              <button onClick={() => setView("profile")}>
                Full history <span>→</span>
              </button>
            </div>
            {todaysNonMealEvents.length === 0 ? (
              <p className="empty">
                Log a workout, sync steps, or train your mind to see it here.
              </p>
            ) : (
              todaysNonMealEvents.map((event) => (
                <div className="event" key={event.id}>
                  <span className="event-dot" />
                  <span>
                    <b>{CARE_EVENT_LABEL[event.type] ?? "A healthy moment"}</b>
                    <small>
                      {new Date(event.occurredAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </small>
                  </span>
                  <span className="event-xp">+ XP</span>
                </div>
              ))
            )}
          </div>
      </Fragment>
    ),
    movement: (
      <Fragment key="movement">
          <div className="steps-panel"><div><p className="kicker">TODAY'S EXPLORING</p><h3>{steps.toLocaleString()} <small>/ {stepGoal.toLocaleString()} steps</small></h3><p>{livePet.name} {steps ? "explored with you today." : "is waiting for today's adventure."}</p></div><label>Daily goal<input type="number" min="1000" max="100000" value={stepGoal} onChange={(event) => setStepGoal(Number(event.target.value) || 1000)} /></label></div>
      </Fragment>
    ),
    mind: (
      <Fragment key="mind">
          <div className="steps-panel mind-panel">
            <div>
              <p className="kicker">TODAY'S THINKING</p>
              <h3>
                {bestMindScore || "—"}{" "}
                <small>
                  best mind score
                  {todaysMindSessions.length
                    ? ` · ${todaysMindSessions.length} session${todaysMindSessions.length > 1 ? "s" : ""}`
                    : ""}
                </small>
              </h3>
              <p>
                {todaysMindSessions.length
                  ? `${mindScoreLabel(bestMindScore)} — ${livePet.name} felt you thinking.`
                  : `${livePet.name} is up for a puzzle whenever you are.`}
              </p>
              <p className="mind-stat-line">
                Mind <i><em style={{ width: `${livePet.mind}%` }} /></i> <b>{livePet.mind}</b>/100
              </p>
            </div>
            <button className="text-button mind-panel-start" onClick={trainMind}>
              Train your mind <span>→</span>
            </button>
          </div>
      </Fragment>
    ),
  };
  // Whatever the survey put first leads the dashboard; the rest still follow.
  const orderedFocus = [
    ...profile.focusAreas,
    ...FOCUS_AREAS.filter((area) => !profile.focusAreas.includes(area)),
  ];

  return (
    <>
      <main className="shell">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">v</span>
            <span>vitto</span>
          </div>
          <nav>
            <button className="nav-active" onClick={() => setView("pet")}>
              My pet
            </button>
            <button onClick={() => setView("profile")}>Profile</button>
            <button>Challenges</button>
          </nav>
          <div className="account-menu">
            <button
              className="avatar"
              onClick={() => setAccountMenuOpen((open) => !open)}
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
            >
              K
            </button>
            {accountMenuOpen && (
              <div className="account-dropdown" role="menu">
                <button
                  onClick={() => {
                    setView("profile");
                    setAccountMenuOpen(false);
                  }}
                >
                  Profile
                </button>
                <button
                  onClick={() => {
                    setView("profile");
                    setAccountMenuOpen(false);
                  }}
                >
                  Settings
                </button>
                <button
                  onClick={() => {
                    signOut().catch(() => setAuthError("Could not sign out."));
                    setAccountMenuOpen(false);
                  }}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </header>
        <section className="hero">
          <div className="hero-heading">
            <p className="kicker">
              {today.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}
              {" · DAY "}{daysSinceAdoption}{" WITH "}{livePet.name.toUpperCase()}
            </p>
            <h1>
              {livePet.name}
              <span className="level">LVL {livePet.level}</span>
              <span className="stage-pill">
                {EVOLUTION_STAGE_LABEL[getEvolutionStage(livePet.level)]}
              </span>
            </h1>
            <p className="mood">
              {reaction?.message || `${livePet.name} is feeling ready for the day.`}
            </p>
            {streaks.currentStreak > 0 && (
              <p className="streak-badge">
                🔥 {streaks.currentStreak}-day streak
                {streaks.longestStreak > streaks.currentStreak && (
                  <small> · best {streaks.longestStreak}</small>
                )}
              </p>
            )}
            {todaysEvents.length === 0 && streaks.currentStreak > 0 && (
              <p className="streak-risk">
                Log something today to keep your {streaks.currentStreak}-day streak alive.
              </p>
            )}
          </div>
          <div className="hero-meta">
            <span>Next level</span>
            <strong>
              {progress}
              <i>/100 XP</i>
            </strong>
            <div className="progress">
              <div style={{ width: `${progress}%` }} />
            </div>
          </div>
        </section>
        <PetAvatar
          pet={livePet}
          isAnalyzingMeal={isAnalyzingMeal}
          isEating={isEating}
          feedingImage={feedingImage}
          feedingGrade={feedingGrade}
          isCelebrating={showConfetti}
          isWorkingOut={isWorkingOut}
          isExploring={isExploring}
        >
          <div className="pet-stats-hud">
            <p className="kicker">VITALS</p>
            {[["Push", livePet.pushingStrength], ["Pull", livePet.pullingStrength], ["Legs", livePet.legStrength], ["Endurance", livePet.endurance], ["Mind", livePet.mind], ["Health", livePet.health]].map(([label, value]) => (
              <div className="hud-stat" key={label as string}>
                <span>{label as string}</span>
                <i><em style={{ width: `${value as number}%` }} /></i>
              </div>
            ))}
          </div>
        </PetAvatar>
        <section className="dashboard">
          <div className="section-title">
            <div>
              <p className="kicker">CARE LOG</p>
              <h2>
                Small moments,
                <br />
                <em>real change.</em>
              </h2>
            </div>
            <span className="date-pill">
              Today <b>⌄</b>
            </span>
          </div>
          {orderedFocus.map((area) => focusSections[area])}
          <div className="steps-panel screen-panel">
            <div>
              <p className="kicker">TODAY'S SCREEN TIME</p>
              <h3>— <small>nothing logged yet</small></h3>
              <p>Screen time tracking is not built yet — {livePet.name} will notice the quiet hours once it is.</p>
            </div>
            <span className="soon-tag">Placeholder</span>
          </div>
          <div className="actions">
            <button onClick={logWorkout}>
              <span className="action-icon coral">↗</span>
              <span>
                <b>Log workout</b>
                <small>Build strength</small>
              </span>
              <strong>+</strong>
            </button>
            <button onClick={logSteps}>
              <span className="action-icon mint">⌁</span>
              <span>
                <b>Sync steps</b>
                <small>Go exploring</small>
              </span>
              <strong>+</strong>
            </button>
            <button onClick={logMeal}>
              <span className="action-icon yellow">✣</span>
              <span>
                <b>Add a meal</b>
                <small>Fuel your pet</small>
              </span>
              <strong>+</strong>
            </button>
            <button onClick={trainMind}>
              <span className="action-icon lilac">✻</span>
              <span>
                <b>Train your mind</b>
                <small>Sharpen focus</small>
              </span>
              <strong>+</strong>
            </button>
            <button className="action-soon" disabled title="Not built yet">
              <span className="action-icon slate">▢</span>
              <span>
                <b>Log screen time</b>
                <small>Coming soon</small>
              </span>
              <strong>·</strong>
            </button>
          </div>
        </section>
        <footer>
          <span>HEALTH SIGNALS</span>
          <span>Private by default · Your data belongs to you</span>
        </footer>
      </main>
      {showMealCapture && (
        <MealCapture
          onComplete={completeMeal}
          onFeedStart={startFeeding}
          onAnalyzingChange={setIsAnalyzingMeal}
          onClose={() => setShowMealCapture(false)}
        />
      )}
      {showWorkout && <WorkoutFlow onFinish={completeWorkout} onClose={() => setShowWorkout(false)} />}
      {showMindGym && <MindGym onFinish={completeMindSession} onClose={() => setShowMindGym(false)} />}
    </>
  );
}

export default App;
