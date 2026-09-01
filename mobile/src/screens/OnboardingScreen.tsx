import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  FOCUS_AREAS,
  calculateMacroTargets,
  convertHeightToFeetAndInches,
  convertWeightValue,
  feetAndInchesToCm,
  planForGoal,
  weightGoalProgress,
  type BodyProfile,
  type FocusArea,
  type PetBreed,
} from '@vitto/core';
import { BreedPicker } from '../components/BreedPicker';
import { ChoiceRow, ErrorText, Field, Kicker, PrimaryButton, TextButton } from '../components/ui';
import { colors, fonts, layout, text } from '../theme';

interface Props {
  name: string;
  onNameChange: (value: string) => void;
  profile: BodyProfile;
  onUpdate: <K extends keyof BodyProfile>(key: K, value: BodyProfile[K]) => void;
  breed: PetBreed;
  onBreedChange: (breed: PetBreed) => void;
  onAdopt: () => Promise<void> | void;
  error: string | null;
  onSignOut?: () => void;
}

const STEPS = ['About you', 'Your goal', 'Your rhythm', 'What you want'];

const GOAL_OPTIONS = [
  { value: 'lose' as const, label: 'Lose fat' },
  { value: 'maintain' as const, label: 'Maintain' },
  { value: 'gain' as const, label: 'Build muscle' },
];

const PACE_OPTIONS = [
  { value: 'gentle' as const, label: 'Gentle', detail: 'Slow and sustainable' },
  { value: 'steady' as const, label: 'Steady', detail: 'A clear, workable change' },
  { value: 'focused' as const, label: 'Focused', detail: 'Faster, harder to hold' },
];

const STYLE_OPTIONS = [
  { value: 'strength' as const, label: 'Strength', detail: 'Lifting, resistance work' },
  { value: 'cardio' as const, label: 'Cardio', detail: 'Running, cycling, swimming' },
  { value: 'mixed' as const, label: 'A bit of both', detail: 'Mixed training week' },
];

const ACTIVITY_OPTIONS = [
  { value: 'low' as const, label: 'Mostly sitting' },
  { value: 'moderate' as const, label: 'On my feet some' },
  { value: 'high' as const, label: 'On my feet all day' },
];

const FOCUS_OPTIONS: { value: FocusArea; label: string; detail: string }[] = [
  { value: 'nutrition', label: 'Eat better', detail: 'Meals, macros, and daily fuel' },
  { value: 'training', label: 'Get stronger', detail: 'Workouts and progress over time' },
  { value: 'movement', label: 'Move more', detail: 'Steps and everyday activity' },
  { value: 'mind', label: 'Sharpen my mind', detail: 'Focus sessions and reading' },
];

const TIMELINE_PRESETS = [8, 12, 16, 24];

export function OnboardingScreen({
  name,
  onNameChange,
  breed,
  onBreedChange,
  profile,
  onUpdate,
  onAdopt,
  error,
  onSignOut,
}: Props) {
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);

  const metric = profile.weightUnit === 'kg';
  const displayedWeight = metric
    ? Math.round(profile.weightKg * 10) / 10
    : Math.round(convertWeightValue(profile.weightKg, 'kg', 'lb') * 10) / 10;
  const displayedHeight = convertHeightToFeetAndInches(profile.heightCm);
  const displayedTarget = profile.targetWeightKg
    ? metric
      ? Math.round(profile.targetWeightKg * 10) / 10
      : Math.round(convertWeightValue(profile.targetWeightKg, 'kg', 'lb') * 10) / 10
    : undefined;

  const toKg = (value: number) => (metric ? value : value / 2.20462);
  const targets = calculateMacroTargets(profile);
  const goalProgress = weightGoalProgress(profile);
  const plan = planForGoal(profile);

  const validate = (): string | null => {
    if (step === 0) {
      if (profile.age < 13 || profile.age > 100) return 'Age must be between 13 and 100.';
      if (profile.heightCm < 120 || profile.heightCm > 230) return 'Height must be between 120 and 230 cm.';
      if (profile.weightKg < 30 || profile.weightKg > 300) return 'Weight must be between 30 and 300 kg.';
    }
    if (step === 1 && profile.targetWeightKg && (profile.targetWeightKg < 30 || profile.targetWeightKg > 300)) {
      return 'Target weight must be between 30 and 300 kg.';
    }
    if (step === 1 && profile.goalWeeks !== undefined && (profile.goalWeeks < 1 || profile.goalWeeks > 104)) {
      return 'Pick a timeline between 1 and 104 weeks.';
    }
    if (step === 3 && profile.focusAreas.length === 0) return 'Pick at least one thing you want from Vitto.';
    return null;
  };

  const advance = () => {
    const failure = validate();
    setStepError(failure);
    if (failure) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else void onAdopt();
  };

  return (
    <KeyboardAvoidingView
      style={layout.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Kicker>Vitto / your life, their story</Kicker>
          {onSignOut ? <TextButton label="Log out" onPress={onSignOut} /> : null}
        </View>

        <View style={styles.progress}>
          {STEPS.map((label, index) => (
            <View key={label} style={[styles.dot, index <= step && styles.dotOn]} />
          ))}
          <Text style={styles.progressLabel}>{STEPS[step]}</Text>
        </View>

        {step === 0 ? (
          <>
            <Text style={styles.headline}>Raise a pet by living well.</Text>
            <Text style={styles.intro}>
              Set a few basics so your companion can learn what fuel supports your goals.
            </Text>
            <Text style={styles.groupLabel}>Who will you raise?</Text>
            <BreedPicker value={breed} onChange={onBreedChange} />
            <Field label="What will you call them?">
              <TextInput style={layout.input} value={name} onChangeText={onNameChange} maxLength={18} />
            </Field>
            <View style={styles.grid}>
              <Field label="Age">
                <TextInput
                  style={layout.input}
                  keyboardType="number-pad"
                  value={String(profile.age)}
                  onChangeText={(value) => onUpdate('age', Number(value.replace(/[^0-9]/g, '')) || 0)}
                />
              </Field>
              <Field label={`Weight (${profile.weightUnit})`}>
                <TextInput
                  style={layout.input}
                  keyboardType="decimal-pad"
                  value={String(displayedWeight)}
                  onChangeText={(value) =>
                    onUpdate('weightKg', toKg(Number(value.replace(/[^0-9.]/g, '')) || 0))
                  }
                />
              </Field>
            </View>
            <ChoiceRow
              options={[
                { value: 'kg' as const, label: 'Kilograms' },
                { value: 'lb' as const, label: 'Pounds' },
              ]}
              value={profile.weightUnit}
              onChange={(value) => onUpdate('weightUnit', value)}
            />
            <ChoiceRow
              options={[
                { value: 'cm' as const, label: 'Centimeters' },
                { value: 'ft' as const, label: 'Feet & inches' },
              ]}
              value={profile.heightUnit}
              onChange={(value) => onUpdate('heightUnit', value)}
            />
            {profile.heightUnit === 'cm' ? (
              <Field label="Height (cm)">
                <TextInput
                  style={layout.input}
                  keyboardType="number-pad"
                  value={String(profile.heightCm)}
                  onChangeText={(value) => onUpdate('heightCm', Number(value.replace(/[^0-9]/g, '')) || 0)}
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
                      onUpdate(
                        'heightCm',
                        feetAndInchesToCm(Number(value.replace(/[^0-9]/g, '')) || 0, displayedHeight.inches),
                      )
                    }
                  />
                </Field>
                <Field label="Height (in)">
                  <TextInput
                    style={layout.input}
                    keyboardType="number-pad"
                    value={String(displayedHeight.inches)}
                    onChangeText={(value) =>
                      onUpdate(
                        'heightCm',
                        feetAndInchesToCm(displayedHeight.feet, Number(value.replace(/[^0-9]/g, '')) || 0),
                      )
                    }
                  />
                </Field>
              </View>
            )}
            <Text style={styles.groupLabel}>Sex</Text>
            <ChoiceRow
              options={[
                { value: 'other' as const, label: 'Prefer not to say' },
                { value: 'female' as const, label: 'Female' },
                { value: 'male' as const, label: 'Male' },
              ]}
              value={profile.sex}
              onChange={(value) => onUpdate('sex', value)}
            />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text style={styles.headline}>What are you working toward?</Text>
            <Text style={styles.intro}>This sets how far your daily calories sit from maintenance.</Text>
            <ChoiceRow options={GOAL_OPTIONS} value={profile.goal} onChange={(value) => onUpdate('goal', value)} />

            {profile.goal !== 'maintain' ? (
              <>
                <Field label={`Target weight (${profile.weightUnit})`} hint="optional">
                  <TextInput
                    style={layout.input}
                    keyboardType="decimal-pad"
                    value={displayedTarget === undefined ? '' : String(displayedTarget)}
                    placeholder="Leave blank to skip"
                    placeholderTextColor={colors.faint}
                    onChangeText={(value) => {
                      const digits = value.replace(/[^0-9.]/g, '');
                      onUpdate('targetWeightKg', digits === '' ? undefined : toKg(Number(digits)));
                    }}
                  />
                </Field>

                {goalProgress && !goalProgress.matchesGoal ? (
                  <Text style={styles.warning}>
                    That target means {goalProgress.direction === 'lose' ? 'losing' : 'gaining'} weight, which
                    does not match this goal. You can keep both — just checking.
                  </Text>
                ) : null}

                {profile.targetWeightKg ? (
                  <>
                    <Text style={styles.groupLabel}>By when?</Text>
                    <ChoiceRow
                      options={TIMELINE_PRESETS.map((weeks) => ({
                        value: String(weeks),
                        label: `${weeks} weeks`,
                        detail: `${Math.round(weeks / 4.345)} months`,
                      }))}
                      value={profile.goalWeeks === undefined ? undefined : String(profile.goalWeeks)}
                      onChange={(value) => onUpdate('goalWeeks', Number(value))}
                    />
                    <Field label="Or set your own (weeks)">
                      <TextInput
                        style={layout.input}
                        keyboardType="number-pad"
                        value={profile.goalWeeks === undefined ? '' : String(profile.goalWeeks)}
                        placeholder="e.g. 14"
                        placeholderTextColor={colors.faint}
                        onChangeText={(value) => {
                          const digits = value.replace(/[^0-9]/g, '');
                          onUpdate('goalWeeks', digits === '' ? undefined : Number(digits));
                        }}
                      />
                    </Field>
                    {plan ? (
                      <View style={styles.plan}>
                        <Text style={styles.planText}>
                          <Text style={styles.planValue}>{plan.kgPerWeek} kg</Text> per week ·{' '}
                          <Text style={styles.planValue}>{Math.abs(plan.dailyAdjustment)} kcal</Text>{' '}
                          {profile.goal === 'lose' ? 'below' : 'above'} maintenance, every day until{' '}
                          {new Date(plan.targetDate).toLocaleDateString([], {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                          .
                        </Text>
                        {plan.capped ? (
                          <Text style={styles.planWarning}>
                            That pace needs {plan.requestedDaily} kcal a day, more than is safe to hold. Capped
                            at {Math.abs(plan.dailyAdjustment)} — about {plan.achievableWeeks} weeks at this rate.
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Text style={styles.groupLabel}>How hard do you want to push?</Text>
                    <ChoiceRow
                      options={PACE_OPTIONS}
                      value={profile.goalPace}
                      onChange={(value) => onUpdate('goalPace', value)}
                    />
                    <Text style={styles.hint}>Set a target weight above to pick a deadline instead.</Text>
                  </>
                )}
              </>
            ) : null}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.headline}>How does your week actually go?</Text>
            <Text style={styles.intro}>
              Training days lift your calorie needs, and lifting raises your protein target.
            </Text>
            <Text style={styles.groupLabel}>Everyday activity</Text>
            <ChoiceRow
              options={ACTIVITY_OPTIONS}
              value={profile.activity}
              onChange={(value) => onUpdate('activity', value)}
            />
            <Field label="Training days per week">
              <TextInput
                style={layout.input}
                keyboardType="number-pad"
                value={String(profile.trainingDaysPerWeek)}
                onChangeText={(value) =>
                  onUpdate(
                    'trainingDaysPerWeek',
                    Math.max(0, Math.min(7, Number(value.replace(/[^0-9]/g, '')) || 0)),
                  )
                }
              />
            </Field>
            <Text style={styles.groupLabel}>What does that training look like?</Text>
            <ChoiceRow
              options={STYLE_OPTIONS}
              value={profile.trainingStyle}
              onChange={(value) => onUpdate('trainingStyle', value)}
            />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={styles.headline}>What do you want from Vitto?</Text>
            <Text style={styles.intro}>Pick as many as you like — your dashboard leads with these.</Text>
            <ChoiceRow
              stacked
              options={FOCUS_OPTIONS}
              value={profile.focusAreas}
              onChange={(area) =>
                onUpdate(
                  'focusAreas',
                  profile.focusAreas.includes(area)
                    ? profile.focusAreas.filter((item) => item !== area)
                    : [...profile.focusAreas, area],
                )
              }
            />
            <View style={styles.summary}>
              <Kicker>Your daily fuel</Kicker>
              <Text style={styles.summaryText}>
                <Text style={styles.summaryValue}>{targets.calories.toLocaleString()}</Text> kcal ·{' '}
                <Text style={styles.summaryValue}>{targets.proteinGrams}g</Text> protein ·{' '}
                <Text style={styles.summaryValue}>{targets.carbsGrams}g</Text> carbs ·{' '}
                <Text style={styles.summaryValue}>{targets.fatGrams}g</Text> fat
              </Text>
              {goalProgress && goalProgress.direction !== 'maintain' ? (
                <Text style={styles.summaryMeta}>
                  {goalProgress.remainingKg} kg to {goalProgress.direction === 'lose' ? 'lose' : 'gain'} ·{' '}
                  {plan
                    ? `${plan.kgPerWeek} kg per week over ${plan.achievableWeeks} weeks`
                    : `a ${profile.goalPace} pace`}
                </Text>
              ) : null}
            </View>
          </>
        ) : null}

        <ErrorText>{stepError ?? error}</ErrorText>

        <View style={styles.actions}>
          <PrimaryButton
            label={step === STEPS.length - 1 ? `Adopt ${name || 'your pet'}` : 'Continue'}
            onPress={advance}
          />
          {step > 0 ? (
            <TextButton
              label="Back"
              onPress={() => {
                setStepError(null);
                setStep(step - 1);
              }}
            />
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 22, paddingTop: 70, paddingBottom: 60 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 22 },
  dot: { width: 26, height: 4, borderRadius: 2, backgroundColor: '#deded7' },
  dotOn: { backgroundColor: colors.coral },
  progressLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginLeft: 8, letterSpacing: 1 },
  headline: { ...text.display, marginTop: 26, lineHeight: 38 },
  intro: { ...text.body, marginTop: 12, color: colors.muted },
  grid: { flexDirection: 'row', gap: 12 },
  groupLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.faint,
    marginTop: 22,
    textTransform: 'uppercase',
  },
  warning: {
    marginTop: 12,
    padding: 12,
    borderLeftWidth: 2,
    borderLeftColor: '#d8a396',
    backgroundColor: '#f7ece8',
    color: '#7a5c53',
    fontSize: 12,
    lineHeight: 18,
  },
  hint: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 12, lineHeight: 16 },
  plan: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(132,160,138,0.35)',
    backgroundColor: '#eef3ec',
  },
  planText: { fontSize: 13, lineHeight: 20, color: colors.inkSoft },
  planValue: { fontSize: 15, fontWeight: '700', color: colors.ink },
  planWarning: { fontFamily: fonts.mono, fontSize: 10, color: '#9a6b5c', marginTop: 8, lineHeight: 15 },
  summary: {
    marginTop: 22,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(132,160,138,0.35)',
    backgroundColor: colors.sageSoft,
  },
  summaryText: { fontSize: 13, lineHeight: 22, color: colors.inkSoft, marginTop: 8 },
  summaryValue: { fontSize: 16, fontWeight: '700', color: colors.ink },
  summaryMeta: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, marginTop: 8 },
  actions: { marginTop: 28, gap: 16 },
});
