/**
 * Friends & Social Pets -- shared types.
 *
 * Mirrors the `friend_requests` table and the minimal, non-owner-facing profile
 * projection returned by the `search_profiles` RPC (see
 * supabase/migrations/*_friends.sql). Keep this file in sync with that migration;
 * it is the interface contract between the backend (Postgres/RLS) and every
 * client (mobile, and web later).
 */

import type { PetState } from './pet';
import type { RecentActivitySignal } from './socialPetStatus';

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';

export interface FriendRequest {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendRequestStatus;
  createdAt: string;
  respondedAt?: string;
}

/**
 * The only profile fields ever shown to someone other than the profile's owner --
 * whether found via username search or displayed next to a friend's pet. Deliberately
 * excludes age/sex/height/weight/activity/goal, which stay owner-only.
 */
export interface FriendProfileSummary {
  id: string;
  username: string;
  displayName: string | null;
}

/**
 * A friend row combines the accepted `friend_requests` record with the other
 * party's minimal profile, resolved client-side from `requesterId`/`addresseeId`
 * plus the viewer's own id -- there is no separate `friendships` table.
 */
export interface Friend {
  requestId: string;
  profile: FriendProfileSummary;
  since: string;
}

/**
 * Everything one row of the friends list needs, in a single batched read
 * (`get_friends_overview` -- one RPC for the whole list, not three per friend).
 *
 * `pet` is the friend's full pet row (already friend-visible via the `pets`
 * RLS policy) or `null` if they have not adopted one. `lastActivity` is the
 * single most recent privacy-safe activity signal (type + time only, last few
 * days) -- enough for the list's status line; the friend-pet detail screen
 * still fetches the fuller history. Feed `pet` + `[lastActivity]` straight into
 * `deriveSocialPetStatus` for the row's location and health read.
 */
export interface FriendOverview {
  friendId: string;
  profile: FriendProfileSummary;
  pet: PetState | null;
  lastActivity: RecentActivitySignal | null;
  /** When the two accounts became friends -- for stable list ordering. */
  friendsSince: string;
}

/**
 * Username format shared by the client-side form check and the database CHECK
 * constraint: lowercase letters, digits, underscore; 3-20 characters. Usernames
 * are stored lower-cased so lookups are case-insensitive without a citext
 * dependency.
 */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export const isValidUsername = (value: string): boolean => USERNAME_PATTERN.test(value);

/**
 * What actually gets stored: trimmed and lower-cased. Typing "Kyle_Li" and
 * "kyle_li" must not create two accounts, so every path -- registration, the
 * friends screen, the availability check -- normalises through here first, and
 * the database's unique index sees one canonical form.
 */
export const normalizeUsername = (value: string): string => value.trim().toLowerCase();

/**
 * Why a candidate cannot be used, or null when it is fine. Shape only -- whether
 * it is already taken is a question for the server.
 */
export const usernameError = (value: string): string | null => {
  const normalized = normalizeUsername(value);
  if (normalized.length === 0) return 'Pick a username so friends can find you.';
  if (normalized.length < 3) return 'Usernames are at least 3 characters.';
  if (normalized.length > 20) return 'Usernames are at most 20 characters.';
  if (!isValidUsername(normalized)) {
    return 'Usernames can use lowercase letters, digits and underscores only.';
  }
  return null;
};
