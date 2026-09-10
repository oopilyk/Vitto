import { useMemo, useRef, useState } from 'react';
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
  DIETARY_OPTIONS,
  MOTIVATION_OPTIONS,
  PET_PERSONALITY_OPTIONS,
  PRIMARY_GOAL_OPTIONS,
  STEP_GOAL_PRESETS,
  TRAINING_TYPE_OPTIONS,
  calculateMacroTargets,
  convertHeightToFeetAndInches,
  convertWeightValue,
  createPet,
  deriveEnergyGoal,
  deriveTrainingStyle,
  feetAndInchesToCm,
  goalInvolvesWeightChange,
  hasCompletedQuestionnaire,
  normalizeInviteCode,
  planForGoal,
  suggestStepGoal,
  weightGoalProgress,
  type BodyProfile,
  type PetBreed,
  type PetPersonality,
  type PrimaryGoal,
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
  onSignOut?: () => void;
  /** Joins a care partner's pet instead of adopting — see App. */
  onRedeemInvite?: (code: string) => Promise<boolean>;
}

const INVITE_INPUT_MAX_LENGTH = 7;

const ACTIVITY_OPTIONS = [
  { value: 'low' as const, label: 'Mostly sitting' },
  { value: 'moderate' as const, label: 'On my feet some' },
  { value: 'high' as const, label: 'On my feet all day' },
];

const ENERGY_GOAL_OPTIONS = [
  { value: 'lose' as const, label: 'Eat in a deficit', detail: 'Trend the scale down' },
  { value: 'maintain' as const, label: 'Eat at maintenance', detail: 'Hold steady while you train' },
  { value: 'gain' as const, label: 'Eat in a surplus', detail: 'Fuel growth' },
];

const TRAINING_DAY_OPTIONS = [
  { value: '0', label: 'None' },
  { value: '2', label: '1–2 / wk' },
  { value: '3', label: '3 / wk' },
  { value: '4', label: '4 / wk' },
  { value: '5', label: '5 / wk' },
  { value: '6', label: '6+ / wk' },
];

const TIMELINE_PRESETS = [8, 12, 16, 24];

type StepId =
  | 'welcome'
  | 'basics'
  | 'goal'
  | 'weight'
  | 'training'
  | 'steps'
  | 'nutrition'
  | 'motivation'
  | 'choosePet'
  | 'namePet'
  | 'meetPet';

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
  onSignOut,
  onRedeemInvite,
}: Props) {
  // Resume at the companion if the questionnaire is already answered (fields
  // persist per-keystroke, so a refresh mid-flow keeps everything). Computed
  // once — a later answer changing shouldn't yank the user around.
  const startId = useRef<StepId>(
    hasCompletedQuestionnaire(profile) ? 'choosePet' : 'welcome',
  ).current;

  const sequence = useMemo<StepId[]>(() => {
    const all: StepId[] = [
      'welcome',
      'basics',
      'goal',
      'weight',
      'training',
      'steps',
      'nutrition',
      'motivation',
      'choosePet',
      'namePet',
      'meetPet',
    ];
    return all.filter((id) => id !== 'weight' || goalInvolvesWeightChange(profile.primaryGoal));
  }, [profile.primaryGoal]);

  const [stepId, setStepId] = useState<StepId>(startId);
  const [stepError, setStepError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  const index = Math.max(0, sequence.indexOf(stepId));
  const isLast = index === sequence.length - 1;

  const metric = profile.weightUnit === 'kg';
  const toKg = (value: number) => (metric ? value : value / 2.20462);
  const displayedWeight = metric
    ? Math.round(profile.weightKg * 10) / 10
    : Math.round(convertWeightValue(profile.weightKg, 'kg', 'lb') * 10) / 10;
  const displayedHeight = convertHeightToFeetAndInches(profile.heightCm);
  const displayedTarget =
    profile.targetWeightKg === undefined
      ? undefined
      : metric
        ? Math.round(profile.targetWeightKg * 10) / 10
        : Math.round(convertWeightValue(profile.targetWeightKg, 'kg', 'lb') * 10) / 10;

  const targets = calculateMacroTargets(profile);
  const goalProgress = weightGoalProgress(profile);
  const plan = planForGoal(profile);

  const previewPet = useMemo(
    () => createPet('preview', name.trim() || 'Miso', 'dog', breed, personality),
    [name, breed, personality],
  );

  const setPrimaryGoal = (value: PrimaryGoal) => {
    onUpdate('primaryGoal', value);
    // Seed the energy-balance axis the calorie maths reads. The weight step
    // lets the user override it.
    onUpdate('goal', deriveEnergyGoal(value));
    if (!goalInvolvesWeightChange(value)) onUpdate('targetWeightKg', undefined);
  };

  const toggleInList = <T extends string>(key: keyof BodyProfile, list: T[], value: T) => {
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    onUpdate(key, next as BodyProfile[typeof key]);
    return next;
  };

  const setTrainingTypes = (value: TrainingType) => {
    const next = toggleInList<TrainingType>('trainingTypes', profile.trainingTypes ?? [], value);
    const style = deriveTrainingStyle(next);
    if (style) onUpdate('trainingStyle', style);
  };

  const validate = (): string | null => {
    if (stepId === 'basics') {
      if (profile.age < 13 || profile.age > 100) return 'Age must be between 13 and 100.';
      if (profile.heightCm < 120 || profile.heightCm > 230)
        return 'Height must be between 120 and 230 cm.';
      if (profile.weightKg < 30 || profile.weightKg > 300)
        return 'Weight must be between 30 and 300 kg.';
    }
    if (stepId === 'goal' && !profile.primaryGoal) return 'Pick what you are mainly working toward.';
    if (stepId === 'weight' && displayedTarget !== undefined) {
      const kg = profile.targetWeightKg ?? 0;
      if (kg < 30 || kg > 300) return 'Target weight must be between 30 and 300 kg.';
      // Under-18s: no weight-change target is calculated for them — the pace
      // presets and plain calorie axis carry the goal instead.
      if (profile.age < 18)
        return 'We don’t set weight targets under 18 — pick a pace instead, or leave the target blank.';
    }
    if (
      stepId === 'weight' &&
      profile.goalWeeks !== undefined &&
      (profile.goalWeeks < 1 || profile.goalWeeks > 104)
    ) {
      return 'Pick a timeline between 1 and 104 weeks.';
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
      setStepId(sequence[index + 1]);
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
    if (index > 0) setStepId(sequence[index - 1]);
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
            style={[styles.progressFill, { width: `${((index + 1) / sequence.length) * 100}%` }]}
          />
        </View>
        <Text style={styles.progressLabel}>
          Step {index + 1} of {sequence.length}
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
              First we’ll get to know you and what you’re working toward. Then you’ll meet the pet
              that lives it with you — every workout, every meal, every step counts.
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
              Enough for Vitto to set sensible starting targets — nothing more.
            </Text>
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
            <Text style={styles.groupLabel}>How active is your day, off training?</Text>
            <ChoiceRow
              options={ACTIVITY_OPTIONS}
              value={profile.activity}
              onChange={(value) => onUpdate('activity', value)}
            />
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
            <Text style={styles.headline}>What are you mainly working toward?</Text>
            <Text style={styles.intro}>Pick one. This shapes your targets, and your pet’s.</Text>
            <ChoiceRow
              stacked
              options={PRIMARY_GOAL_OPTIONS}
              value={profile.primaryGoal}
              onChange={setPrimaryGoal}
            />
            {profile.primaryGoal ? (
              <>
                <Text style={styles.groupLabel}>Anything else? (optional)</Text>
                <ChoiceRow
                  stacked
                  options={PRIMARY_GOAL_OPTIONS.filter((o) => o.value !== profile.primaryGoal)}
                  value={profile.secondaryGoals ?? []}
                  onChange={(value) =>
                    toggleInList<PrimaryGoal>(
                      'secondaryGoals',
                      profile.secondaryGoals ?? [],
                      value,
                    )
                  }
                />
              </>
            ) : null}
          </View>
        ) : null}

        {stepId === 'weight' ? (
          <View style={styles.stepBlock}>
            <Text style={styles.headline}>How do you want to eat for that?</Text>
            <Text style={styles.intro}>
              Sustainable beats aggressive — Vitto keeps the pace in a safe range whatever you pick.
            </Text>
            <ChoiceRow
              stacked
              options={ENERGY_GOAL_OPTIONS}
              value={profile.goal}
              onChange={(value) => onUpdate('goal', value)}
            />
            {profile.goal !== 'maintain' ? (
              <>
                <Field label={`Goal weight (${profile.weightUnit})`} hint="optional">
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
                    That target means {goalProgress.direction === 'lose' ? 'losing' : 'gaining'}{' '}
                    weight, which doesn’t match how you chose to eat. Both can be true — just
                    flagging it.
                  </Text>
                ) : null}
                {profile.targetWeightKg ? (
                  <>
                    <Text style={styles.groupLabel}>By when?</Text>
                    <ChoiceRow
                      options={TIMELINE_PRESETS.map((weeks) => ({
                        value: String(weeks),
                        label: `${weeks} wks`,
                      }))}
                      value={
                        profile.goalWeeks === undefined ? undefined : String(profile.goalWeeks)
                      }
                      onChange={(value) => onUpdate('goalWeeks', Number(value))}
                    />
                    {plan ? (
                      <View style={styles.plan}>
                        <Text style={styles.planText}>
                          About <Text style={styles.planValue}>{plan.kgPerWeek} kg</Text> a week —{' '}
                          <Text style={styles.planValue}>
                            {Math.abs(plan.dailyAdjustment)} kcal
                          </Text>{' '}
                          {profile.goal === 'lose' ? 'below' : 'above'} maintenance daily.
                        </Text>
                        {plan.capped ? (
                          <Text style={styles.planWarning}>
                            That pace isn’t safe to hold — capped, so it’ll take about{' '}
                            {plan.achievableWeeks} weeks.
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Text style={styles.groupLabel}>How hard do you want to push?</Text>
                    <ChoiceRow
                      options={[
                        { value: 'gentle' as const, label: 'Gentle' },
                        { value: 'steady' as const, label: 'Steady' },
                        { value: 'focused' as const, label: 'Focused' },
                      ]}
                      value={profile.goalPace}
                      onChange={(value) => onUpdate('goalPace', value)}
                    />
                  </>
                )}
              </>
            ) : null}
          </View>
        ) : null}

        {stepId === 'training' ? (
          <View style={styles.stepBlock}>
            <Text style={styles.headline}>How do you train?</Text>
            <Text style={styles.intro}>
              This is how Vitto makes the pet feel like yours — pick everything that fits.
            </Text>
            <ChoiceRow
              stacked
              options={TRAINING_TYPE_OPTIONS}
              value={profile.trainingTypes ?? []}
              onChange={setTrainingTypes}
            />
            <Text style={styles.groupLabel}>How often?</Text>
            <ChoiceRow
              options={TRAINING_DAY_OPTIONS}
              value={String(profile.trainingDaysPerWeek)}
              onChange={(value) => onUpdate('trainingDaysPerWeek', Number(value))}
            />
          </View>
        ) : null}

        {stepId === 'steps' ? (
          <View style={styles.stepBlock}>
            <Text style={styles.headline}>A daily step goal.</Text>
            <Text style={styles.intro}>
              Everyday movement counts too. Pick a number to aim for.
            </Text>
            <ChoiceRow
              options={[
                ...STEP_GOAL_PRESETS.map((n) => ({
                  value: String(n),
                  label: n.toLocaleString(),
                })),
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
            <Field label="Or set your own">
              <TextInput
                style={layout.input}
                keyboardType="number-pad"
                value={String(stepGoal)}
                onChangeText={(value) => {
                  const n = Number(value.replace(/[^0-9]/g, '')) || 0;
                  if (n >= 1000 && n <= 50000) onStepGoalChange(n);
                }}
              />
            </Field>
          </View>
        ) : null}

        {stepId === 'nutrition' ? (
          <View style={styles.stepBlock}>
            <Text style={styles.headline}>Vitto’s starting targets.</Text>
            <Text style={styles.intro}>
              Built from what you’ve told us. They update on their own as your weight, goal or
              training change — you never do the maths.
            </Text>
            <View style={styles.targets}>
              <TargetPill value={targets.calories.toLocaleString()} unit="kcal" />
              <TargetPill value={`${targets.proteinGrams}g`} unit="protein" />
              <TargetPill value={`${targets.carbsGrams}g`} unit="carbs" />
              <TargetPill value={`${targets.fatGrams}g`} unit="fat" />
            </View>
            <Text style={styles.groupLabel}>Any dietary preference?</Text>
            <ChoiceRow
              options={DIETARY_OPTIONS}
              value={profile.dietaryPreference}
              onChange={(value) => onUpdate('dietaryPreference', value)}
            />
          </View>
        ) : null}

        {stepId === 'motivation' ? (
          <View style={styles.stepBlock}>
            <Text style={styles.headline}>What keeps you going?</Text>
            <Text style={styles.intro}>
              Vitto leans on this — for nudges, quests, and how your pet cheers you on.
            </Text>
            <ChoiceRow
              stacked
              options={MOTIVATION_OPTIONS}
              value={profile.motivations ?? []}
              onChange={(value) => toggleInList('motivations', profile.motivations ?? [], value)}
            />
          </View>
        ) : null}

        {stepId === 'choosePet' ? (
          <View style={styles.stepBlock}>
            <Kicker>Now — your companion</Kicker>
            <Text style={styles.headline}>Who’s coming with you?</Text>
            <Text style={styles.intro}>
              They’ll live your goals with you. Pick the one that feels right.
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

        {stepId === 'meetPet' ? (
          <View style={styles.stepBlock}>
            <View style={styles.centerPet}>
              <PetAvatar
                {...IDLE_ACTIVITY}
                pet={previewPet}
                isCelebrating
                size={220}
                hideStatusCaption
                stageStyle={styles.centerStage}
              >
                {null}
              </PetAvatar>
            </View>
            <Text style={styles.meetName}>{name.trim() || 'Miso'}</Text>
            <Text style={styles.meetLine}>
              {name.trim() || 'Miso'} is ready. Every healthy choice you make from here, you make
              together.
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

function TargetPill({ value, unit }: { value: string; unit: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillValue}>{value}</Text>
      <Text style={styles.pillUnit}>{unit}</Text>
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
  grid: { flexDirection: 'row', gap: 12 },
  groupLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.faint,
    marginTop: 22,
    textTransform: 'uppercase',
  },
  hint: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 6, lineHeight: 15 },
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
  planWarning: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: '#9a6b5c',
    marginTop: 8,
    lineHeight: 15,
  },
  targets: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  pill: {
    flexGrow: 1,
    flexBasis: 130,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
  },
  pillValue: { fontSize: 20, fontWeight: '700', color: colors.ink },
  pillUnit: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  join: { marginTop: 20, gap: 4, alignSelf: 'stretch' },
  inviteInput: { fontFamily: fonts.mono, letterSpacing: 3 },
  peekPet: { alignItems: 'center', marginTop: 12 },
  peekStage: { height: 130, backgroundColor: 'transparent' },
  centerPet: { alignItems: 'center', marginTop: 10, marginBottom: 8 },
  centerStage: { height: 220, backgroundColor: 'transparent' },
  meetName: { ...text.display, textAlign: 'center', marginTop: 6 },
  meetLine: {
    ...text.body,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 8,
  },
  actions: { marginTop: 28, gap: 16 },
});
