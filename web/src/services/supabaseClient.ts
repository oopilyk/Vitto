import { createClient } from '@supabase/supabase-js';
import { configureCore } from '@vitto/core';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Hand the browser's client to the shared package, which stays platform-agnostic.
configureCore({
  supabase,
  envHint: 'VITE_SUPABASE_*',
  // No USDA key of our own in the app: anything bundled here can be read out
  // of it. Food search goes through our server, which holds the real key
  // (FDC_API_KEY) and uses it ahead of this. USDA's public DEMO_KEY is only
  // for the rare search that cannot reach the server.
  fdcApiKey: 'DEMO_KEY',
});
