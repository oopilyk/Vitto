/**
 * Which signed-in accounts see in-app development tools.
 *
 * Deliberately an allowlist of real accounts rather than a build flag: a flag
 * has to be flipped back before shipping and is therefore something that can be
 * forgotten, whereas this stays false for every other user no matter what ships.
 * The tools it gates are display-only, so this is not a security boundary —
 * anything that must be enforced belongs in RLS, not here.
 */
const DEV_ACCOUNT_EMAILS: readonly string[] = ['kyleyli2005@gmail.com'];

/** Case- and whitespace-insensitive: the same address typed differently is the same account. */
export const isDevAccount = (email: string | null | undefined): boolean =>
  email != null && DEV_ACCOUNT_EMAILS.includes(email.trim().toLowerCase());
