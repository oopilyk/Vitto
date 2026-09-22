import { DIAL_KEYS, TRAITS, type CompanionEventType, type DialKey, type PersonalityDials, type PersonalityTraits, type ToneSignal, type Trait } from './types';
import { clamp, hashString } from './util';

const TRAIT_MIN = 0.05;
const TRAIT_MAX = 0.95;
/** Max change to any single trait from one interaction. Personality drifts, it does not flip. */
export const MAX_TRAIT_STEP = 0.02;

/** How the person's conversational tone pulls each trait, per signal, per exchange. */
const TONE_INFLUENCE: Record<ToneSignal, Partial<Record<Trait, number>>> = {
  joking: { playful: 0.012, sarcastic: 0.004 },
  sarcastic: { sarcastic: 0.012, playful: 0.004 },
  competitive: { competitive: 0.012, energetic: 0.004 },
  affectionate: { affectionate: 0.012, shy: -0.006 },
  calm: { calm: 0.01, energetic: -0.004 },
  energetic: { energetic: 0.01, calm: -0.004 },
  curious: { curious: 0.01 },
  reserved: { shy: 0.006, playful: -0.004 },
};

/** Real life shapes the pet too, more slowly than conversation does. */
const EVENT_INFLUENCE: Partial<Record<CompanionEventType, Partial<Record<Trait, number>>>> = {
  WORKOUT_COMPLETED: { energetic: 0.005, competitive: 0.003 },
  STEP_GOAL_REACHED: { energetic: 0.004 },
  SLEEP_GOAL_REACHED: { calm: 0.005 },
  BRAIN_GAME_PLAYED: { curious: 0.005, calm: 0.002 },
  HEALTHY_MEAL_LOGGED: { calm: 0.002 },
};

/**
 * The temperament the owner picked at onboarding, as a starting lean. It is a
 * nudge, not a cage: the trait vector drifts from here with how they talk and
 * live, which is the whole point of the companion.
 */
const TEMPERAMENT_LEAN: Record<string, Partial<Record<Trait, number>>> = {
  // The four offered at adoption, pushed far enough apart that two pets with
  // different temperaments never sound like each other on day one.
  feisty: { competitive: 0.88, energetic: 0.8, playful: 0.72, shy: 0.08, calm: 0.15, blunt: 0.75 },
  cute: { affectionate: 0.88, playful: 0.8, shy: 0.55, sarcastic: 0.08, energetic: 0.65, blunt: 0.1 },
  sweet: { affectionate: 0.9, calm: 0.72, curious: 0.62, sarcastic: 0.06, competitive: 0.15, blunt: 0.12 },
  savage: { sarcastic: 0.92, playful: 0.66, competitive: 0.6, affectionate: 0.3, shy: 0.05, blunt: 0.85 },
  menace: { competitive: 0.9, energetic: 0.85, sarcastic: 0.7, playful: 0.5, affectionate: 0.35, shy: 0.03, calm: 0.06, blunt: 0.95 },
  hype: { energetic: 0.88, playful: 0.82, competitive: 0.7, affectionate: 0.66, shy: 0.05, calm: 0.2, blunt: 0.45 },
  // The original set, kept for pets adopted under it.
  energetic: { energetic: 0.82, playful: 0.7 },
  chill: { calm: 0.82, shy: 0.3 },
  competitive: { competitive: 0.82, energetic: 0.66 },
  supportive: { affectionate: 0.82, calm: 0.62 },
};

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Mulberry32: a tiny seeded PRNG, so a pet's starting self is reproducible. */
const seeded = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * A pet's starting traits.
 *
 * Seeded from the pet's id rather than `Math.random()`: the state row is created
 * on first contact, and two devices racing to create it must arrive at the same
 * individual. Every pet gets two clear tendencies so it reads as someone from
 * day one; the onboarding temperament, when there is one, picks which.
 */
/**
 * Where each dial lands on the traits. One slider can set two traits when they
 * are two ends of the same thing: calm ↔ energetic is one choice, not two.
 */
const DIAL_TO_TRAITS: Record<DialKey, (value: number) => Partial<Record<Trait, number>>> = {
  playful: (v) => ({ playful: v }),
  blunt: (v) => ({ blunt: v }),
  energetic: (v) => ({ energetic: v, calm: 1 - v }),
  sarcastic: (v) => ({ sarcastic: v }),
  clingy: (v) => ({ affectionate: v }),
};

/**
 * The dials as a temperament sets them, so the sliders start where the base
 * already is: pick Savage and the sarcastic slider is already most of the way
 * over. Neutral for `custom` and for the retired four, which never had a full lean.
 */
export const dialsFor = (temperament?: string): PersonalityDials => {
  const lean = (temperament && TEMPERAMENT_LEAN[temperament]) || {};
  const at = (trait: Trait, fallback: number) => lean[trait] ?? fallback;
  return {
    playful: at('playful', 0.5),
    blunt: at('blunt', 0.5),
    energetic: lean.energetic ?? (lean.calm !== undefined ? 1 - lean.calm : 0.5),
    sarcastic: at('sarcastic', 0.5),
    clingy: at('affectionate', 0.5),
  };
};

const applyDials = (traits: PersonalityTraits, dials: PersonalityDials): PersonalityTraits => {
  const next = { ...traits };
  for (const key of DIAL_KEYS) {
    for (const [trait, value] of Object.entries(DIAL_TO_TRAITS[key](clamp(dials[key], 0, 1))) as [Trait, number][]) {
      next[trait] = round(clamp(value, TRAIT_MIN, TRAIT_MAX));
    }
  }
  return next;
};

/** What the traits were seeded from. Stored beside them, so a change can be told from drift. */
export interface TraitBasis {
  temperament?: string | null;
  dials?: PersonalityDials | null;
}

export const sameBasis = (a: TraitBasis, b: TraitBasis): boolean =>
  (a.temperament ?? null) === (b.temperament ?? null) &&
  (!a.dials && !b.dials || (!!a.dials && !!b.dials && DIAL_KEYS.every((k) => Math.abs(a.dials![k] - b.dials![k]) < 1e-6)));

export const initialTraits = (seedKey: string, temperament?: string, dials?: PersonalityDials | null): PersonalityTraits => {
  const base = seedTraits(seedKey, temperament);
  return dials ? applyDials(base, dials) : base;
};

/** The two ends of each dial, in the person's words. Shared by the app's sliders and the prompt. */
export const DIAL_LABELS: Record<DialKey, readonly [low: string, high: string]> = {
  playful: ['serious', 'playful'],
  blunt: ['gentle', 'blunt'],
  energetic: ['calm', 'energetic'],
  sarcastic: ['wholesome', 'sarcastic'],
  clingy: ['independent', 'clingy'],
};

/**
 * The dials as one line for the prompt, naming only the ones pushed away from
 * the middle. The traits below already carry the same numbers; this restates
 * the person's own choices in their own words, which is what the model should
 * be loudest about.
 */
export const describeDials = (dials: PersonalityDials): string => {
  const parts: string[] = [];
  for (const key of DIAL_KEYS) {
    const v = dials[key];
    const [low, high] = DIAL_LABELS[key];
    if (v >= 0.85) parts.push(`extremely ${high}`);
    else if (v >= 0.65) parts.push(`quite ${high}`);
    else if (v <= 0.15) parts.push(`extremely ${low}`);
    else if (v <= 0.35) parts.push(`quite ${low}`);
  }
  return parts.join(', ');
};

/** A row written before a trait existed lacks it; it takes the seed's value, so it counts as no drift. */
export const fillTraits = (traits: Partial<PersonalityTraits>, seed: PersonalityTraits): PersonalityTraits => {
  const next = { ...seed };
  for (const trait of TRAITS) if (typeof traits[trait] === 'number') next[trait] = traits[trait]!;
  return next;
};

const seedTraits = (seedKey: string, temperament?: string): PersonalityTraits => {
  const random = seeded(hashString(seedKey));
  const traits = {} as PersonalityTraits;
  for (const trait of TRAITS) traits[trait] = round(0.25 + random() * 0.5);
  const lean = temperament ? TEMPERAMENT_LEAN[temperament] : undefined;
  if (lean) {
    for (const [trait, value] of Object.entries(lean) as [Trait, number][]) traits[trait] = value;
    return traits;
  }
  const order = [...TRAITS].sort((a, b) => hashString(seedKey + a) - hashString(seedKey + b));
  traits[order[0]!] = round(0.7 + random() * 0.2);
  traits[order[1]!] = round(0.65 + random() * 0.2);
  return traits;
};

/**
 * Moves a pet's traits onto a new temperament, keeping what it has learned.
 *
 * Traits are seeded once, from the temperament chosen at adoption. Change the
 * temperament later and the voice guidance follows but the traits do not, so a
 * pet switched from sweet to savage is told in one breath to be deadpan and
 * "openly affectionate; calm and steady" — and averages out to nobody.
 *
 * `from` is the temperament the traits grew from, which the server records
 * beside them. Without it (older rows) it is inferred once: the seed is
 * deterministic and early drift is tiny while the leans sit far apart, so the
 * seed the traits are closest to is the one they came from. Either way the
 * accumulated drift is carried over onto the new seed, so nothing learned is lost.
 */
export const rebaseTraits = (traits: PersonalityTraits, seedKey: string, to: TraitBasis, from?: TraitBasis | null): PersonalityTraits => {
  const temperament = to.temperament ?? undefined;
  // `custom` has no lean: its seed is the neutral one, and the person's words do the rest.
  if (!temperament || (!TEMPERAMENT_LEAN[temperament] && temperament !== 'custom')) return traits;
  // Told where the traits came from: no guessing. This is the normal path. The
  // inference below is only for rows written before the origin was recorded —
  // months of drift can carry traits nearer to another temperament's seed than
  // their own, and guessing then would "correct" a pet that never changed.
  if (from !== undefined && from !== null) {
    if (sameBasis(from, to)) return traits;
    const was = initialTraits(seedKey, from.temperament ?? undefined, from.dials);
    const will = initialTraits(seedKey, temperament, to.dials);
    const moved = {} as PersonalityTraits;
    for (const trait of TRAITS) moved[trait] = round(clamp(will[trait] + (traits[trait] - was[trait]), TRAIT_MIN, TRAIT_MAX));
    return moved;
  }
  const distance = (seed: PersonalityTraits) => TRAITS.reduce((sum, trait) => sum + Math.abs(traits[trait] - seed[trait]), 0);
  let origin = initialTraits(seedKey);
  let best = distance(origin);
  let originName: string | undefined;
  for (const name of Object.keys(TEMPERAMENT_LEAN)) {
    const seed = initialTraits(seedKey, name);
    const d = distance(seed);
    if (d < best) { best = d; origin = seed; originName = name; }
  }
  if (originName === temperament && !to.dials) return traits;
  const target = initialTraits(seedKey, temperament, to.dials);
  const next = {} as PersonalityTraits;
  for (const trait of TRAITS) next[trait] = round(clamp(target[trait] + (traits[trait] - origin[trait]), TRAIT_MIN, TRAIT_MAX));
  return next;
};

const applyDeltas = (traits: PersonalityTraits, deltas: Partial<Record<Trait, number>>): PersonalityTraits => {
  const next = { ...traits };
  for (const [trait, delta] of Object.entries(deltas) as [Trait, number][]) {
    next[trait] = round(clamp(next[trait] + clamp(delta, -MAX_TRAIT_STEP, MAX_TRAIT_STEP), TRAIT_MIN, TRAIT_MAX));
  }
  return next;
};

export const applyToneSignals = (traits: PersonalityTraits, signals: readonly ToneSignal[]): PersonalityTraits => {
  const deltas: Partial<Record<Trait, number>> = {};
  for (const signal of new Set(signals)) {
    for (const [trait, delta] of Object.entries(TONE_INFLUENCE[signal] ?? {}) as [Trait, number][]) {
      deltas[trait] = (deltas[trait] ?? 0) + delta;
    }
  }
  return applyDeltas(traits, deltas);
};

export const applyEventInfluence = (traits: PersonalityTraits, type: CompanionEventType): PersonalityTraits =>
  applyDeltas(traits, EVENT_INFLUENCE[type] ?? {});

export const dominantTraits = (traits: PersonalityTraits): Trait[] =>
  (Object.entries(traits) as [Trait, number][])
    .filter(([, value]) => value >= 0.6)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([trait]) => trait);

const FLAVORS: Record<Trait, string> = {
  playful: 'a bouncy, mischievous little thing',
  sarcastic: 'a dry-witted creature with one eyebrow permanently raised',
  affectionate: 'a warm, cuddly companion',
  competitive: 'a scrappy competitor with something to prove',
  shy: 'a soft-spoken creature that watches before it speaks',
  curious: 'a wide-eyed explorer who has to know everything',
  energetic: 'a restless bundle of energy',
  calm: 'a serene, steady presence',
  blunt: 'a straight talker who does not soften anything',
};

export const personalityFlavor = (traits: PersonalityTraits): string => {
  const [top] = dominantTraits(traits);
  return top ? FLAVORS[top] : 'still finding its shape';
};

const TRAIT_DESCRIPTORS: Record<Trait, [low: string, high: string]> = {
  playful: ['fairly serious', 'very playful, loves games and silliness'],
  sarcastic: ['earnest and sincere', 'dry and sarcastic'],
  affectionate: ['reserved with affection', 'openly affectionate'],
  competitive: ['easygoing about winning', 'competitive, keeps score'],
  shy: ['bold and outgoing', 'a bit shy'],
  curious: ['content and incurious', 'intensely curious about their life'],
  energetic: ['low-key', 'high energy'],
  calm: ['easily worked up', 'calm and steady'],
  blunt: ['gentle, careful with feelings', 'blunt, says it straight'],
};

export const describePersonality = (traits: PersonalityTraits): string => {
  const parts: string[] = [];
  for (const trait of TRAITS) {
    const value = traits[trait];
    if (value >= 0.65) parts.push(TRAIT_DESCRIPTORS[trait][1]);
    else if (value <= 0.3) parts.push(TRAIT_DESCRIPTORS[trait][0]);
  }
  return parts.length ? parts.join('; ') : 'balanced, still figuring itself out';
};
