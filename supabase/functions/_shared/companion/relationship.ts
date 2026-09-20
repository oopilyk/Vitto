// GENERATED FILE -- DO NOT EDIT BY HAND.
// Source: packages/core/src/companion/relationship.ts
// Regenerate with: node scripts/syncCompanion.mjs

import { RELATIONSHIP_LEVELS, type CompanionEventType, type CompanionState, type RelationshipLevel, type UserPattern } from './types.ts';
import { DAY, clamp01 } from './util.ts';

const LEVEL_THRESHOLDS: Record<RelationshipLevel, number> = {
  STRANGER: 0, ACQUAINTANCE: 20, FRIEND: 60, CLOSE_FRIEND: 150, BONDED: 300,
};

interface EventEffect { score: number; affection?: number; trust?: number }

/**
 * How each event feeds the relationship. XP and levels are not here: the pet
 * levels up through how the person lives, and grows close through how they show
 * up and talk. Closeness only ever accumulates — how it has been going LATELY is
 * the bond, which is a separate, derived thing (see core's `bondFor`).
 */
const EVENT_EFFECTS: Partial<Record<CompanionEventType, EventEffect>> = {
  USER_SENT_MESSAGE: { score: 1, affection: 0.004 },
  USER_OPENED_APP: { score: 0.5 },
  USER_RETURNED_AFTER_ABSENCE: { score: 1, trust: 0.01 },
  WORKOUT_COMPLETED: { score: 2, affection: 0.005 },
  STEP_GOAL_REACHED: { score: 1.5 },
  SLEEP_GOAL_REACHED: { score: 1 },
  HEALTHY_MEAL_LOGGED: { score: 1 },
  MEAL_LOGGED: { score: 1 },
  STEPS_LOGGED: { score: 0.5 },
  SLEEP_LOGGED: { score: 0.5 },
  BRAIN_GAME_PLAYED: { score: 1.5, affection: 0.005 },
  LEVEL_UP: { score: 3, affection: 0.01 },
};

export const levelFor = (score: number): RelationshipLevel => {
  let level: RelationshipLevel = 'STRANGER';
  for (const candidate of RELATIONSHIP_LEVELS) if (score >= LEVEL_THRESHOLDS[candidate]) level = candidate;
  return level;
};

export const levelIndex = (level: RelationshipLevel): number => RELATIONSHIP_LEVELS.indexOf(level);

/** 0..1 progress from the current level's threshold to the next (1 when maxed). */
export const levelProgress = (score: number): number => {
  const thresholds = RELATIONSHIP_LEVELS.map((level) => LEVEL_THRESHOLDS[level]);
  const next = thresholds.find((t) => t > score);
  if (next === undefined) return 1;
  const previous = [...thresholds].reverse().find((t) => t <= score) ?? 0;
  return Math.max(0, Math.min(1, (score - previous) / (next - previous)));
};

type RelationshipPatch = Pick<CompanionState, 'relationshipScore' | 'relationshipLevel' | 'affection' | 'trust'>;

export const applyRelationshipEvent = (
  state: CompanionState,
  type: CompanionEventType,
  options: { firstInteractionToday: boolean },
): Partial<RelationshipPatch> => {
  const effect = EVENT_EFFECTS[type];
  if (!effect) return {};
  // Coming back day after day matters more than any single burst of activity.
  const returnBonus =
    options.firstInteractionToday && (type === 'USER_OPENED_APP' || type === 'USER_SENT_MESSAGE') ? 3 : 0;
  const score = state.relationshipScore + effect.score + returnBonus;
  return {
    relationshipScore: Math.round(score * 10) / 10,
    relationshipLevel: levelFor(score),
    affection: clamp01(state.affection + (effect.affection ?? 0)),
    trust: clamp01(state.trust + (effect.trust ?? 0) + (returnBonus ? 0.01 : 0)),
  };
};

/** Sharing something personal builds trust. */
export const applyDisclosure = (state: CompanionState, importance: number): Partial<RelationshipPatch> => {
  const score = state.relationshipScore + importance * 2;
  return {
    trust: clamp01(state.trust + importance * 0.03),
    relationshipScore: Math.round(score * 10) / 10,
    relationshipLevel: levelFor(score),
  };
};

/** A rule-based line so the model has a sense of how things have been going. */
export const summarizeRelationship = (
  state: CompanionState,
  stats: { messageCount: number; daysActive: number; memoryCount: number },
  patterns: readonly UserPattern[],
  now: number,
): string => {
  const parts: string[] = [];
  const daysKnown = Math.max(1, Math.floor((now - state.createdAt) / DAY) + 1);
  parts.push(`You've known each other ${daysKnown} day${daysKnown === 1 ? '' : 's'} and talked ${stats.messageCount} time${stats.messageCount === 1 ? '' : 's'}`);
  if (stats.daysActive >= 3) parts.push(`they've come back on ${stats.daysActive} different days`);
  if (stats.memoryCount === 0) parts.push("you don't know much about them yet");
  else if (stats.memoryCount < 4) parts.push("you're starting to learn about their life");
  else parts.push('you know a fair amount about their life');
  const streak = patterns.find((pattern) => pattern.key === 'workout_streak');
  if (streak) parts.push(streak.description.toLowerCase());
  if (state.affection > 0.7) parts.push("you're very fond of them");
  if (state.trust > 0.7) parts.push('they trust you with real stuff');
  return `${parts.join('; ')}.`;
};
