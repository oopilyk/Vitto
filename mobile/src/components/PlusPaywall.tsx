import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, Switch, Text, View } from 'react-native';
import { companion as ai } from '@vitto/core';
import {
  billingService,
  LEGAL_LINKS,
  PLUS_PLANS,
  TRIAL_DAYS,
  TRIAL_REMINDER_DAY,
  type PlusPlan,
  type PlusStatus,
} from '../services/billingService';
import { cancelTrialReminder, scheduleTrialReminder } from '../services/pushService';
import { PrimaryButton, TextButton } from './ui';
import { colors, fonts, text, themedStyles } from '../theme';

interface Props {
  /** The dev account is Plus whatever the store says; the paywall says so instead of selling it. */
  isDevAccount?: boolean;
  /** Called with the new tier after a purchase, restore or cancel, so the app unlocks at once. */
  onTierChange: (tier: 'free' | 'plus') => void;
  /** The close (X). In onboarding this is "not now". */
  onClose: () => void;
  /** After a successful purchase, e.g. to move onboarding on. */
  onPurchased?: () => void;
  /**
   * In onboarding the close becomes a labelled "Skip", and a "Continue with
   * Free" button sits under the purchase button: skipping has to be as easy to
   * see as buying, or the step reads as a wall.
   */
  skippable?: boolean;
}

/**
 * Free next to Plus, feature by feature. The numbers are read off the real
 * limits so the table cannot promise what the server does not enforce. Says
 * "your pet", never a name: onboarding shows this before the pet has one.
 */
const COMPARISON: { feature: string; detail: string; free: string; plus: string }[] = [
  {
    feature: 'Photo meal tracking',
    detail: 'Snap a plate, get the macros',
    free: '—',
    plus: 'Included',
  },
  {
    feature: 'Personality',
    detail: 'Pick or write their character',
    free: 'Default',
    plus: 'Yours',
  },
  {
    feature: 'Chat',
    detail: 'Messages to your pet',
    free: `${ai.TIER_LIMITS.free.messagesPerDay} a day`,
    plus: `${ai.TIER_LIMITS.plus.messagesPerDay} a day`,
  },
  {
    feature: 'Lift progress',
    detail: 'Your estimated max over time',
    free: '—',
    plus: 'Included',
  },
  {
    feature: 'Insights',
    detail: 'Patterns your pet notices',
    free: '—',
    plus: 'Included',
  },
  {
    feature: 'Voice',
    detail: 'Their personality in every reply',
    free: 'Standard',
    plus: 'Sharper',
  },
  {
    feature: 'Check-ins',
    detail: 'Your pet reaches out first',
    free: `${ai.TIER_LIMITS.free.proactivePerDay} a day`,
    plus: `${ai.TIER_LIMITS.plus.proactivePerDay} a day`,
  },
];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * The Vitto Plus paywall, laid out the way paywalls that convert are:
 *
 *   * what you get, as a short checked list;
 *   * a free-trial toggle, on by default, because two-week trials convert far
 *     better than short ones;
 *   * Yearly preselected with its saving and its monthly price, beside a
 *     Monthly plan that makes the saving concrete;
 *   * a trial timeline -- today, the reminder on day 12, the charge on day 14 --
 *     because knowing they will be reminded is what makes people start one;
 *   * the price and "cancel anytime" right under the button, and Restore, as
 *     the App Store requires.
 *
 * TEST MODE: purchases go through the mock `billing` function and nothing is
 * charged; the screen says so under the button. The reminder is real: starting
 * a trial schedules it as a local notification.
 */
export function PlusPaywall({ isDevAccount, onTierChange, onClose, onPurchased, skippable = false }: Props) {
  const [status, setStatus] = useState<PlusStatus | null>(null);
  const [plan, setPlan] = useState<PlusPlan>('yearly');
  const [trial, setTrial] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStatus(await billingService.status());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load Plus.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (work: () => Promise<PlusStatus>, after?: (next: PlusStatus) => Promise<void> | void) => {
    setBusy(true);
    setError(null);
    try {
      const next = await work();
      setStatus(next);
      onTierChange(next.tier);
      await after?.(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  };

  // Store mode sells at the App Store's own prices; test mode at the intended ones.
  const store = status?.mode === 'store';
  const sellable = status?.plans ?? PLUS_PLANS;
  // Store mode: the trial Apple will actually give this person (first-time
  // subscribers only), or none. Test mode: always on offer.
  const trialDays = store ? (status?.trialDays ?? null) : TRIAL_DAYS;
  const reminderDay = trialDays === null ? null : store ? Math.max(1, trialDays - 2) : TRIAL_REMINDER_DAY;
  const chosen = sellable.find((option) => option.value === plan) ?? sellable[0]!;
  const yearlyPrice = sellable.find((option) => option.value === 'yearly')?.price ?? '';
  // The trial is a Yearly offer: turning it on picks Yearly, other plans turn it
  // off. In store mode it is not a choice: Yearly comes with it when eligible.
  const trialOn = trialDays !== null && plan === 'yearly' && (store || trial);
  const choosePlan = (next: PlusPlan) => {
    setPlan(next);
    if (next !== 'yearly') setTrial(false);
  };
  const toggleTrial = (next: boolean) => {
    setTrial(next);
    if (next) setPlan('yearly');
  };

  const buy = () =>
    run(
      () => billingService.purchase(plan, trialOn),
      async (next) => {
        if (next.tier !== 'plus') return;
        if (trialOn && trialDays !== null && reminderDay !== null) await scheduleTrialReminder(reminderDay, trialDays);
        onPurchased?.();
      },
    );

  const isPlus = status?.tier === 'plus';
  // Yearly first: it is the plan the page is built to sell.
  const plans = [...sellable].sort((a, b) => (a.value === 'yearly' ? -1 : b.value === 'yearly' ? 1 : 0));

  return (
    <View style={styles.wrap} testID="plus-paywall">
      <View style={styles.bar}>
        {skippable ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Skip" onPress={onClose} hitSlop={10} style={styles.skip}>
            <Text style={styles.skipLabel}>Skip</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10} style={styles.close}>
            <Text style={styles.closeMark}>×</Text>
          </Pressable>
        )}
        {status?.enabled && !isPlus ? (
          <Pressable accessibilityRole="button" onPress={() => void run(billingService.restore)} hitSlop={10} disabled={busy}>
            <Text style={styles.restore}>Restore</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.hero}>
        <Image source={APP_ICON} style={styles.icon} accessibilityIgnoresInvertColors />
        <Text style={styles.title}>Vitto Plus</Text>
        <Text style={styles.subtitle}>Everything your pet can be.</Text>
      </View>

      <View style={styles.table} testID="plus-comparison">
        <View style={styles.tableHead}>
          <View style={styles.featureCol} />
          <Text style={[styles.headCell, styles.freeCol]}>Free</Text>
          <View style={[styles.plusCol, styles.plusHead]}>
            <Text style={styles.plusHeadLabel}>Plus</Text>
          </View>
        </View>
        {COMPARISON.map((row, index) => (
          <View key={row.feature} style={styles.tableRow}>
            <View style={[styles.featureCol, index > 0 && styles.rowRule]}>
              <Text style={styles.feature}>{row.feature}</Text>
              <Text style={styles.featureDetail} numberOfLines={1}>{row.detail}</Text>
            </View>
            <View style={[styles.freeCol, styles.valueCell, index > 0 && styles.rowRule]}>
              <Text style={styles.freeValue}>{row.free}</Text>
            </View>
            <View style={[styles.plusCol, styles.valueCell, styles.plusCell, index === COMPARISON.length - 1 && styles.plusCellLast]}>
              <Text style={styles.plusValue}>{`✓ ${row.plus}`}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={styles.stillFree}>Logging, workouts, steps and mind games stay free.</Text>

      {!status && !error ? <ActivityIndicator color={colors.coral} style={styles.loading} /> : null}

      {isDevAccount ? <Text style={styles.note}>Dev account: Plus is always on here, whatever the store says.</Text> : null}

      {status && isPlus ? (
        <View style={styles.card}>
          <Text style={styles.statusLine} testID="plus-active">
            {status.expiresAt ? `Plus is on until ${formatDate(status.expiresAt)}.` : 'Plus is on for good.'}
          </Text>
          {status.enabled ? (
            <TextButton
              label={store ? 'Manage subscription' : 'Cancel Plus (test mode)'}
              tone="coral"
              onPress={() =>
                void run(billingService.cancel, (next) => (next.tier === 'free' ? cancelTrialReminder() : undefined))
              }
              disabled={busy}
            />
          ) : null}
        </View>
      ) : null}

      {status && !isPlus && !status.enabled ? <Text style={styles.note}>Plus isn't available to buy yet.</Text> : null}

      {status && !isPlus && status.enabled ? (
        <>
          <View style={styles.plans}>
            {plans.map((option) => {
              const selected = option.value === plan;
              const perWord = option.per === '/ yr' ? 'per year' : 'per month';
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${option.label}, ${option.price} ${option.per}`}
                  onPress={() => choosePlan(option.value)}
                  style={[styles.plan, selected && styles.planOn]}
                >
                  {option.badge ? (
                    <View style={styles.planBadge}>
                      <Text style={styles.planBadgeText}>{option.badge}</Text>
                    </View>
                  ) : null}
                  <View style={styles.planTop}>
                    <Text style={[styles.planLabel, selected && styles.planLabelOn]}>{option.label}</Text>
                    <View style={[styles.radio, selected && styles.radioOn]}>
                      {selected ? <Text style={styles.radioTick}>✓</Text> : null}
                    </View>
                  </View>
                  <Text style={styles.planPrice}>{option.price}</Text>
                  <Text style={styles.planPer}>{perWord}</Text>
                  <Text style={[styles.planNote, selected && styles.planNoteOn]}>{option.note ?? 'Billed monthly'}</Text>
                </Pressable>
              );
            })}
          </View>

          {trialDays !== null ? (
          <View style={[styles.card, styles.trialRow]}>
            <View style={styles.trialText}>
              <Text style={styles.trialTitle}>{`${trialDays}-day free trial`}</Text>
              <Text style={styles.trialSub}>{trialOn ? 'Try everything. Pay nothing today.' : 'On the yearly plan'}</Text>
            </View>
            {store ? null : (
            <Switch
              value={trialOn}
              onValueChange={toggleTrial}
              trackColor={{ true: colors.mintDeep, false: colors.hairline }}
              thumbColor="#ffffff"
              ios_backgroundColor={colors.hairline}
              // react-native-web colours the "on" thumb from this instead.
              {...({ activeThumbColor: '#ffffff' } as object)}
              accessibilityLabel="Free trial"
              testID="trial-toggle"
            />
            )}
          </View>
          ) : null}

          {trialOn ? (
            <View style={styles.card} testID="trial-timeline">
              <Text style={styles.timelineTitle}>How your trial works</Text>
              <View style={styles.timeline}>
                <View style={styles.timelineRail} />
                {[
                  { day: 'Today', what: 'Full access, free', tint: colors.mintDeep },
                  { day: `Day ${reminderDay}`, what: 'We remind you before it ends', tint: colors.lilacDeep },
                  { day: `Day ${trialDays}`, what: `${yearlyPrice} / year, cancel anytime`, tint: colors.inkSoft },
                ].map((step) => (
                  <View key={step.day} style={styles.stop}>
                    <View style={[styles.stopDot, { backgroundColor: step.tint }]} />
                    <Text style={styles.stopDay}>{step.day}</Text>
                    <Text style={styles.stopWhat}>{step.what}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.cta}>
            <PrimaryButton label={trialOn ? 'Start Free Trial' : 'Continue'} onPress={() => void buy()} busy={busy} disabled={busy} />
            <Text style={styles.terms} testID="plus-terms">{chosen.terms(trialOn)}</Text>
            {store ? null : (
              <Text style={styles.testMode} testID="plus-test-mode">
                Test mode: no real payment is taken. This unlocks Plus exactly as a purchase will.
              </Text>
            )}
            {/* The App Store requires both next to a subscription. */}
            <View style={styles.legal}>
              <Text style={styles.legalLink} accessibilityRole="link" onPress={() => void Linking.openURL(LEGAL_LINKS.terms)}>
                Terms of Use
              </Text>
              {LEGAL_LINKS.privacy ? (
                <>
                  <Text style={styles.legalDot}>·</Text>
                  <Text
                    style={styles.legalLink}
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(LEGAL_LINKS.privacy!)}
                  >
                    Privacy Policy
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {skippable ? (
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.continueFree} testID="continue-free">
          <Text style={styles.continueFreeLabel}>Continue with Free</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const APP_ICON = require('../../assets/icon.png');

const styles = themedStyles(() => ({
  wrap: { gap: 14 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeMark: { fontSize: 20, lineHeight: 22, color: colors.muted },
  skip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  skipLabel: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  restore: { fontSize: 14, fontWeight: '600', color: colors.coral },
  legal: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  legalLink: { fontSize: 12, color: colors.muted, textDecorationLine: 'underline' },
  legalDot: { fontSize: 12, color: colors.faint },

  hero: { alignItems: 'center', paddingTop: 4, paddingBottom: 2 },
  icon: {
    width: 76,
    height: 76,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  title: { ...text.display, fontSize: 32, textAlign: 'center' },
  subtitle: { ...text.body, fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 2 },

  table: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
  },
  tableHead: { flexDirection: 'row', alignItems: 'stretch' },
  headCell: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.faint,
    textAlign: 'center',
    paddingTop: 12,
    paddingBottom: 6,
  },
  plusHead: {
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 12,
    paddingBottom: 6,
  },
  plusHeadLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.mintDeep,
  },
  tableRow: { flexDirection: 'row', alignItems: 'stretch' },
  rowRule: { borderTopWidth: 1, borderTopColor: colors.hairline },
  featureCol: { flex: 1.9, paddingVertical: 9, paddingLeft: 14, paddingRight: 6, justifyContent: 'center' },
  freeCol: { flex: 0.9 },
  plusCol: { flex: 1 },
  valueCell: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  plusCell: { backgroundColor: colors.mint },
  plusCellLast: { paddingBottom: 2 },
  feature: { fontSize: 14, fontWeight: '600', color: colors.ink },
  featureDetail: { fontSize: 11, color: colors.muted, marginTop: 1 },
  freeValue: { fontSize: 12, color: colors.faint, textAlign: 'center' },
  plusValue: { fontSize: 12, fontWeight: '700', color: colors.mintDeep, textAlign: 'center' },
  stillFree: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: -4 },

  loading: { marginVertical: 12 },
  note: { ...text.body, color: colors.muted, lineHeight: 19, textAlign: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statusLine: { ...text.body, color: colors.ink },

  plans: { flexDirection: 'row', gap: 10, paddingTop: 8 },
  plan: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 14,
  },
  planOn: { borderColor: colors.mintDeep, borderWidth: 2, backgroundColor: colors.mint },
  planBadge: {
    position: 'absolute',
    top: -11,
    alignSelf: 'center',
    backgroundColor: colors.mintDeep,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  planBadgeText: { fontFamily: fonts.mono, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: '#fff' },
  planTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  planLabel: { fontSize: 15, fontWeight: '600', color: colors.inkSoft },
  planLabelOn: { color: colors.ink },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: colors.mintDeep, borderColor: colors.mintDeep },
  radioTick: { color: '#fff', fontSize: 11, fontWeight: '800' },
  planPrice: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  planPer: { fontSize: 12, color: colors.muted, marginTop: -2 },
  planNote: { fontSize: 12, color: colors.faint, marginTop: 8 },
  planNoteOn: { color: colors.mintDeep, fontWeight: '600' },

  trialRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trialText: { flex: 1 },
  trialTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  trialSub: { fontSize: 12, color: colors.muted, marginTop: 1 },

  timelineTitle: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.faint,
    marginBottom: 10,
  },
  timeline: { flexDirection: 'row' },
  timelineRail: {
    position: 'absolute',
    top: 5,
    left: '16%',
    right: '16%',
    height: 2,
    backgroundColor: colors.hairline,
  },
  stop: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  stopDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.card, marginBottom: 6 },
  stopDay: { fontSize: 13, fontWeight: '700', color: colors.ink },
  stopWhat: { fontSize: 11, color: colors.muted, textAlign: 'center', lineHeight: 15, marginTop: 2 },

  cta: { gap: 8, marginTop: 2 },
  terms: { fontSize: 12, color: colors.inkSoft, textAlign: 'center' },
  testMode: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, lineHeight: 15, textAlign: 'center' },
  error: { ...text.error, textAlign: 'center' },
  continueFree: {
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  continueFreeLabel: { fontSize: 15, fontWeight: '600', color: colors.inkSoft },
}));

/** Bottom padding that clears the iPhone home indicator. */
export const PAYWALL_BOTTOM_INSET = Platform.OS === 'ios' ? 24 : 12;
