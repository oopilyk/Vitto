import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  type BodyProfile,
  FOCUS_AREAS,
  type FocusArea,
  type MeasurementSystem,
  convertHeightToFeetAndInches,
  convertWeightValue,
  feetAndInchesToCm,
  measurementSystemOf,
  planForGoal,
  withMeasurementSystem,
} from '@vitto/core';
import {
  FieldRow,
  FormField,
  SegmentedControl,
  SelectionTiles,
  SaveBar,
  SettingsPage,
  SettingsSection,
  TextField,
} from '../components/settingsKit';
import { colors } from '../theme';

interface Props {
  profile: BodyProfile;
  onSave: (profile: BodyProfile) => Promise<void>;
  onClose: () => void;
}

/** Longest a display name can be; matches the server-side `left(..., 40)` so what is typed is what the partner sees. */
const DISPLAY_NAME_MAX_LENGTH = 40;

const FOCUS_LABEL: Record<FocusArea, string> = {
  nutrition: 'Eat better',
  training: 'Get stronger',
  movement: 'Move more',
  mind: 'Sharpen my mind',
};


/**
 * Your preferences: who you are, what you are working towards, how you train
 * and what you want Vitto to lead with. Pushed from Settings. It holds a draft
 * of the profile and shows the save bar only once something differs; the
 * parent owns persistence through `onSave`.
 */
export function PreferencesScreen({ profile: initial, onSave, onClose }: Props) {
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

  const saveBar = dirty ? <SaveBar saving={saving} error={error} onSave={() => void save()} onDiscard={() => setProfile(initial)} /> : null;

  return (
    <SettingsPage
      title="Your preferences"
      lead="What Vitto knows about you, and what you want from it. Private to you."
      backLabel="Settings"
      onBack={onClose}
      footer={saveBar}
    >
      <SettingsSection title="About you" description="Private to you. Used to tune your daily fuel targets." first>
        <FormField label="Name" hint="shown to your care partner">
          <TextField
            value={profile.displayName ?? ''}
            placeholder="Your name"
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            onChangeText={(value) => update('displayName', value === '' ? undefined : value)}
          />
        </FormField>
        <FieldRow>
          <FormField label="Age">
            <TextField
              keyboardType="number-pad"
              value={String(profile.age)}
              onChangeText={(value) => update('age', Number(digits(value)) || 0)}
            />
          </FormField>
          <FormField label={`Weight (${profile.weightUnit})`}>
            <TextField
              keyboardType="decimal-pad"
              value={String(displayedWeight)}
              onChangeText={(value) => update('weightKg', toKg(Number(digits(value, true)) || 0))}
            />
          </FormField>
        </FieldRow>
        {profile.heightUnit === 'cm' ? (
          <FormField label="Height (cm)">
            <TextField
              keyboardType="number-pad"
              value={String(profile.heightCm)}
              onChangeText={(value) => update('heightCm', Number(digits(value)) || 0)}
            />
          </FormField>
        ) : (
          <FieldRow>
            <FormField label="Height (ft)">
              <TextField
                keyboardType="number-pad"
                value={String(displayedHeight.feet)}
                onChangeText={(value) => update('heightCm', feetAndInchesToCm(Number(digits(value)) || 0, displayedHeight.inches))}
              />
            </FormField>
            <FormField label="Height (in)">
              <TextField
                keyboardType="number-pad"
                value={String(displayedHeight.inches)}
                onChangeText={(value) => update('heightCm', feetAndInchesToCm(displayedHeight.feet, Number(digits(value)) || 0))}
              />
            </FormField>
          </FieldRow>
        )}
        {/* One toggle for every unit, matching sign-up: weight and height move together. */}
        <FormField label="Units">
          <SegmentedControl
            options={[
              { value: 'metric' as const, label: 'Metric' },
              { value: 'imperial' as const, label: 'Imperial' },
            ]}
            value={measurementSystemOf(profile)}
            onChange={(value: MeasurementSystem) => {
              // One update, not two: both unit fields move together.
              setProfile((current) => withMeasurementSystem(current, value));
              setError(null);
            }}
          />
        </FormField>
        <FormField label="Sex" hint="sets your strength standards and targets">
          <SegmentedControl
            options={[
              { value: 'male' as const, label: 'Male' },
              { value: 'female' as const, label: 'Female' },
              { value: 'other' as const, label: 'Prefer not to say' },
            ]}
            value={profile.sex}
            onChange={(value) => update('sex', value)}
          />
        </FormField>
      </SettingsSection>

      <SettingsSection title="Your goal" description="Sets how far your daily calories sit from maintenance.">
        <SegmentedControl
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
            <FieldRow>
              <FormField label={`Target (${profile.weightUnit})`} hint="optional">
                <TextField
                  keyboardType="decimal-pad"
                  placeholder="—"
                  value={displayedTarget === undefined ? '' : String(displayedTarget)}
                  onChangeText={(value) => {
                    const next = digits(value, true);
                    update('targetWeightKg', next === '' ? undefined : toKg(Number(next)));
                  }}
                />
              </FormField>
              <FormField label="Weeks" hint="optional">
                <TextField
                  keyboardType="number-pad"
                  placeholder="—"
                  value={profile.goalWeeks === undefined ? '' : String(profile.goalWeeks)}
                  onChangeText={(value) => {
                    const next = digits(value);
                    update('goalWeeks', next === '' ? undefined : Number(next));
                  }}
                />
              </FormField>
            </FieldRow>
            {plan ? (
              <View style={styles.plan}>
                <Text style={styles.planText}>
                  {weightLabel(plan.totalKg)} over {plan.achievableWeeks} weeks —{' '}
                  <Text style={styles.planValue}>{weightLabel(plan.kgPerWeek)}</Text> per week,{' '}
                  <Text style={styles.planValue}>{Math.abs(plan.dailyAdjustment)} kcal</Text> {profile.goal === 'lose' ? 'below' : 'above'}{' '}
                  maintenance.
                </Text>
                {plan.capped ? <Text style={styles.planWarning}>Capped to a safe rate.</Text> : null}
              </View>
            ) : (
              <FormField label="Pace">
                <SegmentedControl
                  options={[
                    { value: 'gentle' as const, label: 'Gentle' },
                    { value: 'steady' as const, label: 'Steady' },
                    { value: 'focused' as const, label: 'Focused' },
                  ]}
                  value={profile.goalPace}
                  onChange={(value) => update('goalPace', value)}
                />
              </FormField>
            )}
          </>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Your training" description="Training days lift calories; lifting raises protein.">
        <FormField label="Everyday activity">
          <SegmentedControl
            options={[
              { value: 'low' as const, label: 'Mostly sitting' },
              { value: 'moderate' as const, label: 'On my feet some' },
              { value: 'high' as const, label: 'On my feet all day' },
            ]}
            value={profile.activity}
            onChange={(value) => update('activity', value)}
          />
        </FormField>
        <FieldRow>
          <FormField label="Training days a week">
            <TextField
              keyboardType="number-pad"
              value={String(profile.trainingDaysPerWeek)}
              onChangeText={(value) => update('trainingDaysPerWeek', Math.max(0, Math.min(7, Number(digits(value)) || 0)))}
            />
          </FormField>
          <View style={styles.fieldSpacer} />
        </FieldRow>
        <FormField label="Style">
          <SegmentedControl
            options={[
              { value: 'strength' as const, label: 'Strength' },
              { value: 'cardio' as const, label: 'Cardio' },
              { value: 'mixed' as const, label: 'Both' },
            ]}
            value={profile.trainingStyle}
            onChange={(value) => update('trainingStyle', value)}
          />
        </FormField>
      </SettingsSection>

      <SettingsSection title="What you want from Vitto" description="Pick any. Your dashboard leads with these.">
        <SelectionTiles
          options={FOCUS_AREAS.map((area) => ({
            value: area,
            label: FOCUS_LABEL[area],
          }))}
          value={profile.focusAreas}
          onChange={(area) =>
            update(
              'focusAreas',
              profile.focusAreas.includes(area) ? profile.focusAreas.filter((item) => item !== area) : [...profile.focusAreas, area],
            )
          }
        />
      </SettingsSection>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  fieldSpacer: { flex: 1 },
  plan: { padding: 14, borderRadius: 12, backgroundColor: colors.cardSoft },
  planText: { fontSize: 14, lineHeight: 20, color: colors.inkSoft },
  planValue: { fontWeight: '700', color: colors.ink },
  planWarning: { fontSize: 12, color: '#9a6b5c', marginTop: 6 },
});
