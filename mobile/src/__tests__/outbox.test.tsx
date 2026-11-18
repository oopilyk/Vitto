import type { HealthEvent } from '@vitto/core';
import { flushOutbox, MAX_OUTBOX_ATTEMPTS, type OutboxEntry, type OutboxSteps } from '../services/outbox';

const meal = (id: string): HealthEvent =>
  ({ id, userId: 'u', type: 'MEAL', occurredAt: '2026-11-17T12:00:00Z', source: 'manual', metadata: {} }) as HealthEvent;

/** A queue in memory, with the steps recorded in the order they ran. */
const harness = (initial: OutboxEntry[], overrides: Partial<OutboxSteps> = {}) => {
  let queue = [...initial];
  const calls: string[] = [];
  const steps: OutboxSteps = {
    next: () => queue[0],
    applyToPets: async (event) => {
      calls.push(`pets:${event.id}`);
      return 10;
    },
    saveRow: async (event, xp) => {
      calls.push(`row:${event.id}:${xp}`);
      return event;
    },
    update: async (entry) => {
      queue = queue.map((queued) => (queued.event.id === entry.event.id ? entry : queued));
    },
    drop: async (id) => {
      queue = queue.filter((queued) => queued.event.id !== id);
    },
    ...overrides,
  };
  return { steps, calls, queue: () => queue };
};

describe('flushOutbox', () => {
  it('sends the queue oldest first, pets before each row', async () => {
    const run = harness([{ event: meal('a') }, { event: meal('b') }]);
    const outcome = await flushOutbox(run.steps);
    expect(run.calls).toEqual(['pets:a', 'row:a:10', 'pets:b', 'row:b:10']);
    expect(outcome.synced.map((event) => event.id)).toEqual(['a', 'b']);
    expect(run.queue()).toEqual([]);
  });

  it('never pays the pet again for a moment it already has: only the row is sent', async () => {
    const run = harness([{ event: meal('a'), petsDone: true, xpAwarded: 7 }]);
    await flushOutbox(run.steps);
    expect(run.calls).toEqual(['row:a:7']);
  });

  it('stops while still offline and keeps the rest in order, remembering the pet already has it', async () => {
    const run = harness([{ event: meal('a') }, { event: meal('b') }], {
      saveRow: async () => {
        throw new Error('Network request failed');
      },
    });
    const outcome = await flushOutbox(run.steps);
    expect(outcome.offline).toBe(true);
    expect(run.queue().map((entry) => entry.event.id)).toEqual(['a', 'b']);
    // Cut off between the two steps: the next flush must only send the row.
    expect(run.queue()[0]).toMatchObject({ petsDone: true, xpAwarded: 10 });
  });

  it('treats a timeout as offline too', async () => {
    const run = harness([{ event: meal('a') }], {
      applyToPets: async () => {
        throw new Error('Saving timed out. Check your connection.');
      },
    });
    expect((await flushOutbox(run.steps)).offline).toBe(true);
    expect(run.queue()[0]).toEqual({ event: meal('a') });
  });

  it('retries a refused log later, then gives up on it so it never blocks the queue', async () => {
    const refused = Object.assign(new Error('new row violates row-level security policy'), { code: '42501' });
    const run = harness([{ event: meal('a') }, { event: meal('b') }], {
      applyToPets: async (event) => {
        if (event.id === 'a') throw refused;
        return 3;
      },
    });
    for (let attempt = 1; attempt < MAX_OUTBOX_ATTEMPTS; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const outcome = await flushOutbox(run.steps);
      expect(outcome.failed).toEqual([]);
      expect(run.queue()[0]).toMatchObject({ attempts: attempt });
    }
    const last = await flushOutbox(run.steps);
    expect(last.failed.map((failure) => failure.event.id)).toEqual(['a']);
    expect(last.synced.map((event) => event.id)).toEqual(['b']);
    expect(run.queue()).toEqual([]);
  });

  it('picks up a log queued while it was already sending', async () => {
    const queue: OutboxEntry[] = [{ event: meal('a') }];
    const sent: string[] = [];
    await flushOutbox({
      next: () => queue[0],
      applyToPets: async (event) => {
        // Logged offline while "a" was on its way.
        if (event.id === 'a') queue.push({ event: meal('b') });
        return 1;
      },
      saveRow: async (event) => {
        sent.push(event.id);
        return event;
      },
      update: async (entry) => {
        queue.splice(queue.findIndex((queued) => queued.event.id === entry.event.id), 1, entry);
      },
      drop: async (id) => {
        queue.splice(queue.findIndex((queued) => queued.event.id === id), 1);
      },
    });
    expect(sent).toEqual(['a', 'b']);
    expect(queue).toEqual([]);
  });
});
