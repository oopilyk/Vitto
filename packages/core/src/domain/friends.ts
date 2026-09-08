/**
 * Friends & Social Pets -- shared types.
 *
 * Mirrors the `friend_requests` table and the minimal, non-owner-facing profile
 * projection returned by the `search_profiles` RPC (see
 * supabase/migrations/*_friends.sql). Keep this file in sync with that migration;
 * it is the interface contract between the backend (Postgres/RLS) and every
 * client (mobile, and web later).
 */

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
 * Username format shared by the client-side form check and the database CHECK
 * constraint: lowercase letters, digits, underscore; 3-20 characters. Usernames
 * are stored lower-cased so lookups are case-insensitive without a citext
 * dependency.
 */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export const isValidUsername = (value: string): boolean => USERNAME_PATTERN.test(value);
