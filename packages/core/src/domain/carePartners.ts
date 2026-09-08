import { errorMessage } from '../errorMessage';
import type { HealthEvent, HealthEventType } from './health';

/**
 * Care partners: two people raising one pet.
 *
 * Membership lives in `pet_members`, not on the pet row, so `pets.user_id` keeps
 * meaning "who adopted it" while either member can care for it. Everything a
 * partner learns about the other comes through this module: a display name (or
 * a fallback), and a care log that carries only an event TYPE and a time. The
 * labels and sentences here are derived from that type on the client, so a
 * partner never sees the other person's meals, workouts, sleep or screen time —
 * only that a care moment of some kind happened.
 */

export type PetMemberRole = 'owner' | 'partner';

export interface PetMember {
  userId: string;
  role: PetMemberRole;
  joinedAt: string;
  /** Set when the member left; kept so old care-log rows still resolve to a name. */
  leftAt?: string;
  /** Already sanitised server-side (never an email, never blank); null when unusable. */
  displayName: string | null;
}

export interface PetInvite {
  id: string;
  petId: string;
  code: string;
  createdAt: string;
  expiresAt: string;
  redeemedAt?: string;
  revokedAt?: string;
}

/** One row of `pet_care_log`. Deliberately no label, notes or metadata — see the module note. */
export interface CareLogEntry {
  id: string;
  petId: string;
  userId: string;
  type: HealthEventType;
  occurredAt: string;
}

/** What the dashboard's "Today's care" list renders once own events and partner rows are merged. */
export interface CareDiaryEntry {
  id: string;
  occurredAt: string;
  type: HealthEventType;
  label: string;
  actorUserId: string;
  /** null means "you". */
  actorName: string | null;
}

/**
 * Outcome of an optimistic pet write. `conflict` means someone else wrote the
 * row since it was read, and the caller must reload and recompute — never
 * retry the same payload, because decay and diminishing returns were computed
 * against stale stats.
 */
export type PetSaveResult = { status: 'saved'; version: number } | { status: 'conflict' };

export const MAX_PET_MEMBERS = 2;
export const INVITE_CODE_LENGTH = 6;
/** No 0/O/1/I — codes are read aloud and typed by hand. Must match the SQL CHECK on `pet_invites.code`. */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Shown when a member's display name is unusable (blank, or an email we refuse to leak). */
export const PARTNER_FALLBACK_NAME = 'Your partner';

/**
 * `random` is injectable so tests can pin the output; the default is
 * `Math.random`, which is fine here because a code is single-use, expires in a
 * week and only unlocks a pet the owner chose to share.
 */
export const generateInviteCode = (random: () => number = Math.random): string => {
  let code = '';
  for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) {
    // Clamp so a generator that returns exactly 1 cannot index past the alphabet.
    const slot = Math.min(INVITE_CODE_ALPHABET.length - 1, Math.max(0, Math.floor(random() * INVITE_CODE_ALPHABET.length)));
    code += INVITE_CODE_ALPHABET[slot];
  }
  return code;
};

/** Uppercase and strip anything that is not a letter or digit, so 'abc-d ef' and 'ABCDEF' are the same code. */
export const normalizeInviteCode = (input: string): string =>
  input.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** 'ABCDEF' → 'ABC-DEF'. Anything that is not a full code is returned normalised but unbroken. */
export const formatInviteCode = (code: string): string => {
  const normalized = normalizeInviteCode(code);
  if (normalized.length !== INVITE_CODE_LENGTH) return normalized;
  const half = INVITE_CODE_LENGTH / 2;
  return `${normalized.slice(0, half)}-${normalized.slice(half)}`;
};

export const inviteExpiresAt = (createdAt: Date): string =>
  new Date(createdAt.getTime() + INVITE_TTL_MS).toISOString();

const parseTime = (iso: string): number => {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : 0;
};

/** Not redeemed, not revoked, and strictly before expiry — the same rule the RPC applies. */
export const isInviteOpen = (invite: PetInvite, now: Date): boolean =>
  !invite.redeemedAt && !invite.revokedAt && parseTime(invite.expiresAt) > now.getTime();

export const activeMembers = (members: PetMember[]): PetMember[] =>
  members.filter((member) => !member.leftAt);

export const isSharedPet = (members: PetMember[]): boolean => activeMembers(members).length > 1;

export const memberRole = (members: PetMember[], userId: string): PetMemberRole | null =>
  activeMembers(members).find((member) => member.userId === userId)?.role ?? null;

/**
 * Resolves through left members too, so a diary row written by someone who has
 * since left still reads as them rather than as a stranger.
 */
export const memberDisplayName = (members: PetMember[], userId: string): string =>
  members.find((member) => member.userId === userId)?.displayName ?? PARTNER_FALLBACK_NAME;

/**
 * The only thing a partner ever sees about a care moment. Kept upbeat and
 * type-level on purpose: "Shared a meal", never what the meal was.
 */
export const CARE_LOG_LABEL: Record<HealthEventType, string> = {
  WORKOUT: 'Trained together',
  STEP_ACTIVITY: 'Went exploring',
  MEAL: 'Shared a meal',
  BRAIN_TRAINING: 'Trained their mind',
  SLEEP: 'Rested up',
  SCREEN_TIME: 'Screen check-in',
  HYDRATION: 'Had a drink',
  MANUAL_ACTIVITY: 'A healthy moment',
};

export const careLogLabel = (type: HealthEventType): string =>
  CARE_LOG_LABEL[type] ?? CARE_LOG_LABEL.MANUAL_ACTIVITY;

/** Past-tense verb phrases for the "while you were away" sentence; the labels above are not all verbs. */
const CARE_LOG_VERB: Record<HealthEventType, string> = {
  WORKOUT: 'trained together',
  STEP_ACTIVITY: 'went exploring',
  MEAL: 'shared a meal',
  BRAIN_TRAINING: 'trained their mind',
  SLEEP: 'rested up',
  SCREEN_TIME: 'checked in on screen time',
  HYDRATION: 'had a drink',
  MANUAL_ACTIVITY: 'had a healthy moment',
};

/** Newest first, then id ascending, so two renders of the same data never reorder. */
const byNewestThenId = (a: { occurredAt: string; id: string }, b: { occurredAt: string; id: string }): number => {
  const delta = parseTime(b.occurredAt) - parseTime(a.occurredAt);
  if (delta !== 0) return delta;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/**
 * Merges the user's own events with the partner's care-log rows into one diary.
 * Own care-log rows are dropped rather than merged: the user's own `health_events`
 * already describe those moments in full, and the log row is only the shadow the
 * partner sees. Own entries get `actorName: null` so the UI can say "you".
 */
export const mergeCareDiary = (input: {
  ownEvents: HealthEvent[];
  careLog: CareLogEntry[];
  members: PetMember[];
  selfUserId: string;
}): CareDiaryEntry[] => {
  const { ownEvents, careLog, members, selfUserId } = input;
  const own: CareDiaryEntry[] = ownEvents.map((event) => ({
    id: event.id,
    occurredAt: event.occurredAt,
    type: event.type,
    label: careLogLabel(event.type),
    actorUserId: selfUserId,
    actorName: null,
  }));
  const partner: CareDiaryEntry[] = careLog
    .filter((entry) => entry.userId !== selfUserId)
    .map((entry) => ({
      id: entry.id,
      occurredAt: entry.occurredAt,
      type: entry.type,
      label: careLogLabel(entry.type),
      actorUserId: entry.userId,
      actorName: memberDisplayName(members, entry.userId),
    }));
  return [...own, ...partner].sort(byNewestThenId);
};

/**
 * Partner rows strictly after `sinceIso`. A null `since` means nothing has been
 * seen yet, so every partner row counts as new. Strictly-after, because the
 * caller seeds `since` with the newest row it has already shown.
 */
export const partnerEntriesSince = (
  careLog: CareLogEntry[],
  sinceIso: string | null,
  selfUserId: string,
): CareLogEntry[] => {
  const since = sinceIso === null ? null : parseTime(sinceIso);
  return careLog.filter(
    (entry) => entry.userId !== selfUserId && (since === null || parseTime(entry.occurredAt) > since),
  );
};

const listNames = (names: string[]): string => {
  if (names.length <= 1) return names[0] ?? PARTNER_FALLBACK_NAME;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
};

/**
 * The reaction shown when the app comes back to the foreground and the partner
 * has been busy. One entry gets a specific sentence; several collapse to a count
 * so a week away does not produce a wall of text.
 */
export const partnerActivityMessage = (
  entries: CareLogEntry[],
  members: PetMember[],
  petName: string,
): string | null => {
  if (entries.length === 0) return null;
  if (entries.length === 1) {
    const [entry] = entries;
    return `${memberDisplayName(members, entry.userId)} ${CARE_LOG_VERB[entry.type] ?? CARE_LOG_VERB.MANUAL_ACTIVITY} with ${petName} while you were away.`;
  }
  const names: string[] = [];
  for (const entry of entries) {
    const name = memberDisplayName(members, entry.userId);
    if (!names.includes(name)) names.push(name);
  }
  return `${listNames(names)} cared for ${petName} ${entries.length} times while you were away.`;
};

/**
 * The RPCs raise with a bare code as the exception message, so the copy can live
 * here instead of in SQL and stay in step with the rest of the app's voice.
 */
const INVITE_ERROR_COPY: Record<string, string> = {
  INVITE_NOT_FOUND: "That code doesn't match any invite. Check it and try again.",
  INVITE_USED: 'That code has already been used.',
  INVITE_EXPIRED: 'That code has expired. Ask your partner for a new one.',
  OWN_INVITE: "That's your own code — share it with your partner instead.",
  ALREADY_MEMBER: "You're already caring for this pet.",
  PET_FULL: `This pet already has ${MAX_PET_MEMBERS} carers.`,
  HAS_ACTIVE_PET: "You're already caring for a pet. Leave them first to join another.",
  NOT_A_MEMBER: "You're not caring for this pet any more.",
  NOT_SIGNED_IN: 'Sign in to use invite codes.',
};

const causeText = (cause: unknown): string => {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  if (cause && typeof cause === 'object') {
    const { message } = cause as Record<string, unknown>;
    return typeof message === 'string' ? message : '';
  }
  return '';
};

/**
 * Maps an RPC failure to user-facing copy. Matches by inclusion rather than
 * equality because Postgres and PostgREST both wrap the message on some paths;
 * anything unrecognised falls through to the generic `errorMessage` so a real
 * bug still shows its details.
 */
export const inviteErrorMessage = (cause: unknown): string => {
  const text = causeText(cause);
  const code = Object.keys(INVITE_ERROR_COPY).find((candidate) => text.includes(candidate));
  if (code) return INVITE_ERROR_COPY[code];
  return errorMessage(cause, 'Could not join that pet.');
};
