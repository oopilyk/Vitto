import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {

  measurementSystemOf,
  type MeasurementSystem,  DIETARY_OPTIONS,
  MOTIVATION_OPTIONS,
  PET_PERSONALITY_OPTIONS,
  STEP_GOAL_PRESETS,
  TRAINING_TYPE_OPTIONS,
  calculateMacroTargets,
  convertHeightToFeetAndInches,
  convertWeightValue,
  createPet,
  deriveEnergyGoal,
  deriveTrainingStyle,
  feetAndInchesToCm,
  hasCompletedQuestionnaire,
  normalizeInviteCode,
  optimalDailySteps,
  optimalTrainingDays,
  petSurvivalGuidance,
  planForGoal,
  suggestStepGoal,
  weeksUntil,
  type BodyProfile,
  type PetBreed,
  type PetPersonality,
  type TrainingType,
} from '@vitto/core';
import { BreedPicker } from '../components/BreedPicker';
import { PetAvatar } from '../components/PetAvatar';
import { IDLE_ACTIVITY } from '../petWorld/toPetAvatarActivityProps';
import { ChoiceRow, ErrorText, Field, Kicker, PrimaryButton, TextButton } from '../components/ui';
import { colors, fonts, layout, text } from '../theme';

interface Props {
  name: string;
  onNameChange: (value: string) => void;
  breed: PetBreed;
  onBreedChange: (breed: PetBreed) => void;
  personality: PetPersonality;
  onPersonalityChange: (value: PetPersonality) => void;
  stepGoal: number;
  onStepGoalChange: (value: number) => void;
  profile: BodyProfile;
  onUpdate: <K extends keyof BodyProfile>(key: K, value: BodyProfile[K]) => void;
  onAdopt: () => Promise<void> | void;
  error: string | null;
  /** Sets weight and height units together, in one write — see `setMeasurementSystem`. */
  onSetUnits: (system: MeasurementSystem) => void;
  onSignOut?: () => void;
  onRedeemInvite?: (code: string) => Promise<boolean>;
}

const INVITE_INPUT_MAX_LENGTH = 7;
const LB_PER_KG = 2.20462;
const toLb = (kg: number) => Math.round(convertWeightValue(kg, 'kg', 'lb'));
const toKg = (lb: number) => lb / LB_PER_KG;

/**
 * Goal-weight bounds, per unit. The same human range either way — onboarding-v2
 * hard-coded the pound figures, which read as nonsense to anyone on kilograms.
 */
const GOAL_BOUNDS = { kg: { min: 30, max: 300 }, lb: { min: 66, max: 660 } } as const;

const ACTIVITY_OPTIONS = [
  { value: 'low' as const, label: 'Mostly sitting', detail: 'Desk job, not much walking' },
  { value: 'moderate' as const, label: 'On my feet some', detail: 'Walking through the day' },
  { value: 'high' as const, label: 'Physically active job', detail: 'Rarely sitting still' },
];

const GYM_DAY_OPTIONS = [
  { value: '0', label: 'None' },
  { value: '2', label: '2 days' },
  { value: '3', label: '3 days' },
  { value: '4', label: '4 days' },
  { value: '5', label: '5 days' },
  { value: '6', label: '6+ days' },
];

/** The month options for the goal-date picker — the next 15 months. */
const monthChoices = () => {
  const out: { value: string; label: string }[] = [];
  const base = new Date();
  base.setDate(1);
  for (let i = 1; i <= 15; i += 1) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    out.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
      label: d.toLocaleDateString([], { month: 'short', year: 'numeric' }),
    });
  }
  return out;
};

const formatMonth = (iso: string | undefined) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString([], { month: 'long', year: 'numeric' })
    : '';

type StepId =
  | 'welcome'
  | 'basics'
  | 'goal'
  | 'commitments'
  | 'motivation'
  | 'choosePet'
  | 'namePet'
  | 'companion';

const SEQUENCE: StepId[] = [
  'welcome',
  'basics',
  'goal',
  'commitments',
  'motivation',
  'choosePet',
  'namePet',
  'companion',
];

export function OnboardingScreen({
  name,
  onNameChange,
  breed,
  onBreedChange,
  personality,
  onPersonalityChange,
  stepGoal,
  onStepGoalChange,
  profile,
  onUpdate,
  onAdopt,
  error,
  onSetUnits,
  onSignOut,
  onRedeemInvite,
}: Props) {
  // Resume at the companion if the questionnaire is answered (fields persist
  // per-keystroke). Decided once so a later edit doesn't yank the user around.
  const startId = useRef<StepId>(
    hasCompletedQuestionnaire(profile) ? 'choosePet' : 'welcome',
  ).current;

  const [stepId, setStepId] = useState<StepId>(startId);
  const [stepError, setStepError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  const index = Math.max(0, SEQUENCE.indexOf(stepId));
  const isLast = index === SEQUENCE.length - 1;

  const months = useMemo(monthChoices, []);
  // Units follow the profile — seeded from the device locale, changed by the
  // Units toggle on this step. `displayedWeight*` keep their names from
  // onboarding-v2, but now hold whichever unit the user is working in.
  const metric = profile.weightUnit === 'kg';
  const toDisplayWeight = (kg: number) => (metric ? Math.round(kg) : toLb(kg));
  const fromDisplayWeight = (value: number) => (metric ? value : toKg(value));
  /** A kg figure from the domain, in the user's unit. */
  const weightLabel = (kg: number) =>
    metric ? `${kg} kg` : `${Math.round(convertWeightValue(kg, 'kg', 'lb') * 10) / 10} lb`;
  const bounds = GOAL_BOUNDS[profile.weightUnit];
  const displayedWeightLb = toDisplayWeight(profile.weightKg);
  const displayedHeight = convertHeightToFeetAndInches(profile.heightCm);
  const displayedGoalLb =
    profile.targetWeightKg === undefined ? undefined : toDisplayWeight(profile.targetWeightKg);

  const targets = calculateMacroTargets(profile);
  const plan = planForGoal(profile);
  const petName = name.trim() || 'Miso';

  const previewPet = useMemo(
    () => createPet('preview', petName, 'dog', breed, personality),
    [petName, breed, personality],
  );

  const setGoalWeightLb = (lb: number | undefined) => {
    const kg = lb === undefined ? undefined : fromDisplayWeight(lb);
    onUpdate('targetWeightKg', kg);
    onUpdate('goal', deriveEnergyGoal(profile.weightKg, kg));
  };

  const setGoalDate = (iso: string) => {
    onUpdate('goalTargetDate', iso);
    const weeks = weeksUntil(iso);
    if (weeks !== undefined) onUpdate('goalWeeks', weeks);
  };

  const toggleTraining = (value: TrainingType) => {
    const list = profile.trainingTypes ?? [];
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    onUpdate('trainingTypes', next);
    const style = deriveTrainingStyle(next);
    if (style) onUpdate('trainingStyle', style);
  };

  const validate = (): string | null => {
    if (stepId === 'basics') {
      if (profile.age < 13 || profile.age > 100) return 'Age must be between 13 and 100.';
      if (profile.heightCm < 120 || profile.heightCm > 230) return 'Enter a valid height.';
      if (profile.weightKg < 30 || profile.weightKg > 300) return 'Enter a valid weight.';
    }
    if (stepId === 'goal') {
      if (profile.targetWeightKg === undefined) return 'Enter the weight you want to reach.';
      const entered = displayedGoalLb ?? 0;
      if (entered < bounds.min || entered > bounds.max) {
        return `Goal weight must be between ${bounds.min} and ${bounds.max} ${profile.weightUnit}.`;
      }
      if (!profile.goalTargetDate) return 'Pick a month to reach it by.';
    }
    if (stepId === 'motivation' && (profile.motivations?.length ?? 0) === 0)
      return 'Pick at least one thing that keeps you going.';
    if (stepId === 'namePet' && !name.trim()) return 'Give your companion a name.';
    return null;
  };

  const advance = async () => {
    const failure = validate();
    setStepError(failure);
    if (failure) return;
    if (!isLast) {
      setStepId(SEQUENCE[index + 1]);
      return;
    }
    setBusy(true);
    try {
      await onAdopt();
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setStepError(null);
    if (index > 0) setStepId(SEQUENCE[index - 1]);
  };

  const join = async () => {
    if (!onRedeemInvite) return;
    const code = normalizeInviteCode(joinCode);
    if (code.length !== 6) {
      setStepError('Enter the six-character code your partner shared.');
      return;
    }
    setJoining(true);
    try {
      await onRedeemInvite(code);
    } catch (cause) {
      setStepError(
        cause instanceof Error && cause.message ? cause.message : 'Could not join that pet.',
      );
    } finally {
      setJoining(false);
    }
  };

  const nextLabel = isLast
    ? 'Enter the Vitto world'
    : stepId === 'welcome'
      ? 'Get started'
      : 'Continue';

  const survival = petSurvivalGuidance(petName);
  const wantsSteps = stepGoal;
  const bestSteps = optimalDailySteps(profile);
  const bestGymDays = optimalTrainingDays(profile);

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

        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${((index + 1) / SEQUENCE.length) * 100}%` }]}
          />
        </View>
        <Text style={styles.progressLabel}>
          Step {index + 1} of {SEQUENCE.length}
        </Text>

        {stepId === 'welcome' ? (
          <View style={styles.stepBlock}>
            <View style={styles.peekPet}>
              <PetAvatar
                {...IDLE_ACTIVITY}
                pet={previewPet}
                isCelebrating={false}
                size={120}
                hideStatusCaption
                stageStyle={styles.peekStage}
              >
                {null}
              </PetAvatar>
            </View>
            <Text style={styles.headline}>A companion that grows with you.</Text>
            <Text style={styles.intro}>
              First, your weight goal and how you want to train. Then you’ll meet the pet that lives
              it with you — every workout, meal and step keeps them going.
            </Text>
            {onRedeemInvite ? (
              showJoin ? (
                <View style={styles.join}>
                  <Field label="Invite code" hint="from your care partner">
                    <TextInput
                      style={[layout.input, styles.inviteInput]}
                      value={joinCode}
                      onChangeText={(value) => {
                        setJoinCode(value);
                        setStepError(null);
                      }}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={INVITE_INPUT_MAX_LENGTH}
                      placeholder="ABC-DEF"
                      placeholderTextColor={colors.faint}
                    />
                  </Field>
                  <PrimaryButton
                    label="Join their pet"
                    busy={joining}
                    disabled={normalizeInviteCode(joinCode).length !== 6}
                    onPress={() => void join()}
                  />
                </View>
              ) : (
                <TextButton
                  label="Have an invite code? Join a partner’s pet"
                  onPress={() => setShowJoin(true)}
                />
              )
            ) : null}
          </View>
        ) : null}

        {stepId === 'basics' ? (
          <View style={styles.stepBlock}>
            <Text style={styles.headline}>A few basics.</Text>
            <Text style={styles.intro}>
              Enough for Vitto to set your calorie target — nothing more.
            </Text>
            {/* One choice for every unit in the app. Seeded from the device
                locale, so a US phone opens on pounds and feet already. */}
            <Field label="Units">
              <ChoiceRow
                options={[
                  { value: 'metric' as const, label: 'Metric', detail: 'kg · cm' },
                  { value: 'imperial' as const, label: 'Imperial', detail: 'lb · ft/in' },
                ]}
                value={measurementSystemOf(profile)}
                onChange={onSetUnits}
              />
            </Field>
            <View style={styles.grid}>
              <Field label="Age">
                <TextInput
                  style={layout.input}
                  keyboardType="number-pad"
                  value={String(profile.age)}
                  onChangeText={(value) =>
                    onUpdate('age', Number(value.replace(/[^0-9]/g, '')) || 0)
                  }
                />
              </Field>
              <Field label={`Weight (${profile.weightUnit})`}>
                <TextInput
                  style={layout.input}
                  keyboardType="number-pad"
                  value={String(displayedWeightLb)}
                  onChangeText={(value) =>
                    onUpdate('weightKg', fromDisplayWeight(Number(value.replace(/[^0-9]/g, '')) || 0))
                  }
                />
              </Field>
            </View>
            {metric ? (
              <Field label="Height (cm)">
                <TextInput
                  style={layout.input}
                  keyboardType="number-pad"
                  value={String(profile.heightCm)}
                  onChangeText={(value) =>
                    onUpdate('heightCm', Number(value.replace(/[^0-9]/g, '')) || 0)
                  }
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
                        feetAndInchesToCm(
                          Number(value.replace(/[^0-9]/g, '')) || 0,
                          displayedHeight.inches,
                        ),
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
                        feetAndInchesToCm(
                          displayedHeight.feet,
                          Number(value.replace(/[^0-9]/g, '')) || 0,
                        ),
                      )
                    }
                  />
                </Field>
              </View>
            )}
            <Text style={styles.groupLabel}>Sex</Text>
            <Text style={styles.hint}>Used only for the energy estimate. Stays private.</Text>
            <ChoiceRow
              options={[
                { value: 'other' as const, label: 'Prefer not to say' },
                { value: 'female' as const, label: 'Female' },
                { value: 'male' as const, label: 'Male' },
              ]}
              value={profile.sex}
              onChange={(value) => onUpdate('sex', value)}
            />
          </View>
        ) : null}

        {stepId === 'goal' ? (
          <View style={styles.stepBlock}>
            <Text style={styles.headline}>What are you working toward?</Text>
            <Text style={styles.intro}>
              You’re at{' '}
              <Text style={styles.inlineValue}>
                {displayedWeightLb} {profile.weightUnit}
              </Text>{' '}
              now. Where do
              you want to be?
            </Text>
            <Field label={`Goal weight (${profile.weightUnit})`}>
              <TextInput
                style={layout.input}
                keyboardType="number-pad"
                value={displayedGoalLb === undefined ? '' : String(displayedGoalLb)}
                placeholder={String(displayedWeightLb)}
                placeholderTextColor={colors.faint}
                onChangeText={(value) => {
                  const digits = value.replace(/[^0-9]/g, '');
                  setGoalWeightLb(digits === '' ? undefined : Number(digits));
                }}
              />
            </Field>
            <Text style={styles.groupLabel}>Reach it by</Text>
            <ChoiceRow
              options={months}
              value={profile.goalTargetDate}
              onChange={setGoalDate}
            />
            {profile.targetWeightKg && profile.goalTargetDate ? (
              <View style={styles.plan}>
                <Kicker>Your daily target</Kicker>
                <Text style={styles.planBig}>{targets.calories.toLocaleString()} kcal</Text>
                <Text style={styles.planText}>
                  {profile.goal === 'maintain'
                    ? `Holding ${displayedWeightLb} ${profile.weightUnit}.`
                    : `${plan ? `About ${weightLabel(plan.kgPerWeek)}` : 'A steady pace'} a week to hit ${
                        displayedGoalLb
                      } ${profile.weightUnit} by ${formatMonth(profile.goalTargetDate)}.`}
                </Text>
                {plan?.capped ? (
                  <Text style={styles.planWarning}>
                    That’s a fast pace — Vitto capped it to stay safe, so it’ll take a bit longer.
                  </Text>
                ) : null}
              </View>
            ) : null}
            <Text style={styles.groupLabel}>Any dietary preference?</Text>
            <ChoiceRow
              options={DIETARY_OPTIONS}
              value={profile.dietaryPreference}
              onChange={(value) => onUpdate('dietaryPreference', value)}
            />
          </View>
        ) : null}

        {stepId === 'commitments' ? (
          <View style={styles.stepBlock}>
            <Text style={styles.headline}>What will you hold yourself to?</Text>
            <Text style={styles.intro}>
              This is what {petName} lives on. Pick what you’ll actually commit to.
            </Text>
            <Text style={styles.groupLabel}>Outside workouts, how active is your day?</Text>
            <ChoiceRow
              options={ACTIVITY_OPTIONS}
              value={profile.activity}
              onChange={(value) => onUpdate('activity', value)}
            />
            <Text style={styles.groupLabel}>Days a week you’ll train</Text>
            <ChoiceRow
              options={GYM_DAY_OPTIONS}
              value={String(profile.trainingDaysPerWeek)}
              onChange={(value) => onUpdate('trainingDaysPerWeek', Number(value))}
            />
            <Text style={styles.groupLabel}>Daily step goal</Text>
            <ChoiceRow
              options={[
                ...STEP_GOAL_PRESETS.map((n) => ({ value: String(n), label: n.toLocaleString() })),
                { value: 'auto', label: 'Let Vitto choose' },
              ]}
              value={
                STEP_GOAL_PRESETS.includes(stepGoal as (typeof STEP_GOAL_PRESETS)[number])
                  ? String(stepGoal)
                  : undefined
              }
              onChange={(value) =>
                onStepGoalChange(value === 'auto' ? suggestStepGoal(profile) : Number(value))
              }
            />
            <Text style={styles.groupLabel}>What kind of training?</Text>
            <ChoiceRow
              stacked
              options={TRAINING_TYPE_OPTIONS}
              value={profile.trainingTypes ?? []}
              onChange={toggleTraining}
            />
          </View>
        ) : null}

        {stepId === 'motivation' ? (
          <View style={styles.stepBlock}>
            <Text style={styles.headline}>What keeps you going?</Text>
            <Text style={styles.intro}>
              Vitto leans on this — for nudges, and how {petName} cheers you on.
            </Text>
            <ChoiceRow
              stacked
              options={MOTIVATION_OPTIONS}
              value={profile.motivations ?? []}
              onChange={(value) => {
                const list = profile.motivations ?? [];
                onUpdate(
                  'motivations',
                  list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
                );
              }}
            />
          </View>
        ) : null}

        {stepId === 'choosePet' ? (
          <View style={styles.stepBlock}>
            <Kicker>Now — your companion</Kicker>
            <Text style={styles.headline}>Who’s coming with you?</Text>
            <Text style={styles.intro}>
              They’ll live your goal with you. Pick the one that feels right.
            </Text>
            <BreedPicker value={breed} onChange={onBreedChange} size={96} />
          </View>
        ) : null}

        {stepId === 'namePet' ? (
          <View style={styles.stepBlock}>
            <View style={styles.centerPet}>
              <PetAvatar
                {...IDLE_ACTIVITY}
                pet={previewPet}
                isCelebrating={false}
                size={180}
                hideStatusCaption
                stageStyle={styles.centerStage}
              >
                {null}
              </PetAvatar>
            </View>
            <Field label="Their name">
              <TextInput
                style={layout.input}
                value={name}
                onChangeText={onNameChange}
                maxLength={18}
                placeholder="Miso"
                placeholderTextColor={colors.faint}
              />
            </Field>
            <Text style={styles.groupLabel}>Their personality</Text>
            <ChoiceRow
              stacked
              options={PET_PERSONALITY_OPTIONS}
              value={personality}
              onChange={onPersonalityChange}
            />
          </View>
        ) : null}

        {stepId === 'companion' ? (
          <View style={styles.stepBlock}>
            <View style={styles.centerPet}>
              <PetAvatar
                {...IDLE_ACTIVITY}
                pet={previewPet}
                isCelebrating
                size={200}
                hideStatusCaption
                stageStyle={styles.centerStage}
              >
                {null}
              </PetAvatar>
            </View>
            <Text style={styles.meetName}>{petName}</Text>
            <Text style={styles.meetLine}>{survival.detail}</Text>

            <View style={styles.recap}>
              <Kicker>Your plan</Kicker>
              <RecapRow label="Goal" value={`${displayedGoalLb ?? displayedWeightLb} ${profile.weightUnit} by ${formatMonth(profile.goalTargetDate) || 'your date'}`} />
              <RecapRow label="Eat" value={`${targets.calories.toLocaleString()} kcal · ${targets.proteinGrams}g protein / day`} />
              <RecapRow
                label="Move"
                value={`${wantsSteps.toLocaleString()} steps/day${
                  bestSteps !== wantsSteps ? `  (aim ${bestSteps.toLocaleString()})` : ''
                }`}
              />
              <RecapRow
                label="Train"
                value={`${profile.trainingDaysPerWeek} days/wk${
                  bestGymDays !== profile.trainingDaysPerWeek ? `  (aim ${bestGymDays})` : ''
                }`}
              />
            </View>
            <Text style={styles.hint}>
              Keep it up most days and {petName} thrives. {petName} is counting on you.
            </Text>
          </View>
        ) : null}

        <ErrorText>{stepError ?? error}</ErrorText>

        <View style={styles.actions}>
          <PrimaryButton label={nextLabel} busy={busy} onPress={() => void advance()} />
          {index > 0 ? <TextButton label="Back" onPress={back} /> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.recapRow}>
      <Text style={styles.recapLabel}>{label}</Text>
      <Text style={styles.recapValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 22, paddingTop: 70, paddingBottom: 60 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e4e2da',
    marginTop: 22,
    overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.coral },
  progressLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.faint,
    marginTop: 8,
    letterSpacing: 1,
  },
  stepBlock: { marginTop: 8 },
  headline: { ...text.display, marginTop: 22, lineHeight: 38 },
  intro: { ...text.body, marginTop: 12, color: colors.muted },
  inlineValue: { fontWeight: '700', color: colors.ink },
  grid: { flexDirection: 'row', gap: 12 },
  groupLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.faint,
    marginTop: 22,
    textTransform: 'uppercase',
  },
  hint: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 12, lineHeight: 16 },
  plan: {
    marginTop: 18,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(132,160,138,0.35)',
    backgroundColor: colors.sageSoft,
  },
  planBig: { fontSize: 30, fontWeight: '700', color: colors.ink, marginTop: 6 },
  planText: { fontSize: 13, lineHeight: 20, color: colors.inkSoft, marginTop: 4 },
  planWarning: { fontFamily: fonts.mono, fontSize: 10, color: '#9a6b5c', marginTop: 8, lineHeight: 15 },
  join: { marginTop: 20, gap: 4, alignSelf: 'stretch' },
  inviteInput: { fontFamily: fonts.mono, letterSpacing: 3 },
  peekPet: { alignItems: 'center', marginTop: 12 },
  peekStage: { height: 130, backgroundColor: 'transparent' },
  centerPet: { alignItems: 'center', marginTop: 10, marginBottom: 8 },
  centerStage: { height: 210, backgroundColor: 'transparent' },
  meetName: { ...text.display, textAlign: 'center', marginTop: 6 },
  meetLine: {
    ...text.body,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 6,
  },
  recap: {
    marginTop: 22,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    gap: 10,
  },
  recapRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  recapLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.faint,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  recapValue: { flex: 1, textAlign: 'right', fontSize: 13, color: colors.ink, fontWeight: '600' },
  actions: { marginTop: 28, gap: 16 },
});
