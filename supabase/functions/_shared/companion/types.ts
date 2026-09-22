// GENERATED FILE -- DO NOT EDIT BY HAND.
// Source: packages/core/src/companion/types.ts
// Regenerate with: node scripts/syncCompanion.mjs

/**
 * The AI companion: the pet as a character with a memory, a mood, a personality
 * that drifts and a relationship with one person.
 *
 * Ported from the vittoAI prototype. Everything in this folder is pure and has a
 * CLOSED import graph — it imports nothing from outside `companion/` — because it
 * runs in two places: here (vitest, the mobile read side) and inside the Supabase
 * edge function, which is Deno and cannot resolve the rest of core's extensionless
 * imports. `scripts/syncCompanion.mjs` copies this folder into
 * `supabase/functions/_shared/companion/`; a test fails if the copy drifts.
 *
 * Timestamps are epoch milliseconds throughout. The edge function converts to and
 * from Postgres `timestamptz` at its own boundary.
 */

export const TRAITS = [
  'playful', 'sarcastic', 'affectionate', 'competitive', 'shy', 'curious', 'energetic', 'calm',
] as const;
export type Trait = (typeof TRAITS)[number];
/** Each trait is 0..1 and drifts slowly with experience. */
export type PersonalityTraits = Record<Trait, number>;

export const MOODS = [
  'happy', 'excited', 'sleepy', 'bored', 'proud', 'lonely', 'curious', 'annoyed', 'worried', 'hungry',
] as const;
export type CompanionMood = (typeof MOODS)[number];

export const RELATIONSHIP_LEVELS = ['STRANGER', 'ACQUAINTANCE', 'FRIEND', 'CLOSE_FRIEND', 'BONDED'] as const;
export type RelationshipLevel = (typeof RELATIONSHIP_LEVELS)[number];

export const COMPANION_EVENT_TYPES = [
  'WORKOUT_COMPLETED', 'STEP_GOAL_REACHED', 'SLEEP_GOAL_REACHED', 'POOR_SLEEP', 'HEALTHY_MEAL_LOGGED',
  'USER_OPENED_APP', 'USER_SENT_MESSAGE', 'USER_RETURNED_AFTER_ABSENCE',
  'MEAL_LOGGED', 'STEPS_LOGGED', 'SLEEP_LOGGED', 'BRAIN_GAME_PLAYED', 'LEVEL_UP',
] as const;
export type CompanionEventType = (typeof COMPANION_EVENT_TYPES)[number];

export interface CompanionEvent {
  id: string;
  type: CompanionEventType;
  timestamp: number;
  metadata: Record<string, unknown>;
  /** Set once the pet has spoken about this event, or it was not worth a reaction. */
  reactedAt: number | null;
}

export interface CompanionEventInput {
  type: CompanionEventType;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

export const MEMORY_CATEGORIES = [
  'preference', 'goal', 'routine', 'activity', 'relationship', 'importantEvent', 'healthHabit', 'conversationFact',
] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export interface CompanionMemory {
  id: string;
  category: MemoryCategory;
  content: string;
  importance: number; // 0..1
  confidence: number; // 0..1
  createdAt: number;
  lastReferencedAt: number;
  referenceCount: number;
  /** Low-importance memories expire; important ones persist (null). */
  expiresAt: number | null;
  /** For `importantEvent`: the ISO date (YYYY-MM-DD) it happens. */
  eventDate: string | null;
  followedUpAt: number | null;
  source: 'extraction' | 'event';
  active: boolean;
}

/** The character half of a pet, for one person. The body lives in `PetState`. */
export interface CompanionState {
  personalityTraits: PersonalityTraits;
  mood: CompanionMood;
  moodIntensity: number;
  moodReason: string;
  affection: number;
  trust: number;
  relationshipScore: number;
  relationshipLevel: RelationshipLevel;
  relationshipSummary: string;
  userNickname: string | null;
  createdAt: number;
  lastInteractionAt: number;
  lastProactiveAt: number | null;
}

export interface CompanionMessage {
  id: string;
  role: 'user' | 'pet';
  content: string;
  createdAt: number;
  source: 'reply' | 'proactive';
  triggerKey: string | null;
}

export interface UserPattern {
  key: string;
  description: string;
  confidence: number;
}

/**
 * What the app knows about the person's day and the pet's body. Computed on the
 * phone from data the rest of core already derives (the daily recap, the streak,
 * the ailments, the bond) and sent with each request.
 *
 * It is NOT trusted as instructions: the server validates every field, caps every
 * string, and renders it into a prompt it owns. Lying here only changes what your
 * own pet thinks your day looked like.
 */
export interface LifeContext {
  pet: {
    name: string;
    species: string;
    ageDays: number;
    level: number;
    build: string;
    /** The temperament chosen at adoption; the baseline its voice starts from. */
    temperament?: string;
    /** With temperament `custom`: the character, as the person described it. */
    persona?: string;
  };
  /** In-character conditions such as "Hungry", worst first. */
  statuses: string[];
  foodTags: string[];
  /** 0..1, mirrored from the body. */
  energy: number;
  /** Body needs, 0..100. */
  needs: { nutrition: number; energy: number; happiness: number; mind: number };
  /** How it has been going lately — see `bondFor`. Closeness is separate. */
  bond: 'devoted' | 'warm' | 'neutral' | 'wary' | 'sulking';
  silentDays: number;
  today: {
    meals: number;
    calories: number;
    calorieTarget: number;
    proteinGrams: number;
    proteinTarget: number;
    steps: number;
    stepGoal: number;
    workouts: number;
    lastWorkoutName?: string;
    mindSessions: number;
    sleepHoursLastNight: number | null;
    careStreakDays: number;
    loggedSomethingToday: boolean;
  };
  now: { localTime: string; weekday: string; timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' };
}

/** The trimmed view of everything the pet has in mind for one model call. */
export interface PetContext {
  life: LifeContext;
  personality: { traits: PersonalityTraits; dominant: Trait[]; description: string; flavor: string };
  mood: { mood: CompanionMood; intensity: number; reason: string };
  relationship: {
    level: RelationshipLevel;
    summary: string;
    nickname: string | null;
    daysKnown: number;
    affection: number;
    trust: number;
  };
  recentEvents: Array<{ type: CompanionEventType; ago: string; metadata: Record<string, unknown> }>;
  relevantMemories: Array<{ id: string; category: MemoryCategory; content: string; score: number }>;
  userPatterns: UserPattern[];
  recentConversation: Array<{ role: 'user' | 'pet'; content: string }>;
}

export const TONE_SIGNALS = [
  'joking', 'sarcastic', 'competitive', 'affectionate', 'calm', 'energetic', 'curious', 'reserved',
] as const;
export type ToneSignal = (typeof TONE_SIGNALS)[number];

export interface ExtractedMemory {
  category: MemoryCategory;
  content: string;
  importance: number;
  confidence: number;
  eventDate?: string | null;
}

export interface ExtractionResult {
  memories: ExtractedMemory[];
  toneSignals: ToneSignal[];
  /** Only honoured once the two are close. */
  suggestedNickname?: string | null;
}

/** Who may use the companion, and how much. Free for now; the paywall is this seam. */
export type CompanionTier = 'free' | 'plus';
