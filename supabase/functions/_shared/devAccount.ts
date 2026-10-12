/**
 * Whether a signed-in user is the dev account: no caps, everything unlocked,
 * the debug actions open.
 *
 * Read from `app_metadata.vitto_dev`, which only the service role (or the
 * dashboard) can set, never from the email: anyone holding an account with a
 * given address would otherwise get every bypass. The database checks the same
 * claim (`public.is_dev_account()`, migration 20261012120000).
 */
export const isDevAccount = (user: { app_metadata?: Record<string, unknown> | null }): boolean =>
  user.app_metadata?.vitto_dev === true;
