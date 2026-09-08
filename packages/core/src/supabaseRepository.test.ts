import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPet } from './domain/pet';
import { withSurveyDefaults } from './domain/macroTargets';
import { configureCore } from './config';
import { SupabaseRepository } from './supabaseRepository';

/**
 * A chainable, thenable stand-in for the supabase-js query builder. Pass-through
 * methods return the builder itself, so any `.from().update().eq().is()` chain
 * type-checks; awaiting the builder resolves the next queued response (an empty
 * success by default), while `single`/`maybeSingle`/`upsert` are plain mocks a
 * test resolves directly. `mockReset` restores each original implementation.
 */
const chain: Record<string, unknown> = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const passThrough = () => vi.fn((..._args: any[]) => chain);
const upsert = vi.fn();
const single = vi.fn();
const maybeSingle = vi.fn();
const update = passThrough();
const insert = passThrough();
const select = passThrough();
const eq = passThrough();
const is = passThrough();
const gt = passThrough();
const order = passThrough();
const limit = passThrough();
const rpc = vi.fn();
const from = vi.fn((_table: string) => chain);
const responses: unknown[] = [];
Object.assign(chain, {
  upsert, update, insert, select, eq, is, gt, order, limit, single, maybeSingle,
  then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(responses.shift() ?? { data: null, error: null }).then(onFulfilled, onRejected),
});
configureCore({
  supabase: {
    from,
    rpc,
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  } as unknown as SupabaseClient,
});

beforeEach(() => {
  for (const fn of [upsert, single, maybeSingle, update, insert, select, eq, is, gt, order, limit, rpc, from]) fn.mockReset();
  responses.length = 0;
});

const petRow = (over: Record<string, unknown> = {}) => ({
  id: 'pet-1',
  user_id: 'user-1',
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

describe('SupabaseRepository.savePet', () => {
  beforeEach(() => upsert.mockReset());

  it('retries without a column the database has not migrated yet', async () => {
    upsert
      .mockResolvedValueOnce({
        error: { code: 'PGRST204', message: "Could not find the 'mind' column of 'pets' in the schema cache" },
      })
      .mockResolvedValueOnce({ error: null });

    await new SupabaseRepository().savePet(createPet('user-1', 'Miso'));

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0][0]).toHaveProperty('mind');
    expect(upsert.mock.calls[1][0]).not.toHaveProperty('mind');
    expect(upsert.mock.calls[1][0]).toHaveProperty('happiness');
  });

  it('drops each missing column in turn rather than giving up after one', async () => {
    upsert
      .mockResolvedValueOnce({
        error: { code: 'PGRST204', message: "Could not find the 'mind' column of 'pets' in the schema cache" },
      })
      .mockResolvedValueOnce({ error: { code: '42703', message: 'column pets.adopted_at does not exist' } })
      .mockResolvedValueOnce({ error: null });

    await new SupabaseRepository().savePet(createPet('user-1', 'Miso'));

    expect(upsert).toHaveBeenCalledTimes(3);
    expect(upsert.mock.calls[2][0]).not.toHaveProperty('mind');
    expect(upsert.mock.calls[2][0]).not.toHaveProperty('adopted_at');
  });

  it('rethrows an error that is not about a missing column', async () => {
    const failure = { code: '23505', message: 'duplicate key value violates unique constraint' };
    upsert.mockResolvedValue({ error: failure });

    await expect(new SupabaseRepository().savePet(createPet('user-1', 'Miso'))).rejects.toBe(failure);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('rounds fractional stats so integer columns never reject the write', async () => {
    upsert.mockResolvedValue({ error: null });
    const pet = { ...createPet('user-1', 'Miso'), energy: 80.44199050925926 };

    await new SupabaseRepository().savePet(pet);

    expect(upsert.mock.calls[0][0].energy).toBe(80);
  });
});

describe('SupabaseRepository.saveProfile', () => {
  beforeEach(() => update.mockReset());

  const profile = withSurveyDefaults({
    age: 30, sex: 'other', heightCm: 170, heightUnit: 'cm', weightKg: 70, weightUnit: 'kg', activity: 'moderate', goal: 'maintain',
  });

  it.each([
    [undefined, null],
    [0, null],
    [150, 150],
  ])('writes a screen-time budget of %s as %s so the 1..1440 check never rejects the row', async (budget, column) => {
    update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

    await new SupabaseRepository().saveProfile({ ...profile, screenTimeBudgetMinutes: budget });

    expect(update.mock.calls[0][0].screen_time_budget_minutes).toBe(column);
  });

  it.each([
    [undefined, null],
    ['', null],
    ['   ', null],
    ['  Alex ', 'Alex'],
  ])('writes a display name of %j as %j', async (displayName, column) => {
    update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

    await new SupabaseRepository().saveProfile({ ...profile, displayName });

    expect(update.mock.calls[0][0].display_name).toBe(column);
  });
});

describe('SupabaseRepository.loadProfile', () => {
  const profileRow = (over: Record<string, unknown> = {}) => ({
    id: 'user-1', age: 30, sex: 'other', height_cm: 170, height_unit: 'cm', weight_kg: 70, weight_unit: 'kg', activity: 'moderate', goal: 'maintain', ...over,
  });

  it('maps a real display name', async () => {
    maybeSingle.mockResolvedValueOnce({ data: profileRow({ display_name: 'Alex' }), error: null });

    expect((await new SupabaseRepository().loadProfile())?.displayName).toBe('Alex');
  });

  it.each([
    ['the sign-up email handle_new_user seeded', 'alex@example.com'],
    ['a blank name', '   '],
    ['no name', null],
  ])('leaves displayName unset for %s', async (_label, stored) => {
    maybeSingle.mockResolvedValueOnce({ data: profileRow({ display_name: stored }), error: null });

    expect((await new SupabaseRepository().loadProfile())?.displayName).toBeUndefined();
  });
});

describe('SupabaseRepository.loadPet', () => {
  beforeEach(() => single.mockReset());

  it('falls back to created_at when adopted_at was stamped by the migration', async () => {
    // The `adopted_at` column was added `not null default now()`, so a pet that
    // predates it carries the migration's run time. Trusting it restarted the
    // dashboard's day count and let the care streak exceed the pet's own age.
    responses.push({ data: [petRow()], error: null });

    const pet = await new SupabaseRepository().loadPet();

    expect(pet?.adoptedAt).toBe('2026-08-28T20:34:03.748Z');
  });

  it('keeps adopted_at when it is the earlier of the two', async () => {
    responses.push({
      data: [petRow({ adopted_at: '2026-08-28T20:34:03.748Z', created_at: '2026-08-29T09:00:00.000Z' })],
      error: null,
    });

    const pet = await new SupabaseRepository().loadPet();

    expect(pet?.adoptedAt).toBe('2026-08-28T20:34:03.748Z');
  });

  it('uses created_at when the adopted_at column has not been migrated in', async () => {
    responses.push({ data: [petRow({ adopted_at: null })], error: null });

    const pet = await new SupabaseRepository().loadPet();

    expect(pet?.adoptedAt).toBe('2026-08-28T20:34:03.748Z');
  });

  it('returns null rather than throwing when the account has no pet', async () => {
    responses.push({ data: [], error: null });

    expect(await new SupabaseRepository().loadPet()).toBeNull();
  });
});

describe('SupabaseRepository.loadPet version', () => {
  it('maps the row version', async () => {
    responses.push({ data: [petRow({ version: 7 })], error: null });

    expect((await new SupabaseRepository().loadPet())?.version).toBe(7);
  });

  it('defaults to 0 on a database without the column', async () => {
    responses.push({ data: [petRow()], error: null });

    expect((await new SupabaseRepository().loadPet())?.version).toBe(0);
  });
});

describe('SupabaseRepository.savePetIfUnchanged', () => {
  const pet = { ...createPet('user-1', 'Miso'), version: 3 };

  it('reports a conflict when no row matched the expected version', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const result = await new SupabaseRepository().savePetIfUnchanged(pet, 3);

    expect(result).toEqual({ status: 'conflict' });
    expect(from).toHaveBeenCalledWith('pets');
    expect(eq).toHaveBeenCalledWith('id', pet.id);
    expect(eq).toHaveBeenCalledWith('version', 3);
    expect(select).toHaveBeenCalledWith('version');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('returns the new version from the row it wrote', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { version: 4 }, error: null });

    expect(await new SupabaseRepository().savePetIfUnchanged(pet, 3)).toEqual({ status: 'saved', version: 4 });
  });

  it('never sends id, user_id or version in the update payload', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { version: 4 }, error: null });

    await new SupabaseRepository().savePetIfUnchanged(pet, 3);

    const payload = update.mock.calls[0][0];
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('user_id');
    expect(payload).not.toHaveProperty('version');
    expect(payload).toHaveProperty('energy');
    expect(payload).toHaveProperty('last_event_at');
  });

  it.each([
    ['PGRST204', "Could not find the 'version' column of 'pets' in the schema cache"],
    ['42703', 'column pets.version does not exist'],
  ])('falls back to the plain upsert on a %s for the version column', async (code, message) => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: { code, message } });
    upsert.mockResolvedValue({ error: null });

    const result = await new SupabaseRepository().savePetIfUnchanged(pet, 3);

    expect(result).toEqual({ status: 'saved', version: 3 });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({ id: pet.id, user_id: 'user-1' });
  });

  it('rethrows any other error', async () => {
    const failure = { code: '42501', message: 'new row violates row-level security policy' };
    maybeSingle.mockResolvedValueOnce({ data: null, error: failure });

    await expect(new SupabaseRepository().savePetIfUnchanged(pet, 3)).rejects.toBe(failure);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('SupabaseRepository.loadPetMembers', () => {
  it('reads through get_pet_members and maps rows to camelCase', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        { user_id: 'user-1', role: 'owner', joined_at: '2026-08-01T00:00:00Z', left_at: null, display_name: null },
        { user_id: 'user-2', role: 'partner', joined_at: '2026-09-01T00:00:00Z', left_at: '2026-09-05T00:00:00Z', display_name: 'Alex' },
      ],
      error: null,
    });

    const members = await new SupabaseRepository().loadPetMembers('pet-1');

    expect(rpc).toHaveBeenCalledWith('get_pet_members', { p_pet_id: 'pet-1' });
    expect(members).toEqual([
      { userId: 'user-1', role: 'owner', joinedAt: '2026-08-01T00:00:00Z', leftAt: undefined, displayName: null },
      { userId: 'user-2', role: 'partner', joinedAt: '2026-09-01T00:00:00Z', leftAt: '2026-09-05T00:00:00Z', displayName: 'Alex' },
    ]);
  });

  it('throws the RPC error (e.g. NOT_A_MEMBER)', async () => {
    const failure = { code: 'P0001', message: 'NOT_A_MEMBER' };
    rpc.mockResolvedValueOnce({ data: null, error: failure });

    await expect(new SupabaseRepository().loadPetMembers('pet-1')).rejects.toBe(failure);
  });
});

describe('SupabaseRepository.loadCareLog', () => {
  it('reads newest first with the default limit and maps rows', async () => {
    responses.push({
      data: [{ id: 'log-1', pet_id: 'pet-1', user_id: 'user-2', type: 'MEAL', occurred_at: '2026-09-07T10:00:00Z' }],
      error: null,
    });

    const log = await new SupabaseRepository().loadCareLog('pet-1');

    expect(from).toHaveBeenCalledWith('pet_care_log');
    expect(eq).toHaveBeenCalledWith('pet_id', 'pet-1');
    expect(order).toHaveBeenCalledWith('occurred_at', { ascending: false });
    expect(limit).toHaveBeenCalledWith(50);
    expect(log).toEqual([{ id: 'log-1', petId: 'pet-1', userId: 'user-2', type: 'MEAL', occurredAt: '2026-09-07T10:00:00Z' }]);
  });

  it('honours an explicit limit', async () => {
    await new SupabaseRepository().loadCareLog('pet-1', 5);

    expect(limit).toHaveBeenCalledWith(5);
  });
});

describe('SupabaseRepository.appendCareLog', () => {
  it('inserts only type and time, never a label or metadata', async () => {
    await new SupabaseRepository().appendCareLog({ petId: 'pet-1', userId: 'user-1', type: 'WORKOUT', occurredAt: '2026-09-07T10:00:00Z' });

    expect(from).toHaveBeenCalledWith('pet_care_log');
    expect(insert.mock.calls[0][0]).toEqual({ pet_id: 'pet-1', user_id: 'user-1', type: 'WORKOUT', occurred_at: '2026-09-07T10:00:00Z' });
  });

  it('throws the insert error so the caller can decide to ignore it', async () => {
    const failure = { code: '42501', message: 'row-level security' };
    responses.push({ data: null, error: failure });

    await expect(new SupabaseRepository().appendCareLog({ petId: 'pet-1', userId: 'user-1', type: 'WORKOUT', occurredAt: '2026-09-07T10:00:00Z' })).rejects.toBe(failure);
  });
});

const inviteRow = (over: Record<string, unknown> = {}) => ({
  id: 'invite-1',
  pet_id: 'pet-1',
  created_by: 'user-1',
  code: 'ABCDEF',
  created_at: '2026-09-07T10:00:00.000Z',
  expires_at: '2026-09-14T10:00:00.000Z',
  redeemed_at: null,
  revoked_at: null,
  ...over,
});

describe('SupabaseRepository.loadOpenInvite', () => {
  it('filters to unredeemed, unrevoked, unexpired and maps the newest', async () => {
    maybeSingle.mockResolvedValueOnce({ data: inviteRow(), error: null });

    const invite = await new SupabaseRepository().loadOpenInvite('pet-1');

    expect(from).toHaveBeenCalledWith('pet_invites');
    expect(eq).toHaveBeenCalledWith('pet_id', 'pet-1');
    expect(is).toHaveBeenCalledWith('redeemed_at', null);
    expect(is).toHaveBeenCalledWith('revoked_at', null);
    expect(gt.mock.calls[0][0]).toBe('expires_at');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(limit).toHaveBeenCalledWith(1);
    expect(invite).toEqual({
      id: 'invite-1', petId: 'pet-1', code: 'ABCDEF', createdAt: '2026-09-07T10:00:00.000Z', expiresAt: '2026-09-14T10:00:00.000Z', redeemedAt: undefined, revokedAt: undefined,
    });
  });

  it('returns null when there is none', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    expect(await new SupabaseRepository().loadOpenInvite('pet-1')).toBeNull();
  });
});

describe('SupabaseRepository.createInvite', () => {
  it('revokes open invites first, then inserts a fresh code for the signed-in owner', async () => {
    single.mockResolvedValueOnce({ data: inviteRow(), error: null });

    const invite = await new SupabaseRepository().createInvite('pet-1');

    expect(update.mock.calls[0][0]).toEqual({ revoked_at: expect.any(String) });
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(insert.mock.invocationCallOrder[0]);
    const payload = insert.mock.calls[0][0];
    expect(payload).toMatchObject({ pet_id: 'pet-1', created_by: 'user-1' });
    expect(payload.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(Date.parse(payload.expires_at) - Date.now()).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(invite.code).toBe('ABCDEF');
  });

  it('retries once with a new code on a unique-violation', async () => {
    single
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "pet_invites_code_idx"' } })
      .mockResolvedValueOnce({ data: inviteRow({ code: 'GHJKLM' }), error: null });

    const invite = await new SupabaseRepository().createInvite('pet-1');

    expect(insert).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(1);
    expect(invite.code).toBe('GHJKLM');
  });

  it('gives up after the second collision', async () => {
    const failure = { code: '23505', message: 'duplicate key value violates unique constraint "pet_invites_code_idx"' };
    single.mockResolvedValue({ data: null, error: failure });

    await expect(new SupabaseRepository().createInvite('pet-1')).rejects.toBe(failure);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it('does not insert when revoking the old invites fails', async () => {
    const failure = { code: '42501', message: 'row-level security' };
    responses.push({ data: null, error: failure });

    await expect(new SupabaseRepository().createInvite('pet-1')).rejects.toBe(failure);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('SupabaseRepository.revokeInvite', () => {
  it('stamps revoked_at on that invite', async () => {
    await new SupabaseRepository().revokeInvite('invite-1');

    expect(from).toHaveBeenCalledWith('pet_invites');
    expect(update.mock.calls[0][0]).toEqual({ revoked_at: expect.any(String) });
    expect(eq).toHaveBeenCalledWith('id', 'invite-1');
  });
});

describe('SupabaseRepository.redeemInvite', () => {
  it('normalises the code, passes confirmLeave and returns the pet id', async () => {
    rpc.mockResolvedValueOnce({ data: 'pet-9', error: null });

    const petId = await new SupabaseRepository().redeemInvite('abc-def', { confirmLeave: true });

    expect(rpc).toHaveBeenCalledWith('redeem_pet_invite', { p_code: 'ABCDEF', p_confirm_leave: true });
    expect(petId).toBe('pet-9');
  });

  it('defaults confirmLeave to false', async () => {
    rpc.mockResolvedValueOnce({ data: 'pet-9', error: null });

    await new SupabaseRepository().redeemInvite('ABCDEF');

    expect(rpc).toHaveBeenCalledWith('redeem_pet_invite', { p_code: 'ABCDEF', p_confirm_leave: false });
  });

  it('throws the RPC error so inviteErrorMessage can map its code', async () => {
    const failure = { code: 'P0001', message: 'HAS_ACTIVE_PET' };
    rpc.mockResolvedValueOnce({ data: null, error: failure });

    await expect(new SupabaseRepository().redeemInvite('ABCDEF')).rejects.toBe(failure);
  });
});

describe('SupabaseRepository.leavePet', () => {
  it('calls leave_pet', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });

    await new SupabaseRepository().leavePet();

    expect(rpc).toHaveBeenCalledWith('leave_pet');
  });

  it('throws the RPC error', async () => {
    const failure = { code: 'P0001', message: 'NOT_SIGNED_IN' };
    rpc.mockResolvedValueOnce({ data: null, error: failure });

    await expect(new SupabaseRepository().leavePet()).rejects.toBe(failure);
  });
});
