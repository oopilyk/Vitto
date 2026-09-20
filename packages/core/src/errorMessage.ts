/**
 * What a `fetch` says when it never got a response at all: offline, DNS, a
 * gateway that dropped the connection, or a CORS-less error page (a 504 from a
 * proxy carries no CORS headers, so the browser reports it as a failed fetch).
 * Browsers and React Native each have their own wording.
 */
const NETWORK_FAILURE = /^(failed to fetch|network request failed|load failed|networkerror)/i;

export const NETWORK_ERROR_MESSAGE = 'Could not reach the server. Check your connection and try again.';

/** True for the raw transport failures a user should never see verbatim. */
export const isNetworkError = (cause: unknown): boolean => {
  const message =
    cause instanceof Error
      ? cause.message
      : cause && typeof cause === 'object'
        ? (cause as { message?: unknown }).message
        : cause;
  return typeof message === 'string' && NETWORK_FAILURE.test(message.trim());
};

/**
 * PostgREST's verdicts on the bearer token.
 *
 *   PGRST301  the JWT has expired
 *   PGRST302  no JWT at all, and the route needs one
 *   PGRST303  the JWT's `iat` is AHEAD of the database's clock
 *
 * The third is the odd one, and it is not the user's fault or their device's:
 * the token is minted by Supabase's auth server and checked by the database,
 * and when those two clocks differ by even a second a token is "issued at
 * future" for that second. It is transient, it fixes itself, and nobody should
 * ever be shown the code — see `mobile/src/services/supabaseClient.ts`, which
 * waits it out and retries so this message is a last resort.
 */
const STALE_SESSION_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303']);
const STALE_SESSION_TEXT = /\b(jwt|token)\b.*\b(expired|invalid|issued at future|future)\b|issued at future/i;

export const SESSION_ERROR_MESSAGE = 'Could not confirm your session. Give it a moment and try again.';

export const isStaleSessionError = (cause: unknown): boolean => {
  if (!cause || typeof cause !== 'object') return false;
  const { code, message } = cause as { code?: unknown; message?: unknown };
  if (typeof code === 'string' && STALE_SESSION_CODES.has(code)) return true;
  return typeof message === 'string' && STALE_SESSION_TEXT.test(message);
};

/**
 * A readable line for any thrown value. Supabase rejects with plain objects
 * ({ message, details, hint, code }), not Error instances, so a bare
 * `instanceof Error` check would swallow the only useful detail.
 */
export const errorMessage = (cause: unknown, fallback: string): string => {
  if (isNetworkError(cause)) return NETWORK_ERROR_MESSAGE;
  // Before the Error branch: a PostgrestError IS an Error, so checking this
  // second would let "JWT issued at future" through as its own message.
  if (isStaleSessionError(cause)) return SESSION_ERROR_MESSAGE;
  if (cause instanceof Error && cause.message) return cause.message;
  if (cause && typeof cause === 'object') {
    const { message, details, hint, code } = cause as Record<string, unknown>;
    const parts = [message, details, hint].filter(
      (part): part is string => typeof part === 'string' && part.length > 0,
    );
    if (parts.length) {
      return typeof code === 'string' && code ? `${parts.join(' — ')} (${code})` : parts.join(' — ');
    }
  }
  return fallback;
};
