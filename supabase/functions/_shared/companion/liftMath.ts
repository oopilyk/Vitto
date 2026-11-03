// GENERATED FILE -- DO NOT EDIT BY HAND.
// Source: packages/core/src/companion/liftMath.ts
// Regenerate with: node scripts/syncCompanion.mjs

import type { LifeContext } from './types.ts';

/**
 * Gym arithmetic, done here so the model never has to.
 *
 * The pet used to be handed Epley's formula and asked to apply it, and a
 * language model doing sums in its head is exactly how "225 for 8" became a
 * 543 lb max (it is about 285). So the numbers arrive worked out -- each lift's
 * max with a few weights and the reps they are good for, plus any set the user
 * has just mentioned in chat -- and the pet only has to read them off.
 */

/** Sets with more reps than this say little about a one-rep max (as strengthRanks.ts). */
const MAX_REPS_FOR_ESTIMATE = 10;

/**
 * Epley. Capped at 10 reps by default, matching `estimatedOneRepMax` in the
 * Strength map; uncapped for a set they just told the pet about, so "135 for
 * 12" does not come back as "135 is good for 10".
 */
export const oneRepMaxFrom = (weight: number, reps: number, capReps = true): number =>
  reps <= 1 ? weight : weight * (1 + (capReps ? Math.min(reps, MAX_REPS_FOR_ESTIMATE) : reps) / 30);

/** Epley turned round: how many clean reps a weight is good for, from a max. */
export const repsAt = (oneRepMax: number, weight: number): number =>
  weight >= oneRepMax ? (weight > oneRepMax * 1.02 ? 0 : 1) : Math.max(1, Math.floor(30 * (oneRepMax / weight - 1) + 1e-9));

/** Plates come in 5 lb and 2.5 kg steps; nobody loads 233.7. */
const toBar = (weight: number, unit: 'kg' | 'lb') => {
  const step = unit === 'kg' ? 2.5 : 5;
  return Math.round(weight / step) * step;
};

const SHARES = [0.95, 0.9, 0.85, 0.8, 0.75, 0.7];

/**
 * "270 x 1, 255 x 3, ..." at a spread of working weights below the max, plus
 * any weight they have just asked about that is in range ("how many at 225"),
 * heaviest first.
 */
const repTable = (oneRepMax: number, unit: 'kg' | 'lb', asked: readonly number[] = []): string => {
  const weights = new Set<number>();
  for (const share of SHARES) weights.add(toBar(oneRepMax * share, unit));
  for (const weight of asked) if (weight >= oneRepMax * 0.4 && weight <= oneRepMax * 1.1) weights.add(weight);
  return [...weights]
    .filter((weight) => weight > 0)
    .sort((a, b) => b - a)
    .map((weight) => `${weight} x ${repsAt(oneRepMax, weight)}`)
    .join(', ');
};

/** Weights named in a message, for the rep tables: any 2-4 digit number that could be a load. */
const weightsAsked = (messages: readonly string[]): number[] =>
  [...new Set(messages.flatMap((message) => [...message.matchAll(/\b(\d{2,4}(?:\.\d+)?)\b/g)].map((match) => Number(match[1]))))]
    .filter((weight) => weight >= 20 && weight <= 1500)
    .slice(0, 6);

/**
 * Sets written in a message: "225 for 8", "225x8", "100 kg x 5", "185 lbs for 10 reps".
 * Weight first, then reps; a bare number on its own is not a set.
 */
export const setsMentioned = (text: string): { weight: number; reps: number; unit?: 'kg' | 'lb' }[] => {
  const found: { weight: number; reps: number; unit?: 'kg' | 'lb' }[] = [];
  // Not "2000 for 30 days" or "45 for 20 minutes": the reps are not followed by a unit of their own.
  const pattern = /(\d{2,4}(?:\.\d+)?)\s*(kgs?|kilos?|lbs?|pounds?)?\s*(?:x|×|for|by)\s*(\d{1,2})\b(?!\s*(?:kg|kilo|lb|pound|min|day|hour|hr|sec|step|cal|k\b|%|mile|km))/gi;
  for (const match of text.matchAll(pattern)) {
    const weight = Number(match[1]);
    const reps = Number(match[3]);
    if (!(weight > 0) || weight > 1500 || !(reps >= 1) || reps > 20) continue;
    const unitText = match[2]?.toLowerCase();
    const unit = unitText ? (unitText.startsWith('k') ? 'kg' : 'lb') : undefined;
    found.push({ weight, reps, ...(unit ? { unit } : {}) });
  }
  return found.slice(0, 4);
};

/**
 * The prompt lines: every logged lift with its rep table, then the sets from
 * the last few things they said. Empty when there is nothing to work out.
 */
export const renderLiftMath = (life: LifeContext, recentUserMessages: readonly string[]): string[] => {
  const lines: string[] = [];
  const unit = life.lifts?.[0]?.unit ?? 'lb';
  const asked = weightsAsked(recentUserMessages);
  if (life.lifts?.length) {
    lines.push('\n# Their lifts (worked out for you; quote these, never redo the maths)');
    for (const l of life.lifts) {
      lines.push(`${l.lift}: one-rep max about ${l.oneRepMax} ${l.unit} (from ${l.from}). Reps it is good for: ${repTable(l.oneRepMax, l.unit, asked)}.`);
    }
  }
  const mentioned = recentUserMessages.flatMap((message) => setsMentioned(message));
  if (mentioned.length) {
    lines.push('\n# Sets they mentioned in chat (worked out for you)');
    for (const set of mentioned) {
      const setUnit = set.unit ?? unit;
      const max = Math.round(oneRepMaxFrom(set.weight, set.reps, false));
      lines.push(`${set.weight} ${setUnit} x ${set.reps}: one-rep max about ${max} ${setUnit}. Reps it is good for: ${repTable(max, setUnit, asked)}.`);
    }
  }
  return lines;
};
