// GENERATED FILE -- DO NOT EDIT BY HAND.
// Source: packages/core/src/companion/events.ts
// Regenerate with: node scripts/syncCompanion.mjs

import { ABSENCE_THRESHOLD_MS, computeMood } from './mood.ts';
import { applyEventInfluence, initialTraits } from './personality.ts';
import type { PersonalityDials } from './types.ts';
import { applyRelationshipEvent } from './relationship.ts';
import { isReactionWorthy } from './triggers.ts';
import type { CompanionEvent, CompanionEventInput, CompanionEventType, CompanionState, ExtractedMemory, LifeContext } from './types.ts';
import { DAY, dayKey } from './util.ts';

/** Events that count as the person being present. */
const INTERACTION_EVENTS: ReadonlySet<CompanionEventType> = new Set<CompanionEventType>([
  'USER_OPENED_APP', 'USER_SENT_MESSAGE', 'USER_RETURNED_AFTER_ABSENCE',
  // Logging anything means they opened the app and did it themselves.
  'WORKOUT_COMPLETED', 'HEALTHY_MEAL_LOGGED', 'MEAL_LOGGED', 'STEPS_LOGGED', 'STEP_GOAL_REACHED',
  'SLEEP_LOGGED', 'SLEEP_GOAL_REACHED', 'POOR_SLEEP', 'BRAIN_GAME_PLAYED',
]);

export const newCompanionState = (seedKey: string, now: number, temperament?: string, dials?: PersonalityDials | null): CompanionState => ({
  personalityTraits: initialTraits(seedKey, temperament, dials),
  mood: 'curious',
  moodIntensity: 0.6,
  moodReason: 'you just met and everything is new',
  affection: 0.3,
  trust: 0.2,
  relationshipScore: 0,
  relationshipLevel: 'STRANGER',
  relationshipSummary: 'You just met.',
  userNickname: null,
  createdAt: now,
  lastInteractionAt: now,
  lastProactiveAt: null,
});

export interface EventOutcome {
  /** The events to store, in order: a derived "returned after absence" comes first. */
  events: Array<CompanionEventInput & { timestamp: number; reactedAt: number | null }>;
  state: CompanionState;
  /** Things worth remembering that came straight from the event, not from chat. */
  memories: ExtractedMemory[];
}

/**
 * Applies something that happened to the character: relationship, the slow pull
 * on personality, presence, and a freshly recomputed mood. Pure — the caller
 * stores the result. `silent` events are consumed by the caller (a chat reply is
 * itself the reaction), so they never queue a proactive message.
 */
export const applyCompanionEvent = (
  state: CompanionState,
  input: CompanionEventInput,
  history: readonly CompanionEvent[],
  life: LifeContext | undefined,
  now: number,
  options: { silent?: boolean } = {},
): EventOutcome => {
  const timestamp = input.timestamp ?? now;
  const stored: EventOutcome['events'] = [];
  let next = state;

  const apply = (type: CompanionEventType, metadata: Record<string, unknown>) => {
    const firstInteractionToday = !history.some(
      (event) => INTERACTION_EVENTS.has(event.type) && dayKey(event.timestamp) === dayKey(timestamp),
    ) && !stored.some((event) => INTERACTION_EVENTS.has(event.type));
    next = {
      ...next,
      ...applyRelationshipEvent(next, type, { firstInteractionToday }),
      personalityTraits: applyEventInfluence(next.personalityTraits, type),
      lastInteractionAt: INTERACTION_EVENTS.has(type) ? Math.max(next.lastInteractionAt, timestamp) : next.lastInteractionAt,
    };
    stored.push({ type, timestamp, metadata, reactedAt: options.silent || !isReactionWorthy(type) ? now : null });
  };

  // Any sign of life after a long gap is itself worth reacting to.
  const gap = now - state.lastInteractionAt;
  if (INTERACTION_EVENTS.has(input.type) && input.type !== 'USER_RETURNED_AFTER_ABSENCE' && gap >= ABSENCE_THRESHOLD_MS) {
    apply('USER_RETURNED_AFTER_ABSENCE', { days: Math.round(gap / DAY) });
  }
  apply(input.type, input.metadata ?? {});

  const recent = [
    ...stored.map((event, index) => ({ id: `new-${index}`, ...event })),
    ...history,
  ].filter((event) => now - event.timestamp < 2 * DAY) as CompanionEvent[];
  const mood = computeMood({ traits: next.personalityTraits, lastInteractionAt: next.lastInteractionAt, life }, recent, now);
  next = { ...next, mood: mood.mood, moodIntensity: mood.intensity, moodReason: mood.reason };

  const memories: ExtractedMemory[] = [];
  // A broken personal record is the kind of thing a friend remembers.
  const records = (input.metadata ?? {}).personalRecords;
  if (input.type === 'WORKOUT_COMPLETED' && Array.isArray(records)) {
    for (const record of records.slice(0, 4) as Array<Record<string, unknown>>) {
      if (typeof record.exercise !== 'string' || typeof record.weight !== 'number') continue;
      memories.push({
        category: 'activity',
        content: `User's best ${record.exercise} is ${record.weight} ${String(record.unit ?? '')} for ${String(record.reps ?? '?')}`.trim(),
        importance: 0.65,
        confidence: 1,
      });
    }
  }
  return { events: stored, state: next, memories };
};

/** Time passing is not an event, but it still changes how the pet feels. */
export const tickMood = (
  state: CompanionState,
  recentEvents: readonly CompanionEvent[],
  life: LifeContext | undefined,
  now: number,
): CompanionState => {
  const mood = computeMood({ traits: state.personalityTraits, lastInteractionAt: state.lastInteractionAt, life }, recentEvents, now);
  return { ...state, mood: mood.mood, moodIntensity: mood.intensity, moodReason: mood.reason };
};
