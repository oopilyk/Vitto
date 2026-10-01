import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFonts, Rubik_400Regular, Rubik_500Medium, Rubik_600SemiBold, Rubik_700Bold } from '@expo-google-fonts/rubik';
import {
  measurementSystemOf,
  type MeasurementSystem,
  MOTIVATION_OPTIONS,
  MATURE_PERSONALITY_AGE,
  PERSONA_MAX_LENGTH,
  companion,
  isValidPersona,
  petPersonalityOptionsFor,
  STEP_GOAL_PRESETS,
  TRAINING_TYPE_OPTIONS,
  calculateMacroTargets,
  createPet,
  deriveEnergyGoal,
  deriveTrainingStyle,
  feetAndInchesToCm,
  hasCompletedQuestionnaire,
  normalizeInviteCode,
  petSurvivalGuidance,
  suggestStepGoal,
  weeksUntil,
  type BodyProfile,
  type Motivation,
  type PetBreed,
  type PetPersonality,
  type TrainingType,
} from '@vitto/core';
import { CharacterDials } from '../components/CharacterDials';
import { PersonalityPreview } from '../components/CharacterEditor';
import { billingService, PLUS_PLANS, TRIAL_DAYS, TRIAL_REMINDER_DAY, type PlusPlan } from '../services/billingService';
import { scheduleTrialReminder } from '../services/pushService';
import { PetAvatar } from '../components/PetAvatar';
import { PET_SHEETS, sheetByBreed } from '../components/petSprites';
import { SpriteFrame } from '../components/SpriteFrame';
import { IDLE_ACTIVITY } from '../petWorld/toPetAvatarActivityProps';
import { colors, getColorScheme, themedStyles } from '../theme';

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
   * The Vitto Plus paywall, shown to anyone without Plus once they have seen
   * their plan (the point it is worth most). Absent: no paywall step.
   */
  paywall?: { onTierChange: (tier: 'free' | 'plus') => void; isDevAccount?: boolean };
  /** Asks the OS for notifications; resolves to whether they are on. Absent where push cannot work. */
  onEnableNotifications?: () => Promise<boolean>;
}

const INVITE_INPUT_MAX_LENGTH = 7;
const LB_PER_KG = 2.20462;

/** Goal-weight bounds, per unit: the same human range either way. */
const GOAL_BOUNDS = { kg: { min: 30, max: 300 }, lb: { min: 66, max: 660 } } as const;

/** Ages as ranges, the way you would say it out loud; each lands on a representative age. */
const AGE_OPTIONS = [
  { label: 'Under 18', age: 15 },
  { label: '18-24', age: 21 },
  { label: '25-34', age: 29 },
  { label: '35-44', age: 39 },
  { label: '45-54', age: 49 },
  { label: '55-64', age: 59 },
  { label: '65 and over', age: 68 },
];

const GOAL_OPTIONS = [
  { value: 'lose' as const, emoji: '🔥', label: 'Lose fat' },
  { value: 'maintain' as const, emoji: '⚖️', label: 'Stay where I am' },
  { value: 'gain' as const, emoji: '💪', label: 'Build muscle' },
];

const ACTIVITY_OPTIONS = [
  { value: 'low' as const, emoji: '🪑', label: 'Mostly sitting', detail: 'Desk job, not much walking' },
  { value: 'moderate' as const, emoji: '🚶', label: 'On my feet some', detail: 'Walking through the day' },
  { value: 'high' as const, emoji: '🏃', label: 'Always moving', detail: 'A physical job, rarely sitting' },
];

const TRAINING_DAY_OPTIONS = [
  { value: 0, label: 'Not yet' },
  { value: 2, label: '2 days' },
  { value: 3, label: '3 days' },
  { value: 4, label: '4 days' },
  { value: 5, label: '5 days' },
  { value: 6, label: '6+ days' },
];

const STEP_LABEL: Record<number, string> = { 5000: 'Easing in', 7500: 'Steady', 10000: 'The classic', 12500: 'Ambitious' };

const COMMIT_OPTIONS = [
  { days: 3, emoji: '🙌', note: 'Baby steps' },
  { days: 7, emoji: '💪', note: 'Strong start' },
  { days: 14, emoji: '🎯', note: 'Clearly committed' },
  { days: 30, emoji: '🔥', note: 'Unstoppable streak' },
];

const NAME_IDEAS = [
  'Miso',
  'Mochi',
  'Biscuit',
  'Pip',
  'Tofu',
  'Nugget',
  'Bean',
  'Waffles',
  'Peanut',
  'Juniper',
  'Pickles',
  'Clover',
  'Dumpling',
];

/** The pets that greet you before you have picked one. */
const WELCOME_PETS: PetBreed[] = ['bichon', 'bear', 'shiba'];

/** The month options for the goal date: the next 15 months. */
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

type StepId =
  | 'welcome'
  | 'choosePet'
  | 'meetPet'
  | 'namePet'
  | 'yourName'
  | 'aboutIntro'
  | 'age'
  | 'sex'
  | 'body'
  | 'goal'
  | 'target'
  | 'activity'
  | 'trainingDays'
  | 'trainingTypes'
  | 'steps'
  | 'motivation'
  | 'plan'
  | 'plusPersonality'
  | 'plusMeals'
  | 'plusChat'
  | 'plusOffer'
  | 'personality'
  | 'notifications'
  | 'commit'
  | 'dayOne';

const FULL_SEQUENCE: StepId[] = [
  'welcome',
  // Meet the pet first: attachment before questions.
  'choosePet',
  // The moment they become yours: a little party before anything else.
  'meetPet',
  'namePet',
  'yourName',
  // Then, gently, about you. One question a screen.
  'aboutIntro',
  'age',
  'sex',
  'body',
  'goal',
  'target',
  'activity',
  'trainingDays',
  'trainingTypes',
  'steps',
  'motivation',
  // What it adds up to, and then the offer, while the plan is fresh: three
  // pages of what Plus gives, then the offer itself.
  'plan',
  'plusPersonality',
  'plusMeals',
  'plusChat',
  'plusOffer',
  'personality',
  'notifications',
  'commit',
  'dayOne',
];

/** The questions about you; skipped on a resume once they are answered (they persist per answer). */
const QUESTION_STEPS = new Set<StepId>([
  'aboutIntro',
  'age',
  'sex',
  'body',
  'goal',
  'target',
  'activity',
  'trainingDays',
  'trainingTypes',
  'steps',
  'motivation',
]);

/** Screens that move on by themselves once something is tapped: no button. */
const TAP_TO_ADVANCE = new Set<StepId>(['age', 'sex', 'goal', 'activity', 'trainingDays', 'steps']);

/** Screens without the back button and progress bar. */
const BARE = new Set<StepId>(['welcome', 'plusOffer', 'dayOne']);

/** The Plus pages, shown together or not at all. */
const PLUS_STEPS = new Set<StepId>(['plusPersonality', 'plusMeals', 'plusChat', 'plusOffer']);

/** A haptic that never gets in the way: skipped on web, and silent wherever it is unavailable. */
const buzz = (fire: () => Promise<unknown> | undefined) => {
  if (Platform.OS === 'web') return;
  try {
    void fire()?.catch(() => {});
  } catch {
    // No haptics engine here; the tap still works.
  }
};
const tick = () => buzz(() => Haptics.selectionAsync?.());
const thump = () => buzz(() => Haptics.impactAsync?.(Haptics.ImpactFeedbackStyle?.Light));
const cheer = () => buzz(() => Haptics.notificationAsync?.(Haptics.NotificationFeedbackType?.Success));

/** Onboarding's own type: a soft, rounded face, set big. */
const FONT = {
  regular: 'Rubik_400Regular',
  medium: 'Rubik_500Medium',
  semibold: 'Rubik_600SemiBold',
  bold: 'Rubik_700Bold',
};

/**
 * Onboarding's palette: clean white, soft greys and one friendly green for
 * "go" and "chosen", in the manner of the best pet apps. Dark mode keeps the
 * shapes and the green and swaps the greys for the app's dark surfaces.
 */
const palette = () =>
  getColorScheme() === 'dark'
    ? {
        bg: colors.paper,
        text: colors.ink,
        sub: colors.muted,
        soft: colors.cardSoft,
        softEdge: colors.border,
        border: colors.hairline,
        input: colors.card,
        green: '#6dbb5e',
        greenEdge: '#4b8a3f',
        greenPale: '#1f3320',
      }
    : {
        bg: '#ffffff',
        text: '#333333',
        sub: '#6b7785',
        soft: '#f0f0f0',
        softEdge: '#d9d9d9',
        border: '#ebebeb',
        input: '#f7f7f7',
        green: '#6dbb5e',
        greenEdge: '#55994a',
        greenPale: '#eef8eb',
      };

/**
 * Onboarding, the way the best pet apps do it: one small thing per screen,
 * your pet on screen and talking the whole way once you have picked them,
 * taps that answer and move on by themselves, and a little haptic for every
 * choice. Nothing is chosen for you: every answer waits for your tap. The
 * questions still fill the same profile the calorie and macro targets read.
 */
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
  onEnableNotifications,
}: Props) {
  useFonts({ Rubik_400Regular, Rubik_500Medium, Rubik_600SemiBold, Rubik_700Bold });

  // Decided once: answers persist as they are given, so a returning user skips
  // the questions, and buying Plus mid-flow must not reshuffle the steps behind them.
  const answeredAtStart = useRef(hasCompletedQuestionnaire(profile)).current;
  const offerPlus = useRef(Boolean(paywall) && !canCustomise).current;

  // What they have actually picked. The props carry the app's starting values
  // (a breed, a name, 10,000 steps...); none of those count as an answer, so
  // none of them shows as chosen until it is tapped.
  const [picked, setPicked] = useState<Partial<Record<StepId, true>>>({});
  const pick = (step: StepId) => setPicked((current) => (current[step] ? current : { ...current, [step]: true }));
  const [goalChoice, setGoalChoice] = useState<'lose' | 'maintain' | 'gain' | null>(null);
  const [ageChoice, setAgeChoice] = useState<number | null>(null);
  const [sexChoice, setSexChoice] = useState<BodyProfile['sex'] | null>(null);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [motivations, setMotivations] = useState<Motivation[]>([]);
  const [body, setBody] = useState({ feet: '', inches: '', cm: '', weight: '' });
  const [goalText, setGoalText] = useState('');

  const sequenceFor = (goal: typeof goalChoice) =>
    FULL_SEQUENCE.filter((step) => {
      if (answeredAtStart && QUESTION_STEPS.has(step)) return false;
      if (step === 'target') return goal !== 'maintain';
      if (PLUS_STEPS.has(step)) return offerPlus;
      // After the paywall, so buying Plus there opens it up.
      if (step === 'personality') return canCustomise;
      if (step === 'notifications') return Boolean(onEnableNotifications);
      return true;
    });
  const sequence = sequenceFor(goalChoice);

  const [stepId, setStepId] = useState<StepId>('welcome');
  const [stepError, setStepError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [plusBusy, setPlusBusy] = useState<PlusPlan | null>(null);
  const [plusTestMode, setPlusTestMode] = useState<boolean | null>(null);
  const [commitDays, setCommitDays] = useState<number | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [notificationsBusy, setNotificationsBusy] = useState(false);

  const index = Math.max(0, sequence.indexOf(stepId));
  const isLast = index === sequence.length - 1;

  // Each screen slides in from the side it is coming from.
  const enter = useRef(new Animated.Value(1)).current;
  const direction = useRef(1);
  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [stepId, enter]);

  // Meeting your pet gets the big buzz, the moment the page opens.
  useEffect(() => {
    if (stepId === 'meetPet') cheer();
  }, [stepId]);

  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    },
    [],
  );

  const F = palette();
  // Short phones (an SE, a mini) get a smaller pet, so the question and its answers still fit.
  const { height: screenHeight } = useWindowDimensions();
  const compact = screenHeight < 740;
  const petScale = compact ? 0.72 : 1;
  const months = useMemo(monthChoices, []);
  const metric = profile.weightUnit === 'kg';
  const fromDisplayWeight = (value: number) => (metric ? value : value / LB_PER_KG);
  const toDisplayWeight = (kg: number) => (metric ? Math.round(kg) : Math.round(kg * LB_PER_KG));
  const bounds = GOAL_BOUNDS[profile.weightUnit];
  const displayedWeight = toDisplayWeight(profile.weightKg);
  const goalNumber = goalText === '' ? undefined : Number(goalText);
  const targets = calculateMacroTargets(profile);
  const named = Boolean(picked.namePet && name.trim());
  const petName = named ? name.trim() : 'your pet';
  const PetName = named ? name.trim() : 'Your pet';
  const you = picked.yourName ? profile.displayName?.trim() : undefined;
  const survival = petSurvivalGuidance(named ? name.trim() : 'your pet');

  const previewPet = useMemo(
    () => createPet('preview', named ? name.trim() : 'Pet', 'dog', breed, personality, undefined, persona, dials),
    [named, name, breed, personality, persona, dials],
  );

  /** A happy little hop, for tapping the pet or a moment worth one. */
  const celebrate = (ms = 1200) => {
    setCelebrating(true);
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    celebrateTimer.current = setTimeout(() => setCelebrating(false), ms);
  };

  const setGoalWeight = (display: number | undefined) => {
    const kg = display === undefined ? undefined : fromDisplayWeight(display);
    onUpdate('targetWeightKg', kg);
    onUpdate('goal', deriveEnergyGoal(profile.weightKg, kg));
  };

  const setGoalDate = (iso: string) => {
    tick();
    pick('target');
    onUpdate('goalTargetDate', iso);
    const weeks = weeksUntil(iso);
    if (weeks !== undefined) onUpdate('goalWeeks', weeks);
  };

  const digits = (value: string) => value.replace(/[^0-9]/g, '');
  const updateBody = (next: typeof body) => {
    setBody(next);
    if (metric) {
      if (next.cm) onUpdate('heightCm', Number(next.cm));
    } else if (next.feet) {
      onUpdate('heightCm', feetAndInchesToCm(Number(next.feet), Number(next.inches || 0)));
    }
    if (next.weight) onUpdate('weightKg', fromDisplayWeight(Number(next.weight)));
  };
  const bodyComplete = Boolean((metric ? body.cm : body.feet) && body.weight);

  const validate = (): string | null => {
    if (stepId === 'body') {
      if (profile.heightCm < 120 || profile.heightCm > 230) return 'That height doesn’t look right.';
      if (profile.weightKg < 30 || profile.weightKg > 300) return 'That weight doesn’t look right.';
    }
    if (stepId === 'target' && goalNumber !== undefined && (goalNumber < bounds.min || goalNumber > bounds.max))
      return `Pick a goal between ${bounds.min} and ${bounds.max} ${profile.weightUnit}.`;
    // They can go back and lower their age after choosing an age-gated one.
    if (stepId === 'personality' && !petPersonalityOptionsFor(profile.age).some((option) => option.value === personality))
      return 'Pick a personality.';
    if (stepId === 'personality' && personality === 'custom' && !isValidPersona(persona)) return 'Tell us who they are.';
    return null;
  };

  /** Moves to the step after `from`, in `upcoming` (the sequence as it stands after any answer just given). */
  const goNext = (from: StepId = stepId, upcoming: StepId[] = sequence) => {
    const next = upcoming[upcoming.indexOf(from) + 1];
    if (!next) return;
    direction.current = 1;
    setStepError(null);
    Keyboard.dismiss();
    setStepId(next);
  };

  const advance = async () => {
    const failure = validate();
    setStepError(failure);
    if (failure) return;
    thump();
    if (!isLast) {
      goNext();
      return;
    }
    setBusy(true);
    try {
      cheer();
      await onAdopt();
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setStepError(null);
    tick();
    direction.current = -1;
    if (index > 0) setStepId(sequence[index - 1]!);
  };

  /** A tap that answers the question and moves on: a tick now, the next screen a beat later. */
  const answer = (apply: () => void, upcoming: StepId[] = sequence) => {
    tick();
    apply();
    pick(stepId);
    const from = stepId;
    setTimeout(() => goNext(from, upcoming), 220);
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

  const toggleTraining = (value: TrainingType) => {
    tick();
    const next = trainingTypes.includes(value) ? trainingTypes.filter((v) => v !== value) : [...trainingTypes, value];
    setTrainingTypes(next);
    onUpdate('trainingTypes', next);
    const style = deriveTrainingStyle(next);
    if (style) onUpdate('trainingStyle', style);
  };

  const toggleMotivation = (value: Motivation) => {
    tick();
    const next = motivations.includes(value) ? motivations.filter((v) => v !== value) : [...motivations, value];
    setMotivations(next);
    onUpdate('motivations', next);
  };

  /** The pet you chose, tappable (a hop and a little buzz), with whatever they have to say above. */
  const pet = (requested = 130, bubble?: string, partying = false) => {
    const size = Math.round(requested * petScale);
    return (
      <View style={styles.petArea}>
        {bubble ? <Bubble>{bubble}</Bubble> : null}
        <Pressable
          style={styles.petPress}
          accessibilityRole="button"
          accessibilityLabel={`Say hi to ${petName}`}
          onPress={() => {
            thump();
            celebrate();
          }}
        >
          <PetAvatar
            {...IDLE_ACTIVITY}
            pet={previewPet}
            isCelebrating={partying || celebrating}
            size={size}
            hideStatusCaption
            stageStyle={[styles.petStage, { height: size + 8 }]}
          >
            {null}
          </PetAvatar>
        </Pressable>
      </View>
    );
  };

  const yearly = PLUS_PLANS.find((plan) => plan.value === 'yearly')!;
  const monthly = PLUS_PLANS.find((plan) => plan.value === 'monthly')!;

  // Whether the store is in test mode, read once the offer is on screen.
  useEffect(() => {
    if (stepId !== 'plusOffer' || plusTestMode !== null) return;
    void billingService
      .status()
      .then((status) => setPlusTestMode(status.enabled))
      .catch(() => setPlusTestMode(false));
  }, [stepId, plusTestMode]);

  /** Buys Plus (Yearly comes with the trial), unlocks it at once, and carries on. */
  const buyPlus = async (plan: PlusPlan) => {
    if (!paywall) return;
    thump();
    setPlusBusy(plan);
    setStepError(null);
    try {
      const trial = plan === 'yearly';
      const next = await billingService.purchase(plan, trial);
      paywall.onTierChange(next.tier);
      if (next.tier === 'plus') {
        cheer();
        // The reminder is a courtesy: if it cannot be scheduled, the purchase still stands.
        if (trial) await Promise.resolve(scheduleTrialReminder(TRIAL_REMINDER_DAY, TRIAL_DAYS)).catch(() => {});
        goNext('plusOffer');
      }
    } catch (cause) {
      setStepError(cause instanceof Error ? cause.message : 'That did not go through.');
    } finally {
      setPlusBusy(null);
    }
  };

  const footer: { label: string; disabled?: boolean } | null = (() => {
    if (TAP_TO_ADVANCE.has(stepId) || stepId === 'plusOffer' || stepId === 'notifications') return null;
    switch (stepId) {
      case 'welcome':
        return { label: 'Get started' };
      case 'meetPet':
        return { label: 'Let’s go!' };
      case 'choosePet':
        return picked.choosePet
          ? { label: `Choose the ${sheetByBreed(breed).label.toLowerCase()}` }
          : { label: 'Choose your companion', disabled: true };
      case 'namePet':
        return { label: 'Next', disabled: !named };
      case 'yourName':
        return { label: 'Next', disabled: !profile.displayName?.trim() || !picked.yourName };
      case 'plusPersonality':
      case 'plusMeals':
      case 'plusChat':
        return { label: 'Next' };
      case 'body':
        return { label: 'Next', disabled: !bodyComplete };
      case 'target':
        return { label: 'Next', disabled: goalNumber === undefined || !picked.target || !profile.goalTargetDate };
      case 'motivation':
        return { label: 'Next', disabled: motivations.length === 0 };
      case 'personality':
        return { label: 'Next', disabled: !picked.personality };
      case 'plan':
        return { label: 'Let’s do it!' };
      case 'commit':
        return { label: 'Commit to this goal!', disabled: commitDays === null };
      case 'dayOne':
        return { label: 'Start today' };
      default:
        return { label: 'Next' };
    }
  })();

  const translateX = enter.interpolate({ inputRange: [0, 1], outputRange: [24 * direction.current, 0] });
  const progress = Math.max(0.05, index / (sequence.length - 1));

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: F.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {!BARE.has(stepId) ? (
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} hitSlop={12} style={styles.backButton}>
            <Text style={styles.backMark}>‹</Text>
          </Pressable>
          <View style={styles.progressTrack} accessibilityLabel={`Step ${index + 1} of ${sequence.length}`}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]}>
              <View style={styles.progressShine} />
            </View>
          </View>
          <View style={styles.headerBalance} />
        </View>
      ) : stepId === 'welcome' && onSignOut ? (
        <View style={[styles.header, styles.headerEnd]}>
          <Pressable accessibilityRole="button" onPress={onSignOut} hitSlop={8}>
            <Text style={styles.link}>Log out</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.headerSpacer} />
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Animated.View style={[styles.page, { opacity: enter, transform: [{ translateX }] }]}>
          {stepId === 'welcome' ? (
            <View style={[styles.center, styles.tall]}>
              <View style={styles.welcomePets}>
                {WELCOME_PETS.map((option, n) => (
                  <View key={option} style={[styles.welcomePet, n === 1 && styles.welcomePetMiddle]}>
                    <SpriteFrame sheet={sheetByBreed(option)} frame={sheetByBreed(option).animations.idle[0]!} size={n === 1 ? 150 : 112} />
                  </View>
                ))}
              </View>
              <Text style={[styles.title, compact && styles.titleCompact]}>A companion that grows with you.</Text>
              <Text style={[styles.sub, compact && styles.subCompact]}>
                Every workout, meal and step keeps them going. Let’s meet yours!
              </Text>
              {onRedeemInvite ? (
                showJoin ? (
                  <View style={styles.join}>
                    <Text style={styles.fieldLabel}>Invite code from your care partner</Text>
                    <FInput
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
                    <FButton
                      label="Join their pet"
                      busy={joining}
                      disabled={normalizeInviteCode(joinCode).length !== 6}
                      onPress={() => void join()}
                    />
                  </View>
                ) : (
                  <Pressable accessibilityRole="button" onPress={() => setShowJoin(true)} style={styles.linkRow}>
                    <Text style={styles.link}>Have an invite code? Join a partner’s pet</Text>
                  </Pressable>
                )
              ) : null}
            </View>
          ) : null}

          {stepId === 'choosePet' ? (
            <View>
              <Text style={[styles.title, compact && styles.titleCompact]}>Choose your companion!</Text>
              <Text style={[styles.sub, compact && styles.subCompact]}>
                Pick the one that feels right. They’ll live your goals with you.
              </Text>
              <View style={styles.chosen}>
                {picked.choosePet ? (
                  pet(150)
                ) : (
                  <View style={styles.mystery}>
                    <Text style={styles.mysteryMark}>?</Text>
                  </View>
                )}
              </View>
              <View style={styles.grid}>
                {PET_SHEETS.map((sheet) => {
                  const on = Boolean(picked.choosePet) && breed === sheet.name;
                  return (
                    <Pressable
                      key={sheet.name}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`Choose the ${sheet.label}`}
                      onPress={() => {
                        tick();
                        pick('choosePet');
                        onBreedChange(sheet.name);
                        celebrate(900);
                      }}
                      style={({ pressed }) => [styles.petTile, on && styles.choiceOn, pressed && styles.pressed]}
                    >
                      <SpriteFrame sheet={sheet} frame={sheet.animations.idle[0]!} size={84} />
                      <Text style={[styles.petTileLabel, on && styles.choiceLabelOn]}>{sheet.label}</Text>
                      {on ? (
                        <View style={[styles.check, styles.petTileCheck]}>
                          <Text style={styles.checkMark}>✓</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {stepId === 'meetPet' ? (
            <View style={[styles.center, styles.tall]} testID="meet-pet">
              {pet(220, undefined, true)}
              <Text
                style={[styles.title, compact && styles.titleCompact]}
              >{`You chose the ${sheetByBreed(breed).label.toLowerCase()}!`}</Text>
              <Text style={[styles.sub, compact && styles.subCompact]}>
                They’re so happy to meet you. Every workout, meal and step you log, they’ll be right there with you.
              </Text>
            </View>
          ) : null}

          {stepId === 'namePet' ? (
            <View style={styles.center}>
              {pet(150, 'Hi! Thanks for choosing me. What do you want to call me?')}
              <FInput
                value={picked.namePet ? name : ''}
                onChangeText={(value) => {
                  pick('namePet');
                  onNameChange(value);
                }}
                maxLength={18}
                placeholder="Their name"
                returnKeyType="done"
                accessibilityLabel="Your companion's name"
              />
              <View style={[styles.row, styles.rowSpaced]}>
                <View style={styles.rowItem}>
                  <FButton
                    label="Shuffle"
                    tone="secondary"
                    onPress={() => {
                      tick();
                      pick('namePet');
                      const pool = NAME_IDEAS.filter((idea) => idea !== name.trim());
                      onNameChange(pool[Math.floor(Math.random() * pool.length)]!);
                    }}
                  />
                </View>
              </View>
              <Text style={styles.hint}>You can change this later.</Text>
            </View>
          ) : null}

          {stepId === 'yourName' ? (
            <View style={styles.center}>
              {pet(140, `Cheers! I’m ${petName}. And what’s your name?`)}
              <FInput
                value={picked.yourName ? (profile.displayName ?? '') : ''}
                onChangeText={(value) => {
                  pick('yourName');
                  onUpdate('displayName', value);
                }}
                maxLength={40}
                placeholder="Your name"
                returnKeyType="done"
                accessibilityLabel="Your name"
              />
            </View>
          ) : null}

          {stepId === 'aboutIntro' ? (
            <View style={[styles.center, styles.tall]}>
              {pet(170)}
              <Text style={[styles.title, compact && styles.titleCompact]}>Let’s learn a bit about you!</Text>
              <Text style={[styles.sub, compact && styles.subCompact]}>{`${PetName} is curious about how they can grow with you.`}</Text>
            </View>
          ) : null}

          {stepId === 'age' ? (
            <Question
              compact={compact}
              eyebrow="About you"
              pet={pet(110)}
              title="How old are you?"
              sub="This helps us personalize your experience"
            >
              {AGE_OPTIONS.map((option) => (
                <FChoice
                  key={option.label}
                  label={option.label}
                  selected={ageChoice === option.age}
                  onPress={() =>
                    answer(() => {
                      setAgeChoice(option.age);
                      onUpdate('age', option.age);
                    })
                  }
                />
              ))}
            </Question>
          ) : null}

          {stepId === 'sex' ? (
            <Question
              compact={compact}
              eyebrow="About you"
              pet={pet(110)}
              title="What’s your sex?"
              sub="Only for your energy estimate and strength standards"
            >
              {(['male', 'female'] as const).map((value) => (
                <FChoice
                  key={value}
                  label={value === 'male' ? 'Male' : 'Female'}
                  selected={sexChoice === value}
                  onPress={() =>
                    answer(() => {
                      setSexChoice(value);
                      onUpdate('sex', value);
                    })
                  }
                />
              ))}
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  answer(() => {
                    setSexChoice('other');
                    onUpdate('sex', 'other');
                  })
                }
                style={styles.linkRow}
              >
                <Text style={styles.linkLarge}>Prefer not to answer</Text>
              </Pressable>
            </Question>
          ) : null}

          {stepId === 'body' ? (
            <Question
              compact={compact}
              eyebrow="About you"
              pet={pet(100)}
              title="Your height and weight"
              sub="Just for your calorie target. Nobody else sees it."
            >
              {/* Seeded from the device locale, so a US phone opens on pounds and feet already. */}
              <View style={styles.toggle}>
                {(['imperial', 'metric'] as const).map((system) => {
                  const on = measurementSystemOf(profile) === system;
                  return (
                    <Pressable
                      key={system}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => {
                        tick();
                        setBody({ feet: '', inches: '', cm: '', weight: '' });
                        onSetUnits(system);
                      }}
                      style={[styles.toggleOption, on && styles.toggleOptionOn]}
                    >
                      <Text style={[styles.toggleLabel, on && styles.toggleLabelOn]}>{system === 'imperial' ? 'lb · ft' : 'kg · cm'}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {metric ? (
                <FInput
                  keyboardType="number-pad"
                  value={body.cm}
                  onChangeText={(value) => updateBody({ ...body, cm: digits(value) })}
                  placeholder="Height (cm)"
                  accessibilityLabel="Height in centimetres"
                />
              ) : (
                <View style={styles.row}>
                  <View style={styles.rowItem}>
                    <FInput
                      keyboardType="number-pad"
                      value={body.feet}
                      onChangeText={(value) => updateBody({ ...body, feet: digits(value) })}
                      placeholder="Height (ft)"
                      accessibilityLabel="Height in feet"
                    />
                  </View>
                  <View style={styles.rowItem}>
                    <FInput
                      keyboardType="number-pad"
                      value={body.inches}
                      onChangeText={(value) => updateBody({ ...body, inches: digits(value) })}
                      placeholder="(in)"
                      accessibilityLabel="Height in inches"
                    />
                  </View>
                </View>
              )}
              <FInput
                keyboardType="number-pad"
                value={body.weight}
                onChangeText={(value) => updateBody({ ...body, weight: digits(value) })}
                placeholder={`Weight (${profile.weightUnit})`}
                accessibilityLabel={`Weight in ${profile.weightUnit}`}
              />
            </Question>
          ) : null}

          {stepId === 'goal' ? (
            <Question compact={compact} eyebrow="Your goal" pet={pet(110)} title="What would you most like to do?">
              {GOAL_OPTIONS.map((option) => (
                <FChoice
                  key={option.value}
                  emoji={option.emoji}
                  label={option.label}
                  selected={goalChoice === option.value}
                  onPress={() =>
                    answer(() => {
                      setGoalChoice(option.value);
                      if (option.value === 'maintain') {
                        // Holding steady: the goal is where they are, and there is no weight to ask for.
                        setGoalWeight(displayedWeight);
                        if (!profile.goalTargetDate) {
                          onUpdate('goalTargetDate', months[2]!.value);
                          const weeks = weeksUntil(months[2]!.value);
                          if (weeks !== undefined) onUpdate('goalWeeks', weeks);
                        }
                      }
                    }, sequenceFor(option.value))
                  }
                />
              ))}
            </Question>
          ) : null}

          {stepId === 'target' ? (
            <Question
              compact={compact}
              eyebrow="Your goal"
              pet={pet(100)}
              title="What weight are you aiming for?"
              sub={`You’re at ${displayedWeight} ${profile.weightUnit} now.`}
            >
              <FInput
                keyboardType="number-pad"
                value={goalText}
                onChangeText={(value) => {
                  const next = digits(value);
                  setGoalText(next);
                  setGoalWeight(next === '' ? undefined : Number(next));
                }}
                placeholder={`Goal weight (${profile.weightUnit})`}
                accessibilityLabel={`Goal weight in ${profile.weightUnit}`}
              />
              <Text style={styles.fieldLabel}>By when?</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {months.map((month) => {
                  const on = picked.target && profile.goalTargetDate === month.value;
                  return (
                    <Pressable
                      key={month.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: Boolean(on) }}
                      onPress={() => setGoalDate(month.value)}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{month.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Question>
          ) : null}

          {stepId === 'activity' ? (
            <Question compact={compact} eyebrow="Your days" pet={pet(100)} title="Outside workouts, how active is your day?">
              {ACTIVITY_OPTIONS.map((option) => (
                <FChoice
                  key={option.value}
                  emoji={option.emoji}
                  label={option.label}
                  detail={option.detail}
                  selected={picked.activity && profile.activity === option.value}
                  onPress={() => answer(() => onUpdate('activity', option.value))}
                />
              ))}
            </Question>
          ) : null}

          {stepId === 'trainingDays' ? (
            <Question
              compact={compact}
              eyebrow="Your days"
              pet={pet(100)}
              title="How many days a week will you train?"
              sub={`${PetName} gets stronger every time you do`}
            >
              <View style={styles.grid}>
                {TRAINING_DAY_OPTIONS.map((option) => {
                  const on = picked.trainingDays && profile.trainingDaysPerWeek === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: Boolean(on) }}
                      onPress={() => answer(() => onUpdate('trainingDaysPerWeek', option.value))}
                      style={({ pressed }) => [styles.gridCell, on && styles.choiceOn, pressed && styles.pressed]}
                    >
                      <Text style={[styles.gridLabel, on && styles.choiceLabelOn]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Question>
          ) : null}

          {stepId === 'trainingTypes' ? (
            <Question
              compact={compact}
              eyebrow="Your days"
              pet={pet(100)}
              title="What kind of training do you like?"
              sub="Pick any, or none yet"
            >
              {TRAINING_TYPE_OPTIONS.map((option) => (
                <FChoice
                  key={option.value}
                  label={option.label}
                  align="left"
                  selected={trainingTypes.includes(option.value)}
                  onPress={() => toggleTraining(option.value)}
                />
              ))}
            </Question>
          ) : null}

          {stepId === 'steps' ? (
            <Question
              compact={compact}
              eyebrow="Your days"
              pet={pet(100)}
              title="How many steps a day?"
              sub={`Every one of them feeds ${petName}`}
            >
              {STEP_GOAL_PRESETS.map((steps) => (
                <FChoice
                  key={steps}
                  label={`${steps.toLocaleString()} steps`}
                  note={STEP_LABEL[steps]}
                  selected={picked.steps && stepGoal === steps}
                  onPress={() => answer(() => onStepGoalChange(steps))}
                />
              ))}
              <FChoice emoji="✨" label="Let Vitto choose" onPress={() => answer(() => onStepGoalChange(suggestStepGoal(profile)))} />
            </Question>
          ) : null}

          {stepId === 'motivation' ? (
            <Question
              compact={compact}
              eyebrow="Almost there"
              pet={pet(100)}
              title="What keeps you going?"
              sub={`${PetName} will cheer you on the way you like. Pick any.`}
            >
              {MOTIVATION_OPTIONS.map((option) => (
                <FChoice
                  key={option.value}
                  label={option.label}
                  align="left"
                  selected={motivations.includes(option.value)}
                  onPress={() => toggleMotivation(option.value)}
                />
              ))}
            </Question>
          ) : null}

          {stepId === 'plan' ? (
            <View style={styles.center}>
              {pet(120, 'You got this!')}
              <View style={styles.planCard} testID="starter-plan">
                <View style={styles.planRings}>
                  {[0, 1, 2, 3, 4].map((n) => (
                    <View key={n} style={styles.planRing} />
                  ))}
                </View>
                <Text style={styles.planTitle}>{you ? `${you}’s starter plan` : 'Your starter plan'}</Text>
                <Text style={styles.planSub}>{`Try these easy goals with ${petName}!`}</Text>
                <PlanRow emoji="🍽️" text={`Eat about ${targets.calories.toLocaleString()} kcal a day`} />
                <PlanRow emoji="🥩" text={`Get ${targets.proteinGrams}g of protein`} />
                <PlanRow emoji="👟" text={`Walk ${stepGoal.toLocaleString()} steps`} />
                <PlanRow
                  emoji="🏋️"
                  text={profile.trainingDaysPerWeek > 0 ? `Train ${profile.trainingDaysPerWeek} days a week` : 'Try one workout this week'}
                />
                {goalChoice !== 'maintain' && profile.goal !== 'maintain' && profile.targetWeightKg !== undefined ? (
                  <PlanRow
                    emoji="🎯"
                    text={`Reach ${toDisplayWeight(profile.targetWeightKg)} ${profile.weightUnit} by ${formatMonth(profile.goalTargetDate)}`}
                    last
                  />
                ) : (
                  <PlanRow emoji="⚖️" text={`Hold steady around ${displayedWeight} ${profile.weightUnit}`} last />
                )}
              </View>
            </View>
          ) : null}

          {stepId === 'plusPersonality' ? (
            <View style={styles.center}>
              <Text style={styles.plusKicker}>Vitto Plus</Text>
              <Text style={[styles.title, compact && styles.titleCompact]}>{`Make ${petName} truly yours`}</Text>
              <View style={styles.perkStage}>
                <View style={[styles.voice, styles.voiceLeft]}>
                  <Text style={styles.voiceTag}>Sweet</Text>
                  <Text style={styles.voiceLine}>You came back! I saved you a spot.</Text>
                </View>
                <View style={[styles.voice, styles.voiceRight]}>
                  <Text style={styles.voiceTag}>Savage</Text>
                  <Text style={styles.voiceLine}>Oh, you’re up. Groundbreaking.</Text>
                </View>
                {compact ? null : pet(130)}
                <View style={[styles.voice, styles.voiceLeft, compact && styles.hidden]}>
                  <Text style={styles.voiceTag}>Hype</Text>
                  <Text style={styles.voiceLine}>LET’S GOOO, legend!</Text>
                </View>
              </View>
              <Text style={[styles.sub, compact && styles.subCompact]}>
                Pick a personality, fine-tune it with sliders, or write them a whole character of your own.
              </Text>
              <PerkCompare free="One easygoing voice" plus="Every personality, and your own" />
            </View>
          ) : null}

          {stepId === 'plusMeals' ? (
            <View style={styles.center}>
              <Text style={styles.plusKicker}>Vitto Plus</Text>
              <Text style={[styles.title, compact && styles.titleCompact]}>Snap a photo, get the macros</Text>
              <View style={[styles.mealCard, compact && styles.mealCardCompact]}>
                <Text style={styles.mealEmoji}>🥗</Text>
                <View style={styles.mealChips}>
                  {['520 kcal', '32g protein', '48g carbs', '18g fat'].map((chip) => (
                    <View key={chip} style={styles.mealChip}>
                      <Text style={styles.mealChipLabel}>{chip}</Text>
                    </View>
                  ))}
                </View>
              </View>
              {compact ? null : pet(100)}
              <Text
                style={[styles.sub, compact && styles.subCompact]}
              >{`Point your camera at a meal and Vitto works out the calories and macros, then feeds ${petName}. No searching, no typing.`}</Text>
              <PerkCompare free="Search and log by hand" plus="Photo meal tracking" />
            </View>
          ) : null}

          {stepId === 'plusChat' ? (
            <View style={styles.center}>
              <Text style={styles.plusKicker}>Vitto Plus</Text>
              <Text style={[styles.title, compact && styles.titleCompact]}>{`Talk with ${petName} anytime`}</Text>
              <View style={styles.chat}>
                <View style={[styles.chatBubble, styles.chatMine]}>
                  <Text style={[styles.chatText, styles.chatTextMine]}>Hit a new bench PR today!</Text>
                </View>
                <View style={[styles.chatBubble, styles.chatTheirs]}>
                  <Text style={styles.chatText}>No way! I KNEW you had it in you. What’s next, the squat?</Text>
                </View>
              </View>
              {compact ? null : pet(100)}
              <Text
                style={[styles.sub, compact && styles.subCompact]}
              >{`A smarter, more in-character ${petName} who remembers your week, and checks in on you more.`}</Text>
              <PerkCompare free="10 messages a day" plus="100 a day, sharper voice" />
            </View>
          ) : null}

          {stepId === 'plusOffer' && paywall ? (
            <View testID="plus-offer">
              <Pressable accessibilityRole="button" onPress={() => goNext('plusOffer')} hitSlop={10} style={styles.offerSkip}>
                <Text style={styles.link}>Not now</Text>
              </Pressable>
              <Text style={styles.offerReady}>✓ Your free trial is ready</Text>
              <Text style={[styles.title, compact && styles.titleCompact]}>{`Start your ${TRIAL_DAYS}-day free trial`}</Text>
              <View style={[styles.timeline, compact && styles.timelineCompact]}>
                <View style={styles.timelineBar} />
                {[
                  { icon: '🔓', title: 'Today', body: `Unlock everything in Plus and see what ${petName} can be.` },
                  {
                    icon: '🔔',
                    title: `Day ${TRIAL_REMINDER_DAY}`,
                    body: 'We’ll remind you with a notification that your trial is ending.',
                  },
                  {
                    icon: '⭐',
                    title: `Day ${TRIAL_DAYS}`,
                    body: `You’ll be charged on ${new Date(Date.now() + TRIAL_DAYS * 86_400_000).toLocaleDateString([], { month: 'short', day: 'numeric' })}. Cancel anytime before.`,
                  },
                ].map((row) => (
                  <View key={row.title} style={styles.timelineRow}>
                    <View style={styles.timelineIcon}>
                      <Text style={styles.timelineEmoji}>{row.icon}</Text>
                    </View>
                    <View style={styles.timelineText}>
                      <Text style={styles.timelineTitle}>{row.title}</Text>
                      <Text style={styles.timelineBody}>{row.body}</Text>
                    </View>
                  </View>
                ))}
              </View>
              {paywall.isDevAccount ? <Text style={styles.hint}>Dev account: Plus is always on here.</Text> : null}
              {plusTestMode ? <Text style={styles.hint}>Test mode: no real payment is taken.</Text> : null}
            </View>
          ) : null}

          {stepId === 'personality' ? (
            <View>
              {pet(110)}
              <Text style={[styles.title, compact && styles.titleCompact]}>{`Choose a personality for ${petName}`}</Text>
              <Text style={[styles.sub, compact && styles.subCompact]}>
                Their personality: how they talk to you. You can change it any time.
              </Text>
              <View style={styles.choices}>
                {petPersonalityOptionsFor(profile.age).map((option) => {
                  const on = Boolean(picked.personality) && personality === option.value;
                  return (
                    <Fragment key={option.value}>
                      <FChoice
                        label={option.label}
                        detail={option.detail}
                        align="left"
                        selected={on}
                        onPress={() => {
                          tick();
                          pick('personality');
                          onPersonalityChange(option.value);
                          // The sliders show what the base means, and start from it.
                          onDialsChange(companion.dialsFor(option.value));
                        }}
                      />
                      {on ? (
                        <View style={styles.expanded} testID={`choice-expanded-${option.value}`}>
                          <PersonalityPreview
                            personality={option.value}
                            dials={dials ?? companion.dialsFor(option.value)}
                            persona={persona}
                            name={named ? name.trim() : 'They'}
                          />
                          <View>
                            <Text style={styles.fieldLabel}>Fine-tune them</Text>
                            <CharacterDials
                              dials={dials ?? companion.dialsFor(option.value)}
                              onChange={onDialsChange}
                              testID="character-dials"
                            />
                          </View>
                          {option.value === 'custom' && profile.age >= MATURE_PERSONALITY_AGE ? (
                            <View>
                              <Text style={styles.fieldLabel}>Who are they?</Text>
                              <FInput
                                multiline
                                style={styles.persona}
                                value={persona}
                                onChangeText={(value) => onPersonaChange(value.slice(0, PERSONA_MAX_LENGTH))}
                                placeholder="A grumpy old pirate who secretly adores us and hands out sea shanties as rewards"
                                // Return closes the keyboard rather than starting a new line.
                                returnKeyType="done"
                                submitBehavior="blurAndSubmit"
                                onSubmitEditing={() => Keyboard.dismiss()}
                                maxLength={PERSONA_MAX_LENGTH}
                                accessibilityLabel="Their character"
                              />
                              <Text style={styles.count}>{`${persona.length} / ${PERSONA_MAX_LENGTH}`}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </Fragment>
                  );
                })}
              </View>
            </View>
          ) : null}

          {stepId === 'notifications' ? (
            <View style={styles.center}>
              <Text style={[styles.title, compact && styles.titleCompact]}>{`Get reminders from ${petName}`}</Text>
              <View style={styles.notification}>
                <View style={styles.notificationIcon}>
                  <SpriteFrame sheet={sheetByBreed(breed)} frame={sheetByBreed(breed).animations.idle[0]!} size={58} />
                </View>
                <View style={styles.notificationText}>
                  <Text style={styles.notificationTitle}>{`From ${PetName}`}</Text>
                  <Text style={styles.notificationBody}>A quick walk would make my whole day!</Text>
                </View>
                <Text style={styles.notificationTime}>now</Text>
              </View>
              {pet(170)}
            </View>
          ) : null}

          {stepId === 'commit' ? (
            <View>
              <Text
                style={[styles.title, compact && styles.titleCompact]}
              >{`How many days in a row will you take care of ${petName}?`}</Text>
              {pet(110, commitDays ? 'You got this!' : undefined)}
              <View style={styles.choices}>
                {COMMIT_OPTIONS.map((option) => (
                  <FChoice
                    key={option.days}
                    emoji={option.emoji}
                    label={`${option.days} days`}
                    note={option.note}
                    selected={commitDays === option.days}
                    onPress={() => {
                      tick();
                      setCommitDays(option.days);
                    }}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {stepId === 'dayOne' ? (
            <View style={styles.center}>
              <Text style={styles.dayKicker}>Day 1</Text>
              <Text
                style={[styles.title, compact && styles.titleCompact]}
              >{`Happy ${new Date().toLocaleDateString([], { weekday: 'long' })}!`}</Text>
              {pet(190)}
              <View style={styles.dayCard}>
                <Text style={styles.dayCardKicker}>A gentle reminder</Text>
                <Text style={styles.dayCardTitle}>Good things take time.</Text>
                <Text style={styles.dayCardBody}>{survival.detail}</Text>
              </View>
              {commitDays ? <Text style={styles.hint}>{`Your goal: ${commitDays} days in a row with ${petName}.`}</Text> : null}
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>

      <View pointerEvents="none" style={styles.fadeWrap}>
        {[0, 0.35, 0.7].map((opacity, n) => (
          <View key={n} style={[styles.fadeBand, { backgroundColor: F.bg, opacity }]} />
        ))}
      </View>
      <View style={[styles.footer, { backgroundColor: F.bg }]}>
        <View style={styles.footerInner}>
          {(stepError ?? error) ? <Text style={styles.error}>{stepError ?? error}</Text> : null}
          {stepId === 'plusOffer' ? (
            <>
              <Text style={styles.offerPrice}>
                {`${TRIAL_DAYS} days free, then `}
                <Text style={styles.offerPriceStrong}>{`${yearly.price} per year`}</Text>
                {` (${yearly.note?.toLowerCase() ?? ''})`}
              </Text>
              <FButton
                label="Start my free trial"
                busy={plusBusy === 'yearly'}
                disabled={plusBusy !== null}
                onPress={() => void buyPlus('yearly')}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => void buyPlus('monthly')}
                disabled={plusBusy !== null}
                style={styles.linkRow}
              >
                <Text style={styles.linkLarge}>{`Or ${monthly.price} a month, no trial`}</Text>
              </Pressable>
            </>
          ) : stepId === 'notifications' ? (
            <>
              <FButton
                label="Turn on notifications"
                busy={notificationsBusy}
                onPress={() => {
                  thump();
                  setNotificationsBusy(true);
                  void (onEnableNotifications?.() ?? Promise.resolve(false))
                    .catch(() => false)
                    .finally(() => {
                      setNotificationsBusy(false);
                      goNext('notifications');
                    });
                }}
              />
              <FButton label="Maybe later" tone="secondary" onPress={() => goNext('notifications')} />
            </>
          ) : footer ? (
            <>
              <FButton label={footer.label} busy={busy} disabled={footer.disabled} onPress={() => void advance()} />
              {stepId === 'yourName' && footer.disabled ? (
                <Pressable accessibilityRole="button" onPress={() => goNext()} style={styles.linkRow}>
                  <Text style={styles.linkLarge}>Skip</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/** The pet's speech bubble: soft grey, tail pointing down at them. */
function Bubble({ children }: { children: ReactNode }) {
  return (
    <View style={styles.bubble}>
      <Text style={styles.bubbleText}>{children}</Text>
      <View style={styles.bubbleTail} />
    </View>
  );
}

/** One question: a small label, the pet, the question, a line of context, then its answers. */
function Question({
  eyebrow,
  pet,
  title,
  sub,
  compact,
  children,
}: {
  eyebrow?: string;
  pet: ReactNode;
  title: string;
  sub?: string;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <View>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      {pet}
      <Text style={[styles.question, compact && styles.questionCompact]}>{title}</Text>
      {sub ? <Text style={[styles.sub, compact && styles.subCompact]}>{sub}</Text> : null}
      <View style={styles.choices}>{children}</View>
    </View>
  );
}

/** A big rounded answer: grey edge, green edge and a tick once chosen. */
function FChoice({
  label,
  emoji,
  detail,
  note,
  selected,
  align = 'center',
  onPress,
}: {
  label: string;
  emoji?: string;
  detail?: string;
  note?: string;
  selected?: boolean;
  align?: 'center' | 'left';
  onPress: () => void;
}) {
  const centred = align === 'center' && !emoji && !note && !detail;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, selected && styles.choiceOn, pressed && styles.pressed]}
    >
      {emoji ? <Text style={styles.choiceEmoji}>{emoji}</Text> : null}
      <View style={[styles.choiceText, centred && styles.choiceTextCentred]}>
        <Text style={[styles.choiceLabel, selected && styles.choiceLabelOn]}>{label}</Text>
        {detail ? <Text style={styles.choiceDetail}>{detail}</Text> : null}
      </View>
      {note ? <Text style={styles.choiceNote}>{note}</Text> : null}
      {selected ? (
        <View style={styles.check}>
          <Text style={styles.checkMark}>✓</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** The chunky button: a solid face over a darker lip, which it presses down into. */
function FButton({
  label,
  onPress,
  disabled,
  busy,
  tone = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: 'primary' | 'secondary';
}) {
  const primary = tone === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || busy) }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        disabled && (primary ? styles.buttonPrimaryOff : styles.buttonSecondaryOff),
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.buttonLabel, primary ? styles.buttonLabelPrimary : styles.buttonLabelSecondary]}>{busy ? '…' : label}</Text>
    </Pressable>
  );
}

/** A soft grey field with big centred type. */
function FInput(props: TextInputProps) {
  return <TextInput placeholderTextColor={palette().sub} {...props} style={[styles.input, props.style]} />;
}

/** What the free app does, against what Plus adds. */
function PerkCompare({ free, plus }: { free: string; plus: string }) {
  return (
    <View style={styles.compare}>
      <View style={styles.compareCell}>
        <Text style={styles.compareLabel}>Free</Text>
        <Text style={styles.compareValue}>{free}</Text>
      </View>
      <View style={[styles.compareCell, styles.compareCellPlus]}>
        <Text style={[styles.compareLabel, styles.compareLabelPlus]}>Plus</Text>
        <Text style={[styles.compareValue, styles.compareValuePlus]}>{plus}</Text>
      </View>
    </View>
  );
}

function PlanRow({ emoji, text, last }: { emoji: string; text: string; last?: boolean }) {
  return (
    <View style={[styles.planRow, !last && styles.planRowRuled]}>
      <Text style={styles.planEmoji}>{emoji}</Text>
      <Text style={styles.planText}>{text}</Text>
    </View>
  );
}

const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;
const MAX_WIDTH = 560;

const styles = themedStyles(() => {
  const F = palette();
  return {
    screen: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 58, paddingHorizontal: 18, paddingBottom: 4 },
    headerEnd: { justifyContent: 'flex-end' },
    headerSpacer: { height: 58 },
    headerBalance: { width: 12 },
    backButton: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: F.soft },
    backMark: { fontFamily: FONT.medium, fontSize: 32, lineHeight: 40, color: F.sub, marginTop: -3, marginLeft: -2 },
    progressTrack: { flex: 1, height: 16, borderRadius: 8, backgroundColor: F.soft, overflow: 'hidden' },
    progressFill: { height: 16, borderRadius: 8, backgroundColor: F.green },
    progressShine: {
      position: 'absolute',
      top: 4,
      left: 8,
      right: 8,
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.35)',
    },

    scroll: { flex: 1 },
    body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, flexGrow: 1 },
    page: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
    center: { alignItems: 'center' },
    tall: { paddingTop: 36 },
    row: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
    rowSpaced: { marginTop: 14 },
    rowItem: { flex: 1 },

    eyebrow: {
      fontFamily: FONT.medium,
      fontSize: 15,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      color: F.sub,
      textAlign: 'center',
      marginTop: 10,
    },
    title: { fontFamily: FONT.bold, fontSize: 27, lineHeight: 34, color: F.text, textAlign: 'center', marginTop: 10 },
    question: { fontFamily: FONT.bold, fontSize: 24, lineHeight: 30, color: F.text, textAlign: 'center', marginTop: 6 },
    sub: { fontFamily: FONT.regular, fontSize: 17, lineHeight: 24, color: F.sub, textAlign: 'center', marginTop: 6 },
    hint: { fontFamily: FONT.regular, fontSize: 16, color: F.sub, textAlign: 'center', marginTop: 16 },
    fieldLabel: { fontFamily: FONT.medium, fontSize: 16, color: F.text, marginTop: 6, marginBottom: 2 },
    link: { fontFamily: FONT.medium, fontSize: 15, color: F.sub },
    linkLarge: { fontFamily: FONT.medium, fontSize: 18, color: F.sub },
    linkRow: { alignItems: 'center', paddingVertical: 14 },
    error: { fontFamily: FONT.medium, fontSize: 14, color: colors.danger, textAlign: 'center' },
    count: { fontFamily: FONT.regular, fontSize: 13, color: F.sub, textAlign: 'right', marginTop: 4 },

    welcomePets: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 6 },
    welcomePet: { marginHorizontal: -14 },
    welcomePetMiddle: { zIndex: 1 },
    chosen: { alignItems: 'center', minHeight: 170, justifyContent: 'center', marginVertical: 6 },
    mystery: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: F.soft,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: F.border,
      borderStyle: 'dashed',
    },
    mysteryMark: { fontFamily: FONT.bold, fontSize: 48, lineHeight: 58, color: F.sub },

    petArea: { alignItems: 'center', alignSelf: 'stretch', marginTop: 6 },
    // Full width, so the pet's soft glow fades out instead of stopping at a box edge.
    petPress: { alignSelf: 'stretch' },
    petStage: { backgroundColor: 'transparent', alignSelf: 'stretch' },
    bubble: {
      alignSelf: 'stretch',
      backgroundColor: F.soft,
      borderRadius: 26,
      paddingHorizontal: 22,
      paddingVertical: 18,
      marginBottom: 10,
    },
    bubbleText: { fontFamily: FONT.medium, fontSize: 18, lineHeight: 25, color: F.text },
    bubbleTail: {
      position: 'absolute',
      bottom: -9,
      left: 34,
      width: 22,
      height: 22,
      borderRadius: 4,
      backgroundColor: F.soft,
      transform: [{ rotate: '45deg' }],
    },

    choices: { marginTop: 20, gap: 12, alignSelf: 'stretch' },
    choice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      minHeight: 70,
      paddingHorizontal: 22,
      paddingVertical: 14,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: F.border,
      backgroundColor: F.bg,
    },
    choiceOn: { borderColor: F.green, borderWidth: 3, paddingHorizontal: 21, backgroundColor: F.bg },
    pressed: { transform: [{ scale: 0.98 }] },
    choiceEmoji: { fontSize: 28, lineHeight: 36 },
    choiceText: { flex: 1 },
    choiceTextCentred: { alignItems: 'center' },
    choiceLabel: { fontFamily: FONT.medium, fontSize: 19, lineHeight: 25, color: F.text },
    choiceLabelOn: { fontFamily: FONT.semibold },
    choiceDetail: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 20, color: F.sub, marginTop: 2 },
    choiceNote: { fontFamily: FONT.regular, fontSize: 16, lineHeight: 22, color: F.sub, flexShrink: 1, textAlign: 'right' },
    check: { width: 30, height: 30, borderRadius: 15, backgroundColor: F.green, alignItems: 'center', justifyContent: 'center' },
    checkMark: { fontFamily: FONT.bold, fontSize: 16, lineHeight: 20, color: '#ffffff' },
    expanded: { gap: 14, padding: 16, borderRadius: 20, backgroundColor: F.greenPale },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    gridCell: {
      flexBasis: '45%',
      flexGrow: 1,
      height: 70,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: F.border,
      backgroundColor: F.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gridLabel: { fontFamily: FONT.medium, fontSize: 19, lineHeight: 25, color: F.text },
    petTile: {
      flexBasis: '45%',
      flexGrow: 1,
      alignItems: 'center',
      paddingTop: 10,
      paddingBottom: 14,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: F.border,
      backgroundColor: F.bg,
    },
    petTileLabel: { fontFamily: FONT.medium, fontSize: 17, lineHeight: 22, color: F.text, marginTop: 2 },
    petTileCheck: { position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: 13 },

    toggle: { flexDirection: 'row', gap: 10 },
    toggleOption: {
      flex: 1,
      height: 48,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: F.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toggleOptionOn: { borderColor: F.green, backgroundColor: F.greenPale },
    toggleLabel: { fontFamily: FONT.medium, fontSize: 16, lineHeight: 21, color: F.sub },
    toggleLabelOn: { color: F.text, fontFamily: FONT.semibold },

    input: {
      alignSelf: 'stretch',
      minHeight: 66,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: F.border,
      backgroundColor: F.input,
      paddingHorizontal: 20,
      fontFamily: FONT.medium,
      fontSize: 20,
      color: F.text,
      textAlign: 'center',
      marginTop: 14,
    },
    persona: { minHeight: 110, fontSize: 16, textAlign: 'left', paddingTop: 14, textAlignVertical: 'top', lineHeight: 22 },
    chips: { flexDirection: 'row', gap: 10, paddingRight: 24, paddingVertical: 4 },
    chip: {
      height: 48,
      paddingHorizontal: 18,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: F.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipOn: { borderColor: F.green, backgroundColor: F.greenPale },
    chipLabel: { fontFamily: FONT.medium, fontSize: 16, lineHeight: 21, color: F.sub },
    chipLabelOn: { color: F.text },

    plusKicker: { fontFamily: FONT.semibold, fontSize: 14, letterSpacing: 1.6, textTransform: 'uppercase', color: '#f29b0f', marginTop: 8 },
    perkStage: { alignSelf: 'stretch', marginTop: 14, gap: 8 },
    voice: { maxWidth: '78%', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: F.soft },
    voiceLeft: { alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
    voiceRight: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
    voiceTag: { fontFamily: FONT.semibold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: F.green },
    voiceLine: { fontFamily: FONT.medium, fontSize: 16, lineHeight: 22, color: F.text, marginTop: 2 },
    mealCard: {
      alignSelf: 'stretch',
      marginTop: 18,
      paddingVertical: 20,
      paddingHorizontal: 16,
      borderRadius: 28,
      backgroundColor: getColorScheme() === 'dark' ? colors.cardSoft : '#fff4e2',
      alignItems: 'center',
      gap: 14,
    },
    mealEmoji: { fontSize: 72, lineHeight: 86 },
    mealChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
    mealChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: F.bg, borderWidth: 2, borderColor: F.border },
    mealChipLabel: { fontFamily: FONT.semibold, fontSize: 14, color: F.text },
    chat: { alignSelf: 'stretch', marginTop: 18, gap: 10 },
    chatBubble: { maxWidth: '82%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 22 },
    chatMine: { alignSelf: 'flex-end', backgroundColor: F.green, borderBottomRightRadius: 6 },
    chatTheirs: { alignSelf: 'flex-start', backgroundColor: F.soft, borderBottomLeftRadius: 6 },
    chatText: { fontFamily: FONT.medium, fontSize: 16, lineHeight: 22, color: F.text },
    chatTextMine: { color: '#ffffff' },
    compare: { alignSelf: 'stretch', flexDirection: 'row', gap: 10, marginTop: 18 },
    compareCell: { flex: 1, padding: 14, borderRadius: 20, borderWidth: 2, borderColor: F.border },
    compareCellPlus: { borderColor: F.green, backgroundColor: F.greenPale },
    compareLabel: { fontFamily: FONT.semibold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: F.sub },
    compareLabelPlus: { color: F.green },
    compareValue: { fontFamily: FONT.medium, fontSize: 15, lineHeight: 20, color: F.sub, marginTop: 4 },
    compareValuePlus: { color: F.text },

    offerSkip: { alignSelf: 'flex-end', paddingVertical: 6 },
    offerReady: { fontFamily: FONT.semibold, fontSize: 17, lineHeight: 22, color: F.green, textAlign: 'center', marginTop: 6 },
    timeline: { marginTop: 20, gap: 16, paddingLeft: 4 },
    timelineBar: { position: 'absolute', left: 4, top: 6, bottom: 6, width: 52, borderRadius: 26, backgroundColor: F.greenPale },
    timelineRow: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
    timelineIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
    timelineEmoji: { fontSize: 28, lineHeight: 34 },
    timelineText: { flex: 1, paddingTop: 4 },
    timelineTitle: { fontFamily: FONT.bold, fontSize: 19, lineHeight: 24, color: F.text },
    timelineBody: { fontFamily: FONT.regular, fontSize: 16, lineHeight: 21, color: F.sub, marginTop: 1 },
    offerPrice: { fontFamily: FONT.regular, fontSize: 16, lineHeight: 22, color: F.text, textAlign: 'center' },
    offerPriceStrong: { fontFamily: FONT.bold },

    join: { alignSelf: 'stretch', marginTop: 20, gap: 10 },

    planCard: {
      alignSelf: 'stretch',
      marginTop: 22,
      paddingTop: 30,
      paddingHorizontal: 20,
      paddingBottom: 8,
      borderRadius: 28,
      backgroundColor: getColorScheme() === 'dark' ? colors.yellow : '#fdf6e8',
      borderWidth: 2,
      borderColor: getColorScheme() === 'dark' ? colors.hairline : '#f3e7c9',
    },
    planRings: { position: 'absolute', top: -14, left: 34, right: 34, flexDirection: 'row', justifyContent: 'space-between' },
    planRing: { width: 13, height: 28, borderRadius: 6, backgroundColor: '#e2c46e' },
    planTitle: { fontFamily: FONT.bold, fontSize: 22, lineHeight: 28, color: F.text, textAlign: 'center' },
    planSub: { fontFamily: FONT.regular, fontSize: 16, color: '#a39363', textAlign: 'center', marginTop: 4, marginBottom: 6 },
    planRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14 },
    planRowRuled: { borderBottomWidth: 1.5, borderBottomColor: getColorScheme() === 'dark' ? colors.hairline : '#f3e7c9' },
    planEmoji: { fontSize: 26, lineHeight: 34 },
    planText: { flex: 1, fontFamily: FONT.medium, fontSize: 18, lineHeight: 24, color: F.text },

    notification: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginTop: 24,
      padding: 16,
      borderRadius: 26,
      backgroundColor: F.soft,
    },
    notificationIcon: {
      width: 52,
      height: 52,
      borderRadius: 13,
      backgroundColor: colors.tile,
      alignItems: 'center',
      justifyContent: 'flex-end',
      overflow: 'hidden',
    },
    notificationText: { flex: 1 },
    notificationTitle: { fontFamily: FONT.semibold, fontSize: 17, lineHeight: 22, color: F.text },
    notificationBody: { fontFamily: FONT.regular, fontSize: 16, lineHeight: 22, color: F.text, marginTop: 2 },
    notificationTime: { fontFamily: FONT.regular, fontSize: 14, color: F.sub, alignSelf: 'flex-start' },

    dayKicker: { fontFamily: FONT.medium, fontSize: 16, letterSpacing: 1.6, textTransform: 'uppercase', color: F.sub, marginTop: 20 },
    dayCard: {
      alignSelf: 'stretch',
      marginTop: 10,
      padding: 22,
      borderRadius: 26,
      backgroundColor: getColorScheme() === 'dark' ? colors.yellow : '#ffe9a6',
      borderWidth: 8,
      borderColor: getColorScheme() === 'dark' ? colors.card : '#ffffff',
      alignItems: 'center',
      gap: 4,
      shadowColor: '#000000',
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      transform: [{ rotate: '-2deg' }],
    },
    dayCardKicker: { fontFamily: FONT.medium, fontSize: 13, letterSpacing: 1.4, textTransform: 'uppercase', color: '#8a6d1d' },
    dayCardTitle: { fontFamily: FONT.bold, fontSize: 28, lineHeight: 36, color: '#f29b0f', textAlign: 'center' },
    dayCardBody: {
      fontFamily: FONT.regular,
      fontSize: 15,
      lineHeight: 21,
      color: getColorScheme() === 'dark' ? colors.inkSoft : '#5c5440',
      textAlign: 'center',
      marginTop: 4,
    },

    // Three bands that fade the last of a scrolling page into the button area.
    fadeWrap: { height: 18, marginTop: -18 },
    fadeBand: { flex: 1 },
    hidden: { display: 'none' },
    titleCompact: { fontSize: 23, lineHeight: 29, marginTop: 4 },
    questionCompact: { fontSize: 21, lineHeight: 27 },
    subCompact: { fontSize: 15, lineHeight: 21 },
    timelineCompact: { marginTop: 12, gap: 10 },
    mealCardCompact: { paddingVertical: 12, marginTop: 12, gap: 10 },
    // Below the page, not over it: nothing ever scrolls out of sight behind the button.
    footer: { paddingHorizontal: 30, paddingTop: 10, paddingBottom: HOME_INDICATOR_INSET + 10 },
    footerInner: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', gap: 12 },

    button: { height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 5 },
    buttonPrimary: { backgroundColor: F.green, borderBottomColor: F.greenEdge },
    buttonPrimaryOff: { opacity: 0.5 },
    buttonSecondary: { backgroundColor: F.soft, borderBottomColor: F.softEdge },
    buttonSecondaryOff: { opacity: 0.6 },
    buttonPressed: { borderBottomWidth: 1, marginTop: 4, height: 54 },
    buttonLabel: { fontFamily: FONT.medium, fontSize: 20, lineHeight: 26, paddingHorizontal: 12, textAlign: 'center' },
    buttonLabelPrimary: { color: '#ffffff' },
    buttonLabelSecondary: { color: F.sub },
  };
});
