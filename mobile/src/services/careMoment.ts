import {
  type BodyProfile,
  type HealthEvent,
  type PetDelta,
  type PetHealthContext,
  type PetHealthEngine,
  type PetReaction,
  type PetSaveResult,
  type PetState,
  type StepMetadata,
  applyDelta,
  applyTimeDecay,
  assessCondition,
  calculateQualifyingStreaks,
  createsNewStreakDay,
  totalPetXp,
} from '@vitto/core';

const PET_DELTA_KEYS: (keyof PetDelta)[] = [
  'health',
  'energy',
  'happiness',
  'nutrition',
  'strength',
  'pushingStrength',
  'pullingStrength',
  'legStrength',
  'endurance',
  'recovery',
  'mind',
  'xp',
];

/** `after` minus `before`, key by key — only the keys that actually changed. */
const diffDelta = (before: PetDelta, after: PetDelta): PetDelta => {
  const diff: PetDelta = {};
  for (const key of PET_DELTA_KEYS) {
    const change = (after[key] ?? 0) - (before[key] ?? 0);
    if (change !== 0) diff[key] = change;
  }
  return diff;
};

/**
 * The reward top-up for a step re-sync that pushes the day's total across a
 * threshold the engine only ever checks once per event (see
 * `PetHealthEngine`'s `STEP_ACTIVITY` case, e.g. its 8,000-step milestone).
 * The first sync of the day already ran the full engine once, against
 * whatever the count was at that moment — often too low to register a
 * milestone the day goes on to reach. This computes the SAME formula's output
 * for `event`'s (new) step count minus its output for `previousSteps`, so
 * crossing the milestone at 4pm is worth exactly what crossing it at 9am
 * would have been, without re-paying the base reward already granted.
 */
export const stepSyncTopUp = (
  engine: Pick<PetHealthEngine, 'apply'>,
  pet: PetState,
  event: HealthEvent<StepMetadata>,
  previousSteps: number,
  context: PetHealthContext = {},
): PetDelta => {
  const before = engine.apply(
    pet,
    { ...event, metadata: { ...event.metadata, steps: previousSteps } },
    context,
  ).reaction.delta;
  const after = engine.apply(pet, event, context).reaction.delta;
  return diffDelta(before, after);
};

/**
 * A care moment, from "the user did something healthy" to "the pet's row is
 * written". Split out of App so the one rule that matters with two carers can
 * be tested without a renderer: a write is accepted only if the row is
 * unchanged since it was read, and a rejected write is never resent — the
 * whole plan is recomputed from the fresh row, because decay and the
 * diminishing returns on strength were computed against stale stats.
 */

export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365];
export const STREAK_MILESTONE_BONUS_XP = 25;
/**
 * One care moment has to visibly pull a pet back from `dying`, or the only thing
 * a returning user can do is watch it stay collapsed. Paid once, on the event
 * that finds the pet dying.
 */
export const REVIVAL_BONUS = { health: 35, nutrition: 25, energy: 20, happiness: 20 } as const;
/** Two carers logging within the same second is rare; three collisions in a row means something is wrong. */
export const MAX_CARE_MOMENT_ATTEMPTS = 3;

export const careConflictMessage = (petName: string): string =>
  `Someone just cared for ${petName} — try again.`;

export interface CareMomentInput {
  /** The STORED pet, never a decayed projection — decay is settled here, once. */
  pet: PetState;
  event: HealthEvent;
  /** The signed-in user's own events only: streaks and strength are scored per carer. */
  events: HealthEvent[];
  profile: BodyProfile;
  engine: Pick<PetHealthEngine, 'apply'>;
}

export interface CareMomentPlan {
  pet: PetState;
  reaction: PetReaction;
  /**
   * The total xp this moment actually granted — the pet's real before/after
   * total, not `reaction.delta.xp` alone. A streak milestone or the revival
   * bonus below *replaces* `reaction` (so its message is the one shown), which
   * would otherwise mean its xp silently overwrote the base event's instead of
   * adding to it. This is what callers should persist as "xp earned".
   */
  xpGranted: number;
}

/** Pure: decay from the stored anchor, the engine, then the streak and revival bonuses. */
export const planCareMoment = ({ pet, event, events, profile, engine }: CareMomentInput): CareMomentPlan => {
  const eventDay = new Date(event.occurredAt);
  // Whether logging `event` is what turns its own day into a NEW qualifying
  // streak day -- the one gate for the streak-milestone bonus below. Not "was
  // there any event today": a sleep sync or a second meal must never look
  // like a fresh streak day just because it's technically the day's Nth event.
  const newStreakDay = createsNewStreakDay(events, event);
  const decayed = applyTimeDecay(pet, eventDay);
  const xpBefore = totalPetXp(decayed);
  // Read before the event lands: the point is whether this care moment is the
  // one that arrived at the brink, not where it left the pet afterwards.
  const wasDying = assessCondition(decayed).primary === 'dying';
  // Strength is scored against recent training, so hand the engine the
  // history it needs plus body weight for bodyweight-exercise volume.
  const result = engine.apply(decayed, event, { history: events, bodyWeightKg: profile.weightKg });
  let nextPet = result.pet;
  let nextReaction = result.reaction;

  if (newStreakDay) {
    const projected = calculateQualifyingStreaks([...events, event], eventDay).currentStreak;
    if (STREAK_MILESTONES.includes(projected)) {
      const bonus = { xp: STREAK_MILESTONE_BONUS_XP, happiness: 10 };
      nextPet = applyDelta(nextPet, bonus, event.occurredAt);
      nextReaction = {
        message: `${pet.name} celebrates your ${projected}-day streak! +${STREAK_MILESTONE_BONUS_XP} bonus XP`,
        eventLabel: 'Streak milestone',
        delta: bonus,
      };
    }
  }

  // Last, so its message is the one shown: coming back from the brink outranks
  // both the event's own reaction and a streak milestone.
  if (wasDying) {
    nextPet = applyDelta(nextPet, REVIVAL_BONUS, event.occurredAt);
    nextReaction = {
      message: `${pet.name} was fading — that care moment brought them back.`,
      eventLabel: 'Back from the brink',
      delta: { ...REVIVAL_BONUS },
    };
  }

  return { pet: nextPet, reaction: nextReaction, xpGranted: totalPetXp(nextPet) - xpBefore };
};

/** The two remote calls the commit loop needs; `SupabaseRepository` satisfies it directly. */
export interface CareMomentRemote {
  /** By id, not "the" pet: a user can be caring for two, and a conflict must reload the right one. */
  loadPetById(petId: string): Promise<PetState | null>;
  savePetIfUnchanged(pet: PetState, expectedVersion: number): Promise<PetSaveResult>;
}

export interface CommitCareMomentInput extends CareMomentInput {
  /** Absent in local mode: a single writer never conflicts, so the plan is simply returned. */
  remote?: CareMomentRemote;
  maxAttempts?: number;
}

export interface CareMomentResult extends CareMomentPlan {
  /** How many plans were made; 1 unless another carer wrote in between. */
  attempts: number;
}

/**
 * Plans from `pet`, writes optimistically, and on a version conflict reloads
 * the row and plans again from it. Each elapsed decay window is therefore
 * settled exactly once, by exactly one writer, and two devices can never both
 * pay the same decay or overwrite each other's gains. The returned pet carries
 * the version the server assigned, so the next moment reads from the right base.
 */
export const commitCareMoment = async ({
  remote,
  maxAttempts = MAX_CARE_MOMENT_ATTEMPTS,
  ...input
}: CommitCareMomentInput): Promise<CareMomentResult> => {
  let base = input.pet;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const plan = planCareMoment({ ...input, pet: base });
    if (!remote) return { ...plan, attempts: attempt };

    const outcome = await remote.savePetIfUnchanged(plan.pet, base.version ?? 0);
    if (outcome.status === 'saved') {
      return {
        pet: { ...plan.pet, version: outcome.version },
        reaction: plan.reaction,
        xpGranted: plan.xpGranted,
        attempts: attempt,
      };
    }

    // Somebody else wrote first. Never resend: their write moved the decay
    // anchor and the stats this plan was computed against.
    const fresh = await remote.loadPetById(base.id);
    if (!fresh) throw new Error(`Could not reach ${input.pet.name}. Check your connection and try again.`);
    base = fresh;
  }
  throw new Error(careConflictMessage(input.pet.name));
};

export interface CareMomentFanOut {
  /** One result per pet, in the order the pets were given. */
  results: CareMomentResult[];
  /** Every pet after the moment, so the caller can replace its whole list. */
  pets: PetState[];
}

/**
 * Applies one logged moment to every pet the user cares for.
 *
 * A person eats one meal and walks one set of steps, so a moment is a fact about
 * them, not about a particular pet: it feeds the pet they adopted and the pet
 * they share, without asking which. That also keeps the shared pet from becoming
 * a second chore — the reason the alternative (pick a pet per log) was rejected.
 *
 * Sequential rather than parallel on purpose. Each pet is written under its own
 * optimistic-concurrency retry, and running them together would multiply the
 * conflict window against a partner caring at the same moment for no gain: the
 * writes are independent rows, and a person has at most two.
 *
 * One pet failing does not roll back another. There is no cross-pet transaction
 * to be had over PostgREST, and a half-applied moment is better than a lost one —
 * so the error is raised only after every pet has been tried.
 */
export const commitCareMomentForAll = async ({
  pets,
  ...input
}: Omit<CommitCareMomentInput, 'pet'> & { pets: PetState[] }): Promise<CareMomentFanOut> => {
  const results: CareMomentResult[] = [];
  const next: PetState[] = [];
  let failure: unknown = null;

  for (const pet of pets) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await commitCareMoment({ ...input, pet });
      results.push(result);
      next.push(result.pet);
    } catch (cause) {
      failure ??= cause;
      // Keep the pet as it was, so the caller's list stays complete and the
      // untouched pet is not mistaken for one that has no stats.
      next.push(pet);
    }
  }

  if (failure && results.length === 0) throw failure;
  return { results, pets: next };
};
