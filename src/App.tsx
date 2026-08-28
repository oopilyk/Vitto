import { useEffect, useState } from 'react';
import type { HealthEvent, MealMetadata, WorkoutMetadata } from './domain/health';
import { PetHealthEngine } from './domain/petHealthEngine';
import { createPet, type PetReaction, type PetState } from './domain/pet';
import { MockHealthDataProvider } from './services/healthDataProvider';
import { LocalRepository } from './services/localRepository';
import { MealCapture } from './components/MealCapture';
import { getSession, onAuthStateChange, signInWithEmail, signUpWithEmail } from './services/auth';
import { isSupabaseConfigured } from './services/supabaseClient';

const repository = new LocalRepository();
const engine = new PetHealthEngine();
const stepsProvider = new MockHealthDataProvider();

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
  const [showMealCapture, setShowMealCapture] = useState(false);
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

  const adopt = () => {
    const nextPet = createPet(userId, name.trim() || 'Miso');
    repository.savePet(nextPet);
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

  if (!authReady) return <main className="auth-screen"><p className="kicker">VITTO / CONNECTING</p></main>;
  if (isSupabaseConfigured && !session) return <main className="auth-screen"><div className="auth-card"><p className="kicker">VITTO / YOUR LIFE, THEIR STORY</p><h1>{authMode === 'sign-in' ? 'Welcome back.' : 'Start your story.'}</h1><p className="intro">Sign in to save your pet and analyze meals privately.</p><form onSubmit={submitAuth}>{authMode === 'sign-up' && <input value={authName} onChange={(event) => setAuthName(event.target.value)} placeholder="Your name" required />}<input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="Email" required /><input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="Password" minLength={6} required /><button className="primary" type="submit">{authMode === 'sign-in' ? 'Sign in' : 'Create account'} <span>→</span></button></form>{authError && <p className="form-error">{authError}</p>}{authMessage && <p className="auth-message">{authMessage}</p>}<button className="text-button" onClick={() => { setAuthMode(authMode === 'sign-in' ? 'sign-up' : 'sign-in'); setAuthError(null); }}>{authMode === 'sign-in' ? 'Need an account?' : 'Already have an account?'}</button></div></main>;

  if (!pet) {
    return <main className="welcome"><div className="welcome-copy"><p className="kicker">VITTO / YOUR LIFE, THEIR STORY</p><h1>Raise a pet<br /><em>by living well.</em></h1><p className="intro">A gentle social fitness game where the care you give yourself becomes the care your companion feels.</p><label>What will you call them?<input value={name} onChange={(event) => setName(event.target.value)} maxLength={18} /></label><button className="primary" onClick={adopt}>Adopt {name || 'your pet'} <span>→</span></button></div><div className="welcome-pet" aria-label="A sleepy orange pet"><div className="pet-face large">◡</div><div className="spark spark-one">✦</div><div className="spark spark-two">✧</div></div></main>;
  }

  const progress = pet.xp;
  return <><main className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">v</span><span>vitto</span></div><nav><button className="nav-active">My pet</button><button>Friends</button><button>Challenges</button></nav><div className="avatar">K</div></header>
    <section className="hero"><div className="hero-heading"><p className="kicker">TUESDAY, AUGUST 28</p><h1>{pet.name}<span className="level">LVL {pet.level}</span></h1><p className="mood">{reaction?.message || `${pet.name} is feeling ready for the day.`}</p></div><div className="hero-meta"><span>Next level</span><strong>{progress}<i>/100 XP</i></strong><div className="progress"><div style={{ width: `${progress}%` }} /></div></div></section>
    <section className="pet-stage"><div className="pet-aura" /><div className="pet-face">◡</div><div className="pet-ear left" /><div className="pet-ear right" /><span className="pet-name">{pet.name} is here <b>♥</b></span></section>
    <section className="dashboard"><div className="section-title"><div><p className="kicker">CARE LOG</p><h2>Small moments,<br /><em>real change.</em></h2></div><span className="date-pill">Today <b>⌄</b></span></div><div className="actions"><button onClick={logWorkout}><span className="action-icon coral">↗</span><span><b>Log workout</b><small>Build strength</small></span><strong>+</strong></button><button onClick={logSteps}><span className="action-icon mint">⌁</span><span><b>Sync steps</b><small>Go exploring</small></span><strong>+</strong></button><button onClick={logMeal}><span className="action-icon yellow">✣</span><span><b>Add a meal</b><small>Fuel your pet</small></span><strong>+</strong></button></div><div className="recent"><div className="recent-heading"><h3>Recent care</h3><button>See all <span>→</span></button></div>{events.length === 0 ? <p className="empty">Your first healthy action will appear here.</p> : events.slice(0, 3).map((event) => <div className="event" key={event.id}><span className="event-dot" /><span><b>{event.type === 'WORKOUT' ? 'Trained together' : event.type === 'MEAL' ? 'Shared a meal' : 'Went exploring'}</b><small>{new Date(event.occurredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></span><span className="event-xp">+ XP</span></div>)}</div></section>
    <footer><span>HEALTH SIGNALS</span><span>Private by default · Your data belongs to you</span></footer>
  </main>{showMealCapture && <MealCapture onComplete={completeMeal} onClose={() => setShowMealCapture(false)} />}</>;
}

export default App;
