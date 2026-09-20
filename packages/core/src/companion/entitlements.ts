import type { CompanionTier } from './types';

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
  free: { messagesPerDay: 30, proactivePerDay: 6, maxMessageLength: 600 },
  plus: { messagesPerDay: 200, proactivePerDay: 12, maxMessageLength: 1200 },
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
