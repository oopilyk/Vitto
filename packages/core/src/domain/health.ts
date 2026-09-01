export type HealthEventType =
  | 'STEP_ACTIVITY'
  | 'WORKOUT'
  | 'MEAL'
  | 'BRAIN_TRAINING'
  | 'SLEEP'
  | 'SCREEN_TIME'
  | 'HYDRATION'
  | 'MANUAL_ACTIVITY';

export type HealthEventSource = 'manual' | 'mock' | 'healthkit' | 'health_connect' | 'ai';

export interface HealthEvent<TMetadata = unknown> {
  id: string;
  userId: string;
  occurredAt: string;
  type: HealthEventType;
  source: HealthEventSource;
  metadata: TMetadata;
}

export interface WorkoutMetadata {
  workoutType: string;
  durationMinutes: number;
  intensity?: 'easy' | 'moderate' | 'hard';
  workoutId?: string;
  name?: string;
  exercises?: WorkoutExercise[];
  notes?: string;
  stats?: WorkoutStats;
}

export interface WorkoutSet { id: string; reps: number; weight?: number; unit?: 'kg' | 'lb'; rpe?: number; completed: boolean; previous?: { reps: number; weight?: number; unit?: 'kg' | 'lb' }; }
export interface WorkoutExercise { id: string; name: string; muscleGroup: string; bodyweight?: boolean; sets: WorkoutSet[]; }
export interface WorkoutStats { durationMinutes: number; exerciseCount: number; completedSets: number; totalReps: number; totalVolume: number; muscleGroups: string[]; }

export interface StepMetadata {
  steps: number;
  date?: string;
}

export interface BrainTrainingMetadata {
  game: 'math' | 'reading';
  correct: number;
  total: number;
  durationSeconds: number;
  score: number;
  bestStreak?: number;
  passageId?: string;
  passageTitle?: string;
}

export interface MealMetadata {
  protein: boolean;
  vegetables: boolean;
  fruit: boolean;
  wholeGrains: boolean;
  fiber: boolean;
  treats: boolean;
  imageUrl?: string;
  analysis?: MealAnalysis;
  loggedVia?: 'ai' | 'barcode' | 'manual';
}

export interface MealAnalysis {
  foodDescription?: string;
  grade: 'A' | 'B' | 'C' | 'D';
  summary: string;
  confidence: number;
  detectedFoods: string[];
  macros: MacroNutrients;
  nutrients: {
    protein: boolean;
    vegetables: boolean;
    fruit: boolean;
    wholeGrains: boolean;
    fiber: boolean;
    treats: boolean;
  };
}

export interface MacroNutrients {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
}
