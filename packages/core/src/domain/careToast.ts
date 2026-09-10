import type { HealthEvent, BrainTrainingMetadata, MealMetadata, ScreenTimeMetadata, SleepMetadata, StepMetadata, WorkoutMetadata } from './health';
import type { PetDelta } from './pet';

/**
 * The confirmation shown the moment a care moment is logged: what was recorded,
 * and what it did to the pet.
 *
 * This exists because the pet's own reaction line could not do the job. It is
 * one sentence in the name card, it is written in the pet's voice ("Miso enjoyed
 * a little walk"), and — the part that actually broke — an ailment outranks it,
 * so a user whose pet is starving got *no* acknowledgement at all for logging
 * steps. Feedback for an action the user just took must not depend on the pet's
 * mood, so this is a separate, always-shown message that states the fact.
 *
 * Pure and platform-free: the toast's wording and the decision about what is
 * worth showing are testable here, and the mobile component only animates it.
 */

/** "2h 05m", the app's established way of saying a duration. */
export const formatMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, '0')}m`;
};

/**
 * Thousands separators, written out rather than left to `toLocaleString`: step
 * counts are the one number here big enough to need them, and Hermes builds
 * without full ICU fall back to an ungrouped string, so the phone and the test
 * runner would disagree about what this component renders.
 */
export const formatCount = (value: number): string => {
  const safe = Number.isFinite(value) ? Math.round(Math.abs(value)) : 0;
  const sign = Number.isFinite(value) && value < 0 ? '-' : '';
  return sign + String(safe).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/** Hours to one decimal, with a bare "8h" rather than "8.0h". */
const formatHours = (minutes: number): string => {
  const hours = Math.round((Math.max(0, minutes) / 60) * 10) / 10;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
};

const BRAIN_GAME_TITLE: Record<BrainTrainingMetadata['game'], string> = {
  math: 'Quick maths',
  reading: 'Read and recall',
  wordPuzzle: 'Word puzzle',
  wordGarden: 'Word garden',
  spellingBee: 'Word garden',
  countryGuess: 'Guess the country',
};

/**
 * What was logged, in the user's terms and with their number in it — "1,240
 * steps logged", not "Went for a walk".
 *
 * Deliberately plain: the celebration is the animation and the stat line, and a
 * toast that gushes gets old by the fifth log of the day.
 */
export const describeLoggedEvent = (event: HealthEvent): string => {
  switch (event.type) {
    case 'STEP_ACTIVITY': {
      const { steps } = event.metadata as StepMetadata;
      const count = Number.isFinite(steps) ? Math.max(0, Math.round(steps)) : 0;
      return `${formatCount(count)} ${count === 1 ? 'step' : 'steps'} logged`;
    }
    case 'WORKOUT': {
      const { workoutType, durationMinutes } = event.metadata as WorkoutMetadata;
      const kind = workoutType?.trim();
      const minutes = Number.isFinite(durationMinutes) ? Math.max(0, Math.round(durationMinutes)) : 0;
      if (!kind) return minutes > 0 ? `${minutes} min workout logged` : 'Workout logged';
      return minutes > 0 ? `${minutes} min ${kind} logged` : `${kind} logged`;
    }
    case 'MEAL': {
      const meal = event.metadata as MealMetadata;
      const named = meal.analysis?.foodDescription?.trim();
      const calories = meal.analysis?.macros?.calories;
      const headline = named ? `${named} logged` : 'Meal logged';
      return Number.isFinite(calories) && (calories as number) > 0
        ? `${headline} · ${formatCount(calories as number)} kcal`
        : headline;
    }
    case 'BRAIN_TRAINING': {
      const { game, correct, total, wordsFound, rank, roundOutcomes } = event.metadata as BrainTrainingMetadata;
      const title = BRAIN_GAME_TITLE[game] ?? 'Brain training';
      if (game === 'wordPuzzle' && roundOutcomes?.length === 1) {
        const [round] = roundOutcomes;
        return round!.solved ? `${title}: solved in ${round!.guessesUsed}` : `${title}: not solved today`;
      }
      if (game === 'wordGarden' || game === 'spellingBee') {
        const words = Math.max(0, Math.round(wordsFound ?? 0));
        const found = `${words} ${words === 1 ? 'word' : 'words'}`;
        return rank ? `${title}: ${rank} · ${found}` : `${title}: ${found}`;
      }
      if (game === 'countryGuess') {
        return total > 0 ? `${title}: ${correct}/${total} solved` : `${title} logged`;
      }
      return total > 0 ? `${title}: ${correct}/${total} correct` : `${title} logged`;
    }
    case 'SLEEP': {
      const { asleepMinutes } = event.metadata as SleepMetadata;
      return `${formatHours(asleepMinutes)} of sleep logged`;
    }
    case 'SCREEN_TIME': {
      const { minutes } = event.metadata as ScreenTimeMetadata;
      const safe = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
      return `${formatMinutes(safe)} of screen time logged`;
    }
    case 'HYDRATION':
      return 'Water logged';
    default:
      return 'Logged';
  }
};

/**
 * Display order for the stat line, and the proof that every `PetDelta` field is
 * spoken for: a new stat has to be named here or this table stops type-checking.
 * XP is absent because it is appended last regardless of size — it is the one
 * number that always moves, so it reads as the constant reward.
 */
const STAT_LABEL: Record<Exclude<keyof PetDelta, 'xp'>, string> = {
  health: 'health',
  energy: 'energy',
  happiness: 'happiness',
  nutrition: 'nutrition',
  strength: 'strength',
  pushingStrength: 'push',
  pullingStrength: 'pull',
  legStrength: 'legs',
  endurance: 'endurance',
  recovery: 'recovery',
  mind: 'mind',
};

const STAT_ORDER = Object.keys(STAT_LABEL) as (keyof typeof STAT_LABEL)[];

/** At most this many stats before XP, so the line stays one glance wide. */
const MAX_STATS_SHOWN = 3;

const signed = (value: number): string => `${value > 0 ? '+' : '-'}${Math.abs(Math.round(value))}`;

/**
 * "+7 energy · +3 endurance · +16 XP" — the biggest movements first, so a
 * trimmed line still shows what the log mostly did.
 *
 * Returns null when nothing moved, which the caller renders as no second line
 * rather than as an empty one.
 */
export const describeDelta = (delta: PetDelta): string | null => {
  const stats = STAT_ORDER.filter((key) => {
    const value = delta[key];
    return typeof value === 'number' && Number.isFinite(value) && Math.round(value) !== 0;
  })
    // Ties keep `STAT_ORDER`, so the same delta always reads the same way.
    .sort((a, b) => Math.abs(delta[b] as number) - Math.abs(delta[a] as number))
    .slice(0, MAX_STATS_SHOWN)
    .map((key) => `${signed(delta[key] as number)} ${STAT_LABEL[key]}`);

  const xp = delta.xp;
  if (typeof xp === 'number' && Number.isFinite(xp) && Math.round(xp) !== 0) {
    stats.push(`${signed(xp)} XP`);
  }
  return stats.length > 0 ? stats.join(' · ') : null;
};

export interface CareToast {
  /** What was logged: "1,240 steps logged". */
  headline: string;
  /** What it did to the pet, or null when no stat moved. */
  detail: string | null;
}

export const careToast = (event: HealthEvent, delta: PetDelta): CareToast => ({
  headline: describeLoggedEvent(event),
  detail: describeDelta(delta),
});
