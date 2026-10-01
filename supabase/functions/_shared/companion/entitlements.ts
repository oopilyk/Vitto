// GENERATED FILE -- DO NOT EDIT BY HAND.
// Source: packages/core/src/companion/entitlements.ts
// Regenerate with: node scripts/syncCompanion.mjs

import type { CompanionTier, LifeContext } from './types.ts';

/**
 * Who may talk to the pet, and how much.
 *
 * This is the paywall seam. Today every account is `free` and the feature is
 * open to all; later, a payment webhook writes `plus` into the server-side
 * `companion_entitlements` table and nothing else has to change.
 *
 * The caps exist even while the feature is free, and that is deliberate: each
 * message costs real money, and "free" with no ceiling is an unbounded bill that
 * one enthusiastic (or scripted) account can run up. They are enforced in the
 * edge function, where a client cannot lie about them.
 */
export interface TierLimits {
  /** Messages the person may send per local day. */
  messagesPerDay: number;
  /** Unprompted messages the pet may send per local day. */
  proactivePerDay: number;
  /** Longest message accepted, in characters. */
  maxMessageLength: number;
}

export const TIER_LIMITS: Record<CompanionTier, TierLimits> = {
  // Free is the tier that costs money without paying any, so its ceiling is the
  // one that bounds the bill; Plus keeps the generous one.
  free: { messagesPerDay: 10, proactivePerDay: 2, maxMessageLength: 600 },
  // Every Plus message is a Sonnet call; 100 feels unlimited and keeps a
  // heavy subscriber from costing more than they pay.
  plus: { messagesPerDay: 100, proactivePerDay: 12, maxMessageLength: 1200 },
};

export const limitsFor = (tier: CompanionTier | null | undefined): TierLimits =>
  TIER_LIMITS[tier === 'plus' ? 'plus' : 'free'];

export interface CompanionAccess {
  tier: CompanionTier;
  messagesLeftToday: number;
  /** False once today's allowance is spent; the pet falls back to its stock voice. */
  canChat: boolean;
}

export const accessFor = (tier: CompanionTier | null | undefined, messagesSentToday: number): CompanionAccess => {
  const resolved: CompanionTier = tier === 'plus' ? 'plus' : 'free';
  const left = Math.max(0, limitsFor(resolved).messagesPerDay - Math.max(0, messagesSentToday));
  return { tier: resolved, messagesLeftToday: left, canChat: left > 0 };
};

/**
 * Personalities are a Plus feature. A free pet speaks in the default voice: no
 * temperament, no dials, no persona. Applied on the server to whatever the phone
 * sends, so a modified client cannot talk its way into a paid feature; the app
 * applies the same rule to what it shows. The stored pet keeps its choices, so
 * they come back on upgrade.
 */
export const lifeForTier = <T extends Pick<LifeContext, 'pet'>>(life: T, tier: CompanionTier | null | undefined): T => {
  if (tier === 'plus') return life;
  const { temperament: _temperament, persona: _persona, dials: _dials, ...pet } = life.pet;
  return { ...life, pet };
};
