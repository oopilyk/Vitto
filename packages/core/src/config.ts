import type { SupabaseClient } from '@supabase/supabase-js';

interface CoreConfig {
  /** The platform's configured client, or null when the app runs unauthenticated. */
  supabase: SupabaseClient | null;
  /** Named in the "not configured" error so each app points at its own env vars. */
  envHint: string;
  /** USDA FoodData Central key; DEMO_KEY works but is rate limited. */
  fdcApiKey: string;
}

const config: CoreConfig = { supabase: null, envHint: 'SUPABASE_*', fdcApiKey: 'DEMO_KEY' };

/**
 * Both apps build their own Supabase client — the web from `import.meta.env` with
 * browser storage, native from `process.env` with AsyncStorage — then hand it here
 * so everything else in this package is platform-agnostic.
 */
export const configureCore = (options: Partial<CoreConfig>) => {
  Object.assign(config, options);
};

export const getSupabase = (): SupabaseClient | null => config.supabase;

export const isSupabaseConfigured = (): boolean => Boolean(config.supabase);

export const requireSupabase = (): SupabaseClient => {
  if (!config.supabase) {
    throw new Error(`Supabase is not configured. Add the ${config.envHint} variables.`);
  }
  return config.supabase;
};

export const getFdcApiKey = (): string => config.fdcApiKey;
