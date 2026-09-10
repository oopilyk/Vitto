import type {
  BodyProfile,
  DietaryPreference,
  Motivation,
  PrimaryGoal,
  TrainingStyle,
  TrainingType,
} from './macroTargets';
import type { PetPersonality } from './pet';

/**
 * Onboarding is a way of populating the real `profiles` / `pets` models — not a
 * store of its own. This module holds the vocab the flow offers and the pure
 * derivations that turn a game-facing answer into the value an existing engine
 * already reads:
 *
 *   primaryGoal    -> goal          (energy-balance axis, drives calories)
 *   trainingTypes  -> trainingStyle (drives the protein target)
 *   activity/etc.  -> a suggested step goal
 *
 * The derived value is still stored (it's an existing required column), but it
 * is seeded here and the user can override it — `goal` on the weight step in
 * particular.
 */

export interface Choice<T extends string> {
  value: T;
  label: string;
  detail?: string;
}

export const PRIMARY_GOAL_OPTIONS: Choice<PrimaryGoal>[] = [
  { value: 'lose_weight', label: 'Lose weight' },
  { value: 'build_muscle', label: 'Build muscle' },
  { value: 'get_stronger', label: 'Get stronger' },
  { value: 'gain_weight', label: 'Gain weight' },
  { value: 'maintain', label: 'Maintain my weight' },
  { value: 'improve_fitness', label: 'Improve fitness' },
  { value: 'athletic_performance', label: 'Athletic performance' },
  { value: 'build_habits', label: 'Build better habits' },
  { value: 'other', label: 'Something else' },
];

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

/** Which primary goals actually involve moving the number on the scale. */
export const goalInvolvesWeightChange = (goal: PrimaryGoal | undefined): boolean =>
  goal === 'lose_weight' || goal === 'gain_weight' || goal === 'build_muscle';

/**
 * The energy-balance axis the calorie maths reads. Seeded from the primary
 * goal; the weight step lets the user override it (e.g. "build muscle" while
 * eating at maintenance).
 */
export const deriveEnergyGoal = (goal: PrimaryGoal | undefined): BodyProfile['goal'] => {
  if (goal === 'lose_weight') return 'lose';
  if (goal === 'gain_weight' || goal === 'build_muscle') return 'gain';
  return 'maintain';
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

/**
 * Has the user answered enough of the questionnaire that returning to onboarding
 * should resume at pet creation rather than restart? `motivations` is the last
 * question before the pet, so its presence is the marker.
 */
export const hasCompletedQuestionnaire = (
  profile: Pick<BodyProfile, 'primaryGoal' | 'motivations'>,
): boolean => Boolean(profile.primaryGoal) && (profile.motivations?.length ?? 0) > 0;
