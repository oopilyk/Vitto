import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * The one gate in front of every paid AI call. See the ai_call_budget
 * migration: it claims the call atomically (so simultaneous requests cannot
 * all slip under a cap) and records it before the model is asked (so every
 * attempt counts, including ones that fail or find nothing).
 *
 *   AI_DAILY_CEILING   calls the whole app may make in 24 hours, every kind
 *                      and every user together. Default 5000. Raise it as you
 *                      grow; it is the backstop if a cap anywhere is wrong.
 */
export type AiCallKind = 'chat' | 'proactive' | 'meal_photo' | 'push_lines';
export type AiClaim = 'ok' | 'user_limit' | 'global_limit';

const DEFAULT_CEILING = 5000;

const ceiling = () => {
  const raw = Number(Deno.env.get('AI_DAILY_CEILING'));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_CEILING;
};

/**
 * Claims one call. Fails CLOSED: if the claim itself cannot be made (the
 * migration is missing, the database is down), no model is called -- an outage
 * costs nothing, an open gate could cost a lot.
 */
export const claimAiCall = async (
  admin: SupabaseClient,
  userId: string,
  kind: AiCallKind,
  userLimit: number,
): Promise<AiClaim> => {
  const { data, error } = await admin.rpc('claim_ai_call', {
    p_user: userId,
    p_kind: kind,
    p_user_limit: userLimit,
    p_global_limit: ceiling(),
  });
  if (error) {
    console.error(`[aiBudget] claim failed for ${kind}`, error);
    return 'global_limit';
  }
  if (data === 'global_limit') console.error(`[aiBudget] AI_DAILY_CEILING reached (${ceiling()}); refusing ${kind}`);
  return data === 'ok' || data === 'user_limit' ? data : 'global_limit';
};

/** What a person is told when the whole app is over its ceiling. */
export const BUSY_MESSAGE = 'Your pet is resting for a bit. Try again later.';
