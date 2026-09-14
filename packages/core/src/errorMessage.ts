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
 * A readable line for any thrown value. Supabase rejects with plain objects
 * ({ message, details, hint, code }), not Error instances, so a bare
 * `instanceof Error` check would swallow the only useful detail.
 */
export const errorMessage = (cause: unknown, fallback: string): string => {
  if (isNetworkError(cause)) return NETWORK_ERROR_MESSAGE;
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
