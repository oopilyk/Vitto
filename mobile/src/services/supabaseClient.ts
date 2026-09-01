import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { configureCore } from '@vitto/core';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
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
