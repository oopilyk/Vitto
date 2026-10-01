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
  /** When the current Plus period ends; null while free (or for a grant that never lapses). */
  expiresAt: string | null;
}

/** The free trial, on the yearly plan only (the billing function agrees). */
export const TRIAL_DAYS = 14;
/** When the reminder that the trial is ending goes out. */
export const TRIAL_REMINDER_DAY = 12;

export interface PlusPlanOption {
  value: PlusPlan;
  label: string;
  /** The price as billed, e.g. "$39.99". */
  price: string;
  /** What the price is per: "/ mo", "/ yr". */
  per: string;
  /** Under the name, e.g. "Only $3.33 a month". */
  note?: string;
  badge?: string;
  /** The line under the button, stating exactly what will be charged. */
  terms: (trial: boolean) => string;
}

/**
 * Shown on the paywall. Nothing is charged (test mode); these are the intended
 * prices. Monthly is the anchor that makes Yearly's saving concrete ($7.99 x 12
 * is $95.88, so $39.99 saves 58%), which is why Yearly is preselected and the
 * only plan with a trial. No Lifetime: every Plus message is a model call, so a
 * one-off payment would be an open-ended cost.
 */
export const PLUS_PLANS: PlusPlanOption[] = [
  { value: 'monthly', label: 'Monthly', price: '$7.99', per: '/ mo', terms: () => '$7.99 / month. Cancel anytime.' },
  {
    value: 'yearly',
    label: 'Yearly',
    price: '$39.99',
    per: '/ yr',
    note: 'Only $3.33 a month',
    badge: 'SAVE 58%',
    terms: (trial) => (trial ? `Free for ${TRIAL_DAYS} days, then $39.99 / year. Cancel anytime.` : '$39.99 / year. Cancel anytime.'),
  },
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
  purchase: (plan: PlusPlan, trial = false) => call({ action: 'purchase', plan, trial }),
  /** Re-reads the entitlement, as a store's "Restore purchases" would. */
  restore: () => call({ action: 'status' }),
  cancel: () => call({ action: 'cancel' }),
};
