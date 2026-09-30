import { supabase } from './supabaseClient';

/**
 * Vitto Plus, through the MOCK `billing` edge function (see its header). No
 * real store and no charge: "buying" writes the Plus entitlement a real
 * payment webhook will write later. The server refuses unless MOCK_PAYMENTS is
 * on, and this reports that as `enabled: false` rather than as an error.
 */
export type PlusPlan = 'monthly' | 'yearly';

export interface PlusStatus {
  /** Whether test purchases are switched on for this server. */
  enabled: boolean;
  tier: 'free' | 'plus';
  /** When the current Plus period ends; null while free. */
  expiresAt: string | null;
}

/** Shown on the paywall. Nothing is charged; these are the intended prices. */
export const PLUS_PLANS: { value: PlusPlan; label: string; price: string; detail: string }[] = [
  { value: 'monthly', label: 'Monthly', price: '$4.99', detail: '$4.99 a month' },
  { value: 'yearly', label: 'Yearly', price: '$39.99', detail: '$39.99 a year · save 33%' },
];

const call = async (body: Record<string, unknown>): Promise<PlusStatus> => {
  if (!supabase) throw new Error('Sign in to get Plus.');
  const { data, error } = await supabase.functions.invoke('billing', { body });
  if (!error) return data as PlusStatus;
  const context = (error as { context?: unknown }).context;
  if (context && typeof (context as Response).text === 'function') {
    const raw = await (context as Response).text().catch(() => '');
    let reason: string | undefined;
    try {
      reason = (JSON.parse(raw) as { error?: string }).error;
    } catch {
      // Not JSON; fall through to the generic message.
    }
    if (reason) throw new Error(reason);
  }
  throw new Error('Could not reach the store. Try again.');
};

export const billingService = {
  status: () => call({ action: 'status' }),
  purchase: (plan: PlusPlan) => call({ action: 'purchase', plan }),
  cancel: () => call({ action: 'cancel' }),
};
