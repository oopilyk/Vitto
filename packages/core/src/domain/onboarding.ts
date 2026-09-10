import { MAX_DECAY_DAYS } from './decay';
import type {
  BodyProfile,
  DietaryPreference,
  Motivation,
  TrainingStyle,
  TrainingType,
} from './macroTargets';
import type { PetPersonality } from './pet';

/**
 * Onboarding is a way of populating the real `profiles` / `pets` models — not a
 * store of its own. This module holds the vocab the flow offers and the pure
 * derivations that turn a plain answer into the value an existing engine
 * already reads:
 *
 *   current vs goal weight -> goal          (energy-balance axis, drives calories)
 *   goal target date       -> goalWeeks     (drives the calorie plan)
 *   trainingTypes          -> trainingStyle (drives the protein target)
 *
 * Plus the small "what's optimal for this goal / what keeps the pet alive"
 * helpers the summary screen shows.
 */

export interface Choice<T extends string> {
  value: T;
  label: string;
  detail?: string;
}

export const TRAINING_TYPE_OPTIONS: Choice<TrainingType>[] = [
  { value: 'weightlifting', label: 'Weightlifting' },
  { value: 'running', label: 'Running' },
  { value: 'cycling', label: 'Cycling' },
  { value: 'sports', label: 'Sports' },
  { value: 'hiit', label: 'HIIT' },
  { value: 'classes', label: 'Classes' },
  { value: 'other', label: 'Other' },
];

export const DIETARY_OPTIONS: Choice<DietaryPreference>[] = [
  { value: 'none', label: 'No preference' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'other', label: 'Other' },
];

export const MOTIVATION_OPTIONS: Choice<Motivation>[] = [
  { value: 'progress', label: 'Seeing progress' },
  { value: 'streaks', label: 'Keeping a streak alive' },
  { value: 'goals', label: 'Completing goals' },
  { value: 'pet', label: 'Taking care of my pet' },
  { value: 'habits', label: 'Building better habits' },
  { value: 'friends', label: 'Doing it with friends' },
  { value: 'competition', label: 'A bit of competition' },
];

export const PET_PERSONALITY_OPTIONS: Choice<PetPersonality>[] = [
  { value: 'energetic', label: 'Energetic', detail: 'Always ready to go' },
  { value: 'chill', label: 'Chill', detail: 'Calm, steady, unbothered' },
  { value: 'competitive', label: 'Competitive', detail: 'Loves a challenge' },
  { value: 'supportive', label: 'Supportive', detail: 'In your corner, every day' },
];

export const STEP_GOAL_PRESETS = [5000, 7500, 10000, 12500] as const;

const WEIGHT_MATCH_KG = 0.5;

/**
 * The energy-balance axis the calorie maths reads, from where the user is now to
 * where they want to be. A target within half a kilo of current is "maintain".
 */
export const deriveEnergyGoal = (
  currentKg: number,
  goalKg: number | undefined,
): BodyProfile['goal'] => {
  if (goalKg === undefined || !Number.isFinite(goalKg)) return 'maintain';
  const diff = goalKg - currentKg;
  if (Math.abs(diff) < WEIGHT_MATCH_KG) return 'maintain';
  return diff < 0 ? 'lose' : 'gain';
};

/** Whole weeks from today to an ISO date, floored at 1. */
export const weeksUntil = (isoDate: string | undefined, now: Date = new Date()): number | undefined => {
  if (!isoDate) return undefined;
  const target = Date.parse(isoDate);
  if (!Number.isFinite(target)) return undefined;
  const days = (target - now.getTime()) / 86_400_000;
  return Math.max(1, Math.round(days / 7));
};

/**
 * The training style the protein target reads. Both lifting and cardio present
 * -> mixed; lifting-ish only -> strength; cardio only -> cardio; nothing -> the
 * caller keeps the existing `mixed` default.
 */
export const deriveTrainingStyle = (types: TrainingType[] | undefined): TrainingStyle | undefined => {
  if (!types || types.length === 0) return undefined;
  const lifting = types.some((t) => t === 'weightlifting' || t === 'hiit' || t === 'classes');
  const cardio = types.some((t) => t === 'running' || t === 'cycling' || t === 'sports');
  if (lifting && cardio) return 'mixed';
  if (lifting) return 'strength';
  if (cardio) return 'cardio';
  return 'mixed';
};

/**
 * A sensible daily step target when the user asks Vitto to choose — from their
 * everyday activity, nudged up if they train most days. Rounded to 500.
 */
export const suggestStepGoal = (
  profile: Pick<BodyProfile, 'activity' | 'trainingDaysPerWeek'>,
): number => {
  const base = profile.activity === 'high' ? 10000 : profile.activity === 'moderate' ? 8000 : 6000;
  const trains = (profile.trainingDaysPerWeek ?? 0) >= 4 ? 2000 : 0;
  return Math.round((base + trains) / 500) * 500;
};

/** What the summary screen recommends for this goal, to sit beside the user's own commitments. */
export const optimalDailySteps = (profile: Pick<BodyProfile, 'goal' | 'activity'>): number => {
  const forGoal = profile.goal === 'lose' ? 10000 : profile.goal === 'gain' ? 7500 : 8000;
  const lift = profile.activity === 'high' ? 1500 : 0;
  return forGoal + lift;
};

export const optimalTrainingDays = (profile: Pick<BodyProfile, 'goal'>): number =>
  profile.goal === 'maintain' ? 3 : 4;

export interface PetSurvivalGuidance {
  /** Roughly how many active days a week keep the pet from sliding. */
  minActiveDaysPerWeek: number;
  /** The window of total neglect after which the pet can be lost. */
  neglectDays: number;
  headline: string;
  detail: string;
}

/** A motivating (not exact) read of the decay model for the pet-intro screen. */
export const petSurvivalGuidance = (petName: string): PetSurvivalGuidance => ({
  minActiveDaysPerWeek: 3,
  neglectDays: MAX_DECAY_DAYS,
  headline: `${petName} needs you`,
  detail:
    `Log a workout, a meal or your steps most days and ${petName} thrives. Go quiet for a few ` +
    `days and ${petName} starts to fade — about ${MAX_DECAY_DAYS} days of nothing and ${petName} ` +
    `could be lost.`,
});

/**
 * Has the user answered enough of the questionnaire that returning to onboarding
 * should resume at pet creation rather than restart? `motivations` is the last
 * question before the pet, so its presence is the marker.
 */
export const hasCompletedQuestionnaire = (
  profile: Pick<BodyProfile, 'targetWeightKg' | 'motivations'>,
): boolean =>
  profile.targetWeightKg !== undefined && (profile.motivations?.length ?? 0) > 0;
