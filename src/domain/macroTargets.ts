export interface BodyProfile {
  age: number;
  sex: 'female' | 'male' | 'other';
  heightCm: number;
  weightKg: number;
  weightUnit: 'kg' | 'lb';
  activity: 'low' | 'moderate' | 'high';
  goal: 'lose' | 'maintain' | 'gain';
}

export interface MacroTargets {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
}

export const parseNumberInput = (value: string) => Number(value.replace(/^0+(?=\d)/, '')) || 0;

const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;

export const calculateMacroTargets = (profile: BodyProfile): MacroTargets => {

  const sexOffset = profile.sex === 'male' ? 5 : profile.sex === 'female' ? -161 : -78;
  const age = finite(profile.age, 30);
  const heightCm = finite(profile.heightCm, 170);
  const weightKg = finite(profile.weightKg, 70);
  const baseCalories = 10 * weightKg + 6.25 * heightCm - 5 * age + sexOffset;
  const activityFactor = profile.activity === 'high' ? 1.6 : profile.activity === 'moderate' ? 1.4 : 1.25;
  const goalAdjustment = profile.goal === 'lose' ? -300 : profile.goal === 'gain' ? 250 : 0;
  const calories = Math.max(1200, Math.round(baseCalories * activityFactor + goalAdjustment));
  const proteinGrams = Math.round(weightKg * (profile.goal === 'gain' || profile.activity === 'high' ? 1.8 : 1.4));
  const fatGrams = Math.round((calories * 0.28) / 9);
  const carbsGrams = Math.max(0, Math.round((calories - proteinGrams * 4 - fatGrams * 9) / 4));
  return { calories, proteinGrams, carbsGrams, fatGrams };
};