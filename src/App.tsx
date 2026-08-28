import { useEffect, useState } from 'react';
import type { HealthEvent, MealMetadata, WorkoutMetadata } from './domain/health';
import { calculateMacroTargets, type BodyProfile } from './domain/macroTargets';
import { PetHealthEngine } from './domain/petHealthEngine';
import { createPet, type PetReaction, type PetState } from './domain/pet';
import { MockHealthDataProvider } from './services/healthDataProvider';
import { LocalRepository } from './services/localRepository';
import { MealCapture } from './components/MealCapture';
import { getSession, onAuthStateChange, signInWithEmail, signUpWithEmail } from './services/auth';
import { isSupabaseConfigured } from './services/supabaseClient';
import { SupabaseRepository } from './services/supabaseRepository';
import { ProfilePage } from './components/ProfilePage';

const repository = new LocalRepository();
const engine = new PetHealthEngine();
const stepsProvider = new MockHealthDataProvider();
const remoteRepository = new SupabaseRepository();

const makeEvent = <T,>(userId: string, type: HealthEvent['type'], metadata: T): HealthEvent<T> => ({
  id: crypto.randomUUID(),
  userId,
  occurredAt: new Date().toISOString(),
  type,
  source: 'manual',
  metadata,
});

function App() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSession>>['data']['session']>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [pet, setPet] = useState<PetState | null>(() => repository.loadPet());
  const [events, setEvents] = useState(() => repository.loadEvents());
  const [reaction, setReaction] = useState<PetReaction | null>(null);
  const [name, setName] = useState('Miso');
  const [profile, setProfile] = useState<BodyProfile>({ age: 30, sex: 'other', heightCm: 170, weightKg: 70, activity: 'moderate', goal: 'maintain' });
  const [showMealCapture, setShowMealCapture] = useState(false);
  const [view, setView] = useState<'pet' | 'profile'>('pet');
  const userId = session?.user.id ?? 'demo-user';

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    }).catch(() => {
      setAuthError('Could not connect to Supabase.');
      setAuthReady(true);
    });
    const { data: listener } = onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isSupabaseConfigured && session) {
      remoteRepository.loadProfile().then((savedProfile) => {
        if (savedProfile) setProfile(savedProfile);
      }).catch(() => undefined);
      return;
    }
    const savedProfile = localStorage.getItem('vitto.profile');
    if (savedProfile) setProfile(JSON.parse(savedProfile) as BodyProfile);
  }, [session]);

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    setAuthMessage(null);
    try {
      const result = authMode === 'sign-in'
        ? await signInWithEmail(authEmail, authPassword)
        : await signUpWithEmail(authEmail, authPassword, authName);
      if (result.error) throw result.error;
      if (authMode === 'sign-up' && !result.data.session) setAuthMessage('Check your email to confirm your account.');
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : 'Authentication failed.');
    }
  };

  const saveProfile = async (nextProfile: BodyProfile) => {
    setProfile(nextProfile);
    if (isSupabaseConfigured && session) await remoteRepository.saveProfile(nextProfile);
    else localStorage.setItem('vitto.profile', JSON.stringify(nextProfile));
  };

  const adopt = async () => {
    const nextPet = createPet(userId, name.trim() || 'Miso');
    repository.savePet(nextPet);
    await saveProfile(profile);
    setPet(nextPet);
  };

  const recordEvent = (event: HealthEvent<unknown>) => {
    if (!pet) return;
    const result = engine.apply(pet, event);
    repository.savePet(result.pet);
    repository.saveEvent(event);
    setPet(result.pet);
    setReaction(result.reaction);
    setEvents(repository.loadEvents());
  };

  const logWorkout = () => recordEvent(makeEvent<WorkoutMetadata>(userId, 'WORKOUT', { workoutType: 'strength', durationMinutes: 30, intensity: 'moderate' }));
  const logMeal = () => setShowMealCapture(true);
  const completeMeal = (metadata: MealMetadata) => {
    recordEvent(makeEvent<MealMetadata>(userId, 'MEAL', metadata));
    setShowMealCapture(false);
  };
  const logSteps = async () => recordEvent(await stepsProvider.getTodaySteps(userId));
  const targets = calculateMacroTargets(profile);
  const today = new Date().toDateString();
  const consumed = events.filter((event) => event.type === 'MEAL' && new Date(event.occurredAt).toDateString() === today).reduce((total, event) => {
    const macros = (event.metadata as MealMetadata).analysis?.macros;
    return macros ? { calories: total.calories + macros.calories, proteinGrams: total.proteinGrams + macros.proteinGrams, carbsGrams: total.carbsGrams + macros.carbsGrams, fatGrams: total.fatGrams + macros.fatGrams } : total;
  }, { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 });

  if (!authReady) return <main className="auth-screen"><p className="kicker">VITTO / CONNECTING</p></main>;
  if (isSupabaseConfigured && !session) return <main className="auth-screen"><div className="auth-card"><p className="kicker">VITTO / YOUR LIFE, THEIR STORY</p><h1>{authMode === 'sign-in' ? 'Welcome back.' : 'Start your story.'}</h1><p className="intro">Sign in to save your pet and analyze meals privately.</p><form onSubmit={submitAuth}>{authMode === 'sign-up' && <input value={authName} onChange={(event) => setAuthName(event.target.value)} placeholder="Your name" required />}<input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="Email" required /><input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="Password" minLength={6} required /><button className="primary" type="submit">{authMode === 'sign-in' ? 'Sign in' : 'Create account'} <span>→</span></button></form>{authError && <p className="form-error">{authError}</p>}{authMessage && <p className="auth-message">{authMessage}</p>}<button className="text-button" onClick={() => { setAuthMode(authMode === 'sign-in' ? 'sign-up' : 'sign-in'); setAuthError(null); }}>{authMode === 'sign-in' ? 'Need an account?' : 'Already have an account?'}</button></div></main>;

  if (!pet) {
    return <main className="welcome"><div className="welcome-copy"><p className="kicker">VITTO / YOUR LIFE, THEIR STORY</p><h1>Raise a pet<br /><em>by living well.</em></h1><p className="intro">Set a few basics so your companion can learn what fuel supports your goals.</p><label>What will you call them?<input value={name} onChange={(event) => setName(event.target.value)} maxLength={18} /></label><div className="profile-grid"><label>Age<input type="number" min="13" max="100" value={profile.age} onChange={(event) => setProfile({ ...profile, age: Number(event.target.value) })} /></label><label>Weight (kg)<input type="number" min="30" max="300" value={profile.weightKg} onChange={(event) => setProfile({ ...profile, weightKg: Number(event.target.value) })} /></label><label>Height (cm)<input type="number" min="120" max="230" value={profile.heightCm} onChange={(event) => setProfile({ ...profile, heightCm: Number(event.target.value) })} /></label><label>Sex<select value={profile.sex} onChange={(event) => setProfile({ ...profile, sex: event.target.value as BodyProfile['sex'] })}><option value="other">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option></select></label><label>Activity<select value={profile.activity} onChange={(event) => setProfile({ ...profile, activity: event.target.value as BodyProfile['activity'] })}><option value="low">Light</option><option value="moderate">Moderate</option><option value="high">High</option></select></label><label>Goal<select value={profile.goal} onChange={(event) => setProfile({ ...profile, goal: event.target.value as BodyProfile['goal'] })}><option value="lose">Lose fat</option><option value="maintain">Maintain</option><option value="gain">Build muscle</option></select></label></div><button className="primary" onClick={adopt}>Adopt {name || 'your pet'} <span>→</span></button></div><div className="welcome-pet" aria-label="A sleepy orange pet"><div className="pet-face large">◡</div><div className="spark spark-one">✦</div><div className="spark spark-two">✧</div></div></main>;
  }

  if (view === 'profile') return <ProfilePage profile={profile} events={events} onSave={saveProfile} onClose={() => setView('pet')} />;

  const progress = pet.xp;
  return <><main className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">v</span><span>vitto</span></div><nav><button className="nav-active" onClick={() => setView('pet')}>My pet</button><button onClick={() => setView('profile')}>Profile</button><button>Challenges</button></nav><button className="avatar" onClick={() => setView('profile')}>K</button></header>
    <section className="hero"><div className="hero-heading"><p className="kicker">TUESDAY, AUGUST 28</p><h1>{pet.name}<span className="level">LVL {pet.level}</span></h1><p className="mood">{reaction?.message || `${pet.name} is feeling ready for the day.`}</p></div><div className="hero-meta"><span>Next level</span><strong>{progress}<i>/100 XP</i></strong><div className="progress"><div style={{ width: `${progress}%` }} /></div></div></section>
    <section className="pet-stage"><div className="pet-aura" /><div className="pet-face">◡</div><div className="pet-ear left" /><div className="pet-ear right" /><span className="pet-name">{pet.name} is here <b>♥</b></span></section>
    <section className="dashboard"><div className="section-title"><div><p className="kicker">CARE LOG</p><h2>Small moments,<br /><em>real change.</em></h2></div><span className="date-pill">Today <b>⌄</b></span></div><div className="macro-panel"><div><p className="kicker">TODAY'S FUEL</p><h3>{consumed.calories} <small>/ {targets.calories} kcal</small></h3></div><div className="macro-stats"><span><b>{consumed.proteinGrams}g</b><small>/ {targets.proteinGrams}g protein</small></span><span><b>{consumed.carbsGrams}g</b><small>/ {targets.carbsGrams}g carbs</small></span><span><b>{consumed.fatGrams}g</b><small>/ {targets.fatGrams}g fat</small></span></div></div><div className="actions"><button onClick={logWorkout}><span className="action-icon coral">↗</span><span><b>Log workout</b><small>Build strength</small></span><strong>+</strong></button><button onClick={logSteps}><span className="action-icon mint">⌁</span><span><b>Sync steps</b><small>Go exploring</small></span><strong>+</strong></button><button onClick={logMeal}><span className="action-icon yellow">✣</span><span><b>Add a meal</b><small>Fuel your pet</small></span><strong>+</strong></button></div><div className="recent"><div className="recent-heading"><h3>Recent care</h3><button>See all <span>→</span></button></div>{events.length === 0 ? <p className="empty">Your first healthy action will appear here.</p> : events.slice(0, 3).map((event) => <div className="event" key={event.id}><span className="event-dot" /><span><b>{event.type === 'WORKOUT' ? 'Trained together' : event.type === 'MEAL' ? 'Shared a meal' : 'Went exploring'}</b><small>{new Date(event.occurredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></span><span className="event-xp">+ XP</span></div>)}</div></section>
    <footer><span>HEALTH SIGNALS</span><span>Private by default · Your data belongs to you</span></footer>
  </main>{showMealCapture && <MealCapture onComplete={completeMeal} onClose={() => setShowMealCapture(false)} />}</>;
}

export default App;
