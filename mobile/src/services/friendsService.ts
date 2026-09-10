import {
  type FriendOverview,
  type FriendProfileSummary,
  type FriendRequest,
  type FriendRequestStatus,
  type PetState,
  type RecentActivitySignal,
  errorMessage,
  isValidUsername,
  newId,
  otherPartyId,
  partitionFriendRequests,
  requireSupabase,
} from '@vitto/core';

/**
 * Friends & Social Pets -- client-side repository.
 *
 * Kept mobile-only (rather than alongside `SupabaseRepository` in
 * `packages/core/src/supabaseRepository.ts`) because the web app has no use for
 * it yet and every method here is a thin, near-literal pass-through to a single
 * Supabase call -- there is no shared pure logic worth lifting into `packages/core`
 * beyond the state-machine helpers already in `domain/friendRequests.ts`. If web
 * grows a friends surface later, this is the file to promote.
 *
 * Every method throws a plain `Error` with a user-friendly `message` on failure
 * (via `errorMessage`/`mapSetUsernameError`) -- callers show `cause.message`
 * directly rather than re-deriving it.
 */

type FriendRequestRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendRequestStatus;
  created_at: string;
  responded_at: string | null;
};

const toFriendRequest = (row: FriendRequestRow): FriendRequest => ({
  id: row.id,
  requesterId: row.requester_id,
  addresseeId: row.addressee_id,
  status: row.status,
  createdAt: row.created_at,
  respondedAt: row.responded_at ?? undefined,
});

type ProfileSummaryRow = { id: string; username: string | null; display_name: string | null };

const toProfileSummary = (row: ProfileSummaryRow): FriendProfileSummary => ({
  id: row.id,
  username: row.username ?? '',
  displayName: row.display_name,
});

type RecentActivityRow = { type: RecentActivitySignal['type']; occurred_at: string };

const toRecentActivitySignal = (row: RecentActivityRow): RecentActivitySignal => ({
  type: row.type,
  occurredAt: row.occurred_at,
});

/**
 * The `pets` row shape a friend's pet comes back as. Deliberately not imported
 * from `supabaseRepository.ts` -- that file's `PetRow` is a private, unexported
 * type, and this task's scope keeps that file untouched. A little duplication
 * of the snake_case/camelCase mapping is the price of that boundary.
 */
type FriendPetRow = Omit<
  PetState,
  'userId' | 'lastEventAt' | 'pushingStrength' | 'pullingStrength' | 'legStrength' | 'mind' | 'adoptedAt'
> & {
  user_id: string;
  last_event_at: string | null;
  pushing_strength: number;
  pulling_strength: number;
  leg_strength: number;
  mind: number | null;
  adopted_at: string | null;
  created_at: string | null;
};

const toPetState = (row: FriendPetRow): PetState => ({
  ...row,
  userId: row.user_id,
  lastEventAt: row.last_event_at ?? undefined,
  pushingStrength: row.pushing_strength,
  pullingStrength: row.pulling_strength,
  legStrength: row.leg_strength,
  mind: row.mind ?? 20,
  breed: row.breed ?? undefined,
  // Read-only display of a friend's pet has no need for the exact adoption-date
  // repair `SupabaseRepository.loadPet` does for the owner's own pet -- falling
  // back to `created_at`, then now, is close enough for a view a friend cannot
  // edit anyway.
  adoptedAt: row.adopted_at ?? row.created_at ?? new Date().toISOString(),
});

/**
 * One row of `get_friends_overview` -- the whole friends list in a single RPC,
 * rather than N per-friend round trips. `pet` is a raw `pets` row (snake_case
 * JSON) that `toPetState` already knows how to map, or `null` for a friend who
 * has not adopted one.
 */
type FriendsOverviewRow = {
  friend_id: string;
  username: string | null;
  display_name: string | null;
  pet: FriendPetRow | null;
  last_activity_type: RecentActivitySignal['type'] | null;
  last_activity_at: string | null;
  friends_since: string;
};

const toFriendOverview = (row: FriendsOverviewRow): FriendOverview => ({
  friendId: row.friend_id,
  profile: {
    id: row.friend_id,
    username: row.username ?? '',
    displayName: row.display_name,
  },
  pet: row.pet ? toPetState(row.pet) : null,
  // Both halves must be present to count as a signal -- a type with no
  // timestamp (or vice versa) is dropped rather than passed on half-formed.
  lastActivity:
    row.last_activity_type && row.last_activity_at
      ? { type: row.last_activity_type, occurredAt: row.last_activity_at }
      : null,
  friendsSince: row.friends_since,
});

/**
 * Postgres reports a unique-constraint violation as `23505` -- see the
 * `missingColumn` comment in `packages/core/src/supabaseRepository.ts` for the
 * sibling pattern of matching on Supabase's error shape.
 *
 * SECURITY NOTE (accepted, in-scope): surfacing "taken" on a 23505 here is a
 * broader username-existence oracle than `search_profiles` (no 2-char minimum,
 * no self-exclusion, no prefix-only match -- an attacker can confirm any exact
 * candidate username exists by trying to claim it). This app already treats
 * username-existence-via-search as acceptable, in-scope exposure (usernames
 * are meant to be discoverable, that's the point of "add a friend by
 * username"); this is incremental, not novel. Not treated as a defect.
 */
const UNIQUE_VIOLATION = '23505';

/**
 * PostgREST returns `PGRST202` when an RPC target is not in the schema cache --
 * which is what a not-yet-applied migration looks like from the client. Used to
 * fall back to an older code path rather than surfacing a raw error.
 */
const isMissingFunction = (error: { code?: string; message?: string } | null): boolean =>
  error?.code === 'PGRST202' || /schema cache/i.test(error?.message ?? '');

export const mapSetUsernameError = (error: { code?: string; message?: string } | null): string => {
  if (error?.code === UNIQUE_VIOLATION) return 'That username is taken.';
  return errorMessage(error, 'Could not save your username.');
};

/** Fails fast, client-side, before any network call -- see `setMyUsername`. */
export const validateUsernameInput = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!isValidUsername(normalized)) {
    throw new Error('Usernames are 3-20 characters: lowercase letters, digits, and underscores only.');
  }
  return normalized;
};

/** The RPC requires at least 2 characters; shorter queries are treated as no search. */
const MIN_SEARCH_LENGTH = 2;

export class FriendsService {
  /** Empty below `MIN_SEARCH_LENGTH`, without ever reaching the network. */
  async searchUsersByUsername(query: string): Promise<FriendProfileSummary[]> {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length < MIN_SEARCH_LENGTH) return [];

    const client = requireSupabase();
    const { data, error } = await client.rpc('search_profiles', { search_query: trimmed });
    if (error) throw new Error(errorMessage(error, 'Could not search for that username.'));
    return ((data ?? []) as ProfileSummaryRow[]).map(toProfileSummary);
  }

  async sendFriendRequest(addresseeId: string): Promise<FriendRequest> {
    const client = requireSupabase();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) throw new Error('Sign in before adding friends.');

    const row = {
      id: newId(),
      requester_id: user.id,
      addressee_id: addresseeId,
      status: 'pending' as const,
      created_at: new Date().toISOString(),
      responded_at: null,
    };
    const { data, error } = await client.from('friend_requests').insert(row).select().single();
    if (error) throw new Error(errorMessage(error, 'Could not send that friend request.'));
    return toFriendRequest(data as FriendRequestRow);
  }

  async acceptFriendRequest(requestId: string): Promise<void> {
    const client = requireSupabase();
    const { error } = await client
      .from('friend_requests')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', requestId);
    if (error) throw new Error(errorMessage(error, 'Could not accept that friend request.'));
  }

  async declineFriendRequest(requestId: string): Promise<void> {
    const client = requireSupabase();
    const { error } = await client
      .from('friend_requests')
      .update({ status: 'declined', responded_at: new Date().toISOString() })
      .eq('id', requestId);
    if (error) throw new Error(errorMessage(error, 'Could not decline that friend request.'));
  }

  /** Deletes the row -- covers both cancelling a pending outgoing request and
   * unfriending an accepted one; RLS allows either party to delete either state. */
  async cancelOrUnfriend(requestId: string): Promise<void> {
    const client = requireSupabase();
    const { error } = await client.from('friend_requests').delete().eq('id', requestId);
    if (error) throw new Error(errorMessage(error, 'Could not remove that friend request.'));
  }

  /**
   * The accepted-friends list, batched: one `get_friends_overview` call returns
   * every friend's minimal profile, current pet row, and single most-recent
   * privacy-safe activity signal. Feed a row's `pet` + `[lastActivity]` straight
   * into `deriveSocialPetStatus` for its location/health line. Incoming and
   * outgoing requests still come from `loadMyFriendRequests` -- this RPC is
   * accepted friendships only.
   *
   * Falls back to composing the same shape from the older per-friend RPCs when
   * `get_friends_overview` is not in the database yet (its migration
   * unapplied) -- PostgREST answers that with `PGRST202`. The fallback is 3N
   * round trips instead of one, but it keeps the friends screen working the
   * moment the app ships, before the migration is pushed.
   */
  async loadFriendsOverview(): Promise<FriendOverview[]> {
    const client = requireSupabase();
    const { data, error } = await client.rpc('get_friends_overview');
    if (error) {
      if (isMissingFunction(error)) return this.loadFriendsOverviewPerFriend();
      throw new Error(errorMessage(error, 'Could not load your friends.'));
    }
    return ((data ?? []) as FriendsOverviewRow[]).map(toFriendOverview);
  }

  /** Pre-`get_friends_overview` path: one `FriendOverview` per accepted friend,
   *  assembled from the RPCs that already exist. */
  private async loadFriendsOverviewPerFriend(): Promise<FriendOverview[]> {
    const client = requireSupabase();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) throw new Error('Sign in to see your friends.');

    const requests = await this.loadMyFriendRequests();
    const { accepted } = partitionFriendRequests(requests, user.id);

    return Promise.all(
      accepted.map(async (request) => {
        const friendId = otherPartyId(request, user.id);
        const [profile, pet, signals] = await Promise.all([
          this.loadFriendProfile(friendId),
          this.loadFriendPet(friendId),
          this.loadFriendRecentActivity(friendId).catch(() => [] as RecentActivitySignal[]),
        ]);
        return {
          friendId,
          profile: profile ?? { id: friendId, username: '', displayName: null },
          pet,
          lastActivity: signals[0] ?? null,
          friendsSince: request.respondedAt ?? request.createdAt,
        };
      }),
    );
  }

  async loadMyFriendRequests(): Promise<FriendRequest[]> {
    const client = requireSupabase();
    const { data, error } = await client.from('friend_requests').select('*');
    if (error) throw new Error(errorMessage(error, 'Could not load your friends.'));
    return ((data ?? []) as FriendRequestRow[]).map(toFriendRequest);
  }

  /**
   * Since the two-pets-per-user migration (20260907140000), one `user_id` can
   * legitimately own two `pets` rows: a user can leave a pet they created --
   * that's a `pet_members` departure, not a `pets` row delete, so the old row
   * and its `user_id` persist -- and then adopt a new one. `.maybeSingle()`
   * would throw if the friends-view RLS policy matches more than one row for
   * that `user_id`, so this orders by `created_at` (most recent first) and
   * takes the first row instead of asserting exactly one exists.
   */
  async loadFriendPet(friendUserId: string): Promise<PetState | null> {
    const client = requireSupabase();
    const { data, error } = await client
      .from('pets')
      .select('*')
      .eq('user_id', friendUserId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(errorMessage(error, "Could not load your friend's pet."));
    const rows = (data ?? []) as FriendPetRow[];
    return rows.length > 0 ? toPetState(rows[0]) : null;
  }

  /**
   * Calls `get_friend_recent_activity`, the same privacy-limited pattern as
   * `get_friend_profile`: SECURITY DEFINER, projects only `type`/`occurred_at`
   * (never `health_events.metadata`), and returns nothing unless the two users
   * are already accepted friends. Safe to call for a friend who has never
   * logged anything -- the RPC returns an empty set, not an error.
   */
  async loadFriendRecentActivity(friendUserId: string): Promise<RecentActivitySignal[]> {
    const client = requireSupabase();
    const { data, error } = await client.rpc('get_friend_recent_activity', { friend_id: friendUserId });
    if (error) throw new Error(errorMessage(error, "Could not load your friend's activity."));
    return ((data ?? []) as RecentActivityRow[]).map(toRecentActivitySignal);
  }

  /**
   * Calls `get_friend_profile`, not `.from('profiles').select(...)` -- `profiles`
   * carries no friend-facing SELECT policy at all (RLS gates rows, not columns,
   * so a row-level policy there would let a raw `select *` return age/sex/
   * height/weight/activity/goal too). The RPC is SECURITY DEFINER and projects
   * only id/username/display_name, and returns nothing unless the two users are
   * already accepted friends.
   */
  async loadFriendProfile(friendUserId: string): Promise<FriendProfileSummary | null> {
    const client = requireSupabase();
    const { data, error } = await client.rpc('get_friend_profile', { friend_id: friendUserId });
    if (error) throw new Error(errorMessage(error, "Could not load your friend's profile."));
    const rows = (data ?? []) as ProfileSummaryRow[];
    return rows.length > 0 ? toProfileSummary(rows[0]) : null;
  }

  /**
   * Not part of the plan's method list, but needed to drive the one-time
   * username-onboarding prompt: whether the signed-in user has already chosen a
   * username, without pulling in the rest of their (owner-only) profile fields.
   */
  async getMyUsername(): Promise<string | null> {
    const client = requireSupabase();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return null;
    const { data, error } = await client
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw new Error(errorMessage(error, 'Could not load your username.'));
    return (data as { username: string | null } | null)?.username ?? null;
  }

  async setMyUsername(username: string): Promise<void> {
    const normalized = validateUsernameInput(username);
    const client = requireSupabase();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) throw new Error('Sign in before choosing a username.');

    const { error } = await client.from('profiles').update({ username: normalized }).eq('id', user.id);
    if (error) throw new Error(mapSetUsernameError(error));
  }
}

export const friendsService = new FriendsService();
