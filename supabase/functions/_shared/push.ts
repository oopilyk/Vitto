/**
 * Sending to Expo's push service.
 *
 * Expo sits between this function and APNs/FCM, so there are no Apple
 * certificates or Firebase keys anywhere in this project — the device hands the
 * app an Expo token, the app stores it, and this posts to one HTTPS endpoint.
 *
 * The important part is the receipt handling. A token stops working the moment
 * somebody deletes the app, and Expo says so with `DeviceNotRegistered`. Left
 * alone those rows accumulate and every later send wastes a slot on a phone
 * that will never answer, so the caller is told which tokens to drop.
 */

const ENDPOINT = 'https://exp.host/--/api/v2/push/send';
/** Expo's documented ceiling for one request. */
const CHUNK = 100;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** Read by the app when the notification is tapped, to open the right screen. */
  data?: Record<string, unknown>;
}

interface Ticket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

export interface PushOutcome {
  sent: number;
  failed: number;
  /** Tokens Expo says are dead. Delete these rows. */
  invalidTokens: string[];
}

const chunked = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export const sendPush = async (messages: readonly PushMessage[]): Promise<PushOutcome> => {
  const outcome: PushOutcome = { sent: 0, failed: 0, invalidTokens: [] };
  if (messages.length === 0) return outcome;

  for (const batch of chunked(messages, CHUNK)) {
    let tickets: Ticket[];
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch.map((m) => ({ ...m, sound: 'default', priority: 'normal' }))),
      });
      if (!response.ok) {
        console.error(`[push] expo returned ${response.status}`);
        outcome.failed += batch.length;
        continue;
      }
      tickets = (await response.json())?.data ?? [];
    } catch (error) {
      // A push nobody receives must never fail the job that sent it.
      console.error('[push] send failed', error instanceof Error ? error.message : error);
      outcome.failed += batch.length;
      continue;
    }

    batch.forEach((message, i) => {
      const ticket = tickets[i];
      if (ticket?.status === 'ok') {
        outcome.sent += 1;
        return;
      }
      outcome.failed += 1;
      if (ticket?.details?.error === 'DeviceNotRegistered') outcome.invalidTokens.push(message.to);
      else if (ticket) console.error(`[push] ${ticket.details?.error ?? 'error'}: ${ticket.message ?? ''}`);
    });
  }
  return outcome;
};

/** Expo's own format check, so an obviously bad token never reaches the table. */
export const isExpoPushToken = (token: unknown): token is string =>
  typeof token === 'string' && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
