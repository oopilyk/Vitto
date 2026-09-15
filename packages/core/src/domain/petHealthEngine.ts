import type { BrainTrainingMetadata, HealthEvent, MealMetadata, ScreenTimeMetadata, SleepMetadata, StepMetadata, WorkoutMetadata } from './health';
import { getScreenTimeBand, type ScreenTimeBandId } from './screenTime';
import { clamp, XP_PER_LEVEL, type PetDelta, type PetMood, type PetReaction, type PetState } from './pet';
import { formatMinutes } from './careToast';
import { type FoodEffect, detectFoodEffects, foodEffectsDelta } from './foodEffects';
import { workoutStrengthDelta } from './strengthProgression';

export interface EngineResult {
  pet: PetState;
  reaction: PetReaction;
}

/**
 * Optional context for {@link PetHealthEngine.apply}. Everything here is used to
 * score an event *relative to the user's recent behaviour* rather than off a
 * flat table. Omit it and the engine falls back to a history-free formula.
 */
export interface PetHealthContext {
  /** Prior health events, newest or oldest order both fine. The event being applied must not be in here. */
  history?: HealthEvent[];
  /** The user's body weight in kg, if known — lets bodyweight workouts scale by how much they actually move. */
  bodyWeightKg?: number;
}

export const HUNGRY_NUTRITION_THRESHOLD = 35;
export const SLEEPY_ENERGY_THRESHOLD = 40;
const BRIGHT_ENERGY_THRESHOLD = 65;
const BRIGHT_HAPPINESS_THRESHOLD = 65;
const SHARP_SESSION_ACCURACY = 0.8;

/**
 * A "sharp" session is meant to read as a good day, not a flawless one. The timed
 * games have many questions, so 0.8 sits comfortably below perfect. The daily word
 * puzzle is a single word, so it is either solved or not: solving it is the bar.
 */
const SHARP_ACCURACY_BY_GAME: Record<BrainTrainingMetadata['game'], number> = {
  math: SHARP_SESSION_ACCURACY,
  reading: SHARP_SESSION_ACCURACY,
  wordPuzzle: 1,
  // Points towards the full-bloom bar: halfway there is a genuinely good sitting.
  wordGarden: 0.5,
  spellingBee: 0.5,
  // Three countries a session, so two of three is the honest "good day".
  countryGuess: 0.66,
  // Five questions a round, so four of five.
  fourCorners: SHARP_SESSION_ACCURACY,
  // Ten questions counting the final, and the high-value squares are meant to
  // be hard, so the same four-in-five bar reads as a genuinely good board.
  petJeopardy: SHARP_SESSION_ACCURACY,
};

/**
 * XP for one mind session. Extracted from the engine's `BRAIN_TRAINING` case so
 * a game's own results screen can show the figure it is actually about to earn
 * without re-deriving (and eventually contradicting) it. The engine below is the
 * only thing that *awards* it; this is the same arithmetic, named.
 *
 * The floor is the participation award every mind game already pays: sitting
 * down to think is the behaviour worth rewarding, and how well it went moves the
 * number between the floor and the cap.
 */
const BRAIN_TRAINING_FLOOR_XP = 8;
const BRAIN_TRAINING_MAX_XP = 24;
const BRAIN_TRAINING_ACCURACY_XP = 12;
const READING_BONUS_XP = 2;

/**
 * A stated `xpAwarded` wins over the formula, clamped into a sane range so a
 * malformed or hostile event cannot mint xp. Only Pet Jeopardy sets it — its
 * reward depends on a wager the player chose, which no function of `correct` and
 * `total` can recover. The ceiling covers the board's own cap plus the largest
 * stake the final allows, and the floor is zero rather than the participation
 * floor because a lost wager is allowed to take the session down to nothing.
 */
const BRAIN_TRAINING_OVERRIDE_MAX_XP = 80;

export const brainTrainingXp = (
  metadata: Pick<BrainTrainingMetadata, 'game' | 'correct' | 'total'> &
    Partial<Pick<BrainTrainingMetadata, 'xpAwarded'>>,
): number => {
  const stated = metadata.xpAwarded;
  if (stated !== undefined && Number.isFinite(stated)) {
    return Math.round(Math.max(0, Math.min(BRAIN_TRAINING_OVERRIDE_MAX_XP, stated)));
  }
  const accuracy = metadata.total > 0 ? Math.max(0, Math.min(1, metadata.correct / metadata.total)) : 0;
  return Math.min(
    BRAIN_TRAINING_MAX_XP,
    BRAIN_TRAINING_FLOOR_XP +
      Math.round(accuracy * BRAIN_TRAINING_ACCURACY_XP) +
      (metadata.game === 'reading' ? READING_BONUS_XP : 0),
  );
};

/** Keyed on the whole union, so a new brain game must be labelled here or the build fails. */
const BRAIN_GAME_LABEL: Record<BrainTrainingMetadata['game'], string> = {
  math: 'Quick maths',
  reading: 'Read and recall',
  wordPuzzle: "Daily word puzzle",
  wordGarden: 'Word garden',
  spellingBee: 'Word garden',
  countryGuess: 'Guess the country',
  fourCorners: 'Four Corners',
  petJeopardy: 'Pet Jeopardy',
};

export const determineMood = (energy: number, nutrition: number, happiness: number): PetMood => {
  if (nutrition < HUNGRY_NUTRITION_THRESHOLD) return 'hungry';
  if (energy < SLEEPY_ENERGY_THRESHOLD) return 'sleepy';
  if (energy >= BRIGHT_ENERGY_THRESHOLD && happiness >= BRIGHT_HAPPINESS_THRESHOLD) return 'bright';
  return 'content';
};

/**
 * The decay anchor only ever moves forward. With a care partner, an event can
 * legitimately be older than the pet's last care (a HealthKit import that
 * predates the partner's last log); it still applies its delta, but rewinding
 * the anchor would make the next decay pass charge for a window that has already
 * been settled. Solo behaviour is unchanged: solo events are never older than
 * the anchor. An unparsable stored anchor loses to the event's time.
 */
const laterOf = (anchor: string | undefined, occurredAt: string): string => {
  if (anchor === undefined) return occurredAt;
  const anchorTime = Date.parse(anchor);
  const eventTime = Date.parse(occurredAt);
  return Number.isFinite(anchorTime) && Number.isFinite(eventTime) && anchorTime > eventTime ? anchor : occurredAt;
};

/** Two deltas, field by field. */
const mergeDelta = (base: PetDelta, extra: PetDelta): PetDelta => {
  const merged: PetDelta = { ...base };
  for (const [key, value] of Object.entries(extra) as [keyof PetDelta, number][]) {
    merged[key] = (merged[key] ?? 0) + value;
  }
  return merged;
};

export const applyDelta = (pet: PetState, delta: PetDelta, occurredAt: string): PetState => {
  const nextXp = pet.xp + (delta.xp ?? 0);
  const nextLevel = pet.level + Math.floor(nextXp / XP_PER_LEVEL);
  const nextEnergy = clamp(pet.energy + (delta.energy ?? 0));
  const nextNutrition = clamp(pet.nutrition + (delta.nutrition ?? 0));
  const nextHappiness = clamp(pet.happiness + (delta.happiness ?? 0));
  return {
    ...pet,
    level: nextLevel,
    xp: nextXp % XP_PER_LEVEL,
    health: clamp(pet.health + (delta.health ?? 0)),
    energy: nextEnergy,
    happiness: nextHappiness,
    nutrition: nextNutrition,
    strength: clamp(pet.strength + (delta.strength ?? 0), 0, 100),
    pushingStrength: clamp(pet.pushingStrength + (delta.pushingStrength ?? 0), 0, 100),
    pullingStrength: clamp(pet.pullingStrength + (delta.pullingStrength ?? 0), 0, 100),
    legStrength: clamp(pet.legStrength + (delta.legStrength ?? 0), 0, 100),
    endurance: clamp(pet.endurance + (delta.endurance ?? 0), 0, 100),
    recovery: clamp(pet.recovery + (delta.recovery ?? 0)),
    mind: clamp(pet.mind + (delta.mind ?? 0)),
    mood: determineMood(nextEnergy, nextNutrition, nextHappiness),
    lastEventAt: laterOf(pet.lastEventAt, occurredAt),
  };
};

/** A cleared mind. `clamp`'s own ceiling, named where the engine leans on it. */
const MIND_FULL = 100;

const CARDIO_STRENGTH_GAIN = 1;
/** Workout XP: a floor for showing up, then two a set, a little for reps and breadth, capped. */
const WORKOUT_XP_BASE = 8;
const WORKOUT_XP_CAP = 40;
/**
 * Cardio's own pay scale: the same floor for turning up, then time moving and
 * ground covered. Both are capped so that neither a long dawdle nor a single
 * fast hour runs away with the whole budget, and both count so that a session
 * with no distance recorded is still worth going on.
 *
 * Tuned against the strength scale: a ten-kilometre run lands near a
 * twelve-set gym session, which is what each of them costs a person.
 */
const CARDIO_XP_PER_MINUTE = 1 / 4;
const CARDIO_XP_PER_KM = 1.5;
const CARDIO_MINUTES_CAP = 120;
const CARDIO_DISTANCE_CAP_KM = 21;

/**
 * Sleep bands, in minutes asleep. A full night is the adult 7-hour guideline;
 * below `SLEEP_SHORT_MINUTES` the night is short enough that it restores a
 * little and no more. Nothing here is a penalty: a bad night is already its own
 * punishment through the energy the pet did not get back, and docking stats for
 * insomnia would make the app scold someone for something they cannot choose.
 */
const SLEEP_FULL_MINUTES = 7 * 60;
const SLEEP_SHORT_MINUTES = 5.5 * 60;

/**
 * Screen time follows the sleep principle: the good outcome is rewarded and the
 * bad one is never punished. Graded in bands (`screenTime.ts`) rather than
 * against one budget line, so nine hours reads differently from five instead of
 * both being "over".
 *
 * The reward tapers to a floor and never goes negative. Even the heaviest day
 * earns a little xp, because the habit being built is *checking in honestly* and
 * a log that earns nothing on a bad day teaches people to stop logging bad days.
 * A light day restores `mind` — an evening off the screen is real rest for the
 * head, though not exercise for it — and `recovery` at the same rate a scrappy
 * mind session gives.
 *
 * A personal budget is still honoured, as a bonus on top of the band rather than
 * the thing being measured: the bands are the shared scale, the budget is the
 * user's own target.
 */
const SCREEN_TIME_BAND_DELTA: Record<ScreenTimeBandId, PetDelta> = {
  light: { mind: 5, happiness: 3, recovery: 2, xp: 14 },
  moderate: { mind: 3, happiness: 1, xp: 11 },
  heavy: { xp: 8 },
  excessive: { xp: 5 },
};
/** Paid on top of the band when the user set a budget and came in under it. */
const SCREEN_TIME_BUDGET_BONUS_XP = 3;
const SCREEN_TIME_NO_BUDGET_XP = 6;

export class PetHealthEngine {
  apply(pet: PetState, event: HealthEvent, context: PetHealthContext = {}): EngineResult {
    let delta: PetDelta;
    let message: string;
    let eventLabel: string;
    let foodEffects: FoodEffect[] = [];

    switch (event.type) {
      case 'WORKOUT': {
        const metadata = event.metadata as unknown as WorkoutMetadata;
        const hardBonus = metadata.intensity === 'hard' ? 2 : 0;
        const mobility = metadata.name?.toLowerCase().includes('mobility') ? 3 : 0;
        eventLabel = `Trained ${metadata.workoutType}`;

        if (metadata.workoutType === 'cardio') {
          // Cardio has no sets to count, so it is paid for what it actually has:
          // minutes moving and kilometres covered. Reading those rather than the
          // set list is what stops a ten-kilometre run being worth less than four
          // sets of curls — a run carries no ticked sets at all, so the strength
          // formula below scored every one of them at the bare floor.
          //
          // Neither signal is required. A watch import and a hand-logged session
          // are paid the same way, and a session with no distance recorded still
          // earns its time.
          const minutes = Math.min(CARDIO_MINUTES_CAP, Math.max(0, Math.round(metadata.durationMinutes)));
          const km = Math.min(CARDIO_DISTANCE_CAP_KM, Math.max(0, metadata.distanceKm ?? 0));
          // Not all cardio covers ground. Burpees and jump rope are counted in
          // reps like any other bodyweight movement, so a session of them would
          // otherwise be paid for its clock alone.
          const cardioReps = Math.max(0, metadata.stats?.totalReps ?? 0);
          const repBonus = Math.min(6, Math.floor(cardioReps / 25));
          delta = {
            health: minutes >= 30 ? 2 : 1,
            energy: Math.min(8, 3 + Math.floor(minutes / 15)),
            happiness: Math.min(7, 3 + Math.floor(minutes / 20)),
            // Running does not build the lifts, so the push/pull/leg axes are
            // held flat on purpose rather than left undefined.
            strength: CARDIO_STRENGTH_GAIN,
            pushingStrength: 0,
            pullingStrength: 0,
            legStrength: 0,
            endurance: Math.min(8, 2 + Math.floor(minutes / 20) + Math.floor(km / 4) + Math.floor(cardioReps / 60)),
            recovery: mobility,
            mind: 1,
            xp: Math.min(
              WORKOUT_XP_CAP,
              WORKOUT_XP_BASE +
                Math.floor(minutes * CARDIO_XP_PER_MINUTE) +
                Math.round(km * CARDIO_XP_PER_KM) +
                repBonus +
                hardBonus,
            ),
          };
          // Minutes, not distance: the engine stores kilometres and has no idea
          // whether this user reads miles, and a pet announcing the wrong unit is
          // worse than one that does not mention it.
          message = `${pet.name} kept pace with you for ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} and feels lighter on its feet.`;
          break;
        }

        const hasWorkoutStats = Boolean(metadata.stats);
        const sets = Math.min(30, Math.max(0, metadata.stats?.completedSets ?? 0));
        const reps = Math.max(0, metadata.stats?.totalReps ?? 0);
        const exerciseCount = Math.max(0, metadata.stats?.exerciseCount ?? 0);
        // Strength is volume-driven and measured against the user's own recent
        // training (see strengthProgression).
        const strengthDelta = workoutStrengthDelta(pet, metadata.stats, {
          history: context.history,
          bodyWeightKg: context.bodyWeightKg,
          occurredAt: event.occurredAt,
        });
        // A logged session is paid for the work in it — sets ticked, reps done,
        // exercises covered — not for how long the gym clock ran. Twelve hard
        // sets in 35 minutes is a better session than three sets in an hour,
        // and the reward should say so. Duration is still recorded (it drives
        // the calorie estimate and the day's recap), it just earns nothing.
        const workXp = Math.min(
          WORKOUT_XP_CAP,
          WORKOUT_XP_BASE + 2 * Math.min(12, sets) + Math.min(6, Math.floor(reps / 25)) + (exerciseCount >= 4 ? 2 : 0) + hardBonus,
        );
        delta = hasWorkoutStats
          ? {
              health: sets >= 6 ? 2 : 1,
              energy: Math.min(8, 3 + Math.floor(sets / 3)),
              happiness: Math.min(7, 3 + Math.floor(sets / 4)),
              ...strengthDelta,
              endurance: Math.min(4, 1 + Math.floor(reps / 40)),
              recovery: mobility,
              mind: 1,
              xp: workXp,
            }
          : { energy: 6, happiness: 5, strength: 4, endurance: 2, xp: 18 + hardBonus };
        message = hasWorkoutStats
          ? sets > 0
            ? `${pet.name} pushed through ${sets} ${sets === 1 ? 'set' : 'sets'} with you and feels stronger.`
            : `${pet.name} showed up to train with you.`
          : `${pet.name} trained for ${metadata.durationMinutes} minutes and feels stronger.`;
        break;
      }
      case 'STEP_ACTIVITY': {
        const metadata = event.metadata as unknown as StepMetadata;
        const milestone = metadata.steps >= 8000;
        delta = { energy: milestone ? 7 : 3, happiness: 4, endurance: milestone ? 3 : 1, xp: milestone ? 16 : 8 };
        message = milestone ? `${pet.name} explored somewhere new today.` : `${pet.name} enjoyed a little walk with you.`;
        eventLabel = milestone ? 'Explored the wilds' : 'Went for a walk';
        break;
      }
      case 'BRAIN_TRAINING': {
        const metadata = event.metadata as unknown as BrainTrainingMetadata;
        const accuracy = metadata.total > 0 ? metadata.correct / metadata.total : 0;
        const sharp = accuracy >= SHARP_ACCURACY_BY_GAME[metadata.game];
        delta = {
          happiness: sharp ? 5 : 3,
          recovery: sharp ? 4 : 2,
          energy: 1,
          // A session restores mind in full, whatever the score. Mind used to
          // creep back 2-8 points a time, so a foggy pet needed a week of
          // sessions to clear -- the stat drifted down faster than sitting down
          // to think could lift it, which made the Study read as pointless.
          // Sitting down and doing the work is the behaviour worth rewarding;
          // how well it went still separates the XP and the mood below.
          mind: Math.max(0, MIND_FULL - pet.mind),
          xp: brainTrainingXp(metadata),
        };
        message = sharp
          ? `${pet.name} feels clear-headed after thinking that through with you.`
          : `${pet.name} liked puzzling over that together.`;
        eventLabel = BRAIN_GAME_LABEL[metadata.game];
        break;
      }
      case 'MEAL': {
        const meal = event.metadata as unknown as MealMetadata;
        const nourishingSignals = [meal.protein, meal.vegetables, meal.fruit, meal.wholeGrains, meal.fiber].filter(Boolean).length;
        delta = { nutrition: nourishingSignals * 3, health: nourishingSignals >= 3 ? 2 : 0, happiness: meal.treats ? 4 : 2, energy: nourishingSignals >= 3 ? 3 : 0, xp: 10 };
        // Food effects ride on top: a spicy plate is a little energising, a feast
        // a little sleepy. Small by design — flavour, not a second nutrition engine.
        foodEffects = detectFoodEffects(meal);
        if (foodEffects.length > 0) delta = mergeDelta(delta, foodEffectsDelta(foodEffects));
        message = meal.treats ? `${pet.name} savored the treat. Balance feels good.` : `${pet.name} loved the variety in that meal.`;
        eventLabel = 'Shared a meal';
        break;
      }
      case 'SLEEP': {
        const metadata = event.metadata as unknown as SleepMetadata;
        const minutes = Math.max(0, metadata.asleepMinutes);
        const hours = Math.round((minutes / 60) * 10) / 10;
        if (minutes >= SLEEP_FULL_MINUTES) {
          delta = { energy: 14, recovery: 5, health: 2, happiness: 3, xp: 16 };
          message = `${pet.name} slept soundly for ${hours}h and woke up bright.`;
        } else if (minutes >= SLEEP_SHORT_MINUTES) {
          delta = { energy: 9, recovery: 3, happiness: 1, xp: 11 };
          message = `${pet.name} got ${hours}h — enough to take the edge off.`;
        } else {
          delta = { energy: 4, recovery: 1, xp: 6 };
          message = `${pet.name} only managed ${hours}h. A longer night would help.`;
        }
        eventLabel = 'Rested up';
        break;
      }
      case 'SCREEN_TIME': {
        const metadata = event.metadata as unknown as ScreenTimeMetadata;
        // NaN is not a total: it would read "NaNh" and fail every comparison.
        const minutes = Number.isFinite(metadata.minutes) ? Math.max(0, Math.round(metadata.minutes)) : 0;
        const band = getScreenTimeBand(minutes);
        const budget = metadata.budgetMinutes;
        const hasBudget = budget !== undefined && Number.isFinite(budget) && budget > 0;
        const underBudget = hasBudget && (metadata.withinBudget ?? minutes <= (budget as number));
        delta = { ...SCREEN_TIME_BAND_DELTA[band.id] };
        if (underBudget) delta = { ...delta, xp: (delta.xp ?? 0) + SCREEN_TIME_BUDGET_BONUS_XP };
        else if (!hasBudget) delta = { ...delta, xp: Math.max(delta.xp ?? 0, SCREEN_TIME_NO_BUDGET_XP) };

        const spent = `${formatMinutes(minutes)} on the screen — ${band.verdict}`;
        message = underBudget
          ? `${pet.name} liked that: ${spent}, and under your ${formatMinutes(budget as number)} budget.`
          : `${pet.name} saw you check in: ${spent}.`;
        eventLabel = band.id === 'light' ? 'Unplugged' : 'Screen check-in';
        break;
      }
      default:
        delta = { happiness: 2, xp: 5 };
        message = `${pet.name} noticed you taking care of yourself.`;
        eventLabel = 'A healthy moment';
    }

    return {
      pet: applyDelta(pet, delta, event.occurredAt),
      reaction: { message, eventLabel, delta, ...(foodEffects.length > 0 ? { effects: foodEffects } : {}) },
    };
  }
}
