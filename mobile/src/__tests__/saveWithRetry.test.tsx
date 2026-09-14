import { saveWithRetry } from '../services/saveWithRetry';

const noDelay = async () => {};

describe('saveWithRetry', () => {
  it('returns on the first success without waiting', async () => {
    const delays: number[] = [];
    let calls = 0;
    await saveWithRetry(async () => { calls += 1; }, { delay: async (ms) => { delays.push(ms); } });
    expect(calls).toBe(1);
    expect(delays).toEqual([]);
  });

  it('retries a transport failure and a timeout, then succeeds', async () => {
    const failures = [new TypeError('Failed to fetch'), new Error('Saving timed out. Check your connection.')];
    let calls = 0;
    await saveWithRetry(async () => {
      calls += 1;
      const next = failures.shift();
      if (next) throw next;
    }, { delay: noDelay });
    expect(calls).toBe(3);
  });

  it('treats a duplicate key on a retry as the earlier attempt having landed', async () => {
    let calls = 0;
    await expect(saveWithRetry(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('Failed to fetch');
      throw { code: '23505', message: 'duplicate key value violates unique constraint' };
    }, { delay: noDelay })).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });

  it('gives up after the last delay and rethrows the final failure', async () => {
    let calls = 0;
    await expect(saveWithRetry(async () => {
      calls += 1;
      throw new TypeError('Failed to fetch');
    }, { delay: noDelay })).rejects.toThrow('Failed to fetch');
    expect(calls).toBe(3);
  });

  it('does not retry a real rejection', async () => {
    let calls = 0;
    await expect(saveWithRetry(async () => {
      calls += 1;
      throw { code: '42501', message: 'new row violates row-level security policy' };
    }, { delay: noDelay })).rejects.toMatchObject({ code: '42501' });
    expect(calls).toBe(1);
  });
});
