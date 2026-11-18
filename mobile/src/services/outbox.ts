import AsyncStorage from '@react-native-async-storage/async-storage';
import { isNetworkError, type HealthEvent } from '@vitto/core';
import { isTimeout } from './saveWithRetry';

/**
 * Logs made while the server could not be reached, waiting to be sent.
 *
 * A care moment normally writes the pet on the server first and the event row
 * second, and the user waits on both. Without a connection that wait ended in
 * "Saving timed out" and the log was gone. Now the moment is applied to the pet
 * on the phone at once, and the event is kept here, on the device, until it can
 * be replayed against the server's own copy of the pet (see flushOutbox).
 *
 * Kept per account, so signing in as someone else never sends one person's
 * meals to another's pet.
 */
export interface OutboxEntry {
  event: HealthEvent;
  /**
   * The server's pets already have this moment: the commit landed, only the
   * row is left. Never apply it to the pets a second time.
   */
  petsDone?: boolean;
  /** What the moment granted when it landed on the server, stamped on the row. */
  xpAwarded?: number;
  /** Failed replays that were not a lost connection; given up on after MAX_OUTBOX_ATTEMPTS. */
  attempts?: number;
}

/** A replay the server keeps turning down (not offline) is dropped after this many tries, so it never blocks the queue. */
export const MAX_OUTBOX_ATTEMPTS = 5;

/** How often a non-empty queue tries again while the app is open. */
export const OUTBOX_RETRY_MS = 20_000;

const keyFor = (userId: string) => `vitto.outbox.v1.${userId}`;

/** True for a failure that means "no connection right now", which is worth queueing and retrying. */
export const isOfflineFailure = (cause: unknown): boolean => isNetworkError(cause) || isTimeout(cause);

export const loadOutbox = async (userId: string): Promise<OutboxEntry[]> => {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is OutboxEntry => Boolean(entry?.event?.id))
      : [];
  } catch {
    return [];
  }
};

export const saveOutbox = async (userId: string, entries: readonly OutboxEntry[]): Promise<void> => {
  try {
    if (entries.length === 0) await AsyncStorage.removeItem(keyFor(userId));
    else await AsyncStorage.setItem(keyFor(userId), JSON.stringify(entries));
  } catch {
    // Storage full or unavailable: the log is still on screen and in memory,
    // and is sent with the next flush while the app stays open.
  }
};

export interface OutboxSteps {
  /** The oldest entry still waiting. Read fresh each time: a log can be queued mid-flush. */
  next: () => OutboxEntry | undefined;
  /** Applies the moment to the server's pets; resolves to the xp it granted. */
  applyToPets: (event: HealthEvent) => Promise<number>;
  /** Writes the event row, idempotently (same id). Resolves to the row as stored. */
  saveRow: (event: HealthEvent, xpAwarded: number) => Promise<HealthEvent>;
  /** Persists a changed entry (pets done, or one more failed attempt). */
  update: (entry: OutboxEntry) => Promise<void>;
  /** Removes an entry for good: sent, or given up on. */
  drop: (eventId: string) => Promise<void>;
}

export interface FlushOutcome {
  /** Rows now on the server, as stored. */
  synced: HealthEvent[];
  /** Given up on: the server refused them MAX_OUTBOX_ATTEMPTS times. */
  failed: { event: HealthEvent; cause: unknown }[];
  /** Stopped because the connection is still down; the rest are kept, in order. */
  offline: boolean;
}

/**
 * Sends the queue, oldest first, one at a time: the pets were changed in that
 * order on the phone, and streaks and decay are worked out in order.
 *
 * Each moment is applied to the pets in two steps that are recorded
 * separately, so a flush cut off between them never pays the pet twice: once
 * `petsDone` is saved, a later flush only writes the row.
 */
export const flushOutbox = async (steps: OutboxSteps): Promise<FlushOutcome> => {
  const synced: HealthEvent[] = [];
  const failed: FlushOutcome['failed'] = [];
  for (;;) {
    const entry = steps.next();
    if (!entry) return { synced, failed, offline: false };
    let current = entry;
    try {
      if (!current.petsDone) {
        // eslint-disable-next-line no-await-in-loop
        const xp = await steps.applyToPets(current.event);
        current = { ...current, petsDone: true, xpAwarded: xp };
        // eslint-disable-next-line no-await-in-loop
        await steps.update(current);
      }
      // eslint-disable-next-line no-await-in-loop
      synced.push(await steps.saveRow(current.event, current.xpAwarded ?? 0));
      // eslint-disable-next-line no-await-in-loop
      await steps.drop(current.event.id);
    } catch (cause) {
      if (isOfflineFailure(cause)) return { synced, failed, offline: true };
      const attempts = (current.attempts ?? 0) + 1;
      if (attempts >= MAX_OUTBOX_ATTEMPTS) {
        failed.push({ event: current.event, cause });
        // eslint-disable-next-line no-await-in-loop
        await steps.drop(current.event.id);
      } else {
        // eslint-disable-next-line no-await-in-loop
        await steps.update({ ...current, attempts });
        // Leave the rest in order behind it rather than skipping ahead; try again later.
        return { synced, failed, offline: false };
      }
    }
  }
};
