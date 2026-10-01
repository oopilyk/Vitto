import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import {
  measurementSystemOf,
  type MeasurementSystem,
  DIETARY_OPTIONS,
  MOTIVATION_OPTIONS,
  MATURE_PERSONALITY_AGE,
  PERSONA_MAX_LENGTH,
  companion,
  isValidPersona,
  petPersonalityOptionsFor,
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
import { CharacterDials } from '../components/CharacterDials';
import { PersonalityPreview } from '../components/CharacterEditor';
import { PlusPaywall } from '../components/PlusPaywall';
import { PetAvatar } from '../components/PetAvatar';
import { IDLE_ACTIVITY } from '../petWorld/toPetAvatarActivityProps';
import { ErrorText, PrimaryButton, TextButton } from '../components/ui';
import {
  ChipGroup,
  FieldRow,
  FormField,
  SETTINGS_MAX_WIDTH,
  SegmentedControl,
  SelectionList,
  SelectionTiles,
  TextField,
} from '../components/settingsKit';
import { colors, fonts, layout, themedStyles } from '../theme';

interface Props {
  name: string;
  onNameChange: (value: string) => void;
  breed: PetBreed;
  onBreedChange: (breed: PetBreed) => void;
  /**
   * Whether they may choose a personality at all. Personalities are Plus; a
   * free pet is adopted in the default voice. Defaults to true.
   */
  canCustomise?: boolean;
  personality: PetPersonality;
  onPersonalityChange: (value: PetPersonality) => void;
  /** Their own notes on the character, on any base. Shown from MATURE_PERSONALITY_AGE. */
  persona?: string;
  onPersonaChange?: (value: string) => void;
  /** The five sliders. Reset to the base's positions when the base changes. */
  dials?: companion.PersonalityDials;
  onDialsChange?: (value: companion.PersonalityDials) => void;
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
  /**
   * The Vitto Plus paywall, shown as the third step to anyone without Plus
   * (up-front paywalls earn several times more per install than ones found
   * later in Settings). Absent: no paywall step.
   */
  paywall?: { onTierChange: (tier: 'free' | 'plus') => void; isDevAccount?: boolean };
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
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
  { value: '6', label: '6+' },
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
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString([], { month: 'long', year: 'numeric' }) : '';

type StepId = 'welcome' | 'basics' | 'plus' | 'goal' | 'commitments' | 'motivation' | 'choosePet' | 'namePet' | 'companion';

const FULL_SEQUENCE: StepId[] = [
  'welcome',
  'basics',
  // Third: early enough to be seen by nearly everyone, after a question or two
  // so it is not the very first thing they meet.
  'plus',
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
  canCustomise = true,
  personality,
  onPersonalityChange,
  persona = '',
  onPersonaChange = () => {},
  dials,
  onDialsChange = () => {},
  stepGoal,
  onStepGoalChange,
  profile,
  onUpdate,
  onAdopt,
  error,
  onSetUnits,
  onSignOut,
  onRedeemInvite,
  paywall,
}: Props) {
  // Decided once: buying Plus on the paywall step must not reshuffle the steps
  // (or skip ahead) under their thumb.
  const SEQUENCE = useRef<StepId[]>(FULL_SEQUENCE.filter((step) => step !== 'plus' || (Boolean(paywall) && !canCustomise))).current;
  // Resume at the companion if the questionnaire is answered (fields persist
  // per-keystroke). Decided once so a later edit doesn't yank the user around.
  const startId = useRef<StepId>(hasCompletedQuestionnaire(profile) ? 'choosePet' : 'welcome').current;

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
  const weightLabel = (kg: number) => (metric ? `${kg} kg` : `${Math.round(convertWeightValue(kg, 'kg', 'lb') * 10) / 10} lb`);
  const bounds = GOAL_BOUNDS[profile.weightUnit];
  const displayedWeightLb = toDisplayWeight(profile.weightKg);
  const displayedHeight = convertHeightToFeetAndInches(profile.heightCm);
  const displayedGoalLb = profile.targetWeightKg === undefined ? undefined : toDisplayWeight(profile.targetWeightKg);

  const targets = calculateMacroTargets(profile);
  const plan = planForGoal(profile);
  const petName = name.trim() || 'Miso';

  const previewPet = useMemo(
    () => createPet('preview', petName, 'dog', breed, personality, undefined, persona, dials),
    [petName, breed, personality, persona, dials],
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
    if (stepId === 'motivation' && (profile.motivations?.length ?? 0) === 0) return 'Pick at least one thing that keeps you going.';
    if (stepId === 'namePet' && !name.trim()) return 'Give your companion a name.';
    // They can go back and lower their age after choosing an age-gated one.
    if (stepId === 'namePet' && canCustomise && !petPersonalityOptionsFor(profile.age).some((option) => option.value === personality))
      return 'Pick a personality.';
    if (stepId === 'namePet' && canCustomise && personality === 'custom' && !isValidPersona(persona)) return 'Tell us who they are.';
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
      setStepError(cause instanceof Error && cause.message ? cause.message : 'Could not join that pet.');
    } finally {
      setJoining(false);
    }
  };

  const nextLabel = isLast ? 'Enter the Vitto world' : stepId === 'welcome' ? 'Get started' : 'Continue';

  const survival = petSurvivalGuidance(petName);
  const wantsSteps = stepGoal;
  const bestSteps = optimalDailySteps(profile);
  const bestGymDays = optimalTrainingDays(profile);

  const STEP_EYEBROW: Record<StepId, string> = {
    welcome: 'Welcome',
    basics: 'About you',
    plus: 'Vitto Plus',
    goal: 'Your goal',
    commitments: 'Your habits',
    motivation: 'Motivation',
    choosePet: 'Your companion',
    namePet: 'Your companion',
    companion: 'All set',
  };

  return (
    <KeyboardAvoidingView style={layout.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {index > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} hitSlop={12} style={styles.backButton}>
              <Text style={styles.backMark}>←</Text>
            </Pressable>
          ) : (
            <View style={styles.backButton} />
          )}
          <View style={styles.progress} accessibilityLabel={`Step ${index + 1} of ${SEQUENCE.length}`}>
            {SEQUENCE.map((step, n) => (
              <View key={step} style={[styles.progressSegment, n <= index && styles.progressSegmentOn]} />
            ))}
          </View>
          {onSignOut ? (
            <Pressable accessibilityRole="button" onPress={onSignOut} hitSlop={8} style={styles.signOut}>
              <Text style={styles.signOutLabel}>Log out</Text>
            </Pressable>
          ) : (
            <View style={styles.backButton} />
          )}
        </View>
        <Text style={styles.progressLabel}>
          Step {index + 1} of {SEQUENCE.length}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.page}>
          {stepId !== 'plus' ? <Text style={styles.eyebrow}>{STEP_EYEBROW[stepId]}</Text> : null}

          {stepId === 'welcome' ? (
            <View>
              <View style={styles.heroPet}>
                <PetAvatar
                  {...IDLE_ACTIVITY}
                  pet={previewPet}
                  isCelebrating={false}
                  size={170}
                  hideStatusCaption
                  stageStyle={styles.heroStage}
                >
                  {null}
                </PetAvatar>
              </View>
              <Text style={styles.headline}>A companion that grows with you.</Text>
              <Text style={styles.intro}>
                First, your goal and how you want to train. Then you’ll meet the pet that lives it with you. Every workout, meal and step
                keeps them going.
              </Text>
              <View style={styles.promises}>
                <WelcomePoint mark="1" text="Tell us your goal. Takes about a minute." />
                <WelcomePoint mark="2" text="Pick and name your companion." />
                <WelcomePoint mark="3" text="Look after yourself, and they thrive." />
              </View>
              {onRedeemInvite ? (
                showJoin ? (
                  <View style={styles.join}>
                    <FormField label="Invite code" hint="from your care partner">
                      <TextField
                        style={styles.inviteInput}
                        value={joinCode}
                        onChangeText={(value) => {
                          setJoinCode(value);
                          setStepError(null);
                        }}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={INVITE_INPUT_MAX_LENGTH}
                        placeholder="ABC-DEF"
                      />
                    </FormField>
                    <PrimaryButton
                      label="Join their pet"
                      busy={joining}
                      disabled={normalizeInviteCode(joinCode).length !== 6}
                      onPress={() => void join()}
                    />
                  </View>
                ) : (
                  <View style={styles.joinLink}>
                    <TextButton label="Have an invite code? Join a partner’s pet" onPress={() => setShowJoin(true)} />
                  </View>
                )
              ) : null}
            </View>
          ) : null}

          {stepId === 'basics' ? (
            <View>
              <Text style={styles.headline}>A few basics.</Text>
              <Text style={styles.intro}>Enough for Vitto to set your calorie target. Nothing more.</Text>
              <View style={styles.fields}>
                {/* One choice for every unit in the app. Seeded from the device
                    locale, so a US phone opens on pounds and feet already. */}
                <FormField label="Units">
                  <SegmentedControl
                    options={[
                      { value: 'imperial' as const, label: 'lb · ft' },
                      { value: 'metric' as const, label: 'kg · cm' },
                    ]}
                    value={measurementSystemOf(profile)}
                    onChange={onSetUnits}
                  />
                </FormField>
                <FieldRow>
                  <FormField label="Age">
                    <TextField
                      keyboardType="number-pad"
                      value={String(profile.age)}
                      onChangeText={(value) => onUpdate('age', Number(value.replace(/[^0-9]/g, '')) || 0)}
                    />
                  </FormField>
                  <FormField label={`Weight (${profile.weightUnit})`}>
                    <TextField
                      keyboardType="number-pad"
                      value={String(displayedWeightLb)}
                      onChangeText={(value) => onUpdate('weightKg', fromDisplayWeight(Number(value.replace(/[^0-9]/g, '')) || 0))}
                    />
                  </FormField>
                </FieldRow>
                {metric ? (
                  <FormField label="Height (cm)">
                    <TextField
                      keyboardType="number-pad"
                      value={String(profile.heightCm)}
                      onChangeText={(value) => onUpdate('heightCm', Number(value.replace(/[^0-9]/g, '')) || 0)}
                    />
                  </FormField>
                ) : (
                  <FieldRow>
                    <FormField label="Height (ft)">
                      <TextField
                        keyboardType="number-pad"
                        value={String(displayedHeight.feet)}
                        onChangeText={(value) =>
                          onUpdate('heightCm', feetAndInchesToCm(Number(value.replace(/[^0-9]/g, '')) || 0, displayedHeight.inches))
                        }
                      />
                    </FormField>
                    <FormField label="Height (in)">
                      <TextField
                        keyboardType="number-pad"
                        value={String(displayedHeight.inches)}
                        onChangeText={(value) =>
                          onUpdate('heightCm', feetAndInchesToCm(displayedHeight.feet, Number(value.replace(/[^0-9]/g, '')) || 0))
                        }
                      />
                    </FormField>
                  </FieldRow>
                )}
                <FormField label="Sex" hint="only for the energy estimate, stays private">
                  <SegmentedControl
                    options={[
                      { value: 'female' as const, label: 'Female' },
                      { value: 'male' as const, label: 'Male' },
                      { value: 'other' as const, label: 'Rather not say' },
                    ]}
                    value={profile.sex}
                    onChange={(value) => onUpdate('sex', value)}
                  />
                </FormField>
              </View>
            </View>
          ) : null}

          {stepId === 'goal' ? (
            <View>
              <Text style={styles.headline}>What are you working toward?</Text>
              <Text style={styles.intro}>
                You’re at{' '}
                <Text style={styles.inlineValue}>
                  {displayedWeightLb} {profile.weightUnit}
                </Text>{' '}
                now. Where do you want to be?
              </Text>
              <View style={styles.fields}>
                <FormField label={`Goal weight (${profile.weightUnit})`}>
                  <TextField
                    style={styles.bigInput}
                    keyboardType="number-pad"
                    value={displayedGoalLb === undefined ? '' : String(displayedGoalLb)}
                    placeholder={String(displayedWeightLb)}
                    onChangeText={(value) => {
                      const digits = value.replace(/[^0-9]/g, '');
                      setGoalWeightLb(digits === '' ? undefined : Number(digits));
                    }}
                  />
                </FormField>
                <FormField label="Reach it by">
                  <ChipGroup scroll options={months} value={profile.goalTargetDate} onChange={setGoalDate} />
                </FormField>
                {profile.targetWeightKg && profile.goalTargetDate ? (
                  <View style={styles.plan} testID="goal-plan">
                    <Text style={styles.planLabel}>Your daily target</Text>
                    <Text style={styles.planBig}>{targets.calories.toLocaleString()} kcal</Text>
                    <Text style={styles.planText}>
                      {profile.goal === 'maintain'
                        ? `Holding ${displayedWeightLb} ${profile.weightUnit}.`
                        : `${plan ? `About ${weightLabel(plan.kgPerWeek)}` : 'A steady pace'} a week to hit ${displayedGoalLb} ${
                            profile.weightUnit
                          } by ${formatMonth(profile.goalTargetDate)}.`}
                    </Text>
                    {plan?.capped ? (
                      <Text style={styles.planWarning}>That’s a fast pace. Vitto capped it to stay safe, so it’ll take a bit longer.</Text>
                    ) : null}
                  </View>
                ) : null}
                <FormField label="Any dietary preference?">
                  <ChipGroup
                    options={DIETARY_OPTIONS}
                    value={profile.dietaryPreference}
                    onChange={(value) => onUpdate('dietaryPreference', value)}
                  />
                </FormField>
              </View>
            </View>
          ) : null}

          {stepId === 'commitments' ? (
            <View>
              <Text style={styles.headline}>What will you hold yourself to?</Text>
              <Text style={styles.intro}>This is what {petName} lives on. Pick what you’ll actually commit to.</Text>
              <View style={styles.fields}>
                <FormField label="Outside workouts, how active is your day?">
                  <SelectionList options={ACTIVITY_OPTIONS} value={profile.activity} onChange={(value) => onUpdate('activity', value)} />
                </FormField>
                <FormField label="Days a week you’ll train">
                  <SegmentedControl
                    options={GYM_DAY_OPTIONS}
                    value={String(profile.trainingDaysPerWeek)}
                    onChange={(value) => onUpdate('trainingDaysPerWeek', Number(value))}
                  />
                </FormField>
                <FormField label="Daily step goal">
                  <ChipGroup
                    options={[
                      ...STEP_GOAL_PRESETS.map((n) => ({ value: String(n), label: n.toLocaleString() })),
                      { value: 'auto', label: 'Let Vitto choose' },
                    ]}
                    value={STEP_GOAL_PRESETS.includes(stepGoal as (typeof STEP_GOAL_PRESETS)[number]) ? String(stepGoal) : undefined}
                    onChange={(value) => onStepGoalChange(value === 'auto' ? suggestStepGoal(profile) : Number(value))}
                  />
                </FormField>
                <FormField label="What kind of training?" hint="pick any">
                  <SelectionTiles options={TRAINING_TYPE_OPTIONS} value={profile.trainingTypes ?? []} onChange={toggleTraining} />
                </FormField>
              </View>
            </View>
          ) : null}

          {stepId === 'motivation' ? (
            <View>
              <Text style={styles.headline}>What keeps you going?</Text>
              <Text style={styles.intro}>Vitto leans on this, for nudges and for how {petName} cheers you on. Pick any.</Text>
              <View style={styles.fields}>
                <SelectionList
                  multiple
                  options={MOTIVATION_OPTIONS}
                  value={profile.motivations ?? []}
                  onChange={(value) => {
                    const list = profile.motivations ?? [];
                    onUpdate('motivations', list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
                  }}
                />
              </View>
            </View>
          ) : null}

          {stepId === 'choosePet' ? (
            <View>
              <Text style={styles.headline}>Who’s coming with you?</Text>
              <Text style={styles.intro}>They’ll live your goal with you. Pick the one that feels right.</Text>
              <View style={styles.fields}>
                <BreedPicker value={breed} onChange={onBreedChange} size={96} />
              </View>
            </View>
          ) : null}

          {stepId === 'namePet' ? (
            <View>
              <View style={styles.heroPet}>
                <PetAvatar
                  {...IDLE_ACTIVITY}
                  pet={previewPet}
                  isCelebrating={false}
                  size={170}
                  hideStatusCaption
                  stageStyle={styles.heroStage}
                >
                  {null}
                </PetAvatar>
              </View>
              <View style={styles.fields}>
                <FormField label="Their name">
                  <TextField
                    style={styles.bigInput}
                    value={name}
                    onChangeText={onNameChange}
                    maxLength={18}
                    placeholder="Miso"
                    returnKeyType="done"
                  />
                </FormField>
                <FormField label="Their personality">
                  {!canCustomise ? (
                    <View style={styles.locked} testID="personality-locked">
                      <Text style={styles.lockedTitle}>A Plus feature</Text>
                      <Text style={styles.lockedBody}>
                        {`${name.trim() || 'Your companion'} starts with their own easygoing voice. With Plus you can pick a temperament, fine-tune it, or write them a whole character.`}
                      </Text>
                    </View>
                  ) : (
                    <SelectionList
                      // By age: the ones that swear hard need MATURE_PERSONALITY_AGE.
                      options={petPersonalityOptionsFor(profile.age)}
                      // An age corrected downwards after choosing it leaves nothing selected.
                      value={petPersonalityOptionsFor(profile.age).some((option) => option.value === personality) ? personality : undefined}
                      onChange={(next) => {
                        onPersonalityChange(next);
                        // The sliders show what the base means, and start from it.
                        onDialsChange(companion.dialsFor(next));
                        // Notes are kept when another base is tried, so coming back to
                        // "Your own" does not lose them; only "Your own" uses them.
                      }}
                      // The fine-tuning drops down under the base it tunes.
                      expanded={(chosen) => (
                        <>
                          <PersonalityPreview
                            personality={chosen}
                            dials={dials ?? companion.dialsFor(chosen)}
                            persona={persona}
                            name={name.trim() || 'They'}
                          />
                          <View>
                            <Text style={styles.dialsLabel}>Fine-tune them</Text>
                            <CharacterDials dials={dials ?? companion.dialsFor(chosen)} onChange={onDialsChange} testID="character-dials" />
                          </View>
                          {chosen === 'custom' && profile.age >= MATURE_PERSONALITY_AGE ? (
                            <FormField label="Who are they?" hint="as much or as little as you like">
                              <TextField
                                style={styles.persona}
                                value={persona}
                                onChangeText={(value) => onPersonaChange(value.slice(0, PERSONA_MAX_LENGTH))}
                                placeholder="A grumpy old pirate who secretly adores us and hands out sea shanties as rewards"
                                multiline
                                // Return closes the keyboard rather than starting a new line.
                                returnKeyType="done"
                                submitBehavior="blurAndSubmit"
                                onSubmitEditing={() => Keyboard.dismiss()}
                                maxLength={PERSONA_MAX_LENGTH}
                                accessibilityLabel="Their character"
                              />
                              <Text style={styles.personaCount}>{`${persona.length} / ${PERSONA_MAX_LENGTH}`}</Text>
                            </FormField>
                          ) : null}
                        </>
                      )}
                    />
                  )}
                </FormField>
              </View>
            </View>
          ) : null}

          {stepId === 'companion' ? (
            <View>
              <View style={styles.heroPet}>
                <PetAvatar {...IDLE_ACTIVITY} pet={previewPet} isCelebrating size={200} hideStatusCaption stageStyle={styles.heroStageTall}>
                  {null}
                </PetAvatar>
              </View>
              <Text style={styles.meetName}>{petName}</Text>
              <Text style={styles.meetLine}>{survival.detail}</Text>

              <View style={styles.recap}>
                <Text style={styles.recapTitle}>Your plan</Text>
                <RecapRow
                  label="Goal"
                  value={`${displayedGoalLb ?? displayedWeightLb} ${profile.weightUnit} by ${formatMonth(profile.goalTargetDate) || 'your date'}`}
                />
                <RecapRow label="Eat" value={`${targets.calories.toLocaleString()} kcal · ${targets.proteinGrams}g protein / day`} />
                <RecapRow
                  label="Move"
                  value={`${wantsSteps.toLocaleString()} steps/day${bestSteps !== wantsSteps ? `  (aim ${bestSteps.toLocaleString()})` : ''}`}
                />
                <RecapRow
                  label="Train"
                  value={`${profile.trainingDaysPerWeek} days/wk${bestGymDays !== profile.trainingDaysPerWeek ? `  (aim ${bestGymDays})` : ''}`}
                />
              </View>
              <Text style={styles.hint}>
                Keep it up most days and {petName} thrives. {petName} is counting on you.
              </Text>
            </View>
          ) : null}

          {stepId === 'plus' && paywall ? (
            <PlusPaywall
              skippable
              isDevAccount={paywall.isDevAccount}
              onTierChange={paywall.onTierChange}
              // Not now, or bought: either way, on with onboarding.
              onClose={() => setStepId(SEQUENCE[index + 1])}
              onPurchased={() => setStepId(SEQUENCE[index + 1])}
            />
          ) : null}
        </View>
      </ScrollView>

      {stepId !== 'plus' ? (
        <View style={styles.footer}>
          <View style={styles.footerInner}>
            <ErrorText>{stepError ?? error}</ErrorText>
            <PrimaryButton label={nextLabel} busy={busy} onPress={() => void advance()} />
          </View>
        </View>
      ) : (
        <ErrorText>{stepError ?? error}</ErrorText>
      )}
    </KeyboardAvoidingView>
  );
}

function WelcomePoint({ mark, text: line }: { mark: string; text: string }) {
  return (
    <View style={styles.promise}>
      <View style={styles.promiseMark}>
        <Text style={styles.promiseMarkText}>{mark}</Text>
      </View>
      <Text style={styles.promiseText}>{line}</Text>
    </View>
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

const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;

const styles = themedStyles(() => ({
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 44, height: 36, justifyContent: 'center' },
  backMark: { fontSize: 22, color: colors.ink },
  progress: { flex: 1, flexDirection: 'row', gap: 4 },
  progressSegment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.track },
  progressSegmentOn: { backgroundColor: colors.coral },
  signOut: { minWidth: 44, height: 36, justifyContent: 'center', alignItems: 'flex-end' },
  signOutLabel: { fontSize: 13, fontWeight: '500', color: colors.muted },
  progressLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, letterSpacing: 1, textAlign: 'center', marginTop: 6 },

  body: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 140 },
  page: { width: '100%', maxWidth: SETTINGS_MAX_WIDTH, alignSelf: 'center' },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.coralDeep,
    marginTop: 8,
  },
  headline: { fontSize: 30, fontWeight: '800', color: colors.ink, letterSpacing: -0.6, lineHeight: 36, marginTop: 8 },
  intro: { fontSize: 16, color: colors.muted, lineHeight: 23, marginTop: 10 },
  inlineValue: { fontWeight: '700', color: colors.ink },
  fields: { marginTop: 24, gap: 22 },
  bigInput: { fontSize: 22, fontWeight: '700', minHeight: 56 },
  hint: { fontSize: 13, color: colors.muted, marginTop: 16, lineHeight: 19, textAlign: 'center' },

  heroPet: { alignItems: 'center', marginTop: 4 },
  heroStage: { height: 180, backgroundColor: 'transparent' },
  heroStageTall: { height: 210, backgroundColor: 'transparent' },
  promises: { marginTop: 24, gap: 12 },
  promise: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  promiseMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.selectedFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promiseMarkText: { fontSize: 13, fontWeight: '700', color: colors.coralDeep },
  promiseText: { flex: 1, fontSize: 15, color: colors.inkSoft },
  join: { marginTop: 24, gap: 12 },
  joinLink: { marginTop: 20, alignItems: 'center' },
  inviteInput: { fontFamily: fonts.mono, letterSpacing: 3 },

  plan: { padding: 18, borderRadius: 16, backgroundColor: colors.sageSoft },
  planLabel: { fontSize: 13, fontWeight: '600', color: colors.inkSoft },
  planBig: { fontSize: 32, fontWeight: '800', color: colors.ink, marginTop: 4, letterSpacing: -0.5 },
  planText: { fontSize: 14, lineHeight: 20, color: colors.inkSoft, marginTop: 4 },
  planWarning: { fontSize: 12, color: colors.caution, marginTop: 8, lineHeight: 17 },

  locked: { borderRadius: 16, padding: 16, gap: 4, backgroundColor: colors.cardSoft },
  lockedTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  lockedBody: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  dialsLabel: { fontSize: 13, fontWeight: '600', color: colors.inkSoft, marginBottom: 6 },
  persona: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top', lineHeight: 20 },
  personaCount: { fontSize: 12, color: colors.faint, textAlign: 'right' },

  meetName: { fontSize: 34, fontWeight: '800', color: colors.ink, textAlign: 'center', letterSpacing: -0.6, marginTop: 4 },
  meetLine: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 22, marginTop: 8, paddingHorizontal: 6 },
  recap: {
    marginTop: 22,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    gap: 12,
  },
  recapTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  recapRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  recapLabel: { fontSize: 14, color: colors.muted },
  recapValue: { flex: 1, textAlign: 'right', fontSize: 14, color: colors.ink, fontWeight: '600' },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: HOME_INDICATOR_INSET + 8,
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  footerInner: { width: '100%', maxWidth: SETTINGS_MAX_WIDTH, alignSelf: 'center', gap: 8 },
}));
