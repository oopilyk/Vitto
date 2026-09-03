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
export interface WorkoutStats {
  durationMinutes: number;
  exerciseCount: number;
  completedSets: number;
  totalReps: number;
  totalVolume: number;
  muscleGroups: string[];
  /**
   * Loaded training volume (Σ weight×reps) split by muscle group. Optional
   * because events stored before this field existed will not carry it — read it
   * with a `?? {}` fallback. The sum can differ from `totalVolume` when a
   * group's exercises were all bodyweight (those reps live in the next field).
   */
  volumeByMuscleGroup?: Record<string, number>;
  /** Completed reps of bodyweight (unweighted) sets, split by muscle group. Optional for the same reason. */
  bodyweightRepsByMuscleGroup?: Record<string, number>;
}

export interface StepMetadata {
  steps: number;
  date?: string;
}

export interface SleepMetadata {
  /**
   * Minutes actually asleep, summed across the night's asleep segments. Time
   * merely `inBed`, and `awake` stretches in the middle of the night, are both
   * excluded: lying down is not rest, and the pet's energy should reflect sleep
   * the user actually got.
   */
  asleepMinutes: number;
  /**
   * The date key of the morning the night ended, so a night that crosses
   * midnight is attributed to the day the user wakes into rather than split in
   * two. Also what makes "one night per day" checkable.
   */
  night?: string;
  /**
   * HealthKit id of the night's last segment. Nights arrive as many segments and
   * are stitched together here, so one representative id is what dedupe keys on
   * -- see `getKnownHealthKitExternalIds`.
   */
  externalId?: string;
}

export interface WordPuzzleRoundOutcome {
  length: number;
  solved: boolean;
  guessesUsed: number;
}

export interface BrainTrainingMetadata {
  game: 'math' | 'reading' | 'wordPuzzle';
  correct: number;
  total: number;
  durationSeconds: number;
  score: number;
  bestStreak?: number;
  passageId?: string;
  passageTitle?: string;
  puzzleDate?: string;
  generatorVersion?: number;
  roundOutcomes?: WordPuzzleRoundOutcome[];
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
  loggedVia?: 'ai' | 'barcode' | 'manual' | 'healthkit';
  /** Dedup key for entries imported from an external source (e.g. a HealthKit sample UUID). */
  externalId?: string;
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
