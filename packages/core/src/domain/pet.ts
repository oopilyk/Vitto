import type { PersonalityDials } from '../companion/types';
import type { FoodEffect } from './foodEffects';
import type { FocusArea } from './macroTargets';
import { newId } from './ids';

/**
 * `sleepy` is low Energy (sleep and food); `sluggish` is low Vitality
 * (workouts and walks, stored as `energy`). Hungry outranks both.
 */
export type PetMood = 'bright' | 'content' | 'sleepy' | 'sluggish' | 'hungry';

/** The mood as a word a person would use about a friend: "Blue is happy". */
export const MOOD_WORD: Record<PetMood, string> = {
  bright: 'happy',
  content: 'doing fine',
  sleepy: 'sleepy',
  sluggish: 'sluggish',
  hungry: 'hungry',
};

/** Energy for a pet that may predate it: a comfortable middle, so no old pet wakes up sleepy. */
export const CHARGE_DEFAULT = 70;
export const chargeOf = (pet: Pick<PetState, 'charge'>): number =>
  typeof pet.charge === 'number' && Number.isFinite(pet.charge) ? pet.charge : CHARGE_DEFAULT;

/**
 * The companion's disposition, chosen at adoption. Lives on the pet, not the
 * user: a pet persists independently of the profile, and multi-pet / switching
 * later must not tie personality to the account. Only stored today — dialogue,
 * reactions and social presentation can read it when those systems exist.
 */
/**
 * The pet's temperament, chosen when it is adopted. It is the baseline, not the
 * whole character: the AI companion starts from here and then drifts with how
 * its person actually talks to it (see `companion/personality.ts`).
 *
 * The first five are what onboarding offers now. The last four are the original
 * set, kept valid because pets adopted under them still carry them — they are
 * not offered any more, and each reads as a quieter version of one of the four.
 */
export type PetPersonality =
  | 'feisty'
  | 'cute'
  | 'sweet'
  | 'savage'
  | 'hype'
  | 'menace'
  | 'custom'
  | 'energetic'
  | 'chill'
  | 'competitive'
  | 'supportive';

/** Which drawn companion the pet is. Optional: pets adopted before the picker have none. */
export type PetBreed =
  | 'bichon'
  | 'shiba'
  | 'otter'
  | 'tabbyCat'
  | 'bunny'
  | 'fox'
  | 'koala'
  | 'bear'
  | 'axolotl'
  | 'dino';

/**
 * Every adoptable companion. Adding one means widening the `pets.breed` CHECK in
 * a migration too -- `pet.test.ts` reads the latest migration back and fails if
 * the two drift, because a breed the database has not been told about fails every
 * write for that pet, not just the adoption.
 *
 * `orangeCat` was removed here; `20260909120000_pet_breeds_expand.sql` moves any
 * pet already adopted as one onto `tabbyCat`, the cat that replaced it.
 */
export const PET_BREEDS: PetBreed[] = [
  'bichon',
  'shiba',
  'otter',
  'tabbyCat',
  'bunny',
  'fox',
  'koala',
  'bear',
  'axolotl',
  'dino',
];

export interface PetState {
  id: string;
  /**
   * Who adopted the pet — the creator, not the sole carer. A care partner can
   * hold and save this same pet; membership lives in `pet_members`, not here.
   */
  userId: string;
  name: string;
  species: 'cat' | 'dog' | 'bunny';
  breed?: PetBreed;
  level: number;
  xp: number;
  health: number;
  /**
   * Vitality, as the app shows it: what workouts and walks build. Stored as
   * `energy` from before the stat was split; Energy proper is `charge`.
   */
  energy: number;
  /**
   * Energy, as the app shows it: what sleep and meals fill. Absent on a pet
   * saved before it existed; read it with `chargeOf`.
   */
  charge?: number;
  happiness: number;
  nutrition: number;
  strength: number;
  pushingStrength: number;
  pullingStrength: number;
  legStrength: number;
  endurance: number;
  recovery: number;
  mind: number;
  mood: PetMood;
  /** Chosen at adoption (onboarding-v2). Optional: pets created before it have none. */
  personality?: PetPersonality;
  /**
   * Their own notes on the character, in their words ("a grumpy old pirate who
   * secretly loves us", "calls me chief"). On top of the temperament, or the
   * whole character when the temperament is `custom`. Under the companion's
   * rules, which it cannot loosen.
   */
  persona?: string;
  /**
   * The five sliders set at adoption (serious↔playful, gentle↔blunt, and so
   * on), as 0..1. They start where the temperament puts them and are the seed
   * the companion's traits then drift from. Absent on pets adopted before them.
   */
  dials?: PersonalityDials;
  /**
   * What affects this pet: the care areas its owner chose (see careAreas.ts).
   * A need none of them feeds is held steady instead of decaying. Absent means
   * every area, as every pet always worked. Only the owner may change it; the
   * database undoes a partner's change.
   */
  careAreas?: FocusArea[];
  /**
   * Meals still feeding the pet: the last day's, each as its share of the
   * logger's maintenance. Hunger is worked out from these (see hunger.ts).
   * Absent on a pet that has not eaten since hunger started counting calories.
   */
  recentMeals?: { at: string; points: number }[];
  /**
   * The specialism the pet evolved into, locked once earned. Evolving is for
   * keeps: when the stats behind it drift back to even (a scholar skipping Mind
   * Gym), `getPetBuild` falls back to this rather than devolving the pet. A
   * different specialism clearly taking over still changes it -- that is
   * re-specialising, not devolving. Set by `lockEvolution`, never by hand.
   */
  evolvedBuild?: EvolvedBuild;
  /**
   * Every specialism the pet has ever evolved into, in the order earned. Each
   * one is a form the pet may wear (`chosenBuild`), alongside its base look.
   */
  earnedBuilds?: EvolvedBuild[];
  /** The evolution picked by hand, out of `earnedBuilds`; see `chooseForm`. */
  chosenBuild?: EvolvedBuild;
  /**
   * Wearing the base look by choice, whatever it has evolved into. A flag of its
   * own rather than a `chosenBuild` of 'base': app builds from before it read
   * `chosen_build` straight into a sprite lookup, and simply ignore this.
   */
  showBase?: boolean;
  /**
   * Every animal this pet has been, bought once (`BREED_CHANGE_COST`) and then
   * free to switch back to. Absent on a pet from before it existed; read it
   * with `ownedBreedsOf`, which always counts the current breed.
   */
  ownedBreeds?: PetBreed[];
  /** Coins earned by caring for the pet, spent on changes (see coins.ts). Absent reads as 0. */
  coins?: number;
  /** Mind sessions ever played. Only counts up; the scholar evolution is read from it (`buildMindScore`). */
  mindSessions?: number;
  adoptedAt: string;
  lastEventAt?: string;
  /**
   * Row version from the database, bumped by a trigger on every update. Used
   * for optimistic writes (`savePetIfUnchanged`) so two carers cannot overwrite
   * each other. Optional: local pets, `createPet` and the web never carry one.
   */
  version?: number;
}

export interface PetDelta {
  health?: number;
  energy?: number;
  charge?: number;
  happiness?: number;
  nutrition?: number;
  strength?: number;
  pushingStrength?: number;
  pullingStrength?: number;
  legStrength?: number;
  endurance?: number;
  recovery?: number;
  mind?: number;
  /** Mind sessions played; only ever added to. */
  mindSessions?: number;
  xp?: number;
}

export interface PetReaction {
  message: string;
  eventLabel: string;
  delta: PetDelta;
  /**
   * What the meal did, as tags — "Spicy", "Sugar rush". Only ever set for a
   * MEAL, and only when the plate earned any. See `foodEffects.ts`.
   */
  effects?: FoodEffect[];
  /**
   * `message` was written for this exact moment — the model looked at the
   * plate and reacted to it — rather than picked from the stock lines. The HUD
   * shows an authored line over a food effect's generic one-liner.
   */
  authored?: boolean;
  /** Set when this moment ended a silence of at least a few days: how many. */
  returnedAfterDays?: number;
}

// Pet stats are whole numbers everywhere they are stored (integer columns) and shown,
// while time decay works in fractional days, so clamping rounds as well as bounds.
export const clamp = (value: number, minimum = 0, maximum = 100) =>
  Math.round(Math.min(maximum, Math.max(minimum, value)));

/**
 * The level a pet has to reach before a specialism can show as an evolution.
 *
 * There used to be a baby/teen/adult ladder that gated this and also drove the
 * sprite's size. It was removed: the builds are the progression the pet actually
 * has, and a second, parallel one measured only in levels said nothing the level
 * number was not already saying. What is left is the part that mattered — a pet
 * has to have been raised a while before how it was raised means anything, so a
 * level-2 pet that has been walked twice is not yet a runner.
 */
export const EVOLUTION_LEVEL = 15;

/**
 * The stored `xp` is progress through the current level, 0-100, whatever that
 * level costs: the column, the level ring and every older app read it as a
 * percentage. What a level COSTS in earned xp is `xpToLevelUp`.
 */
export const XP_PER_LEVEL = 100;

/**
 * Levels get harder from here on: each costs `LEVEL_COST_STEP` more than the
 * last, up to `MAX_LEVEL_COST`. Below it every level is 100, so the early
 * levels (and the first evolution's runway) stay quick and the later ones are
 * earned. 10 -> 11 costs 115, 15 -> 16 190, 20 -> 21 265, and from 29 on 400.
 */
export const HARDER_FROM_LEVEL = 10;
const LEVEL_COST_STEP = 15;
const MAX_LEVEL_COST = 400;

/** Earned xp it takes to go from `level` to the next. */
export const xpToLevelUp = (level: number): number =>
  level < HARDER_FROM_LEVEL ? XP_PER_LEVEL : Math.min(MAX_LEVEL_COST, XP_PER_LEVEL + LEVEL_COST_STEP * (level - HARDER_FROM_LEVEL + 1));

/**
 * A pet's total lifetime xp, as one number instead of a level/xp pair — the
 * form every other total (a day's, a week's) is a difference of. Never stored:
 * `level`/`xp` stay the two persisted fields, this is them read back out in
 * earned xp (each level at its own cost), so a diff against an earlier reading
 * is the xp actually earned in between ("+33 XP" stays 33 at level 40).
 */
export const totalPetXp = (pet: Pick<PetState, 'level' | 'xp'>): number => {
  let total = 0;
  for (let level = 1; level < pet.level; level += 1) total += xpToLevelUp(level);
  return total + Math.round((pet.xp / XP_PER_LEVEL) * xpToLevelUp(pet.level));
};

/**
 * The shape a pet has grown into. Derived from how it was actually raised, never
 * chosen: the point is that the pet reflects the user's own habits back at them.
 *
 * `balanced` is the absence of a specialism rather than a build of its own, and
 * is what a pet keeps while nothing dominates. Every specialism listed here has
 * evolved artwork for all four breeds — a build with no sheet behind it would
 * promise a change that never visibly arrives, so add the art before the build.
 */
export type PetBuild = 'balanced' | 'runner' | 'lifter' | 'scholar';
export type EvolvedBuild = Exclude<PetBuild, 'balanced'>;

/**
 * A specialism's stat has to be both substantial and clearly ahead of the other
 * two. Both halves matter: the floor stops a level-1 pet (endurance 16, strength
 * 14) from being declared a runner on a two-point lead, and the margin stops a pet
 * training everything evenly from tipping into a specialism on noise. Because the
 * lead is required over BOTH rivals, at most one specialism can ever qualify.
 */
const BUILD_MIN_STAT = 60;
const BUILD_LEAD_OVER_OTHERS = 15;

/**
 * The mind side of the build is counted in SESSIONS, not read off `mind`.
 * `mind` decays every day without a session (it drives mood and "foggy"), so a
 * scholar measured by it could slip out of its specialism -- and a runner or
 * lifter could tip in or out of the lead as it rose and fell. Sessions only ever
 * count up, like strength and endurance only ever build. Each is worth this many
 * points on the 0-100 scale the other two use, so a scholar needs about
 * BUILD_MIN_STAT / MIND_SCORE_PER_SESSION (20) sessions.
 */
export const MIND_SCORE_PER_SESSION = 3;

/** The mind score evolution compares: sessions, on the same 0-100 scale as strength and endurance. */
export const buildMindScore = (pet: Partial<Pick<PetState, 'mindSessions'>>): number =>
  Math.min(100, Math.max(0, pet.mindSessions ?? 0) * MIND_SCORE_PER_SESSION);

const dominates = (stat: number, ...others: number[]): boolean =>
  stat >= BUILD_MIN_STAT && others.every((other) => stat - other >= BUILD_LEAD_OVER_OTHERS);

/** The stats evolution reads: endurance, strength, and the mind score from sessions. */
type BuildStats = Pick<PetState, 'endurance' | 'strength'> & Partial<Pick<PetState, 'mindSessions'>>;

/** What the stats alone say right now, ignoring any locked evolution. */
const liveBuild = (pet: BuildStats): PetBuild => {
  const { endurance, strength } = pet;
  const mind = buildMindScore(pet);
  if (dominates(endurance, strength, mind)) return 'runner';
  if (dominates(strength, endurance, mind)) return 'lifter';
  if (dominates(mind, endurance, strength)) return 'scholar';
  return 'balanced';
};

/**
 * The pet's build: the specialism its stats show, or -- once they have drifted
 * back to even -- the one it already evolved into. A pet never devolves.
 */
export const getPetBuild = (
  pet: BuildStats & Partial<Pick<PetState, 'evolvedBuild' | 'earnedBuilds' | 'chosenBuild' | 'showBase'>>,
): PetBuild => {
  // A form picked by hand is worn whatever the stats say: the base look, or any
  // evolution already earned.
  if (pet.showBase) return 'balanced';
  if (pet.chosenBuild && isFormUnlocked(pet, pet.chosenBuild)) return pet.chosenBuild;
  const live = liveBuild(pet);
  return live === 'balanced' ? (pet.evolvedBuild ?? 'balanced') : live;
};

export const EVOLVED_BUILDS: readonly EvolvedBuild[] = ['runner', 'lifter', 'scholar'];

/** A look the pet can wear: its base form, or one of its evolutions. */
export type PetForm = 'base' | EvolvedBuild;

/** Every form, base first: the order the picker shows them in. */
export const PET_FORMS: readonly PetForm[] = ['base', ...EVOLVED_BUILDS];

/** Whether the pet may wear `form`: the base always, an evolution once earned. */
export const isFormUnlocked = (
  pet: Partial<Pick<PetState, 'earnedBuilds' | 'evolvedBuild'>>,
  form: PetForm,
): boolean => form === 'base' || Boolean(pet.earnedBuilds?.includes(form) || pet.evolvedBuild === form);

/** Whether there is anything to switch between: the base look and at least one evolution. */
export const canSwitchForm = (pet: Partial<Pick<PetState, 'earnedBuilds' | 'evolvedBuild'>>): boolean =>
  EVOLVED_BUILDS.some((build) => isFormUnlocked(pet, build));

/** The form the pet is drawn in right now. */
export const wornForm = (
  pet: Pick<PetState, 'level'> & BuildStats & Partial<Pick<PetState, 'evolvedBuild' | 'earnedBuilds' | 'chosenBuild' | 'showBase'>>,
): PetForm => (hasEvolved(pet) ? (getPetBuild(pet) as EvolvedBuild) : 'base');

/**
 * The pet wearing `form`, if it may; unchanged otherwise (an unearned
 * evolution, or the form it already wears). The pick sticks until the next
 * one: a pet that later earns another evolution keeps wearing what was picked.
 * Nothing picked, it wears what it has grown into, as it always did.
 */
export const chooseForm = <T extends PetState>(pet: T, form: PetForm): T => {
  if (!isFormUnlocked(pet, form) || wornForm(pet) === form) return pet;
  return form === 'base'
    ? { ...pet, showBase: true, chosenBuild: undefined }
    : { ...pet, showBase: undefined, chosenBuild: form };
};

/** What each evolution is grown from. The scholar's is counted in sessions. */
export const BUILD_STAT: Record<EvolvedBuild, 'endurance' | 'strength' | 'mindSessions'> = {
  runner: 'endurance',
  lifter: 'strength',
  scholar: 'mindSessions',
};

/** A build's stat on the shared 0-100 scale. */
const buildScore = (pet: BuildStats, build: EvolvedBuild): number =>
  build === 'scholar' ? buildMindScore(pet) : pet[BUILD_STAT[build] as 'endurance' | 'strength'];

export interface EvolutionProgress {
  build: EvolvedBuild;
  /** Earned at some point, so it is kept for good. */
  earned: boolean;
  /** 0..1 across the three requirements below; 1 once earned. */
  progress: number;
  level: { have: number; need: number };
  /** In the stat's own units: points for endurance and strength, sessions for mind. */
  stat: { key: 'endurance' | 'strength' | 'mindSessions'; have: number; need: number };
  /** How far the stat is ahead of the higher of the other two. */
  lead: { have: number; need: number };
}

/**
 * How close the pet is to one evolution, requirement by requirement. The three
 * requirements are the real rule (`EVOLUTION_LEVEL`, `BUILD_MIN_STAT`,
 * `BUILD_LEAD_OVER_OTHERS`), each counted as a share done, so the bar can never
 * be full while the pet still would not evolve.
 */
export const evolutionProgress = (
  pet: Pick<PetState, 'level'> & BuildStats & Partial<Pick<PetState, 'earnedBuilds' | 'evolvedBuild'>>,
  build: EvolvedBuild,
): EvolutionProgress => {
  const key = BUILD_STAT[build];
  const have = buildScore(pet, build);
  const rival = Math.max(...EVOLVED_BUILDS.filter((other) => other !== build).map((other) => buildScore(pet, other)));
  const earned = Boolean(pet.earnedBuilds?.includes(build) || pet.evolvedBuild === build);
  const share = (value: number, need: number) => Math.max(0, Math.min(1, value / need));
  const parts = [
    share(pet.level, EVOLUTION_LEVEL),
    share(have, BUILD_MIN_STAT),
    share(have - rival, BUILD_LEAD_OVER_OTHERS),
  ];
  return {
    build,
    earned,
    progress: earned ? 1 : parts.reduce((total, part) => total + part, 0) / parts.length,
    level: { have: pet.level, need: EVOLUTION_LEVEL },
    stat:
      build === 'scholar'
        ? { key, have: Math.max(0, pet.mindSessions ?? 0), need: Math.ceil(BUILD_MIN_STAT / MIND_SCORE_PER_SESSION) }
        : { key, have: Math.round(have), need: BUILD_MIN_STAT },
    lead: { have: Math.round(have - rival), need: BUILD_LEAD_OVER_OTHERS },
  };
};

/**
 * Records the specialism an evolved pet has grown into, so it is kept when the
 * stats drift. Run wherever stats move (every event, and before decay), which
 * is what makes it impossible to decay out of an evolution between saves.
 */
export const lockEvolution = <T extends PetState>(pet: T): T => {
  // A pet locked before `earnedBuilds` existed has earned its locked form.
  const known = pet.evolvedBuild && !pet.earnedBuilds?.includes(pet.evolvedBuild)
    ? { ...pet, earnedBuilds: [...(pet.earnedBuilds ?? []), pet.evolvedBuild] }
    : pet;
  if (known.level < EVOLUTION_LEVEL) return known;
  const live = liveBuild(known);
  if (live === 'balanced' || (live === known.evolvedBuild && known.earnedBuilds?.includes(live))) return known;
  return {
    ...known,
    evolvedBuild: live,
    earnedBuilds: known.earnedBuilds?.includes(live) ? known.earnedBuilds : [...(known.earnedBuilds ?? []), live],
  };
};

export const PET_BUILD_LABEL: Record<PetBuild, string> = {
  balanced: 'Balanced',
  runner: 'Runner',
  lifter: 'Lifter',
  scholar: 'Scholar',
};

/**
 * Whether the pet has visibly evolved: it has both reached `EVOLUTION_LEVEL` and
 * grown into a specialism. Kept here rather than in the sprite layer so the copy
 * on the dashboard and the sheet the avatar draws can never disagree about it.
 */
export const hasEvolved = (
  pet: Pick<PetState, 'level'> & BuildStats & Partial<Pick<PetState, 'evolvedBuild' | 'earnedBuilds' | 'chosenBuild' | 'showBase'>>,
): boolean => pet.level >= EVOLUTION_LEVEL && getPetBuild(pet) !== 'balanced';

/** Every animal the pet owns, the one it is now included. */
export const ownedBreedsOf = (pet: Partial<Pick<PetState, 'breed' | 'ownedBreeds'>>): PetBreed[] => {
  const owned = pet.ownedBreeds ?? [];
  return pet.breed && !owned.includes(pet.breed) ? [...owned, pet.breed] : [...owned];
};

export const ownsBreed = (pet: Partial<Pick<PetState, 'breed' | 'ownedBreeds'>>, breed: PetBreed): boolean =>
  ownedBreedsOf(pet).includes(breed);


/**
 * DEV TOOL -- which form to preview. Evolutions are earned over weeks of real
 * training, so without this the only way to see one is to wait for it.
 */
export type ForcedPetForm = 'base' | 'runner' | 'lifter' | 'scholar';

/** `base` stays under the line on purpose; a specialism has to clear it. */
const FORCED_FORM_LEVEL: Record<ForcedPetForm, number> = {
  base: 1,
  runner: EVOLUTION_LEVEL,
  lifter: EVOLUTION_LEVEL,
  scholar: EVOLUTION_LEVEL,
};

/**
 * What the stats a forced form is not pushing up get held at.
 *
 * Must stay clear of every ailment threshold in `petCondition.ts` — it used to be
 * 10, which is exactly the `foggy` line, so forcing Runner or Lifter dropped
 * `mind` onto it and the preview came back dizzy no matter what the forced status
 * said. Still far enough below the dominant stat (65) to clear
 * `BUILD_LEAD_OVER_OTHERS` several times over, so the build still reads correctly.
 * `petStats.test.ts` asserts a forced form produces no ailments at all.
 */
const FORCED_FORM_FLOOR = 20;

/** Which of the three stats `getPetBuild` reads a forced specialism pushes up. */
const FORCED_FORM_STAT: Partial<Record<ForcedPetForm, 'endurance' | 'strength' | 'mind'>> = {
  runner: 'endurance',
  lifter: 'strength',
  scholar: 'mind',
};

/**
 * DEV TOOL -- rewrites level and the three stats `getPetBuild` reads, so the real
 * `sheetForPet` path resolves to the requested form and nothing is special-cased.
 *
 * Moves the STATS, not the sheet, for the same reason `applyForcedAilment` does:
 * the sprite, the build copy and the stat bars then all agree with each other.
 * A specialism gets its stat well past the floor with the other two held low;
 * `base` pins all three level with each other so a pet that really is a runner,
 * lifter or scholar still previews as unevolved when asked to.
 *
 * Display only. Apply it to the projection being rendered, never to a pet on its
 * way to being saved.
 */
export const applyForcedForm = (pet: PetState, form: ForcedPetForm | null): PetState => {
  if (!form) return pet;
  const dominant = FORCED_FORM_STAT[form];
  const statFor = (stat: 'endurance' | 'strength' | 'mind'): number => {
    if (!dominant) return FORCED_FORM_FLOOR;
    return stat === dominant ? BUILD_MIN_STAT + 20 : FORCED_FORM_FLOOR;
  };
  return {
    ...pet,
    level: FORCED_FORM_LEVEL[form],
    endurance: statFor('endurance'),
    strength: statFor('strength'),
    mind: statFor('mind'),
    // The scholar is read from sessions, so the preview pins those too.
    mindSessions: Math.ceil(statFor('mind') / MIND_SCORE_PER_SESSION),
    // Pinned too, or a real pet's locked evolution would still show through
    // (and a forced `foggy` after a forced form could not keep the form).
    evolvedBuild: form === 'base' ? undefined : form,
    // A picked form would override the preview, so the preview drops it.
    chosenBuild: undefined,
    showBase: undefined,
  };
};

export const createPet = (
  userId: string,
  name: string,
  species: PetState['species'] = 'cat',
  breed: PetBreed = 'bichon',
  personality?: PetPersonality,
  id: string = newId(),
  persona?: string,
  dials?: PersonalityDials,
): PetState => ({
  id,
  breed,
  userId,
  name,
  species,
  ...(personality ? { personality } : {}),
  ...(persona?.trim() ? { persona: persona.trim() } : {}),
  ...(dials ? { dials } : {}),
  level: 1,
  xp: 0,
  health: 78,
  energy: 72,
  charge: 72,
  happiness: 82,
  nutrition: 68,
  strength: 14,
  pushingStrength: 10,
  pullingStrength: 10,
  legStrength: 10,
  endurance: 16,
  recovery: 64,
  mind: 20,
  mood: 'content',
  adoptedAt: new Date().toISOString(),
});
