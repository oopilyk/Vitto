import type { HealthEvent, BrainTrainingMetadata, MealMetadata, ScreenTimeMetadata, SleepMetadata, StepMetadata, WorkoutMetadata } from './health';
import type { PetDelta } from './pet';
import type { FoodEffect } from './foodEffects';
import { waterMlOf } from './hydration';
import { msg, t, tn, tx, type Params } from '../i18n';

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

// English here, translated where a sentence is built: `describeLoggedEvent` also writes the companion's English copy.
const BRAIN_GAME_TITLE: Record<BrainTrainingMetadata['game'], string> = {
  math: msg('Quick maths'),
  reading: msg('Read and recall'),
  wordPuzzle: msg('Word puzzle'),
  wordGarden: msg('Word garden'),
  spellingBee: msg('Word garden'),
  countryGuess: msg('Guess the country'),
  fourCorners: msg('Four Corners'),
  petJeopardy: msg('Pet Jeopardy'),
};

/**
 * The words a sentence is written with: the app's language for the toast, or
 * plain English for the copy the companion is sent (`companionBridge`), which
 * is stored on the server and read by the model.
 */
interface Wording {
  t: typeof t;
  tn: typeof tn;
  tx: typeof tx;
}
const english = (source: string, params?: Params): string =>
  params ? source.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole)) : source;
const WORDING: Record<'app' | 'english', Wording> = {
  app: { t, tn, tx },
  english: {
    t: english,
    tn: (count, one, other, params) => english(count === 1 ? one : other, { count, ...params }),
    tx: (_context, source, params) => english(source, params),
  },
};

/**
 * What was logged, in the user's terms and with their number in it — "1,240
 * steps logged", not "Went for a walk".
 *
 * Deliberately plain: the celebration is the animation and the stat line, and a
 * toast that gushes gets old by the fifth log of the day.
 *
 * `language` is 'english' only for the companion's copy (see `Wording`).
 */
export const describeLoggedEvent = (event: HealthEvent, language: 'app' | 'english' = 'app'): string => {
  // Shadows the imports on purpose: the same calls, in the language asked for.
  const { t, tn, tx } = WORDING[language];
  switch (event.type) {
    case 'STEP_ACTIVITY': {
      const { steps } = event.metadata as StepMetadata;
      const count = Number.isFinite(steps) ? Math.max(0, Math.round(steps)) : 0;
      return tn(count, '{count} step logged', '{count} steps logged', { count: formatCount(count) });
    }
    case 'WORKOUT': {
      const { workoutType, durationMinutes, stats } = event.metadata as WorkoutMetadata;
      const stored = workoutType?.trim();
      // The two types the app itself writes are translated; anything else (an import's own name) is shown as it is.
      const kind = stored === 'strength' ? tx('a kind of workout', 'strength') : stored === 'cardio' ? tx('a kind of workout', 'cardio') : stored;
      // A session logged set by set is described by its sets — that is what it
      // was paid for. Minutes are the fallback for imports that only know time.
      const sets = Math.max(0, Math.round(stats?.completedSets ?? 0));
      if (sets > 0) {
        return kind
          ? tn(sets, '{kind} logged · {count} set', '{kind} logged · {count} sets', { kind })
          : tn(sets, 'Workout logged · {count} set', 'Workout logged · {count} sets');
      }
      const minutes = Number.isFinite(durationMinutes) ? Math.max(0, Math.round(durationMinutes)) : 0;
      if (!kind) return minutes > 0 ? t('{minutes} min workout logged', { minutes }) : t('Workout logged');
      return minutes > 0 ? t('{minutes} min {kind} logged', { minutes, kind }) : t('{kind} logged', { kind });
    }
    case 'MEAL': {
      // Not what was on the plate: a photographed meal is described in a
      // sentence, and that sentence swamped the toast. The calories say enough.
      const calories = (event.metadata as MealMetadata).analysis?.macros?.calories;
      return Number.isFinite(calories) && (calories as number) > 0
        ? t('Meal logged · {calories} kcal', { calories: formatCount(calories as number) })
        : t('Meal logged');
    }
    case 'BRAIN_TRAINING': {
      const { game, correct, total, wordsFound, rank, roundOutcomes } = event.metadata as BrainTrainingMetadata;
      const title = BRAIN_GAME_TITLE[game] ? t(BRAIN_GAME_TITLE[game]) : t('Brain training');
      if (game === 'wordPuzzle' && roundOutcomes?.length === 1) {
        const [round] = roundOutcomes;
        return round!.solved
          ? t('{game}: solved in {guesses}', { game: title, guesses: round!.guessesUsed })
          : t('{game}: not solved today', { game: title });
      }
      if (game === 'wordGarden' || game === 'spellingBee') {
        const words = Math.max(0, Math.round(wordsFound ?? 0));
        // The rank is stored with the session in English (wordGarden.ts): translated here, where it is shown.
        return rank
          ? tn(words, '{game}: {rank} · {count} word', '{game}: {rank} · {count} words', { game: title, rank: t(rank) })
          : tn(words, '{game}: {count} word', '{game}: {count} words', { game: title });
      }
      if (game === 'countryGuess') {
        return total > 0 ? t('{game}: {correct}/{total} solved', { game: title, correct, total }) : t('{game} logged', { game: title });
      }
      return total > 0 ? t('{game}: {correct}/{total} correct', { game: title, correct, total }) : t('{game} logged', { game: title });
    }
    case 'SLEEP': {
      const { asleepMinutes } = event.metadata as SleepMetadata;
      return t('{duration} of sleep logged', { duration: formatHours(asleepMinutes) });
    }
    case 'SCREEN_TIME': {
      const { minutes } = event.metadata as ScreenTimeMetadata;
      const safe = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
      return t('{duration} of screen time logged', { duration: formatMinutes(safe) });
    }
    case 'HYDRATION':
      return waterMlOf(event) < 0 ? t('Water removed') : t('Water logged');
    default:
      return t('Logged');
  }
};

/**
 * Display order for the stat line, and the proof that every `PetDelta` field is
 * spoken for: a new stat has to be named here or this table stops type-checking.
 * XP is absent because it is appended last regardless of size — it is the one
 * number that always moves, so it reads as the constant reward.
 */
const STAT_LABEL: Record<Exclude<keyof PetDelta, 'xp'>, string> = {
  health: tx('pet stat after a signed number, as in "+3 energy"', 'health'),
  energy: tx('pet stat after a signed number, as in "+3 energy"', 'vitality'),
  charge: tx('pet stat after a signed number, as in "+3 energy"', 'energy'),
  happiness: tx('pet stat after a signed number, as in "+3 energy"', 'happiness'),
  nutrition: tx('pet stat after a signed number, as in "+3 energy"', 'hunger'),
  strength: tx('pet stat after a signed number, as in "+3 energy"', 'strength'),
  pushingStrength: tx('pet stat after a signed number, as in "+3 energy"', 'push'),
  pullingStrength: tx('pet stat after a signed number, as in "+3 energy"', 'pull'),
  legStrength: tx('pet stat after a signed number, as in "+3 energy"', 'legs'),
  endurance: tx('pet stat after a signed number, as in "+3 energy"', 'endurance'),
  recovery: tx('pet stat after a signed number, as in "+3 energy"', 'recovery'),
  mindSessions: tx('pet stat after a signed number, as in "+3 energy"', 'mind session'),
  mind: tx('pet stat after a signed number, as in "+3 energy"', 'mind'),
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
    .map((key) => t('{amount} {stat}', { amount: signed(delta[key] as number), stat: STAT_LABEL[key] }));

  const xp = delta.xp;
  if (typeof xp === 'number' && Number.isFinite(xp) && Math.round(xp) !== 0) {
    stats.push(t('{amount} XP', { amount: signed(xp) }));
  }
  return stats.length > 0 ? stats.join(' · ') : null;
};

export interface CareToast {
  /** What was logged: "1,240 steps logged". */
  headline: string;
  /** What it did to the pet, or null when no stat moved. */
  detail: string | null;
  /**
   * The plate's food effect, when a meal earned one: the pet's line ("That was
   * hot!") and the tags it now wears ("Spicy · Cozy"). Absent for everything
   * that is not a meal, and for a meal with nothing to say.
   */
  effect?: { line: string; tags: string[] };
}

export const careToast = (event: HealthEvent, delta: PetDelta, effects: readonly FoodEffect[] = []): CareToast => ({
  headline: describeLoggedEvent(event),
  detail: describeDelta(delta),
  ...(effects.length > 0
    ? { effect: { line: effects[0].reaction, tags: effects.map((effect) => t(effect.label)) } }
    : {}),
});
