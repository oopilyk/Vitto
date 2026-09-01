// Supabase rejects with plain objects ({ message, details, hint, code }), not Error
// instances, so a bare `instanceof Error` check swallows the only useful detail.
export const errorMessage = (cause: unknown, fallback: string): string => {
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
