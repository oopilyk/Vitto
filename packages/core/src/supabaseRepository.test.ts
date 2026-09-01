import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPet } from './domain/pet';
import { configureCore } from './config';
import { SupabaseRepository } from './supabaseRepository';

const upsert = vi.fn();
configureCore({ supabase: { from: () => ({ upsert }) } as unknown as SupabaseClient });

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
