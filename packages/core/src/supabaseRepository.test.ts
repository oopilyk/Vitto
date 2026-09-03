import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPet } from './domain/pet';
import { configureCore } from './config';
import { SupabaseRepository } from './supabaseRepository';

const upsert = vi.fn();
const single = vi.fn();
configureCore({
  supabase: { from: () => ({ upsert, select: () => ({ single }) }) } as unknown as SupabaseClient,
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

describe('SupabaseRepository.loadPet', () => {
  beforeEach(() => single.mockReset());

  it('falls back to created_at when adopted_at was stamped by the migration', async () => {
    // The `adopted_at` column was added `not null default now()`, so a pet that
    // predates it carries the migration's run time. Trusting it restarted the
    // dashboard's day count and let the care streak exceed the pet's own age.
    single.mockResolvedValueOnce({ data: petRow(), error: null });

    const pet = await new SupabaseRepository().loadPet();

    expect(pet?.adoptedAt).toBe('2026-08-28T20:34:03.748Z');
  });

  it('keeps adopted_at when it is the earlier of the two', async () => {
    single.mockResolvedValueOnce({
      data: petRow({ adopted_at: '2026-08-28T20:34:03.748Z', created_at: '2026-08-29T09:00:00.000Z' }),
      error: null,
    });

    const pet = await new SupabaseRepository().loadPet();

    expect(pet?.adoptedAt).toBe('2026-08-28T20:34:03.748Z');
  });

  it('uses created_at when the adopted_at column has not been migrated in', async () => {
    single.mockResolvedValueOnce({ data: petRow({ adopted_at: null }), error: null });

    const pet = await new SupabaseRepository().loadPet();

    expect(pet?.adoptedAt).toBe('2026-08-28T20:34:03.748Z');
  });

  it('returns null rather than throwing when the account has no pet', async () => {
    single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

    expect(await new SupabaseRepository().loadPet()).toBeNull();
  });
});
