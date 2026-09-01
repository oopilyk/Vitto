export type GoalPace = 'gentle' | 'steady' | 'focused';
export type TrainingStyle = 'strength' | 'cardio' | 'mixed';
export type FocusArea = 'nutrition' | 'training' | 'movement' | 'mind';

export const FOCUS_AREAS: FocusArea[] = ['nutrition', 'training', 'movement', 'mind'];

export interface BodyProfile {
  age: number;
  sex: 'female' | 'male' | 'other';
  heightCm: number;
  heightUnit: 'cm' | 'ft';
  weightKg: number;
  weightUnit: 'kg' | 'lb';
  activity: 'low' | 'moderate' | 'high';
  goal: 'lose' | 'maintain' | 'gain';
  targetWeightKg?: number;
  goalWeeks?: number;
  goalPace: GoalPace;
  trainingDaysPerWeek: number;
  trainingStyle: TrainingStyle;
  focusAreas: FocusArea[];
}

/** Applied to anything loaded from before the survey existed. */
export const PROFILE_SURVEY_DEFAULTS = {
  goalPace: 'steady' as GoalPace,
  trainingDaysPerWeek: 3,
  trainingStyle: 'mixed' as TrainingStyle,
  focusAreas: FOCUS_AREAS,
};

export const withSurveyDefaults = (profile: Partial<BodyProfile>): BodyProfile => ({
  ...profile,
  goalPace: profile.goalPace ?? PROFILE_SURVEY_DEFAULTS.goalPace,
  trainingDaysPerWeek: profile.trainingDaysPerWeek ?? PROFILE_SURVEY_DEFAULTS.trainingDaysPerWeek,
  trainingStyle: profile.trainingStyle ?? PROFILE_SURVEY_DEFAULTS.trainingStyle,
  focusAreas: profile.focusAreas?.length ? profile.focusAreas : PROFILE_SURVEY_DEFAULTS.focusAreas,
} as BodyProfile);

export interface MacroTargets {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
}

export const parseNumberInput = (value: string) => Number(value.replace(/^0+(?=\d)/, '')) || 0;

export const convertWeightValue = (
  value: number,
  from: BodyProfile['weightUnit'],
  to: BodyProfile['weightUnit'],
) => {
  if (from === to) return value;
  return from === 'kg' ? value * 2.20462 : value / 2.20462;
};

export const cmToFeetAndInches = (heightCm: number) => {
  const totalInches = Math.round(heightCm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return { feet, inches };
};

export const convertHeightToFeetAndInches = (heightCm: number) => cmToFeetAndInches(heightCm);

export const feetAndInchesToCm = (feet: number, inches: number) => {
  const totalInches = feet * 12 + inches;
  return Math.round(totalInches * 2.54);
};

const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;

/** Daily kcal moved away from maintenance, by how hard the goal is being pushed. */
const PACE_DEFICIT: Record<GoalPace, number> = { gentle: 250, steady: 450, focused: 650 };
const PACE_SURPLUS: Record<GoalPace, number> = { gentle: 150, steady: 300, focused: 450 };

const BASE_ACTIVITY_FACTOR = { low: 1.2, moderate: 1.35, high: 1.5 };
const TRAINING_DAY_FACTOR = 0.025;
const MAX_TRAINING_DAYS = 6;

export const activityFactorFor = (profile: BodyProfile): number => {
  const days = Math.max(0, Math.min(MAX_TRAINING_DAYS, finite(profile.trainingDaysPerWeek, 3)));
  return BASE_ACTIVITY_FACTOR[profile.activity] + days * TRAINING_DAY_FACTOR;
};

/**
 * A kilogram of body mass is worth roughly 7,700 kcal, so a kilo per week is about
 * 1,100 kcal per day. The caps keep an ambitious deadline from turning into an
 * unsafe deficit; a surplus is capped lower because excess turns to fat faster
 * than a deficit turns to loss.
 */
export const DAILY_KCAL_PER_KG_PER_WEEK = 1100;
export const MAX_DAILY_DEFICIT = 1000;
export const MAX_DAILY_SURPLUS = 500;

export interface GoalPlan {
  weeks: number;
  totalKg: number;
  kgPerWeek: number;
  dailyAdjustment: number;
  requestedDaily: number;
  capped: boolean;
  achievableWeeks: number;
  targetDate: string;
}

/**
 * Turns "8 kg by 12 weeks" into a daily calorie figure. Returns null when the
 * profile has not given both a target weight and a deadline — the pace presets
 * cover that case instead.
 */
export const planForGoal = (profile: BodyProfile): GoalPlan | null => {
  const weeks = finite(profile.goalWeeks ?? 0, 0);
  const target = profile.targetWeightKg;
  if (profile.goal === 'maintain' || !target || !Number.isFinite(target) || weeks <= 0) return null;

  const totalKg = Math.abs(target - profile.weightKg);
  const kgPerWeek = totalKg / weeks;
  const requestedDaily = kgPerWeek * DAILY_KCAL_PER_KG_PER_WEEK;
  const cap = profile.goal === 'lose' ? MAX_DAILY_DEFICIT : MAX_DAILY_SURPLUS;
  const capped = requestedDaily > cap;
  const dailyMagnitude = Math.round(Math.min(requestedDaily, cap));
  const cappedRatePerWeek = cap / DAILY_KCAL_PER_KG_PER_WEEK;

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + Math.round(weeks * 7));

  return {
    weeks,
    totalKg: Math.round(totalKg * 10) / 10,
    kgPerWeek: Math.round(kgPerWeek * 100) / 100,
    dailyAdjustment: profile.goal === 'lose' ? -dailyMagnitude : dailyMagnitude,
    requestedDaily: Math.round(requestedDaily),
    capped,
    achievableWeeks: capped ? Math.ceil(totalKg / cappedRatePerWeek) : weeks,
    targetDate: targetDate.toISOString().slice(0, 10),
  };
};

export const calorieAdjustmentFor = (profile: BodyProfile): number => {
  const plan = planForGoal(profile);
  if (plan) return plan.dailyAdjustment;
  const pace = PACE_DEFICIT[profile.goalPace] ? profile.goalPace : 'steady';
  if (profile.goal === 'lose') return -PACE_DEFICIT[pace];
  if (profile.goal === 'gain') return PACE_SURPLUS[pace];
  return 0;
};

/**
 * Protein per kg of bodyweight. Lifting and cutting both raise the requirement —
 * a deficit is when protein matters most for holding on to lean mass.
 */
export const proteinPerKgFor = (profile: BodyProfile): number => {
  const days = finite(profile.trainingDaysPerWeek, 3);
  const lifts = profile.trainingStyle !== 'cardio' && days >= 3;
  if (profile.goal === 'lose') return lifts ? 2 : 1.8;
  if (profile.goal === 'gain') return 1.8;
  return lifts ? 1.8 : 1.5;
};

export const calculateMacroTargets = (profile: BodyProfile): MacroTargets => {
  const sexOffset = profile.sex === 'male' ? 5 : profile.sex === 'female' ? -161 : -78;
  const age = finite(profile.age, 30);
  const heightCm = finite(profile.heightCm, 170);
  const weightKg = finite(profile.weightKg, 70);
  const baseCalories = 10 * weightKg + 6.25 * heightCm - 5 * age + sexOffset;
  const calories = Math.max(
    1200,
    Math.round(baseCalories * activityFactorFor(profile) + calorieAdjustmentFor(profile)),
  );
  const proteinGrams = Math.round(weightKg * proteinPerKgFor(profile));
  const fatGrams = Math.round((calories * 0.28) / 9);
  const carbsGrams = Math.max(0, Math.round((calories - proteinGrams * 4 - fatGrams * 9) / 4));
  return { calories, proteinGrams, carbsGrams, fatGrams };
};

export interface WeightGoalProgress {
  direction: 'lose' | 'gain' | 'maintain';
  remainingKg: number;
  matchesGoal: boolean;
}

/** Describes the gap to the target weight, and whether it agrees with the stated goal. */
export const weightGoalProgress = (profile: BodyProfile): WeightGoalProgress | null => {
  const target = profile.targetWeightKg;
  if (!target || !Number.isFinite(target)) return null;
  const difference = target - profile.weightKg;
  const direction = Math.abs(difference) < 0.5 ? 'maintain' : difference < 0 ? 'lose' : 'gain';
  return {
    direction,
    remainingKg: Math.round(Math.abs(difference) * 10) / 10,
    matchesGoal: direction === 'maintain' || direction === profile.goal,
  };
};