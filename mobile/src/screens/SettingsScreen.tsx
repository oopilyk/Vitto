import { useMemo, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  type BodyProfile,
  FOCUS_AREAS,
  type FocusArea,
  type MeasurementSystem,
  type PetBreed,
  convertHeightToFeetAndInches,
  convertWeightValue,
  feetAndInchesToCm,
  measurementSystemOf,
  planForGoal,
  withMeasurementSystem,
} from '@vitto/core';
import { BreedPicker } from '../components/BreedPicker';
import { ChoiceRow, Field, Kicker, PrimaryButton, TextButton } from '../components/ui';
import { colors, fonts, layout, text } from '../theme';

interface Props {
  profile: BodyProfile;
  onSave: (profile: BodyProfile) => Promise<void>;
  onClose: () => void;
  /** The pet's look. Saved straight away by the parent, outside the profile draft. */
  breed?: PetBreed;
  onBreedChange?: (breed: PetBreed) => void;
  /**
   * Deletes the account for good. Owns its own confirmation (see App), so this
   * is called only once the user has actually agreed. Absent offline.
   */
  onDeleteAccount?: () => Promise<void>;
  deletingAccount?: boolean;
}

/** Longest a display name can be; matches the server-side `left(..., 40)` so what is typed is what the partner sees. */
const DISPLAY_NAME_MAX_LENGTH = 40;

const FOCUS_LABEL: Record<FocusArea, string> = {
  nutrition: 'Eat better',
  training: 'Get stronger',
  movement: 'Move more',
  mind: 'Sharpen my mind',
};

const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;

/** A titled card, the same shape Profile draws — this screen used to be part of it. */
function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Kicker>{title}</Kicker>
      {hint ? <Text style={styles.cardHint}>{hint}</Text> : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      {children}
    </View>
  );
}

/**
 * The body profile — who you are, what you are working towards, how you train
 * and what you want Vitto to lead with. Reached from Profile's top bar. It
 * holds a draft of the profile and shows the save bar only once something
 * differs, exactly as these cards did when they sat inside Profile; the parent
 * owns persistence through `onSave`.
 */
export function SettingsScreen({
  profile: initial,
  onSave,
  onClose,
  breed,
  onBreedChange,
  onDeleteAccount,
  deletingAccount,
}: Props) {
  const [profile, setProfile] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drives the save bar: it only appears once something actually differs.
  const dirty = useMemo(() => JSON.stringify(profile) !== JSON.stringify(initial), [profile, initial]);

  const update = <K extends keyof BodyProfile>(key: K, value: BodyProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const metric = profile.weightUnit === 'kg';
  const toKg = (value: number) => (metric ? value : value / 2.20462);
  const round = (value: number) => Math.round(value * 10) / 10;
  /** A kg figure from the domain, shown in the user's unit — see the same helper in onboarding. */
  const weightLabel = (kg: number) => (metric ? `${kg} kg` : `${round(convertWeightValue(kg, 'kg', 'lb'))} lb`);
  const displayedWeight = metric ? round(profile.weightKg) : round(convertWeightValue(profile.weightKg, 'kg', 'lb'));
  const displayedTarget = profile.targetWeightKg
    ? metric
      ? round(profile.targetWeightKg)
      : round(convertWeightValue(profile.targetWeightKg, 'kg', 'lb'))
    : undefined;
  const displayedHeight = convertHeightToFeetAndInches(profile.heightCm);
  const digits = (value: string, decimals = false) => value.replace(decimals ? /[^0-9.]/g : /[^0-9]/g, '');
  const plan = planForGoal(profile);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(profile);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={layout.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topbar}>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={styles.back}>
          <Text style={styles.backMark}>←</Text>
          <Text style={styles.backLabel}>Profile</Text>
        </Pressable>
        <Text style={styles.topTitle}>Settings</Text>
        <View style={styles.back} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: (dirty ? 110 : 40) + HOME_INDICATOR_INSET }]}
        keyboardShouldPersistTaps="handled"
      >
        {onBreedChange ? (
          <Card title="Your companion" hint="Changes take effect straight away">
            <BreedPicker value={breed} onChange={onBreedChange} size={88} />
          </Card>
        ) : null}

        <Card title="About you" hint="Private to you · used to tune your daily fuel targets">
          <Field label="Your name" hint="shown to your care partner">
            <TextInput
              style={layout.input}
              value={profile.displayName ?? ''}
              placeholder="—"
              placeholderTextColor={colors.faint}
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              onChangeText={(value) => update('displayName', value === '' ? undefined : value)}
            />
          </Field>
          <View style={styles.grid}>
            <Field label="Age">
              <TextInput
                style={layout.input}
                keyboardType="number-pad"
                value={String(profile.age)}
                onChangeText={(value) => update('age', Number(digits(value)) || 0)}
              />
            </Field>
            <Field label={`Weight (${profile.weightUnit})`}>
              <TextInput
                style={layout.input}
                keyboardType="decimal-pad"
                value={String(displayedWeight)}
                onChangeText={(value) => update('weightKg', toKg(Number(digits(value, true)) || 0))}
              />
            </Field>
          </View>

          {profile.heightUnit === 'cm' ? (
            <Field label="Height (cm)">
              <TextInput
                style={layout.input}
                keyboardType="number-pad"
                value={String(profile.heightCm)}
                onChangeText={(value) => update('heightCm', Number(digits(value)) || 0)}
              />
            </Field>
          ) : (
            <View style={styles.grid}>
              <Field label="Height (ft)">
                <TextInput
                  style={layout.input}
                  keyboardType="number-pad"
                  value={String(displayedHeight.feet)}
                  onChangeText={(value) =>
                    update('heightCm', feetAndInchesToCm(Number(digits(value)) || 0, displayedHeight.inches))
                  }
                />
              </Field>
              <Field label="Height (in)">
                <TextInput
                  style={layout.input}
                  keyboardType="number-pad"
                  value={String(displayedHeight.inches)}
                  onChangeText={(value) =>
                    update('heightCm', feetAndInchesToCm(displayedHeight.feet, Number(digits(value)) || 0))
                  }
                />
              </Field>
            </View>
          )}

          {/* One toggle for every unit, matching the one at sign-up: weight and
              height always move together. */}
          <Group label="Units">
            <ChoiceRow
              options={[
                { value: 'metric' as const, label: 'Metric', detail: 'kg · cm' },
                { value: 'imperial' as const, label: 'Imperial', detail: 'lb · ft/in' },
              ]}
              value={measurementSystemOf(profile)}
              onChange={(value: MeasurementSystem) => {
                // One update, not two: both unit fields move together.
                setProfile((current) => withMeasurementSystem(current, value));
                setError(null);
              }}
            />
          </Group>

          <Group label="Sex">
            <ChoiceRow
              options={[
                { value: 'other' as const, label: 'Prefer not to say' },
                { value: 'female' as const, label: 'Female' },
                { value: 'male' as const, label: 'Male' },
              ]}
              value={profile.sex}
              onChange={(value) => update('sex', value)}
            />
          </Group>
        </Card>

        <Card title="Your goal" hint="Sets how far your daily calories sit from maintenance">
          <ChoiceRow
            options={[
              { value: 'lose' as const, label: 'Lose fat' },
              { value: 'maintain' as const, label: 'Maintain' },
              { value: 'gain' as const, label: 'Build muscle' },
            ]}
            value={profile.goal}
            onChange={(value) => update('goal', value)}
          />

          {profile.goal !== 'maintain' ? (
            <>
              <View style={styles.grid}>
                <Field label={`Target (${profile.weightUnit})`} hint="optional">
                  <TextInput
                    style={layout.input}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor={colors.faint}
                    value={displayedTarget === undefined ? '' : String(displayedTarget)}
                    onChangeText={(value) => {
                      const next = digits(value, true);
                      update('targetWeightKg', next === '' ? undefined : toKg(Number(next)));
                    }}
                  />
                </Field>
                <Field label="Timeline (weeks)" hint="optional">
                  <TextInput
                    style={layout.input}
                    keyboardType="number-pad"
                    placeholder="—"
                    placeholderTextColor={colors.faint}
                    value={profile.goalWeeks === undefined ? '' : String(profile.goalWeeks)}
                    onChangeText={(value) => {
                      const next = digits(value);
                      update('goalWeeks', next === '' ? undefined : Number(next));
                    }}
                  />
                </Field>
              </View>

              {plan ? (
                <View style={styles.plan}>
                  <Text style={styles.planText}>
                    {weightLabel(plan.totalKg)} over {plan.achievableWeeks} weeks —{' '}
                    <Text style={styles.planValue}>{weightLabel(plan.kgPerWeek)}</Text> per week,{' '}
                    <Text style={styles.planValue}>{Math.abs(plan.dailyAdjustment)} kcal</Text>{' '}
                    {profile.goal === 'lose' ? 'below' : 'above'} maintenance.
                  </Text>
                  {plan.capped ? <Text style={styles.planWarning}>Capped to a safe rate.</Text> : null}
                </View>
              ) : (
                <Group label="Pace">
                  <ChoiceRow
                    options={[
                      { value: 'gentle' as const, label: 'Gentle' },
                      { value: 'steady' as const, label: 'Steady' },
                      { value: 'focused' as const, label: 'Focused' },
                    ]}
                    value={profile.goalPace}
                    onChange={(value) => update('goalPace', value)}
                  />
                </Group>
              )}
            </>
          ) : null}
        </Card>

        <Card title="Your training" hint="Training days lift calories; lifting raises protein">
          <Group label="Everyday activity">
            <ChoiceRow
              options={[
                { value: 'low' as const, label: 'Mostly sitting' },
                { value: 'moderate' as const, label: 'On my feet some' },
                { value: 'high' as const, label: 'On my feet all day' },
              ]}
              value={profile.activity}
              onChange={(value) => update('activity', value)}
            />
          </Group>
          <Field label="Training days per week">
            <TextInput
              style={[layout.input, styles.narrowInput]}
              keyboardType="number-pad"
              value={String(profile.trainingDaysPerWeek)}
              onChangeText={(value) =>
                update('trainingDaysPerWeek', Math.max(0, Math.min(7, Number(digits(value)) || 0)))
              }
            />
          </Field>
          <Group label="Style">
            <ChoiceRow
              options={[
                { value: 'strength' as const, label: 'Strength' },
                { value: 'cardio' as const, label: 'Cardio' },
                { value: 'mixed' as const, label: 'Both' },
              ]}
              value={profile.trainingStyle}
              onChange={(value) => update('trainingStyle', value)}
            />
          </Group>
        </Card>

        <Card title="What you want from Vitto" hint="Your dashboard leads with these">
          <ChoiceRow
            stacked
            options={FOCUS_AREAS.map((area) => ({ value: area, label: FOCUS_LABEL[area] }))}
            value={profile.focusAreas}
            onChange={(area) =>
              update(
                'focusAreas',
                profile.focusAreas.includes(area)
                  ? profile.focusAreas.filter((item) => item !== area)
                  : [...profile.focusAreas, area],
              )
            }
          />
        </Card>

        {onDeleteAccount ? (
          <View style={styles.deleteAccount}>
            <TextButton
              label={deletingAccount ? 'Deleting...' : 'Delete account'}
              tone="coral"
              disabled={deletingAccount}
              onPress={() => void onDeleteAccount()}
            />
            <Text style={styles.deleteAccountHint}>
              Permanently deletes your account, your pet and everything you have logged. A pet you
              share stays with your care partner. This cannot be undone.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {dirty ? (
        <View style={[styles.saveBar, { paddingBottom: HOME_INDICATOR_INSET }]}>
          {error ? <Text style={styles.saveError}>{error}</Text> : null}
          <View style={styles.saveRow}>
            <View style={{ flex: 1 }}>
              <PrimaryButton label={saving ? 'Saving...' : 'Save changes'} busy={saving} onPress={() => void save()} />
            </View>
            <TextButton label="Discard" onPress={() => setProfile(initial)} disabled={saving} />
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
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
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
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
  },
  cardHint: { fontSize: 12, color: colors.faint, marginTop: 6, lineHeight: 17 },
  cardBody: { marginTop: 4 },
  group: { marginTop: 16 },
  groupLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.faint,
    textTransform: 'uppercase',
  },
  grid: { flexDirection: 'row', gap: 12 },
  narrowInput: { maxWidth: 120 },
  plan: {
    marginTop: 16,
    padding: 13,
    borderRadius: 12,
    backgroundColor: '#eef3ec',
    borderWidth: 1,
    borderColor: 'rgba(132,160,138,0.35)',
  },
  planText: { fontSize: 12, lineHeight: 19, color: colors.inkSoft },
  planValue: { fontWeight: '700', color: colors.ink },
  planWarning: { fontFamily: fonts.mono, fontSize: 10, color: '#9a6b5c', marginTop: 6 },
  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    shadowColor: '#26312d',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -3 },
    elevation: 14,
  },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  deleteAccount: { marginTop: 18, alignItems: 'center', gap: 8, paddingHorizontal: 24 },
  deleteAccountHint: {
    fontFamily: fonts.mono,
    fontSize: 10,
    lineHeight: 15,
    color: colors.muted,
    textAlign: 'center',
  },
  saveError: { ...text.error, fontSize: 12, marginBottom: 10 },
});
