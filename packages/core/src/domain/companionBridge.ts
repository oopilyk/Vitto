import type { CompanionEventInput, LifeContext } from '../companion/types';
import { timeOfDayFor, WEEKDAYS } from '../companion/util';
import { bondFor } from './bond';
import { describeLoggedEvent } from './careToast';
import { buildDailyRecap } from './dailyRecap';
import { activeFoodEffects } from './foodEffects';
import type { BrainTrainingMetadata, HealthEvent, MealMetadata, SleepMetadata, StepMetadata, WeightUnit, WorkoutMetadata } from './health';
import { calorieEstimate } from './macros';
import type { BodyProfile } from './macroTargets';
import { personalRecords } from './personalRecords';
import { PET_BUILD_LABEL, getPetBuild, hasEvolved, type PetState } from './pet';
import { assessCondition, type PetAilment } from './petCondition';
import { daysWithPet } from './petStats';
import { calculateStreakStatus } from './streaks';

/**
 * Where Vitto's existing world meets the AI companion.
 *
 * The companion (`../companion`) knows nothing about health events, macros or
 * sprites: it perceives plain events and a plain description of the day. This
 * file is the only place that translates, and it runs on the PHONE, because
 * everything it reads is already derived there by the rest of core. Nothing here
 * is a second source of truth — it only re-describes what core already computed.
 */

const GAME_NAMES: Partial<Record<BrainTrainingMetadata['game'], string>> = {
  math: 'quick maths',
  reading: 'read and recall',
  wordPuzzle: 'the daily word puzzle',
  countryGuess: 'guess the country',
  fourCorners: 'four corners trivia',
  petJeopardy: 'pet jeopardy',
};

const CARDIO_KINDS: ReadonlyArray<readonly [needle: string, kind: string]> = [
  ['swim', 'swimming'], ['run', 'running'], ['jog', 'running'], ['cycl', 'cycling'], ['bike', 'cycling'],
  ['row', 'rowing'], ['walk', 'walking'], ['hik', 'hiking'],
];

const cardioKind = (m: WorkoutMetadata): string => {
  const text = `${m.name ?? ''} ${m.exercises?.map((e) => e.name).join(' ') ?? ''}`.toLowerCase();
  return CARDIO_KINDS.find(([needle]) => text.includes(needle))?.[1] ?? 'cardio';
};

const clean = (object: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(object).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)),
  );

/** What a friend would call the plate: the first thing named, not the whole portion list. */
const mealName = (analysis: MealMetadata['analysis']): string | undefined => {
  const named = analysis?.detectedFoods?.slice(0, 3).join(', ') || analysis?.foodDescription?.split(',')[0];
  return named?.trim().slice(0, 60) || undefined;
};

export interface PersonalRecordNote { exercise: string; weight: number; unit: WeightUnit; reps: number }

/** Lifts where `workout` beat everything logged before it. */
export const newPersonalRecords = (
  earlier: readonly HealthEvent[],
  workout: HealthEvent,
  unit: WeightUnit,
): PersonalRecordNote[] => {
  const before = new Map(personalRecords(earlier, unit).map((entry) => [entry.exercise, entry.record]));
  return personalRecords([...earlier, workout], unit)
    .filter(({ exercise, record }) => record && record.occurredAt === workout.occurredAt && record.weight > (before.get(exercise)?.weight ?? 0))
    .map(({ exercise, record }) => ({ exercise, weight: record!.weight, unit, reps: record!.reps }));
};

export interface BridgeExtras {
  personalRecords?: PersonalRecordNote[];
  stepGoal?: number;
  /** Steps already counted today before this sync, so crossing the goal fires once. */
  previousSteps?: number;
}

/**
 * A logged fact about someone's life, as the pet perceives it. The metadata is
 * what the model sees when it reacts, so it carries the specifics a friend would
 * notice (what they ate, which lift went up) and nothing the pet could not
 * plausibly know. Returns null for event types the pet has no feelings about.
 */
export const toCompanionEvent = (event: HealthEvent, extras: BridgeExtras = {}): CompanionEventInput | null => {
  const summary = describeLoggedEvent(event);
  const timestamp = Date.parse(event.occurredAt);
  const at = Number.isFinite(timestamp) ? { timestamp } : {};
  switch (event.type) {
    case 'WORKOUT': {
      const m = event.metadata as WorkoutMetadata;
      return {
        ...at,
        type: 'WORKOUT_COMPLETED',
        metadata: clean({
          summary,
          kind: m.workoutType === 'cardio' ? cardioKind(m) : 'strength',
          name: m.name,
          minutes: m.durationMinutes,
          distanceKm: m.distanceKm,
          exercises: m.exercises?.slice(0, 5).map((e) => e.name),
          sets: m.stats?.completedSets,
          personalRecords: extras.personalRecords,
        }),
      };
    }
    case 'MEAL': {
      const m = event.metadata as MealMetadata;
      const grade = m.analysis?.grade;
      return {
        ...at,
        type: grade === 'A' || grade === 'B' ? 'HEALTHY_MEAL_LOGGED' : 'MEAL_LOGGED',
        metadata: clean({
          summary,
          food: mealName(m.analysis),
          grade,
          calories: calorieEstimate(m.analysis?.macros) || undefined,
          treat: m.treats || undefined,
        }),
      };
    }
    case 'STEP_ACTIVITY': {
      const m = event.metadata as StepMetadata;
      const goal = extras.stepGoal ?? 8000;
      const crossedGoal = m.steps >= goal && (extras.previousSteps ?? 0) < goal;
      return { ...at, type: crossedGoal ? 'STEP_GOAL_REACHED' : 'STEPS_LOGGED', metadata: { summary, steps: m.steps, goal } };
    }
    case 'SLEEP': {
      const m = event.metadata as SleepMetadata;
      const type = m.asleepMinutes >= 7 * 60 ? 'SLEEP_GOAL_REACHED' : m.asleepMinutes < 5.5 * 60 ? 'POOR_SLEEP' : 'SLEEP_LOGGED';
      return { ...at, type, metadata: { summary, hours: Math.round((m.asleepMinutes / 60) * 10) / 10 } };
    }
    case 'BRAIN_TRAINING': {
      const m = event.metadata as BrainTrainingMetadata;
      return {
        ...at,
        type: 'BRAIN_GAME_PLAYED',
        metadata: clean({ summary, game: GAME_NAMES[m.game] ?? 'a mind game', score: m.score, correct: m.correct, total: m.total }),
      };
    }
    default:
      return null;
  }
};

/** How each ailment reads as a feeling the pet would own. */
const STATUS_LABEL: Record<PetAilment, string> = {
  dying: 'Very weak', starving: 'Hungry', exhausted: 'Worn out', sad: 'Lonely', foggy: 'Foggy-headed',
};

const SPECIES: Record<string, string> = {
  bichon: 'bichon puppy', shiba: 'shiba inu puppy', tabbyCat: 'tabby kitten', otter: 'otter pup', bunny: 'bunny',
  fox: 'fox kit', koala: 'koala joey', bear: 'bear cub', dino: 'little dinosaur', axolotl: 'axolotl',
};

/**
 * The description of the pet's body and the person's day that rides along with
 * every companion request. Every figure here comes from a function the app
 * already uses to draw its own screens, so the pet never believes something the
 * dashboard would contradict.
 */
export const buildLifeContext = (input: {
  pet: PetState;
  events: HealthEvent[];
  profile: BodyProfile;
  stepGoal: number;
  now?: Date;
}): LifeContext => {
  const now = input.now ?? new Date();
  const { pet, events } = input;
  const recap = buildDailyRecap({ events, profile: input.profile, pet, stepGoal: input.stepGoal, day: now });
  const streak = calculateStreakStatus(events, now);
  const bond = bondFor(events, now, { adoptedAt: pet.adoptedAt });

  // Last night: the most recent sleep that ended within the past day.
  const lastSleep = events
    .filter((event) => event.type === 'SLEEP' && now.getTime() - Date.parse(event.occurredAt) < 86_400_000)
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0];
  const asleep = (lastSleep?.metadata as SleepMetadata | undefined)?.asleepMinutes;

  return {
    pet: {
      name: pet.name,
      species: SPECIES[pet.breed ?? ''] ?? 'pet',
      ageDays: Math.max(0, daysWithPet(pet, now) - 1),
      level: pet.level,
      build: hasEvolved(pet) ? PET_BUILD_LABEL[getPetBuild(pet)] : 'Balanced',
      ...(pet.personality ? { temperament: pet.personality } : {}),
      ...(pet.persona ? { persona: pet.persona } : {}),
      ...(pet.dials ? { dials: pet.dials } : {}),
    },
    statuses: assessCondition(pet).ailments.map((ailment) => STATUS_LABEL[ailment]),
    foodTags: activeFoodEffects(events, now).map((effect) => effect.label),
    energy: pet.energy / 100,
    needs: { nutrition: pet.nutrition, energy: pet.energy, happiness: pet.happiness, mind: pet.mind },
    bond: bond.stage,
    silentDays: bond.silentDays,
    today: {
      meals: recap.food.mealCount,
      calories: Math.round(recap.food.consumed.calories),
      calorieTarget: Math.round(recap.food.targets.calories),
      proteinGrams: Math.round(recap.food.consumed.proteinGrams),
      proteinTarget: Math.round(recap.food.targets.proteinGrams),
      steps: recap.outdoors.steps,
      stepGoal: recap.outdoors.goal,
      workouts: recap.gym.workoutCount,
      ...(recap.gym.lastName ? { lastWorkoutName: recap.gym.lastName } : {}),
      mindSessions: recap.mind.sessionCount,
      sleepHoursLastNight: typeof asleep === 'number' ? Math.round((asleep / 60) * 10) / 10 : null,
      careStreakDays: streak.currentStreak,
      loggedSomethingToday: streak.todayQualifies,
    },
    now: {
      localTime: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      weekday: WEEKDAYS[now.getDay()]!,
      timeOfDay: timeOfDayFor(now.getHours()),
      // Negated: getTimezoneOffset counts minutes WEST of UTC.
      utcOffsetMinutes: -now.getTimezoneOffset(),
    },
  };
};
