import type { BodyProfile } from './macroTargets';

/**
 * Where a lift sits against other lifters of the same sex, bodyweight and age.
 *
 * WHAT THIS IS, AND IS NOT. These are the published training standards the
 * lifting world already uses — the untrained/novice/intermediate/advanced/elite
 * bands expressed as a multiple of bodyweight — with percentiles fitted to those
 * bands. They are not a measured survey of the general population, and they
 * describe people who train, not everyone alive. Read "70th percentile" as
 * "stronger than about seven in ten people who lift", and never as a medical or
 * population fact. The card says as much; this comment is the reason it does.
 *
 * Three corrections are applied, in this order:
 *
 *   age          A lift at 55 is worth more than the same lift at 25. The
 *                lift is scaled up by an age factor before it is compared,
 *                the way masters meets score an older lifter's total.
 *   bodyweight   Strength does not scale linearly with size — roughly with
 *                bodyweight^(2/3), so the expected bodyweight MULTIPLE falls
 *                as a lifter gets heavier. A flat ratio would tell every
 *                heavy lifter they are weak and every light one they are
 *                strong, which is the best-known flaw of ratio standards.
 *   sex          Separate tables, because the distributions genuinely differ.
 */

/** The bands every table below is expressed in, as percentiles. */
const STANDARD_PERCENTILES: readonly number[] = [5, 20, 50, 80, 95];

/**
 * Lift as a multiple of bodyweight at each band, for a lifter at the reference
 * bodyweight in their prime. Ordered to match `STANDARD_PERCENTILES`.
 */
const STRENGTH_STANDARDS: Record<string, { male: readonly number[]; female: readonly number[] }> = {
  'Bench Press': { male: [0.5, 0.75, 1.1, 1.5, 1.9], female: [0.25, 0.4, 0.6, 0.85, 1.15] },
  Squat: { male: [0.6, 0.95, 1.4, 1.95, 2.5], female: [0.35, 0.6, 0.95, 1.35, 1.8] },
  Deadlift: { male: [0.85, 1.25, 1.75, 2.35, 3.0], female: [0.45, 0.75, 1.2, 1.65, 2.15] },
  'Lat Pulldown': { male: [0.55, 0.75, 1.0, 1.25, 1.5], female: [0.35, 0.5, 0.7, 0.9, 1.15] },
};

/** The bodyweight each table is written for. */
const REFERENCE_BODYWEIGHT_KG = { male: 80, female: 65 } as const;

/** Lifts this module can place. Anything else returns null rather than a guess. */
export const RANKED_LIFTS: readonly string[] = Object.keys(STRENGTH_STANDARDS);

/**
 * Age factors, as meets use them: what to multiply a lift by so it compares
 * fairly against a lifter in their prime. Below 23 and above 40 only; in
 * between, strength is at its peak and the factor is 1.
 */
const AGE_FACTORS: readonly (readonly [number, number])[] = [
  [14, 1.23], [16, 1.13], [18, 1.06], [20, 1.03], [23, 1.0],
  [40, 1.0], [45, 1.11], [50, 1.19], [55, 1.29], [60, 1.41],
  [65, 1.56], [70, 1.82], [75, 2.15], [80, 2.55],
];

/** Linear interpolation across a sorted table of [x, y], flat outside its ends. */
const fromTable = (table: readonly (readonly [number, number])[], x: number): number => {
  if (x <= table[0]![0]) return table[0]![1];
  const last = table[table.length - 1]!;
  if (x >= last[0]) return last[1];
  for (let index = 1; index < table.length; index += 1) {
    const [x1, y1] = table[index]!;
    const [x0, y0] = table[index - 1]!;
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return last[1];
};

export const ageFactor = (age: number): number => fromTable(AGE_FACTORS, age);

/**
 * "Other" is scored against the midpoint of the two tables. Hiding the card for
 * those users would be worse: a blended placement is approximate and says so,
 * where no placement at all says only that the app did not consider them.
 */
const standardsFor = (lift: string, sex: BodyProfile['sex']): { anchors: readonly number[]; referenceKg: number } | null => {
  const table = STRENGTH_STANDARDS[lift];
  if (!table) return null;
  if (sex === 'male') return { anchors: table.male, referenceKg: REFERENCE_BODYWEIGHT_KG.male };
  if (sex === 'female') return { anchors: table.female, referenceKg: REFERENCE_BODYWEIGHT_KG.female };
  return {
    anchors: table.male.map((value, index) => (value + table.female[index]!) / 2),
    referenceKg: (REFERENCE_BODYWEIGHT_KG.male + REFERENCE_BODYWEIGHT_KG.female) / 2,
  };
};

/** Where a bodyweight multiple falls across the bands, as a percentile from 1 to 99. */
const percentileFor = (ratio: number, anchors: readonly number[]): number => {
  const first = anchors[0]!;
  if (ratio <= first) return Math.max(1, Math.round((ratio / first) * STANDARD_PERCENTILES[0]!));
  for (let index = 1; index < anchors.length; index += 1) {
    const low = anchors[index - 1]!;
    const high = anchors[index]!;
    if (ratio <= high) {
      const share = high === low ? 0 : (ratio - low) / (high - low);
      return Math.round(STANDARD_PERCENTILES[index - 1]! + share * (STANDARD_PERCENTILES[index]! - STANDARD_PERCENTILES[index - 1]!));
    }
  }
  // Past elite the curve flattens hard — a long way beyond it is still 99th.
  const top = anchors[anchors.length - 1]!;
  return Math.min(99, Math.round(95 + ((ratio - top) / top) * 40));
};

export interface LiftStanding {
  percentile: number;
  /** The band the lift falls in, for a word the number alone does not give. */
  label: string;
  /** What the lift is worth once scaled for age, in kg. Equals the lift under 40. */
  ageAdjustedKg: number;
}

const BANDS: readonly (readonly [number, string])[] = [
  [5, 'Untrained'], [20, 'Beginner'], [50, 'Novice'], [80, 'Intermediate'], [95, 'Advanced'],
];

const bandFor = (percentile: number): string =>
  BANDS.find(([ceiling]) => percentile < ceiling)?.[1] ?? 'Elite';

/**
 * Places one lift, or returns null when it cannot be placed honestly — an
 * unranked exercise, or a profile with no usable bodyweight or age.
 */
export const liftStanding = (
  lift: string,
  liftKg: number,
  profile: Pick<BodyProfile, 'sex' | 'age' | 'weightKg'>,
): LiftStanding | null => {
  const standards = standardsFor(lift, profile.sex);
  if (!standards || !(liftKg > 0) || !(profile.weightKg > 0) || !(profile.age > 0)) return null;
  const ageAdjustedKg = liftKg * ageFactor(profile.age);
  // The expected multiple falls as bodyweight rises: strength ~ bodyweight^(2/3).
  const sizeFactor = Math.cbrt(standards.referenceKg / profile.weightKg);
  const anchors = standards.anchors.map((ratio) => ratio * sizeFactor);
  const percentile = percentileFor(ageAdjustedKg / profile.weightKg, anchors);
  return { percentile, label: bandFor(percentile), ageAdjustedKg: Math.round(ageAdjustedKg * 10) / 10 };
};

/** The mean of the lifts that could be placed, or null when none could. */
export const overallStanding = (standings: readonly (LiftStanding | null)[]): LiftStanding | null => {
  const placed = standings.filter((standing): standing is LiftStanding => standing !== null);
  if (placed.length === 0) return null;
  const percentile = Math.round(placed.reduce((total, one) => total + one.percentile, 0) / placed.length);
  return { percentile, label: bandFor(percentile), ageAdjustedKg: 0 };
};

/** "62nd", "1st", "23rd" — for a percentile read out in prose. */
export const ordinal = (value: number): string => {
  const rest = value % 100;
  if (rest >= 11 && rest <= 13) return `${value}th`;
  return `${value}${['th', 'st', 'nd', 'rd'][value % 10] ?? 'th'}`;
};
