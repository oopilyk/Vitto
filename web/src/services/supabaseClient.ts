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
  fdcApiKey: import.meta.env.VITE_FDC_API_KEY || 'DEMO_KEY',
});
