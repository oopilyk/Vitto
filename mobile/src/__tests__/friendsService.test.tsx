import type { SupabaseClient } from '@supabase/supabase-js';
import { configureCore } from '@vitto/core';
import { FriendsService, mapSetUsernameError, validateUsernameInput } from '../services/friendsService';

/**
 * A chainable, thenable stand-in for the supabase-js query builder -- mirrors
 * the pattern in packages/core/src/supabaseRepository.test.ts. Pass-through
 * methods return the builder itself, so `.from().select().eq().order().limit()`
 * type-checks; awaiting the builder resolves the next queued response (an
 * empty success by default). `rpc` is a separate mock resolved directly.
 */
const chain: Record<string, unknown> = {};
const passThrough = () => jest.fn((..._args: unknown[]) => chain);
const select = passThrough();
const eq = passThrough();
const order = passThrough();
const limit = passThrough();
const rpc = jest.fn();
const from = jest.fn((_table: string) => chain);
const getUser = jest.fn(async () => ({ data: { user: { id: 'me' } } }));
const responses: unknown[] = [];
Object.assign(chain, {
  select,
  eq,
  order,
  limit,
  then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(responses.shift() ?? { data: null, error: null }).then(onFulfilled, onRejected),
});
configureCore({
  supabase: { from, rpc, auth: { getUser } } as unknown as SupabaseClient,
});

beforeEach(() => {
  for (const fn of [select, eq, order, limit, rpc, from, getUser]) fn.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: 'me' } } });
  from.mockImplementation(() => chain);
  select.mockImplementation(() => chain);
  eq.mockImplementation(() => chain);
  order.mockImplementation(() => chain);
  limit.mockImplementation(() => chain);
  responses.length = 0;
});

describe('validateUsernameInput', () => {
  it('lower-cases and trims a valid username', () => {
    expect(validateUsernameInput('  Owen_Akers10  ')).toBe('owen_akers10');
  });

  it('rejects a username that is too short', () => {
    expect(() => validateUsernameInput('ab')).toThrow(
      'Usernames are 3-20 characters: lowercase letters, digits, and underscores only.',
    );
  });

  it('rejects a username with invalid characters even before lower-casing', () => {
    expect(() => validateUsernameInput('owen akers')).toThrow();
    expect(() => validateUsernameInput('owen-akers')).toThrow();
  });

  it('accepts a username that is only valid after lower-casing', () => {
    // Uppercase letters are stripped to lowercase first, so this must pass.
    expect(validateUsernameInput('OWEN')).toBe('owen');
  });
});

describe('mapSetUsernameError', () => {
  it('maps a unique-constraint violation to a friendly message', () => {
    expect(mapSetUsernameError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(
      'That username is taken.',
    );
  });

  it('falls back to the Supabase error message for anything else', () => {
    expect(mapSetUsernameError({ code: '42501', message: 'permission denied' })).toContain('permission denied');
  });

  it('falls back to a generic message when there is nothing else to show', () => {
    expect(mapSetUsernameError(null)).toBe('Could not save your username.');
  });
});

describe('FriendsService.searchUsersByUsername', () => {
  const service = new FriendsService();

  it('returns no results for a query under two characters, without touching Supabase', async () => {
    // The fake client configured above would throw if `rpc` were called without
    // being mocked to resolve -- resolving cleanly proves the short-circuit
    // runs first, before any network call.
    await expect(service.searchUsersByUsername('a')).resolves.toEqual([]);
    await expect(service.searchUsersByUsername('')).resolves.toEqual([]);
    await expect(service.searchUsersByUsername('  a  ')).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('FriendsService.loadFriendRecentActivity', () => {
  const service = new FriendsService();

  it('maps rows to camelCase RecentActivitySignal objects', async () => {
    rpc.mockResolvedValue({
      data: [
        { type: 'WORKOUT', occurred_at: '2026-09-07T10:00:00.000Z' },
        { type: 'MEAL', occurred_at: '2026-09-07T08:00:00.000Z' },
      ],
      error: null,
    });

    const result = await service.loadFriendRecentActivity('friend-1');

    expect(rpc).toHaveBeenCalledWith('get_friend_recent_activity', { friend_id: 'friend-1' });
    expect(result).toEqual([
      { type: 'WORKOUT', occurredAt: '2026-09-07T10:00:00.000Z' },
      { type: 'MEAL', occurredAt: '2026-09-07T08:00:00.000Z' },
    ]);
  });

  it('resolves to an empty array for a friend who has never logged anything, without throwing', async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await expect(service.loadFriendRecentActivity('friend-1')).resolves.toEqual([]);
  });

  it('resolves to an empty array when data comes back null', async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    await expect(service.loadFriendRecentActivity('friend-1')).resolves.toEqual([]);
  });

  it('surfaces an RPC error as a friendly Error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    await expect(service.loadFriendRecentActivity('friend-1')).rejects.toThrow('permission denied');
  });
});

describe('FriendsService.loadFriendsOverview', () => {
  const service = new FriendsService();

  const overviewPetRow = (over: Record<string, unknown> = {}) => ({
    id: 'pet-1',
    user_id: 'friend-1',
    name: 'Blue',
    species: 'cat',
    breed: null,
    level: 4,
    xp: 66,
    health: 51,
    energy: 19,
    happiness: 31,
    nutrition: 27,
    strength: 22,
    pushing_strength: 8,
    pulling_strength: 0,
    leg_strength: 0,
    endurance: 35,
    recovery: 74,
    mind: 3,
    mood: 'hungry',
    last_event_at: null,
    created_at: '2026-08-28T20:34:03.748Z',
    adopted_at: '2026-09-01T19:17:44.627Z',
    ...over,
  });

  it('calls get_friends_overview with no arguments and maps rows to FriendOverview', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          friend_id: 'friend-1',
          username: 'friend_one',
          display_name: 'Friend One',
          pet: overviewPetRow(),
          last_activity_type: 'WORKOUT',
          last_activity_at: '2026-09-07T10:00:00.000Z',
          friends_since: '2026-09-01T00:00:00.000Z',
        },
        {
          friend_id: 'friend-2',
          username: 'friend_two',
          display_name: null,
          pet: null,
          last_activity_type: null,
          last_activity_at: null,
          friends_since: '2026-09-02T00:00:00.000Z',
        },
      ],
      error: null,
    });

    const result = await service.loadFriendsOverview();

    expect(rpc).toHaveBeenCalledWith('get_friends_overview');
    expect(result).toHaveLength(2);

    expect(result[0].friendId).toBe('friend-1');
    expect(result[0].profile).toEqual({ id: 'friend-1', username: 'friend_one', displayName: 'Friend One' });
    expect(result[0].pet?.userId).toBe('friend-1');
    expect(result[0].pet?.pushingStrength).toBe(8);
    expect(result[0].lastActivity).toEqual({ type: 'WORKOUT', occurredAt: '2026-09-07T10:00:00.000Z' });
    expect(result[0].friendsSince).toBe('2026-09-01T00:00:00.000Z');

    // The pet-less friend maps to `pet: null` and `lastActivity: null` rather
    // than a half-formed object.
    expect(result[1].pet).toBeNull();
    expect(result[1].lastActivity).toBeNull();
    expect(result[1].profile.username).toBe('friend_two');
  });

  it('drops a half-formed activity signal (type without timestamp, or vice versa)', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          friend_id: 'friend-1',
          username: 'friend_one',
          display_name: null,
          pet: null,
          last_activity_type: 'MEAL',
          last_activity_at: null,
          friends_since: '2026-09-01T00:00:00.000Z',
        },
      ],
      error: null,
    });

    const [friend] = await service.loadFriendsOverview();
    expect(friend.lastActivity).toBeNull();
  });

  it('resolves to an empty array when data comes back null', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(service.loadFriendsOverview()).resolves.toEqual([]);
  });

  it('surfaces an RPC error as a friendly Error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(service.loadFriendsOverview()).rejects.toThrow('permission denied');
  });

  it('falls back to the per-friend RPCs when get_friends_overview is not deployed yet (PGRST202)', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'get_friends_overview') {
        return Promise.resolve({
          data: null,
          error: { code: 'PGRST202', message: 'Could not find the function ... in the schema cache' },
        });
      }
      if (name === 'get_friend_profile') {
        return Promise.resolve({
          data: [{ id: 'friend-1', username: 'friend_one', display_name: 'Friend One' }],
          error: null,
        });
      }
      if (name === 'get_friend_recent_activity') {
        return Promise.resolve({
          data: [{ type: 'MEAL', occurred_at: '2026-09-07T10:00:00.000Z' }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    // loadMyFriendRequests (friend_requests select), then loadFriendPet (pets select).
    responses.push(
      {
        data: [
          {
            id: 'req-1',
            requester_id: 'me',
            addressee_id: 'friend-1',
            status: 'accepted',
            created_at: '2026-09-01T00:00:00.000Z',
            responded_at: '2026-09-02T00:00:00.000Z',
          },
        ],
        error: null,
      },
      { data: [overviewPetRow()], error: null },
    );

    const result = await service.loadFriendsOverview();

    expect(rpc).toHaveBeenCalledWith('get_friends_overview');
    expect(result).toEqual([
      {
        friendId: 'friend-1',
        profile: { id: 'friend-1', username: 'friend_one', displayName: 'Friend One' },
        pet: expect.objectContaining({ userId: 'friend-1', pushingStrength: 8 }),
        lastActivity: { type: 'MEAL', occurredAt: '2026-09-07T10:00:00.000Z' },
        friendsSince: '2026-09-02T00:00:00.000Z',
      },
    ]);
  });
});

describe('FriendsService.loadFriendPet', () => {
  const service = new FriendsService();

  const petRow = (over: Record<string, unknown> = {}) => ({
    id: 'pet-1',
    user_id: 'friend-1',
    name: 'Blue',
    species: 'cat',
    breed: null,
    level: 4,
    xp: 66,
    health: 51,
    energy: 19,
    happiness: 31,
    nutrition: 27,
    strength: 22,
    pushing_strength: 8,
    pulling_strength: 0,
    leg_strength: 0,
    endurance: 35,
    recovery: 74,
    mind: 3,
    mood: 'hungry',
    last_event_at: null,
    created_at: '2026-08-28T20:34:03.748Z',
    adopted_at: '2026-09-01T19:17:44.627Z',
    ...over,
  });

  it('returns null when the friend has no pet', async () => {
    responses.push({ data: [], error: null });

    await expect(service.loadFriendPet('friend-1')).resolves.toBeNull();
  });

  it('maps a single pet row to a PetState', async () => {
    responses.push({ data: [petRow()], error: null });

    const result = await service.loadFriendPet('friend-1');

    expect(result?.id).toBe('pet-1');
    expect(result?.userId).toBe('friend-1');
    expect(result?.pushingStrength).toBe(8);
  });

  // Regression test: since 20260907140000_two_pets_per_user.sql, one user_id can
  // legitimately own two `pets` rows (leave a shared pet, then adopt a new one).
  // `.maybeSingle()` used to throw when the friends-view RLS policy matched more
  // than one row; this asserts the fix picks the more-recently-created pet
  // instead of throwing.
  it('resolves with the more-recently-created pet rather than throwing when a friend has two pets', async () => {
    responses.push({
      data: [
        petRow({ id: 'pet-new', created_at: '2026-09-05T00:00:00.000Z' }),
        petRow({ id: 'pet-old', created_at: '2026-08-01T00:00:00.000Z' }),
      ],
      error: null,
    });

    const result = await service.loadFriendPet('friend-1');

    expect(result?.id).toBe('pet-new');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(limit).toHaveBeenCalledWith(1);
  });

  it('surfaces a query error as a friendly Error', async () => {
    responses.push({ data: null, error: { message: 'permission denied' } });

    await expect(service.loadFriendPet('friend-1')).rejects.toThrow('permission denied');
  });
});
