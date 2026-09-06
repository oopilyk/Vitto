export type HealthEventType =
  | 'STEP_ACTIVITY'
  | 'WORKOUT'
  | 'MEAL'
  | 'BRAIN_TRAINING'
  | 'SLEEP'
  | 'SCREEN_TIME'
  | 'HYDRATION'
  | 'MANUAL_ACTIVITY';

/**
 * Where an event came from. `device` is the phone itself rather than a health
 * store — Android's UsageStatsManager or an iOS DeviceActivity threshold — and
 * is only used by SCREEN_TIME, whose metadata says which of the two it was.
 */
export type HealthEventSource = 'manual' | 'mock' | 'healthkit' | 'health_connect' | 'device' | 'ai';

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

/**
 * One day of screen use.
 *
 * Privacy rule: this stores a total and a budget flag, nothing else. Never add
 * per-app breakdowns, app names, package ids or categories — the pet only needs
 * to know whether the day stayed under the user's own budget, and anything
 * finer would turn a companion app into a surveillance log.
 */
export interface ScreenTimeMetadata {
  /**
   * Total minutes on the screen for the day. On iOS this is typed in by hand
   * (the system never exposes it to apps); on Android it is summed from
   * UsageStatsManager; from a threshold callback it is only a floor. `source`
   * says which, so a reader knows how much to trust it.
   */
  minutes: number;
  /**
   * The day the total is for, as a date key. Screen time is a whole-day figure
   * logged at some point during or after that day, so `occurredAt` alone would
   * misattribute a total typed in after midnight. Also what makes "one log per
   * day" checkable.
   */
  date?: string;
  /**
   * `manual`: read off the OS Screen Time settings and typed in. `thresholds`:
   * an iOS DeviceActivity threshold was crossed, so `minutes` is a floor, not a
   * total. `usage_stats`: summed from Android's UsageStatsManager.
   */
  source: 'manual' | 'thresholds' | 'usage_stats';
  /**
   * The user's own daily budget at the time of logging, copied in so the event
   * still reads correctly after the budget is changed. Absent when no budget
   * was set — the engine then treats the day as a neutral log.
   */
  budgetMinutes?: number;
  /**
   * `minutes <= budgetMinutes`, precomputed so diaries and the engine agree
   * without each re-deriving it. Undefined whenever `budgetMinutes` is.
   */
  withinBudget?: boolean;
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
