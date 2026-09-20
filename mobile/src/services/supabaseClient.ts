import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { configureCore } from '@vitto/core';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * PostgREST's "JWT issued at future" (PGRST303), waited out rather than shown.
 *
 * The access token is minted by Supabase's auth server and verified by the
 * database. Those are two machines, and when the auth server's clock is even a
 * second ahead, a token it has just issued is dated in the database's future and
 * every request 401s until the database catches up. Nothing on the device causes
 * it and nothing on the device can prevent it — the app had been surfacing the
 * raw code in its error banner.
 *
 * So: a single retry after a pause longer than any plausible skew. Refreshing
 * the session instead would be actively wrong, because a newer token carries an
 * even later `iat`.
 *
 * Done here, in the client's own `fetch`, so it covers every caller at once —
 * the repository, the companion, the edge functions — rather than at sixteen
 * call sites that each throw their own raw error.
 */
const SKEW_RETRY_DELAY_MS = 1500;
const ISSUED_AT_FUTURE = /PGRST303|issued at future/i;

const waitOutClockSkew: typeof fetch = async (input, init) => {
  const response = await fetch(input as RequestInfo, init);
  if (response.status !== 401) return response;
  // Read from a clone: the caller still needs the original body.
  const body = await response.clone().text().catch(() => '');
  if (!ISSUED_AT_FUTURE.test(body)) return response;
  await new Promise((resolve) => setTimeout(resolve, SKEW_RETRY_DELAY_MS));
  // `init.body` is a string on every request supabase-js makes, so it is safe
  // to send again; a stream would not be.
  return fetch(input as RequestInfo, init);
};

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      global: { fetch: waitOutClockSkew },
      auth: {
        // React Native has no localStorage; sessions live in AsyncStorage instead.
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // There is no URL to parse a session out of on a native client.
        detectSessionInUrl: false,
      },
    })
  : null;

// Hand the device's client to the shared package, which stays platform-agnostic.
configureCore({
  supabase,
  envHint: 'EXPO_PUBLIC_SUPABASE_*',
  fdcApiKey: process.env.EXPO_PUBLIC_FDC_API_KEY || 'DEMO_KEY',
});
