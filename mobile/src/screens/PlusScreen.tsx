import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { companion as ai } from '@vitto/core';
import { ChoiceRow, Kicker, PrimaryButton, TextButton } from '../components/ui';
import { billingService, PLUS_PLANS, type PlusPlan, type PlusStatus } from '../services/billingService';
import { colors, fonts, layout, text } from '../theme';

interface Props {
  petName: string;
  /** The dev account is Plus whatever the store says; the screen says so instead of selling it. */
  isDevAccount?: boolean;
  /** Called with the new tier after a purchase or cancel, so the app unlocks at once. */
  onTierChange: (tier: 'free' | 'plus') => void;
  onClose: () => void;
}

const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;

/** What Plus changes, side by side with free. Read off the real limits, so it cannot drift. */
const PERKS = (petName: string) => [
  {
    title: 'Personalities',
    body: `Pick ${petName}'s temperament, fine-tune it with the sliders, or write them a whole character of your own.`,
  },
  {
    title: 'A sharper voice',
    body: 'Replies come from a stronger model: more in character, better at remembering what you told them.',
  },
  {
    title: 'More to say',
    body: `${ai.TIER_LIMITS.plus.messagesPerDay} messages a day instead of ${ai.TIER_LIMITS.free.messagesPerDay}, and up to ${ai.TIER_LIMITS.plus.proactivePerDay} check-ins a day instead of ${ai.TIER_LIMITS.free.proactivePerDay}.`,
  },
];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Vitto Plus: what it is, and (in TEST MODE) getting it.
 *
 * Purchases go through the mock `billing` function: no store, no charge, and
 * the screen says so on the button itself. It writes the same entitlement a
 * real payment will, so upgrading here unlocks exactly what a subscriber gets.
 */
export function PlusScreen({ petName, isDevAccount, onTierChange, onClose }: Props) {
  const [status, setStatus] = useState<PlusStatus | null>(null);
  const [plan, setPlan] = useState<PlusPlan>('yearly');
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

  const run = async (work: () => Promise<PlusStatus>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await work();
      setStatus(next);
      onTierChange(next.tier);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  };

  const isPlus = status?.tier === 'plus';

  return (
    <View style={layout.screen}>
      <View style={styles.topbar}>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={styles.back}>
          <Text style={styles.backMark}>←</Text>
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
        <Text style={styles.topTitle}>Vitto Plus</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 40 + HOME_INDICATOR_INSET }]}>
        <View style={styles.card}>
          <Kicker>What you get</Kicker>
          {PERKS(petName).map((perk) => (
            <View key={perk.title} style={styles.perk}>
              <Text style={styles.perkTitle}>{perk.title}</Text>
              <Text style={styles.perkBody}>{perk.body}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Kicker>{isPlus ? 'Your plan' : 'Choose a plan'}</Kicker>
          {!status && !error ? <ActivityIndicator color={colors.coral} style={styles.loading} /> : null}

          {isDevAccount ? (
            <Text style={styles.note}>Dev account: Plus is always on here, whatever the store says.</Text>
          ) : null}

          {status && isPlus ? (
            <>
              <Text style={styles.statusLine} testID="plus-active">
                {status.expiresAt ? `Plus is on until ${formatDate(status.expiresAt)}.` : 'Plus is on.'}
              </Text>
              {status.enabled ? (
                <TextButton label="Cancel Plus (test mode)" tone="coral" onPress={() => void run(billingService.cancel)} disabled={busy} />
              ) : null}
            </>
          ) : null}

          {status && !isPlus ? (
            status.enabled ? (
              <>
                <ChoiceRow
                  stacked
                  options={PLUS_PLANS.map((option) => ({ value: option.value, label: option.label, detail: option.detail }))}
                  value={plan}
                  onChange={setPlan}
                />
                <View style={styles.buy}>
                  <PrimaryButton
                    label={`Start Plus · ${PLUS_PLANS.find((option) => option.value === plan)!.price}`}
                    onPress={() => void run(() => billingService.purchase(plan))}
                    busy={busy}
                    disabled={busy}
                  />
                </View>
                <Text style={styles.testMode} testID="plus-test-mode">
                  Test mode: no real payment is taken. This unlocks Plus exactly as a purchase will.
                </Text>
              </>
            ) : (
              <Text style={styles.note}>Plus isn't available to buy yet.</Text>
            )
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 62,
    paddingBottom: 12,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 64 },
  backMark: { fontSize: 18, color: colors.coral },
  backLabel: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  topTitle: { ...text.heading, fontSize: 16 },
  body: { padding: 16, gap: 14 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 18,
    padding: 18,
    gap: 10,
  },
  perk: { gap: 2, marginTop: 4 },
  perkTitle: { ...text.heading, fontSize: 15, color: colors.ink },
  perkBody: { ...text.body, color: colors.muted, lineHeight: 19 },
  loading: { marginVertical: 12 },
  statusLine: { ...text.body, color: colors.ink },
  note: { ...text.body, color: colors.muted, lineHeight: 19 },
  buy: { marginTop: 4 },
  testMode: { fontFamily: fonts.mono, fontSize: 11, color: colors.faint, lineHeight: 16 },
  error: { ...text.error },
});
