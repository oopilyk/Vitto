import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import {
  type BodyProfile,
  type MeasurementSystem,
  convertHeightToFeetAndInches,
  convertWeightValue,
  feetAndInchesToCm,
  measurementSystemOf,
  planForGoal,
  CALORIE_GOAL_RANGE,
  isMinor,
  recommendedCalories,
  withMeasurementSystem,
  bodyProblem,
  hasBlockedTerm,
  BLOCKED_NAME_MESSAGE,
} from '@vitto/core';
import {
  FieldRow,
  FormField,
  SegmentedControl,
  SelectionTiles,
  SaveBar,
  SavedBar,
  useSavedNote,
  SettingsPage,
  SettingsSection,
  TextField,
} from '../components/settingsKit';
import { useNumberText } from '../components/ui';
import { colors, themedStyles, fonts } from '../theme';
import { formatLocale, t, tRich, tx } from '../i18n';

interface Props {
  profile: BodyProfile;
  onSave: (profile: BodyProfile) => Promise<void>;
  onClose: () => void;
}

/** Longest a display name can be; matches the server-side `left(..., 40)` so what is typed is what the partner sees. */
const DISPLAY_NAME_MAX_LENGTH = 40;



/**
 * Your preferences: who you are, what you are working towards, how you train
 * and what you want Vitto to lead with. Pushed from Settings. It holds a draft
 * of the profile and shows the save bar only once something differs; the
 * parent owns persistence through `onSave`.
 */
export function PreferencesScreen({ profile: initial, onSave, onClose }: Props) {
  const [profile, setProfile] = useState(initial);
  const [saving, setSaving] = useState(false);
  const savedNote = useSavedNote();
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
  const weightText = useNumberText(displayedWeight, (value) => update('weightKg', toKg(value ?? 0)), true);
  const targetText = useNumberText(
    displayedTarget,
    (value) => update('targetWeightKg', value === undefined ? undefined : toKg(value)),
    true,
  );
  const digits = (value: string, decimals = false) => value.replace(decimals ? /[^0-9.]/g : /[^0-9]/g, '');
  const plan = planForGoal(profile);
  const recommended = recommendedCalories(profile);
  // The plan's sentence: the bold figures, and the plain ones, wherever a translation puts them.
  const planSlots = plan
    ? {
        rate: <Text style={styles.planValue}>{weightLabel(plan.kgPerWeek)}</Text>,
        calories: <Text style={styles.planValue}>{Math.abs(plan.dailyAdjustment)} kcal</Text>,
      }
    : {};
  const planValues = plan ? { total: weightLabel(plan.totalKg), weeks: plan.achievableWeeks } : undefined;
  /** Typed separately so a half-typed "18" is not rejected or rounded while typing. */
  const [calorieText, setCalorieText] = useState(initial.calorieGoal ? String(initial.calorieGoal) : '');
  const ownCalories = profile.calorieGoal !== undefined;
  const calorieGoalProblem =
    ownCalories && !(profile.calorieGoal! >= CALORIE_GOAL_RANGE.min && profile.calorieGoal! <= CALORIE_GOAL_RANGE.max)
      ? t('Choose between {min} and {max} kcal.', { min: CALORIE_GOAL_RANGE.min.toLocaleString(formatLocale()), max: CALORIE_GOAL_RANGE.max.toLocaleString(formatLocale()) })
      : null;

  const save = async () => {
    // Nothing that can't be a real body gets saved: the day's targets are
    // built from these numbers (an age of 999 cut the calorie target to 1,200).
    const problem =
      calorieGoalProblem ?? bodyProblem(profile) ?? (hasBlockedTerm(profile.displayName ?? '') ? BLOCKED_NAME_MESSAGE : null);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(profile);
      savedNote.show();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('Could not save your settings.'));
    } finally {
      setSaving(false);
    }
  };

  // Up while saving and after a failure too: App applies the change before
  // the write lands, so `dirty` alone hid the bar and any error with it.
  const saveBar = dirty || saving || error ? <SaveBar saving={saving} error={error} onSave={() => void save()} onDiscard={() => {
          setProfile(initial);
          setCalorieText(initial.calorieGoal ? String(initial.calorieGoal) : '');
        }} /> : savedNote.saved ? <SavedBar label={t('Preferences saved')} /> : null;

  return (
    <SettingsPage
      title={t('Your preferences')}
      lead={t('What Vitto knows about you, and what you want from it. Private to you.')}
      backLabel={t('Settings')}
      onBack={onClose}
      footer={saveBar}
    >
      <SettingsSection title={t('About you')} description={t('Private to you. Used to set your daily calorie and protein targets.')} first>
        <FormField label={t('Name')} hint={t('shown to your care partner')}>
          <TextField
            value={profile.displayName ?? ''}
            placeholder={t('Your name')}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            onChangeText={(value) => update('displayName', value === '' ? undefined : value)}
          />
        </FormField>
        <FieldRow>
          <FormField label={t('Age')}>
            <TextField
              keyboardType="number-pad"
              value={String(profile.age)}
              onChangeText={(value) => update('age', Number(digits(value)) || 0)}
            />
          </FormField>
          <FormField label={t('Weight ({unit})', { unit: profile.weightUnit })}>
            <TextField
              keyboardType="decimal-pad"
              {...weightText}
            />
          </FormField>
        </FieldRow>
        {profile.heightUnit === 'cm' ? (
          <FormField label={t('Height (cm)')}>
            <TextField
              keyboardType="number-pad"
              value={String(profile.heightCm)}
              onChangeText={(value) => update('heightCm', Number(digits(value)) || 0)}
            />
          </FormField>
        ) : (
          <FieldRow>
            <FormField label={t('Height (ft)')}>
              <TextField
                keyboardType="number-pad"
                value={String(displayedHeight.feet)}
                onChangeText={(value) => update('heightCm', feetAndInchesToCm(Number(digits(value)) || 0, displayedHeight.inches))}
              />
            </FormField>
            <FormField label={t('Height (in)')}>
              <TextField
                keyboardType="number-pad"
                value={String(displayedHeight.inches)}
                onChangeText={(value) => update('heightCm', feetAndInchesToCm(displayedHeight.feet, Number(digits(value)) || 0))}
              />
            </FormField>
          </FieldRow>
        )}
        {/* One toggle for every unit, matching sign-up: weight and height move together. */}
        <FormField label={t('Units')}>
          <SegmentedControl
            options={[
              { value: 'metric' as const, label: t('Metric') },
              { value: 'imperial' as const, label: t('Imperial') },
            ]}
            value={measurementSystemOf(profile)}
            onChange={(value: MeasurementSystem) => {
              // One update, not two: both unit fields move together.
              setProfile((current) => withMeasurementSystem(current, value));
              setError(null);
            }}
          />
        </FormField>
        <FormField label={t('Sex')} hint={t('sets your strength standards and targets')}>
          <SegmentedControl
            options={[
              { value: 'male' as const, label: t('Male') },
              { value: 'female' as const, label: t('Female') },
              // One line in a third of a 320pt phone: "Prefer not to say" broke in two.
              { value: 'other' as const, label: tx('a choice for sex: prefer not to say', 'Private') },
            ]}
            value={profile.sex}
            onChange={(value) => update('sex', value)}
          />
        </FormField>
      </SettingsSection>

      <SettingsSection title={t('Your goal')} description={t('Sets how far your daily calories sit from maintenance.')}>
        <SegmentedControl
          options={[
            // No weight loss under 18 (see calorieAdjustmentFor).
            ...(isMinor(profile) ? [] : [{ value: 'lose' as const, label: t('Lose fat') }]),
            { value: 'maintain' as const, label: t('Maintain') },
            // "Build muscle" broke in two in a third of a 320pt phone.
            { value: 'gain' as const, label: t('Bulk up') },
          ]}
          value={isMinor(profile) && profile.goal === 'lose' ? 'maintain' : profile.goal}
          onChange={(value) => update('goal', value)}
        />
        {profile.goal !== 'gain' ? (
          <FormField label={t('Build muscle too')} hint={profile.goal === 'lose' ? t('gentler deficit, more protein') : t('same weight, more protein')}>
            <SegmentedControl
              options={[
                { value: 'no' as const, label: t('No') },
                { value: 'yes' as const, label: t('Yes') },
              ]}
              value={profile.buildMuscle ? 'yes' : 'no'}
              onChange={(value) => update('buildMuscle', value === 'yes' || undefined)}
            />
          </FormField>
        ) : null}
        {profile.goal !== 'maintain' ? (
          <>
            <FieldRow>
              {/* "optional" as the placeholder: beside the label it wrapped in half a 320pt phone. */}
              <FormField label={t('Target ({unit})', { unit: profile.weightUnit })}>
                <TextField
                  keyboardType="decimal-pad"
                  placeholder={t('Optional')}
                  {...targetText}
                />
              </FormField>
              <FormField label={t('Weeks')}>
                <TextField
                  keyboardType="number-pad"
                  placeholder={t('Optional')}
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
                  {profile.goal === 'lose'
                    ? tRich('{total} over {weeks} weeks — {rate} per week, {calories} below maintenance.', planSlots, planValues)
                    : tRich('{total} over {weeks} weeks — {rate} per week, {calories} above maintenance.', planSlots, planValues)}
                </Text>
                {plan.capped ? <Text style={styles.planWarning}>{t('Capped to a safe rate.')}</Text> : null}
              </View>
            ) : (
              <FormField label={t('Pace')}>
                <SegmentedControl
                  options={[
                    { value: 'gentle' as const, label: t('Gentle') },
                    { value: 'steady' as const, label: t('Steady') },
                    { value: 'focused' as const, label: t('Focused') },
                  ]}
                  value={profile.goalPace}
                  onChange={(value) => update('goalPace', value)}
                />
              </FormField>
            )}
          </>
        ) : null}
      </SettingsSection>

      <SettingsSection
        title={t('Daily calories')}
        description={t('Vitto estimates this from your body, activity and goal. It is a general guide, not medical advice: check with a doctor before changing how you eat, especially with a medical condition, during pregnancy, or with a history of disordered eating. Set your own if you already follow a number.')}
      >
        <SegmentedControl
          options={[
            { value: 'recommended' as const, label: t('Recommended') },
            { value: 'own' as const, label: t('My own') },
          ]}
          value={ownCalories ? 'own' : 'recommended'}
          onChange={(value) => {
            if (value === 'recommended') {
              update('calorieGoal', undefined);
            } else {
              // Starts from the recommendation, ready to adjust.
              setCalorieText(String(recommended));
              update('calorieGoal', recommended);
            }
          }}
        />
        {ownCalories ? (
          <FormField label={t('Calories a day')} hint={t('recommended {calories}', { calories: recommended.toLocaleString(formatLocale()) })}>
            <TextField
              keyboardType="number-pad"
              value={calorieText}
              accessibilityLabel={t('Your daily calorie goal')}
              onChangeText={(value) => {
                const next = digits(value).slice(0, 4);
                setCalorieText(next);
                update('calorieGoal', next === '' ? 0 : Number(next));
              }}
            />
          </FormField>
        ) : (
          <View style={styles.plan}>
            <Text style={styles.planText}>
              {tRich('{calories} a day, from your details above.', {
                calories: <Text style={styles.planValue}>{recommended.toLocaleString(formatLocale())} kcal</Text>,
              })}
            </Text>
          </View>
        )}
        {calorieGoalProblem ? <Text style={styles.planWarning}>{calorieGoalProblem}</Text> : null}
      </SettingsSection>

      <SettingsSection title={t('Your training')} description={t('Training days lift calories; lifting raises protein.')}>
        {/* Short answers, each on one line in a third of a 320pt phone. */}
        <FormField label={t('Time on your feet')}>
          <SegmentedControl
            options={[
              { value: 'low' as const, label: t('Little') },
              { value: 'moderate' as const, label: t('Some') },
              { value: 'high' as const, label: t('All day') },
            ]}
            value={profile.activity}
            onChange={(value) => update('activity', value)}
          />
        </FormField>
        <FieldRow>
          <FormField label={t('Days a week')}>
            <TextField
              keyboardType="number-pad"
              value={String(profile.trainingDaysPerWeek)}
              onChangeText={(value) => update('trainingDaysPerWeek', Math.max(0, Math.min(7, Number(digits(value)) || 0)))}
            />
          </FormField>
          <View style={styles.fieldSpacer} />
        </FieldRow>
        <FormField label={t('Style')}>
          <SegmentedControl
            options={[
              { value: 'strength' as const, label: t('Strength') },
              { value: 'cardio' as const, label: t('Cardio') },
              { value: 'mixed' as const, label: t('Both') },
            ]}
            value={profile.trainingStyle}
            onChange={(value) => update('trainingStyle', value)}
          />
        </FormField>
      </SettingsSection>

    </SettingsPage>
  );
}

const styles = themedStyles(() => ({
  fieldSpacer: { flex: 1 },
  plan: { padding: 14, borderRadius: 12, backgroundColor: colors.cardSoft },
  planText: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 21, color: colors.inkSoft },
  planValue: { fontWeight: '700', color: colors.ink },
  planWarning: { fontFamily: fonts.ui, fontSize: 13, color: colors.caution, marginTop: 6 },
}));
