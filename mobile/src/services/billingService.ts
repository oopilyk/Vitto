import { Platform } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { supabase } from './supabaseClient';

/**
 * Vitto Plus. Two ways to buy it, and the server's entitlement row is the only
 * thing that ever says who has it:
 *
 *   store -- iOS, when EXPO_PUBLIC_REVENUECAT_IOS_KEY is set and the server has
 *            its RevenueCat secret. A real App Store purchase through
 *            RevenueCat; the `billing` function then asks RevenueCat what this
 *            user owns and writes the row (and the `revenuecat-webhook` keeps
 *            it right through renewals, refunds and lapses). See PAYMENTS.md.
 *   test  -- the MOCK `billing` function: "buying" writes the row directly,
 *            nothing is charged. Only while MOCK_PAYMENTS is on.
 *
 * Neither available reads as `enabled: false` rather than as an error.
 */
export type PlusPlan = 'monthly' | 'yearly';

export interface PlusStatus {
  /** Whether Plus can be bought here at all, by either route. */
  enabled: boolean;
  tier: 'free' | 'plus';
  /** When the current Plus period ends; null while free (or for a grant that never lapses). */
  expiresAt: string | null;
  /** How it is bought. Absent means test, when `enabled`. */
  mode?: 'store' | 'test';
  /** Store mode: the plans at the App Store's own prices, in the buyer's currency. */
  plans?: PlusPlanOption[];
  /**
   * Store mode: the free trial this person can still get on Yearly, in days,
   * or null. Apple gives the trial to first-time subscribers only, and applies
   * it by itself; it is not a switch.
   */
  trialDays?: number | null;
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
 * prices. Monthly is the anchor that makes Yearly's saving concrete ($9.99 x 12
 * is $119.88, so $59.99 saves 50%), which is why Yearly is preselected and the
 * only plan with a trial. No Lifetime: every Plus message is a model call, so a
 * one-off payment would be an open-ended cost.
 */
export const PLUS_PLANS: PlusPlanOption[] = [
  { value: 'monthly', label: 'Monthly', price: '$9.99', per: '/ mo', terms: () => '$9.99 / month. Cancel anytime.' },
  {
    value: 'yearly',
    label: 'Yearly',
    price: '$59.99',
    per: '/ yr',
    note: 'Only $4.99 a month',
    badge: 'SAVE 50%',
    terms: (trial) => (trial ? `Free for ${TRIAL_DAYS} days, then $59.99 / year. Cancel anytime.` : '$59.99 / year. Cancel anytime.'),
  },
];

/** What the server says, before the app adds anything from the store. */
interface ServerStatus {
  /** MOCK_PAYMENTS is on. */
  enabled: boolean;
  /** The server can verify App Store purchases (it has the RevenueCat secret). */
  store?: boolean;
  tier: 'free' | 'plus';
  expiresAt: string | null;
}

const call = async (body: Record<string, unknown>): Promise<ServerStatus> => {
  if (!supabase) throw new Error('Sign in to get Plus.');
  const { data, error } = await supabase.functions.invoke('billing', { body });
  if (!error) return data as ServerStatus;
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

// ---- the App Store, through RevenueCat --------------------------------------

/** RevenueCat's public iOS SDK key. Public by design; it can only start purchases. */
const STORE_KEY = Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : undefined;

type PurchasesModule = typeof import('react-native-purchases').default;
/** Loaded only when the store is in use: the native module is absent on web and in tests. */
const purchases = (): PurchasesModule => require('react-native-purchases').default;

/** The Supabase user the SDK is signed in as, so a purchase lands on the right account. */
let storeUser: string | null = null;

const ensureStore = async (): Promise<PurchasesModule> => {
  const Purchases = purchases();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const userId = data.session?.user.id;
  if (!userId) throw new Error('Sign in to get Plus.');
  if (storeUser === null) {
    // The Supabase user id IS the RevenueCat app user id: the server looks the
    // subscriber up by it, so nobody can buy for, or claim, another account.
    Purchases.configure({ apiKey: STORE_KEY!, appUserID: userId });
  } else if (storeUser !== userId) {
    await Purchases.logIn(userId);
  }
  storeUser = userId;
  return Purchases;
};

const formatPercent = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** The current offering's two packages, keyed by plan. */
const storePackages = async (Purchases: PurchasesModule) => {
  const offering = (await Purchases.getOfferings()).current;
  const packages: Partial<Record<PlusPlan, PurchasesPackage>> = {};
  if (offering?.monthly) packages.monthly = offering.monthly;
  if (offering?.annual) packages.yearly = offering.annual;
  return packages;
};

/** The plans as the paywall shows them, at the store's prices. */
const storePlans = (packages: Partial<Record<PlusPlan, PurchasesPackage>>, trialDays: number | null): PlusPlanOption[] => {
  const monthly = packages.monthly?.product;
  const yearly = packages.yearly?.product;
  const plans: PlusPlanOption[] = [];
  if (monthly) {
    plans.push({
      value: 'monthly',
      label: 'Monthly',
      price: monthly.priceString,
      per: '/ mo',
      terms: () => `${monthly.priceString} / month, renews automatically. Cancel anytime in Settings.`,
    });
  }
  if (yearly) {
    const saving = monthly && monthly.price > 0 ? 1 - yearly.price / (monthly.price * 12) : 0;
    plans.push({
      value: 'yearly',
      label: 'Yearly',
      price: yearly.priceString,
      per: '/ yr',
      note: yearly.pricePerMonthString ? `Only ${yearly.pricePerMonthString} a month` : undefined,
      badge: saving >= 0.05 ? `SAVE ${formatPercent(saving)}` : undefined,
      terms: (trial) =>
        trial && trialDays
          ? `Free for ${trialDays} days, then ${yearly.priceString} / year, renews automatically. Cancel anytime in Settings.`
          : `${yearly.priceString} / year, renews automatically. Cancel anytime in Settings.`,
    });
  }
  return plans;
};

/** The Yearly free trial in days, if this person can still get it. */
const storeTrialDays = async (Purchases: PurchasesModule, yearly: PurchasesPackage | undefined): Promise<number | null> => {
  const intro = yearly?.product.introPrice;
  if (!yearly || !intro || intro.price !== 0) return null;
  const eligibility = await Purchases.checkTrialOrIntroductoryPriceEligibility([yearly.product.identifier]).catch(() => null);
  const status = eligibility?.[yearly.product.identifier]?.status;
  if (status === Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE) return null;
  const unit = intro.periodUnit.toUpperCase();
  const perUnit = unit === 'DAY' ? 1 : unit === 'WEEK' ? 7 : unit === 'MONTH' ? 30 : unit === 'YEAR' ? 365 : 0;
  const days = perUnit * intro.periodNumberOfUnits * Math.max(1, intro.cycles);
  return days > 0 ? days : null;
};

/** What the paywall needs, from the server and (in store mode) the store. */
const toStatus = async (server: ServerStatus): Promise<PlusStatus> => {
  if (STORE_KEY && server.store) {
    const base = { enabled: true, tier: server.tier, expiresAt: server.expiresAt, mode: 'store' as const };
    // Already Plus: nothing to sell, so no need to ask the store for prices.
    if (server.tier === 'plus') return base;
    const Purchases = await ensureStore();
    const packages = await storePackages(Purchases);
    const trialDays = await storeTrialDays(Purchases, packages.yearly);
    const plans = storePlans(packages, trialDays);
    // No products yet (App Store Connect not set up): say so rather than sell nothing.
    if (plans.length === 0) return { ...base, enabled: false };
    return { ...base, plans, trialDays };
  }
  return { enabled: server.enabled, tier: server.tier, expiresAt: server.expiresAt, ...(server.enabled ? { mode: 'test' as const } : {}) };
};

const storeMode = async () => STORE_KEY !== undefined && (await call({ action: 'status' })).store === true;

/** Asks the server to re-read what this user owns from RevenueCat and write it. */
const sync = async () => toStatus(await call({ action: 'sync' }));

export const billingService = {
  status: async () => toStatus(await call({ action: 'status' })),
  /**
   * Buys a plan. In store mode `trial` is ignored: Apple applies the free trial
   * by itself to anyone eligible. Backing out of Apple's sheet is not an error;
   * it resolves with the unchanged status.
   */
  purchase: async (plan: PlusPlan, trial = false): Promise<PlusStatus> => {
    if (!(await storeMode())) return toStatus(await call({ action: 'purchase', plan, trial }));
    const Purchases = await ensureStore();
    const chosen = (await storePackages(Purchases))[plan];
    if (!chosen) throw new Error('That plan is not available right now.');
    try {
      await Purchases.purchasePackage(chosen);
    } catch (cause) {
      const failure = cause as { code?: string; userCancelled?: boolean | null; message?: string };
      if (failure.userCancelled || failure.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
        return billingService.status();
      }
      throw new Error(failure.message || 'The purchase did not go through.');
    }
    return sync();
  },
  /** "Restore purchases": hands the device's App Store purchases to this account. */
  restore: async (): Promise<PlusStatus> => {
    if (!(await storeMode())) return toStatus(await call({ action: 'status' }));
    const Purchases = await ensureStore();
    await Purchases.restorePurchases();
    return sync();
  },
  /**
   * Test mode: back to free at once. Store mode: Apple's own subscription
   * screen (an app cannot cancel a subscription itself), then a fresh read --
   * a cancelled plan still runs to the end of the period it was paid for.
   */
  cancel: async (): Promise<PlusStatus> => {
    if (!(await storeMode())) return toStatus(await call({ action: 'cancel' }));
    const Purchases = await ensureStore();
    await Purchases.showManageSubscriptions();
    return sync();
  },
  /** Signs the store out with the app, so the next account does not inherit purchases. */
  signOut: async () => {
    if (!STORE_KEY || storeUser === null) return;
    storeUser = null;
    await purchases().logOut().catch(() => undefined);
  },
};

/** The legal pages the App Store requires next to a subscription. */
export const LEGAL_LINKS = {
  /** Apple's standard licence, unless you publish your own terms. */
  terms: process.env.EXPO_PUBLIC_TERMS_URL || 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/',
  /** Your privacy policy. Required for App Review; the paywall hides the link until it is set. */
  privacy: process.env.EXPO_PUBLIC_PRIVACY_URL || null,
};
