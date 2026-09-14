import { isNetworkError } from '@vitto/core';

/** Postgres unique_violation: the row is already there, so the write did land. */
const DUPLICATE_KEY = '23505';

const isDuplicateKey = (cause: unknown): boolean =>
  Boolean(cause) && typeof cause === 'object' && (cause as { code?: unknown }).code === DUPLICATE_KEY;

/** Backoff between attempts. Short: the user is looking at a spinner. */
export const RETRY_DELAYS_MS: readonly number[] = [600, 1800];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs an idempotent write again after a transport failure or a timeout.
 *
 * Why this exists: a care moment writes the pet first (versioned, under its
 * own conflict retry) and the event row second. If the event insert dies on
 * the way — a gateway 504, a dropped connection — the pet already has its XP,
 * and the only thing left is to get that one row in. Bubbling the failure up
 * instead makes the user tap "Save" again, which re-runs the whole moment and
 * pays the pet twice. So the row is retried here, with its own id, before
 * anyone is asked.
 *
 * Only transport-level failures are retried; a real rejection (RLS, a bad
 * payload) is final on the first answer. A duplicate-key error on a retry means
 * the earlier attempt did land and only the response was lost — that is a
 * success.
 */
export const saveWithRetry = async (
  attempt: () => Promise<void>,
  {
    shouldRetry = (cause: unknown) => isNetworkError(cause) || isTimeout(cause),
    delays = RETRY_DELAYS_MS,
    delay = wait,
  }: {
    shouldRetry?: (cause: unknown) => boolean;
    delays?: readonly number[];
    delay?: (ms: number) => Promise<void>;
  } = {},
): Promise<void> => {
  for (let index = 0; ; index += 1) {
    try {
      await attempt();
      return;
    } catch (cause) {
      if (index > 0 && isDuplicateKey(cause)) return;
      if (index >= delays.length || !shouldRetry(cause)) throw cause;
      await delay(delays[index]!);
    }
  }
};

/** The message `withTimeout` in App rejects with — recognised by wording, since it is a plain Error. */
export const isTimeout = (cause: unknown): boolean =>
  cause instanceof Error && /timed out/i.test(cause.message);
