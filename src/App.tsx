import { useEffect, useState } from "react";
import type {
  HealthEvent,
  MealAnalysis,
  MealMetadata,
  WorkoutMetadata,
} from "./domain/health";
import {
  calculateMacroTargets,
  parseNumberInput,
  type BodyProfile,
} from "./domain/macroTargets";
import {
  estimateCaloriesBurned,
  getEventsForDay,
  getMealsForDay,
  sumMealMacros,
} from "./domain/nutritionSummary";
import { PetHealthEngine } from "./domain/petHealthEngine";
import {
  createPet,
  EVOLUTION_STAGE_LABEL,
  getEvolutionStage,
  type PetReaction,
  type PetState,
} from "./domain/pet";
import { MockHealthDataProvider } from "./services/healthDataProvider";
import { LocalRepository } from "./services/localRepository";
import { MealCapture } from "./components/MealCapture";
import { PetAvatar } from "./components/PetAvatar";
import { NutrientRing } from "./components/NutrientRing";
import { MealDiaryRow } from "./components/MealDiaryRow";
import {
  getSession,
  onAuthStateChange,
  signInWithEmail,
  signUpWithEmail,
  signOut,
} from "./services/auth";
import { isSupabaseConfigured } from "./services/supabaseClient";
import { SupabaseRepository } from "./services/supabaseRepository";
import { ProfilePage } from "./components/ProfilePage";
import { WorkoutFlow } from "./components/WorkoutFlow";
import { playCelebrationSound, playMealSound, playMunchSound } from "./services/mealFeedback";

const repository = new LocalRepository();
const engine = new PetHealthEngine();
const stepsProvider = new MockHealthDataProvider();
const remoteRepository = new SupabaseRepository();
const WORKOUT_ANIMATION_MS = 1100;
const EXPLORE_ANIMATION_MS = 1100;
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
  const [pet, setPet] = useState<PetState | null>(() => repository.loadPet());
  const [events, setEvents] = useState(() => repository.loadEvents());
  const [reaction, setReaction] = useState<PetReaction | null>(null);
  const [name, setName] = useState("Miso");
  const [profile, setProfile] = useState<BodyProfile>({
    age: 30,
    sex: "other",
    heightCm: 170,
    weightKg: 70,
    weightUnit: "kg",
    activity: "moderate",
    goal: "maintain",
  });
  const [showMealCapture, setShowMealCapture] = useState(false);
  const [view, setView] = useState<"pet" | "profile">("pet");
  const [showWorkout, setShowWorkout] = useState(false);
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
    const normalizeNumberInput = (event: Event) => {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.type === "number") {
        input.value = input.value.replace(/^0+(?=\d)/, "");
      }
    };
    document.addEventListener("input", normalizeNumberInput, true);
    return () =>
      document.removeEventListener("input", normalizeNumberInput, true);
  }, []);

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
    if (isSupabaseConfigured && session) {
      setAccountDataReady(false);
      setPet(null);
      setEvents([]);
      setView("pet");
      Promise.all([remoteRepository.loadPet(), remoteRepository.loadEvents()])
        .then(([savedPet, savedEvents]) => {
          setPet(savedPet);
          setEvents(savedEvents);
        })
        .catch(() => {
          setAuthError("Could not load your account data.");
        })
        .finally(() => setAccountDataReady(true));
      remoteRepository
        .loadProfile()
        .then((savedProfile) => {
          if (savedProfile) setProfile(savedProfile);
        })
        .catch(() => undefined);
      return;
    }
    setAccountDataReady(true);
    const savedProfile = localStorage.getItem("vitto.profile");
    if (savedProfile) setProfile({ weightUnit: "kg", ...(JSON.parse(savedProfile) as Partial<BodyProfile>) } as BodyProfile);
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

  const adopt = async () => {
    try {
      const nextPet = createPet(userId, name.trim() || "Miso");
      if (isSupabaseConfigured && session)
        await remoteRepository.savePet(nextPet);
      await saveProfile(profile);
      repository.savePet(nextPet);
      setPet(nextPet);
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : "Could not save your pet.");
    }
  };

  const recordEvent = async (event: HealthEvent<unknown>) => {
    if (!pet) return;
    try {
      const result = engine.apply(pet, event);
      if (isSupabaseConfigured && session) {
        await withTimeout(remoteRepository.savePet(result.pet), "Saving timed out. Check your Supabase connection.");
        await withTimeout(remoteRepository.saveEvent(event), "Saving timed out. Check your Supabase connection.");
      }
      repository.savePet(result.pet);
      repository.saveEvent(event);
      setPet(result.pet);
      setReaction(result.reaction);
      setEvents(repository.loadEvents());
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : "Could not save this care moment.");
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
  const displayedWeight = profile.weightUnit === "lb" ? Math.round(profile.weightKg * 2.20462 * 10) / 10 : profile.weightKg;
  const updateWeight = (value: string) => setProfile({ ...profile, weightKg: profile.weightUnit === "lb" ? parseNumberInput(value) / 2.20462 : parseNumberInput(value) });
  const today = new Date();
  const todaysEvents = getEventsForDay(events, today);
  const todaysMeals = getMealsForDay(events, today);
  const consumed = sumMealMacros(todaysMeals);
  const burned = estimateCaloriesBurned(todaysEvents);
  const remaining = targets.calories - consumed.calories + burned;

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
      <main className="welcome">
        <div className="welcome-copy">
          <p className="kicker">VITTO / YOUR LIFE, THEIR STORY</p>
          <h1>
            Raise a pet
            <br />
            <em>by living well.</em>
          </h1>
          <p className="intro">
            Set a few basics so your companion can learn what fuel supports your
            goals.
          </p>
          <label>
            What will you call them?
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={18}
            />
          </label>
          <div className="profile-grid">
            <label>
              Age
              <input
                type="number"
                min="13"
                max="100"
                value={profile.age}
                onChange={(event) =>
                  setProfile({ ...profile, age: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Weight ({profile.weightUnit})
              <input
                type="number"
                min={profile.weightUnit === "lb" ? 66 : 30}
                max={profile.weightUnit === "lb" ? 661 : 300}
                value={displayedWeight}
                onChange={(event) => updateWeight(event.target.value)}
              />
            </label>
            <label>
              Unit
              <select value={profile.weightUnit} onChange={(event) => setProfile({ ...profile, weightUnit: event.target.value as BodyProfile["weightUnit"] })}>
                <option value="kg">Kilograms (kg)</option>
                <option value="lb">Pounds (lb)</option>
              </select>
            </label>
            <label>
              Height (cm)
              <input
                type="number"
                min="120"
                max="230"
                value={profile.heightCm}
                onChange={(event) =>
                  setProfile({
                    ...profile,
                    heightCm: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Sex
              <select
                value={profile.sex}
                onChange={(event) =>
                  setProfile({
                    ...profile,
                    sex: event.target.value as BodyProfile["sex"],
                  })
                }
              >
                <option value="other">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </label>
            <label>
              Activity
              <select
                value={profile.activity}
                onChange={(event) =>
                  setProfile({
                    ...profile,
                    activity: event.target.value as BodyProfile["activity"],
                  })
                }
              >
                <option value="low">Light</option>
                <option value="moderate">Moderate</option>
                <option value="high">High</option>
              </select>
            </label>
            <label>
              Goal
              <select
                value={profile.goal}
                onChange={(event) =>
                  setProfile({
                    ...profile,
                    goal: event.target.value as BodyProfile["goal"],
                  })
                }
              >
                <option value="lose">Lose fat</option>
                <option value="maintain">Maintain</option>
                <option value="gain">Build muscle</option>
              </select>
            </label>
          </div>
          <button className="primary" onClick={adopt}>
            Adopt {name || "your pet"} <span>→</span>
          </button>
        </div>
        <div className="welcome-pet" aria-label="A sleepy orange pet">
          <div className="pet-face large">◡</div>
          <div className="spark spark-one">✦</div>
          <div className="spark spark-two">✧</div>
        </div>
      </main>
    );
  }

  if (view === "profile")
    return (
      <ProfilePage
        profile={profile}
        events={events}
        onSave={saveProfile}
        onClose={() => setView("pet")}
      />
    );

  const progress = pet.xp;
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
            <p className="kicker">TUESDAY, AUGUST 28</p>
            <h1>
              {pet.name}
              <span className="level">LVL {pet.level}</span>
              <span className="stage-pill">
                {EVOLUTION_STAGE_LABEL[getEvolutionStage(pet.level)]}
              </span>
            </h1>
            <p className="mood">
              {reaction?.message || `${pet.name} is feeling ready for the day.`}
            </p>
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
          pet={pet}
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
            {[["Push", pet.pushingStrength], ["Pull", pet.pullingStrength], ["Legs", pet.legStrength], ["Endurance", pet.endurance], ["Health", pet.health]].map(([label, value]) => (
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
          <div className="steps-panel"><div><p className="kicker">TODAY'S EXPLORING</p><h3>{steps.toLocaleString()} <small>/ {stepGoal.toLocaleString()} steps</small></h3><p>{pet.name} {steps ? "explored with you today." : "is waiting for today's adventure."}</p></div><label>Daily goal<input type="number" min="1000" max="100000" value={stepGoal} onChange={(event) => setStepGoal(Number(event.target.value) || 1000)} /></label></div>
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
          </div>
          <div className="recent">
            <div className="recent-heading">
              <h3>Recent care</h3>
              <button>
                See all <span>→</span>
              </button>
            </div>
            {events.length === 0 ? (
              <p className="empty">
                Your first healthy action will appear here.
              </p>
            ) : (
              events.slice(0, 3).map((event) => (
                <div className="event" key={event.id}>
                  <span className="event-dot" />
                  <span>
                    <b>
                      {event.type === "WORKOUT"
                        ? "Trained together"
                        : event.type === "MEAL"
                          ? "Shared a meal"
                          : "Went exploring"}
                    </b>
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
    </>
  );
}

export default App;
