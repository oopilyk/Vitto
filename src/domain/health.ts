export type HealthEventType =
  | 'STEP_ACTIVITY'
  | 'WORKOUT'
  | 'MEAL'
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
}

export interface StepMetadata {
  steps: number;
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
}

export interface MealAnalysis {
  grade: 'A' | 'B' | 'C' | 'D';
  summary: string;
  confidence: number;
  detectedFoods: string[];
  nutrients: {
    protein: boolean;
    vegetables: boolean;
    fruit: boolean;
    wholeGrains: boolean;
    fiber: boolean;
    treats: boolean;
  };
}
