import type { HealthEventType } from './health';
import type { PetState } from './pet';
import { getStatusEffects, type StatusEffect } from './petStatusEffects';

/**
 * Friends & Social Pets -- "what is this pet doing right now."
 *
 * The one module that owns this question, per the product requirement that
 * activity/status rules be centralized rather than scattered across screens.
 * Everything it reads is already something an accepted friend is allowed to
 * see: full pet stats (the `pets` RLS policy already grants friends a SELECT),
 * and a minimal type+timestamp activity signal (see `RecentActivitySignal`
 * below). This module only ever combines those two -- it never invents
 * activity, and it never reaches for anything private.
 */

/**
 * The privacy-safe shadow of a `HealthEvent` a friend is allowed to see: what
 * KIND of thing happened, and when -- never `metadata` (which can carry meal
 * photos, workout notes, exact macros, screen-time totals). This is the only
 * shape `get_friend_recent_activity` (a SECURITY DEFINER RPC) returns; a
 * friend has no other path into another user's `health_events`, which
 * otherwise stays strictly author-only -- the same boundary the care-partners
 * migration already draws for `pet_care_log`.
 */
export interface RecentActivitySignal {
  type: HealthEventType;
  occurredAt: string;
}

/**
 * The pose/read a friend's pet card shows. A small, closed set on purpose: a
 * new `HealthEventType` maps onto one of these existing activities rather than
 * growing this union, so the rendering layer (PetAvatar's existing activity
 * flags -- see `SOCIAL_ACTIVITY_POSE`) never has to grow to match it.
 */
export type SocialActivity = 'workout' | 'eating' | 'walking' | 'sleeping' | 'training' | 'relaxing' | 'idle';

export interface SocialPetStatus {
  /** What to show as the pet's current pose/read. */
  activity: SocialActivity;
  /** One line of copy describing it, e.g. "Working out" or "Went for a walk earlier". */
  headline: string;
  /**
   * Whether `activity` reflects something that just happened (within
   * `LIVE_WINDOW_MINUTES`), as opposed to a recent-but-stale fallback. Only a
   * live signal should ever be presented as happening right now -- a derived
   * or recent state must never be misrepresented as live.
   */
  isLive: boolean;
  /** The most recent signal's timestamp, if any -- for an "active 3h ago" chip. */
  lastActiveAt?: string;
  /** Whether the friend has done anything at all in the last `RECENT_WINDOW_HOURS`. */
  recentlyActive: boolean;
  /**
   * The pet's current mood/ailment chip, straight from `getStatusEffects` --
   * kept alongside activity rather than duplicated, so a friend's
   * "Foggy"/"Thriving" chip always agrees with the one the pet's own
   * dashboard would show. `null` when nothing is notable either way.
   *
   * @deprecated Superseded by `health`, which always has a value (down to a
   * plain "Healthy") and carries a tone for colouring. Kept for the existing
   * `FriendPetCard` until it migrates.
   */
  moodLabel: string | null;
  /**
   * Which room the pet reads as being in. The app has no shared real-time
   * presence, so this is INFERRED from the latest live activity, never a
   * precise location -- `home` whenever nothing live is happening.
   */
  place: SocialPetPlace;
  /** Display copy for `place`, e.g. "At the gym", "In the kitchen". */
  placeLabel: string;
  /**
   * The pet's overall health read -- "Healthy" / "Thriving" / "Fading" and so
   * on, with a tone the UI can colour by. Always set (unlike `moodLabel`); the
   * single source both the friends list and the friend-pet card should use.
   */
  health: SocialHealthInfo;
}

/**
 * Which room a friend's pet reads as being in. Mirrors the mobile app's
 * `EnvironmentId` set (`home` is its `main`/living-room scene) so the client can
 * map it straight onto a scene without a translation table.
 */
export type SocialPetPlace = 'home' | 'kitchen' | 'gym' | 'outdoors' | 'study';

export const SOCIAL_PLACE_LABEL: Record<SocialPetPlace, string> = {
  home: 'At home',
  kitchen: 'In the kitchen',
  gym: 'At the gym',
  outdoors: 'Outdoors',
  study: 'In the study',
};

/** The room each activity implies, when that activity is live. */
const PLACE_BY_ACTIVITY: Record<SocialActivity, SocialPetPlace> = {
  workout: 'gym',
  eating: 'kitchen',
  walking: 'outdoors',
  training: 'study',
  sleeping: 'home',
  relaxing: 'home',
  idle: 'home',
};

/**
 * The pet's overall condition, in the words a friend sees. One word plus a
 * tone -- deliberately not the full `getStatusEffects` detail string, which is
 * owner-facing ("Energy 18, at or under 20. Log a walk.").
 */
export type SocialHealthLevel = StatusEffect['id'] | 'healthy';
export type SocialHealthTone = 'good' | 'neutral' | 'warn' | 'bad';

export interface SocialHealthInfo {
  level: SocialHealthLevel;
  /** Chip text, one word: "Healthy", "Thriving", "Fading", "Starving", ... */
  label: string;
  tone: SocialHealthTone;
}

const HEALTH_TONE: Record<StatusEffect['id'], SocialHealthTone> = {
  dying: 'bad',
  starving: 'bad',
  exhausted: 'warn',
  sad: 'warn',
  foggy: 'warn',
  sleepy: 'neutral',
  thriving: 'good',
};

/**
 * Collapses `getStatusEffects` into the one-word, toned read a friend sees.
 * Reuses that function's precedence and labels verbatim so a friend's chip can
 * never disagree with the pet's own dashboard; a pet with nothing notable
 * reads as a plain, neutral "Healthy".
 */
export const deriveSocialHealth = (pet: PetState): SocialHealthInfo => {
  const top = getStatusEffects(pet)[0];
  if (!top) return { level: 'healthy', label: 'Healthy', tone: 'neutral' };
  return { level: top.id, label: top.label, tone: HEALTH_TONE[top.id] };
};

/** A signal older than this no longer looks like something happening right now. */
const LIVE_WINDOW_MINUTES = 45;
/** Beyond this, "recently active" turns off and the pet just reads as quiet. */
const RECENT_WINDOW_HOURS = 24;

const ACTIVITY_BY_EVENT_TYPE: Partial<Record<HealthEventType, SocialActivity>> = {
  WORKOUT: 'workout',
  MEAL: 'eating',
  STEP_ACTIVITY: 'walking',
  SLEEP: 'sleeping',
  BRAIN_TRAINING: 'training',
  SCREEN_TIME: 'relaxing',
  HYDRATION: 'relaxing',
  MANUAL_ACTIVITY: 'relaxing',
};

const LIVE_HEADLINE: Record<SocialActivity, string> = {
  workout: 'Working out',
  eating: 'Having a meal',
  walking: 'Out for a walk',
  sleeping: 'Sleeping',
  training: 'Training their mind',
  relaxing: 'Taking it easy',
  idle: 'Around',
};

const RECENT_HEADLINE: Record<SocialActivity, string> = {
  workout: 'Worked out earlier',
  eating: 'Ate a meal earlier',
  walking: 'Went for a walk earlier',
  sleeping: 'Slept recently',
  training: 'Trained their mind earlier',
  relaxing: 'Checked in earlier',
  idle: 'Was around earlier',
};

/** Which of PetAvatar's existing activity flags a live social activity should light up. */
type PetAvatarPose = 'eating' | 'workout' | 'exploring';

/**
 * Activities with no matching pose (sleeping/training/relaxing/idle) map to
 * nothing here on purpose: PetAvatar already renders mood/ailment poses
 * (sleepy, foggy, ...) straight from the pet's own stats, so leaving these
 * activities un-posed lets that existing, correct rendering show through
 * rather than being overridden with a guess.
 */
export const SOCIAL_ACTIVITY_POSE: Partial<Record<SocialActivity, PetAvatarPose>> = {
  workout: 'workout',
  eating: 'eating',
  walking: 'exploring',
};

/** Unparsable timestamps sort last, so malformed data never wins "most recent". */
const parseTime = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

const minutesSince = (iso: string, now: Date): number => (now.getTime() - parseTime(iso)) / 60_000;

/**
 * Derives what a friend's pet is doing right now (or most recently) from its
 * live stats plus a short, privacy-safe activity history.
 *
 * `signals` should already be scoped to a recent window by the caller (the
 * `get_friend_recent_activity` RPC only returns the last few days) -- this
 * function still defends against a wider or malformed list, since it has no
 * way to enforce that from the type alone.
 */
export const deriveSocialPetStatus = (
  pet: PetState,
  signals: RecentActivitySignal[],
  now: Date = new Date(),
): SocialPetStatus => {
  const sorted = [...signals].sort((a, b) => parseTime(b.occurredAt) - parseTime(a.occurredAt));
  const latest = sorted.find((signal) => Number.isFinite(parseTime(signal.occurredAt)));

  // A future-dated signal (clock skew, bad data) is treated as no signal at
  // all rather than as the most-live thing possible.
  const age = latest ? minutesSince(latest.occurredAt, now) : Number.POSITIVE_INFINITY;
  const hasValidAge = Number.isFinite(age) && age >= 0;
  const isLive = hasValidAge && age <= LIVE_WINDOW_MINUTES;
  const recentlyActive = hasValidAge && age <= RECENT_WINDOW_HOURS * 60;

  const mapped = latest ? ACTIVITY_BY_EVENT_TYPE[latest.type] : undefined;

  let activity: SocialActivity;
  let headline: string;
  if (isLive && mapped) {
    activity = mapped;
    headline = LIVE_HEADLINE[activity];
  } else if (recentlyActive && mapped) {
    activity = mapped;
    headline = RECENT_HEADLINE[activity];
  } else {
    activity = 'idle';
    headline = recentlyActive ? RECENT_HEADLINE.idle : 'Quiet lately';
  }

  const moodLabel = getStatusEffects(pet)[0]?.label ?? null;

  // Location is only claimed from a LIVE activity -- a pet that worked out two
  // hours ago is back home now, not still at the gym.
  const place: SocialPetPlace = isLive ? PLACE_BY_ACTIVITY[activity] : 'home';

  return {
    activity,
    headline,
    isLive,
    lastActiveAt: latest && hasValidAge ? latest.occurredAt : undefined,
    recentlyActive,
    moodLabel,
    place,
    placeLabel: SOCIAL_PLACE_LABEL[place],
    health: deriveSocialHealth(pet),
  };
};
