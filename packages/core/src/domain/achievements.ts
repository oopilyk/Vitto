import type { HealthEvent } from './health';
import type { BodyProfile } from './macroTargets';
import { hasEvolved, type PetState } from './pet';
import { calculateStreaks } from './streaks';
import { TROPHY_IDS, TROPHY_LABEL, type TrophyId, trophyRule } from './trophies';

/**
 * Achievements: everything the app can congratulate someone for, in one list.
 *
 * Two kinds. Badges are milestones on the way — the first meal, a week's streak,
 * level 10 — and exist so the first days have something to unlock. Trophies are
 * the four month-long habits from `trophies.ts`; they are achievements too, and
 * additionally sit on the living-room shelf. Both are derived from history and
 * the pet, never stored, so nothing here can be lost or need migrating.
 *
 * The one thing that IS stored is which unlocks the user has already been shown
 * (`newlyUnlocked` against a persisted "seen" list), so a milestone pops once,
 * when it happens, and not on every launch.
 */

export type BadgeId =
  | 'first_care'
  | 'first_meal'
  | 'first_workout'
  | 'first_walk'
  | 'first_mind'
  | 'streak_7'
  | 'streak_30'
  | 'care_50'
  | 'care_250'
  | 'level_5'
  | 'level_10'
  | 'evolved';

export type AchievementId = BadgeId | TrophyId;

export interface Achievement {
  id: AchievementId;
  kind: 'badge' | 'trophy';
  title: string;
  /** What it takes, in the user's terms. Trophies read the profile's own targets. */
  describe: (profile: Pick<BodyProfile, 'trainingDaysPerWeek'>) => string;
}

export const STREAK_WEEK = 7;
export const STREAK_MONTH = 30;
export const CARE_MILESTONE_SMALL = 50;
export const CARE_MILESTONE_LARGE = 250;
export const LEVEL_MILESTONE_SMALL = 5;
export const LEVEL_MILESTONE_LARGE = 10;

const badge = (id: BadgeId, title: string, description: string): Achievement => ({
  id,
  kind: 'badge',
  title,
  describe: () => description,
});

const trophy = (id: TrophyId): Achievement => ({
  id,
  kind: 'trophy',
  title: TROPHY_LABEL[id],
  describe: (profile) => trophyRule(id, profile),
});

/** Display order: the early badges first, trophies last, so the list reads as a path. */
export const ACHIEVEMENTS: readonly Achievement[] = [
  badge('first_care', 'Hello, world', 'Care for your pet for the first time'),
  badge('first_meal', 'First bite', 'Log a meal'),
  badge('first_walk', 'First steps', 'Sync a walk'),
  badge('first_workout', 'First rep', 'Log a workout'),
  badge('first_mind', 'First thought', 'Finish a mind-gym session'),
  badge('streak_7', 'One week', `Care for your pet ${STREAK_WEEK} days in a row`),
  badge('level_5', 'Growing', `Reach level ${LEVEL_MILESTONE_SMALL}`),
  badge('care_50', 'Fifty moments', `${CARE_MILESTONE_SMALL} care moments logged`),
  badge('streak_30', 'One month', `Care for your pet ${STREAK_MONTH} days in a row`),
  badge('level_10', 'Grown', `Reach level ${LEVEL_MILESTONE_LARGE}`),
  badge('evolved', 'Evolved', 'Your pet grows into what you raised it to be'),
  badge('care_250', 'Devoted', `${CARE_MILESTONE_LARGE} care moments logged`),
  ...TROPHY_IDS.map(trophy),
];

export const ACHIEVEMENT_BY_ID: Record<AchievementId, Achievement> = Object.fromEntries(
  ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]),
) as Record<AchievementId, Achievement>;

export interface AchievementInput {
  events: HealthEvent[];
  pet: Pick<PetState, 'level' | 'endurance' | 'strength' | 'mind'> | null;
  /** From `earnedTrophies` — passed in rather than recomputed so a dev override flows through. */
  trophies: readonly TrophyId[];
  today?: Date;
}

/**
 * Everything earned, in display order.
 *
 * Milestones are "ever", not "now": a streak that reached seven and later broke
 * still earned One week, and a pet that hit level 10 keeps Grown. That is what
 * makes them safe to derive rather than store.
 */
export const earnedAchievements = ({ events, pet, trophies, today = new Date() }: AchievementInput): AchievementId[] => {
  const has = (type: HealthEvent['type']) => events.some((event) => event.type === type);
  const streaks = calculateStreaks(events, today);
  const earned = new Set<AchievementId>();

  if (events.length > 0) earned.add('first_care');
  if (has('MEAL')) earned.add('first_meal');
  if (has('STEP_ACTIVITY')) earned.add('first_walk');
  if (has('WORKOUT')) earned.add('first_workout');
  if (has('BRAIN_TRAINING')) earned.add('first_mind');
  if (streaks.longestStreak >= STREAK_WEEK) earned.add('streak_7');
  if (streaks.longestStreak >= STREAK_MONTH) earned.add('streak_30');
  if (events.length >= CARE_MILESTONE_SMALL) earned.add('care_50');
  if (events.length >= CARE_MILESTONE_LARGE) earned.add('care_250');
  if (pet && pet.level >= LEVEL_MILESTONE_SMALL) earned.add('level_5');
  if (pet && pet.level >= LEVEL_MILESTONE_LARGE) earned.add('level_10');
  if (pet && hasEvolved(pet)) earned.add('evolved');
  for (const id of trophies) earned.add(id);

  return ACHIEVEMENTS.map((achievement) => achievement.id).filter((id) => earned.has(id));
};

/**
 * What to pop: earned but never shown. Order is display order, so several
 * unlocking at once (a first meal is also the first care moment) are announced
 * in the order the list presents them.
 */
export const newlyUnlocked = (
  earned: readonly AchievementId[],
  seen: ReadonlySet<string>,
): AchievementId[] => earned.filter((id) => !seen.has(id));
