import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFonts, Rubik_400Regular, Rubik_500Medium, Rubik_600SemiBold, Rubik_700Bold } from '@expo-google-fonts/rubik';
import {
  measurementSystemOf,
  type MeasurementSystem,
  MOTIVATION_OPTIONS,
  MATURE_PERSONALITY_AGE,
  PERSONA_MAX_LENGTH,
  PERSONALITY_PREVIEW,
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
  INVITE_CODE_LENGTH,
  INVITE_CODE_LENGTHS,
  normalizeInviteCode,
  CARE_AREAS,
  type CareArea,
  normalizeUsername,
  usernameError,
  petSurvivalGuidance,
  suggestStepGoal,
  weeksUntil,
  type BodyProfile,
  type Motivation,
  type PetBreed,
  type PetPersonality,
  type TrainingType,
} from '@vitto/core';
import { companion as ai } from '@vitto/core';
import { PetAvatar } from '../components/PetAvatar';
import { PET_SHEETS, sheetByBreed, portraitFrame } from '../components/petSprites';
import { SpriteFrame } from '../components/SpriteFrame';
import { IDLE_ACTIVITY } from '../petWorld/toPetAvatarActivityProps';
import {
  billingService,
  LEGAL_LINKS,
  PLUS_PLANS,
  TRIAL_DAYS,
  TRIAL_REMINDER_DAY,
  type PlusPlan,
  type PlusStatus,
} from '../services/billingService';
import { scheduleTrialReminder } from '../services/pushService';
import { colors, getColorScheme, themedStyles } from '../theme';
import { ONB_FONT as FONT, OnbButton as FButton, OnbInput as FInput, onboardingPalette as palette } from '../components/onboardingKit';

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
  /** Their own notes on the character. Shown for "Your own", from MATURE_PERSONALITY_AGE. */
  persona?: string;
  onPersonaChange?: (value: string) => void;
  /** The five sliders. Set to the base's positions when a base is picked; fine-tuned later in Settings. */
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
   * The Vitto Plus offer, shown to anyone without Plus once they have seen
   * their plan (the point it is worth most). Absent: no Plus pages.
   */
  paywall?: { onTierChange: (tier: 'free' | 'plus') => void; isDevAccount?: boolean };
  /**
   * Claims a username (unique, how friends find you); rejects with a readable
   * message, e.g. when it is taken. Absent offline, which skips the step.
   */
  onClaimUsername?: (username: string) => Promise<void>;
  /** Asks the OS for notifications; resolves to whether they are on. Absent where push cannot work. */
  onEnableNotifications?: () => Promise<boolean>;
}

/** The longest code with its dash, 'ABCD-EFGH'. */
const INVITE_INPUT_MAX_LENGTH = INVITE_CODE_LENGTH + 1;
const LB_PER_KG = 2.20462;

/** Goal-weight bounds, per unit: the same human range either way. */
const GOAL_BOUNDS = { kg: { min: 30, max: 300 }, lb: { min: 66, max: 660 } } as const;

/** The care areas as onboarding asks about them: what each one means for the pet. */
/**
 * The care areas as onboarding asks about them: what you do, what happens if
 * you don't, and which of the pet's stats it raises (as the engine applies them;
 * happiness rises with everything, so it is left off every line).
 */
const CARE_AREA_CHOICE: Record<CareArea, { label: string; detail: (pet: string) => string; stats: string }> = {
  nutrition: { label: 'Food', detail: (pet) => `Log your meals. Skip them and ${pet} gets hungry.`, stats: '+ Hunger · Energy · Health' },
  training: { label: 'Workouts', detail: () => 'Log your training sessions.', stats: '+ Strength · Endurance · Vitality' },
  movement: { label: 'Steps', detail: () => 'Sync your daily steps.', stats: '+ Vitality · Endurance' },
  mind: { label: 'Mind games', detail: (pet) => `Play quick games. Skip them and ${pet} gets foggy.`, stats: '+ Mind' },
};

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
  { value: 'lose' as const, label: 'Lose fat' },
  { value: 'maintain' as const, label: 'Stay where I am' },
  { value: 'gain' as const, label: 'Build muscle' },
];

const ACTIVITY_OPTIONS = [
  { value: 'low' as const, label: 'Mostly sitting', detail: 'Desk job, not much walking' },
  { value: 'moderate' as const, label: 'On my feet some', detail: 'Walking through the day' },
  { value: 'high' as const, label: 'Always moving', detail: 'A physical job, rarely sitting' },
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
  { days: 3, note: 'Baby steps' },
  { days: 7, note: 'Strong start' },
  { days: 14, note: 'Clearly committed' },
  { days: 30, note: 'Unstoppable streak' },
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
  | 'username'
  | 'careAreas'
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
  // The handle friends find you by: unique, so the server has the last word.
  'username',
  // What the pet runs on: chosen before the questions, so someone who doesn't
  // track food knows from the start it won't be held against their pet.
  'careAreas',
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



/** The smallest pet worth showing; with less room than this the pet steps aside. */
const MIN_PET = 72;
/** An answer button shrinks to this on a long list in a small space, and no further. */
const MIN_CHOICE = 46;
const CHOICE_GAP = 10;

/**
 * Onboarding, the way the best pet apps do it: one small thing per screen,
 * your pet on screen and talking the whole way once you have picked them,
 * taps that answer and move on by themselves, and a little haptic for every
 * choice. Nothing is chosen for you: every answer waits for your tap.
 *
 * Nothing scrolls. Each page is laid out in the space it actually has (which
 * the keyboard shrinks): answers shrink towards MIN_CHOICE, long lists sit in
 * two columns, and the pet takes whatever room is left, stepping aside if
 * there is not enough of it.
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
  onClaimUsername,
  onEnableNotifications,
}: Props) {
  useFonts({ Rubik_400Regular, Rubik_500Medium, Rubik_600SemiBold, Rubik_700Bold });

  // Decided once: answers persist as they are given, so a returning user skips
  // the questions, and buying Plus mid-flow must not reshuffle the steps behind them.
  const answeredAtStart = useRef(hasCompletedQuestionnaire(profile)).current;
  const offerPlus = useRef(Boolean(paywall) && !canCustomise).current;
  const hadUsername = useRef(Boolean(profile.username)).current;

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
      // After the offer, so buying Plus there opens it up.
      if (step === 'personality') return canCustomise;
      if (step === 'notifications') return Boolean(onEnableNotifications);
      // Asked once: someone who already has one is not asked again.
      if (step === 'username') return Boolean(onClaimUsername) && !hadUsername;
      return true;
    });
  const sequence = sequenceFor(goalChoice);

  const [stepId, setStepId] = useState<StepId>('welcome');
  const [stepError, setStepError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [commitDays, setCommitDays] = useState<number | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [handle, setHandle] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [plusBusy, setPlusBusy] = useState<PlusPlan | null>(null);
  /** How Plus is sold here (store or test) and at what price, read once the offer is on screen. */
  const [plusStatus, setPlusStatus] = useState<PlusStatus | null>(null);

  // The room the page has (the keyboard takes its share), measured, so every
  // page can be laid out to fit it instead of scrolling.
  const [area, setArea] = useState({ width: 0, height: 0 });
  const onAreaLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setArea((current) => (Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1 ? current : { width, height }));
  };
  const short = area.height > 0 && area.height < 520;

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
  const animal = sheetByBreed(breed).label.toLowerCase();

  const previewPet = useMemo(
    () => createPet('preview', named ? name.trim() : 'Pet', 'dog', breed, personality, undefined, persona),
    [named, name, breed, personality, persona],
  );

  /** A happy little hop, for tapping the pet or a moment worth one. */
  const celebrate = (ms = 1200) => {
    setCelebrating(true);
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    celebrateTimer.current = setTimeout(() => setCelebrating(false), ms);
  };

  /**
   * How big the pet can be on this page: what is left of the measured height
   * once `reserved` (everything else on the page) is set aside, capped at
   * `wanted`. Zero, and the pet steps aside, when that is less than MIN_PET.
   * Before the first measurement, the wanted size.
   */
  const petRoom = (wanted: number, reserved: number) => {
    if (area.height === 0) return wanted;
    const room = Math.floor(Math.min(wanted, area.height - reserved - 16));
    return room >= MIN_PET ? room : 0;
  };

  /** The space a list of `count` answers needs at its smallest. */
  const listNeeds = (count: number, columns = 1) => {
    const rows = Math.ceil(count / columns);
    return rows * MIN_CHOICE + (rows - 1) * CHOICE_GAP + 16;
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
    if (stepId === 'careAreas' && careAreas.length === 0) return 'Pick at least one.';
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
    if (stepId === 'username' && onClaimUsername) {
      setClaiming(true);
      try {
        await onClaimUsername(normalizeUsername(handle));
      } catch (cause) {
        setStepError(cause instanceof Error ? cause.message : 'Could not save that username.');
        return;
      } finally {
        setClaiming(false);
      }
    }
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
    if (!INVITE_CODE_LENGTHS.includes(code.length)) {
      setStepError('Enter the code your partner shared.');
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

  /** What should affect the pet. Nothing preselected; carried on the profile until the pet is adopted. */
  const [careAreas, setCareAreas] = useState<CareArea[]>([]);
  const toggleCareArea = (value: CareArea) => {
    tick();
    const next = careAreas.includes(value)
      ? careAreas.filter((area) => area !== value)
      : CARE_AREAS.filter((area) => area === value || careAreas.includes(area));
    setCareAreas(next);
    if (next.length > 0) onUpdate('focusAreas', next);
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

  // The App Store's own prices once known, the intended ones until then.
  const sellable = plusStatus?.plans ?? PLUS_PLANS;
  const yearly = sellable.find((plan) => plan.value === 'yearly') ?? PLUS_PLANS.find((plan) => plan.value === 'yearly')!;
  const monthly = sellable.find((plan) => plan.value === 'monthly') ?? PLUS_PLANS.find((plan) => plan.value === 'monthly')!;
  const plusStore = plusStatus?.mode === 'store';
  // Store mode: the trial Apple will give this person (first-time subscribers
  // only), or none. Test mode: always.
  const trialDays = plusStore ? (plusStatus?.trialDays ?? null) : TRIAL_DAYS;
  const reminderDay = trialDays === null ? null : plusStore ? Math.max(1, trialDays - 2) : TRIAL_REMINDER_DAY;

  useEffect(() => {
    if (stepId !== 'plusOffer' || plusStatus !== null) return;
    void billingService
      .status()
      .then(setPlusStatus)
      .catch(() => setPlusStatus({ enabled: false, tier: 'free', expiresAt: null }));
  }, [stepId, plusStatus]);

  /** Buys Plus (Yearly comes with the trial), unlocks it at once, and carries on. */
  const buyPlus = async (plan: PlusPlan) => {
    if (!paywall) return;
    thump();
    setPlusBusy(plan);
    setStepError(null);
    try {
      const trial = plan === 'yearly' && trialDays !== null;
      const next = await billingService.purchase(plan, trial);
      paywall.onTierChange(next.tier);
      if (next.tier === 'plus') {
        cheer();
        // The reminder is a courtesy: if it cannot be scheduled, the purchase still stands.
        if (trial && trialDays !== null && reminderDay !== null) {
          await Promise.resolve(scheduleTrialReminder(reminderDay, trialDays)).catch(() => {});
        }
        goNext('plusOffer');
      }
    } catch (cause) {
      setStepError(cause instanceof Error ? cause.message : 'That did not go through.');
    } finally {
      setPlusBusy(null);
    }
  };

  /** The pet you chose at `size` (nothing at 0), tappable for a hop and a little buzz, with what they have to say above. */
  const pet = (size: number, bubble?: string, partying = false) => (
    <View style={styles.petArea}>
      {bubble ? <Bubble>{bubble}</Bubble> : null}
      {size > 0 ? (
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
            stageStyle={[styles.petStage, { height: size + 4 }]}
          >
            {null}
          </PetAvatar>
        </Pressable>
      ) : null}
    </View>
  );

  /** A question page: label, pet if it fits, the question, then answers laid out to fit what is left. */
  const question = (
    {
      eyebrow,
      title,
      sub,
      count,
      columns = 1,
      wanted = 110,
      extraRoom = 0,
    }: { eyebrow: string; title: string; sub?: string; count: number; columns?: number; wanted?: number; extraRoom?: number },
    answers: ReactNode,
  ) => {
    const header = 26 + (title.length > 26 ? 64 : 34) + (sub && !short ? (sub.length > 44 ? 52 : 30) : 0);
    const size = petRoom(wanted, header + listNeeds(count, columns) + extraRoom);
    return (
      <View style={styles.fill}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        {pet(size)}
        <Text style={[styles.question, short && styles.questionShort]}>{title}</Text>
        {sub && !short ? <Text style={styles.sub}>{sub}</Text> : null}
        <View style={styles.choices}>{answers}</View>
      </View>
    );
  };

  const footer: { label: string; disabled?: boolean } | null = (() => {
    if (TAP_TO_ADVANCE.has(stepId) || stepId === 'plusOffer' || stepId === 'notifications') return null;
    switch (stepId) {
      case 'welcome':
        return { label: 'Get started' };
      case 'choosePet':
        return picked.choosePet ? { label: `Choose the ${animal}` } : { label: 'Choose your companion', disabled: true };
      case 'meetPet':
        return { label: 'Let’s go!' };
      case 'namePet':
        return { label: 'Next', disabled: !named };
      case 'yourName':
        return { label: 'Next', disabled: !profile.displayName?.trim() || !picked.yourName };
      case 'username':
        return { label: 'Next', disabled: usernameError(handle) !== null };
      case 'body':
        return { label: 'Next', disabled: !bodyComplete };
      case 'target':
        return { label: 'Next', disabled: goalNumber === undefined || !picked.target || !profile.goalTargetDate };
      case 'motivation':
        return { label: 'Next', disabled: motivations.length === 0 };
      case 'careAreas':
        return { label: 'Next', disabled: careAreas.length === 0 };
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
  const personalities = petPersonalityOptionsFor(profile.age);
  const preview = picked.personality && personality !== 'custom' ? PERSONALITY_PREVIEW[personality] : undefined;

  // Pet tiles: five across, square, from the measured width.
  // `area` is measured outside its 20pt side padding, and the page caps at MAX_WIDTH.
  const inner = Math.min(MAX_WIDTH, area.width - 40);
  const tile = area.width > 0 ? Math.floor((inner - 4 * 8) / 5) : 64;

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

      <View style={styles.area} onLayout={onAreaLayout}>
        <Animated.View style={[styles.page, { opacity: enter, transform: [{ translateX }] }]}>
          {stepId === 'welcome' ? (
            <View style={[styles.fill, styles.centred]}>
              <View style={styles.welcomePets}>
                {WELCOME_PETS.map((option, n) => {
                  const size = Math.min(n === 1 ? 150 : 112, Math.max(0, petRoom(n === 1 ? 150 : 112, showJoin ? 360 : 230)));
                  return size > 0 ? (
                    <View key={option} style={[styles.welcomePet, n === 1 && styles.welcomePetMiddle]}>
                      <SpriteFrame sheet={sheetByBreed(option)} frame={portraitFrame(sheetByBreed(option))} size={size} />
                    </View>
                  ) : null;
                })}
              </View>
              <Text style={styles.title}>A companion that grows with you.</Text>
              <Text style={styles.sub}>Every workout, meal and step keeps them going. Let’s meet yours!</Text>
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
                      placeholder="ABCD-EFGH"
                    />
                    <FButton
                      label="Join their pet"
                      busy={joining}
                      disabled={!INVITE_CODE_LENGTHS.includes(normalizeInviteCode(joinCode).length)}
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
            <View style={styles.fill}>
              <Text style={styles.title}>Choose your companion!</Text>
              {!short ? <Text style={styles.sub}>Pick the one that feels right.</Text> : null}
              <View style={[styles.fill, styles.centred]}>
                {picked.choosePet ? (
                  <>
                    {pet(petRoom(170, (short ? 50 : 80) + tile * 2 + 8 + 50), undefined, true)}
                    <Text style={styles.chosenName}>{`The ${animal}`}</Text>
                  </>
                ) : (
                  <View style={styles.mystery}>
                    <Text style={styles.mysteryMark}>?</Text>
                  </View>
                )}
              </View>
              <View style={styles.petGrid}>
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
                      style={({ pressed }) => [
                        styles.petTile,
                        { width: tile, height: tile },
                        on && styles.selected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <SpriteFrame sheet={sheet} frame={portraitFrame(sheet)} size={Math.round(tile * 0.86)} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {stepId === 'meetPet' ? (
            <View style={[styles.fill, styles.centred]} testID="meet-pet">
              {pet(petRoom(230, 150), undefined, true)}
              <Text style={styles.title}>{`You chose the ${animal}!`}</Text>
              <Text style={styles.sub}>They’re so happy to meet you, and they’ll be with you for every workout, meal and step.</Text>
            </View>
          ) : null}

          {stepId === 'namePet' ? (
            <View style={[styles.fill, styles.centred]}>
              {pet(petRoom(160, 96 + 80 + 72), 'Hi! Thanks for choosing me. What do you want to call me?')}
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
            </View>
          ) : null}

          {stepId === 'yourName' ? (
            <View style={[styles.fill, styles.centred]}>
              {pet(petRoom(150, 96 + 80), `Cheers! I’m ${petName}. And what’s your name?`)}
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

          {stepId === 'username' ? (
            <View style={[styles.fill, styles.centred]}>
              {pet(petRoom(140, 96 + 80 + 50), `Now pick a username, so your friends can find us!`)}
              <FInput
                value={handle}
                onChangeText={(value) => {
                  setHandle(value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20));
                  setStepError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                placeholder="@username"
                returnKeyType="done"
                accessibilityLabel="Your username"
              />
              <Text style={styles.hint}>
                {handle && usernameError(handle) ? usernameError(handle) : 'Letters, numbers and underscores. Friends see this, not your name.'}
              </Text>
            </View>
          ) : null}

          {stepId === 'aboutIntro' ? (
            <View style={[styles.fill, styles.centred]}>
              {pet(petRoom(180, 130))}
              <Text style={styles.title}>Let’s learn a bit about you!</Text>
              <Text style={styles.sub}>{`${PetName} is curious about how they can grow with you.`}</Text>
            </View>
          ) : null}

          {stepId === 'age'
            ? question(
                {
                  eyebrow: 'About you',
                  title: 'How old are you?',
                  sub: 'This helps us personalize your experience',
                  count: AGE_OPTIONS.length,
                  columns: 2,
                },
                <Grid columns={2}>
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
                </Grid>,
              )
            : null}

          {stepId === 'sex'
            ? question(
                { eyebrow: 'About you', title: 'What’s your sex?', sub: 'Only for your energy estimate and strength standards', count: 3 },
                <>
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
                </>,
              )
            : null}

          {stepId === 'body'
            ? question(
                {
                  eyebrow: 'About you',
                  title: 'Your height and weight',
                  sub: 'Just for your calorie target. Nobody else sees it.',
                  count: 4,
                  wanted: 100,
                },
                <>
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
                          <Text style={[styles.toggleLabel, on && styles.toggleLabelOn]}>
                            {system === 'imperial' ? 'lb · ft' : 'kg · cm'}
                          </Text>
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
                </>,
              )
            : null}

          {stepId === 'goal'
            ? question(
                { eyebrow: 'Your goal', title: 'What would you most like to do?', count: 3, wanted: 140 },
                <>
                  {GOAL_OPTIONS.map((option) => (
                    <FChoice
                      key={option.value}
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
                </>,
              )
            : null}

          {stepId === 'target'
            ? question(
                {
                  eyebrow: 'Your goal',
                  title: 'What weight are you aiming for?',
                  sub: `You’re at ${displayedWeight} ${profile.weightUnit} now.`,
                  count: 3,
                  wanted: 100,
                },
                <>
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
                  {/* The one sideways list: fifteen months in a row, swiped, never the page. */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chips}
                    style={styles.chipStrip}
                  >
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
                </>,
              )
            : null}

          {stepId === 'activity'
            ? question(
                { eyebrow: 'Your days', title: 'Outside workouts, how active is your day?', count: 3 },
                <>
                  {ACTIVITY_OPTIONS.map((option) => (
                    <FChoice
                      key={option.value}
                      label={option.label}
                      detail={short ? undefined : option.detail}
                      align="left"
                      selected={picked.activity && profile.activity === option.value}
                      onPress={() => answer(() => onUpdate('activity', option.value))}
                    />
                  ))}
                </>,
              )
            : null}

          {stepId === 'trainingDays'
            ? question(
                {
                  eyebrow: 'Your days',
                  title: 'How many days a week will you train?',
                  sub: `${PetName} gets stronger every time you do`,
                  count: TRAINING_DAY_OPTIONS.length,
                  columns: 2,
                },
                <Grid columns={2}>
                  {TRAINING_DAY_OPTIONS.map((option) => (
                    <FChoice
                      key={option.value}
                      label={option.label}
                      selected={picked.trainingDays && profile.trainingDaysPerWeek === option.value}
                      onPress={() => answer(() => onUpdate('trainingDaysPerWeek', option.value))}
                    />
                  ))}
                </Grid>,
              )
            : null}

          {stepId === 'careAreas'
            ? question(
                {
                  eyebrow: petName,
                  title: `What should keep ${petName} healthy?`,
                  sub: `Pick what you'll track. Anything you leave off never affects ${petName}.`,
                  count: CARE_AREAS.length,
                  // Two-line rows: room for them, so nothing scrolls.
                  extraRoom: CARE_AREAS.length * 40,
                  wanted: 90,
                },
                <>
                  {CARE_AREAS.map((area) => (
                    <FChoice
                      key={area}
                      label={CARE_AREA_CHOICE[area].label}
                      detail={CARE_AREA_CHOICE[area].detail(petName)}
                      detailLines={2}
                      stats={CARE_AREA_CHOICE[area].stats}
                      align="left"
                      selected={careAreas.includes(area)}
                      onPress={() => toggleCareArea(area)}
                      style={styles.choiceTall}
                    />
                  ))}
                </>,
              )
            : null}

          {stepId === 'trainingTypes'
            ? question(
                {
                  eyebrow: 'Your days',
                  title: 'What kind of training do you like?',
                  sub: 'Pick any, or none yet',
                  count: TRAINING_TYPE_OPTIONS.length,
                  columns: 2,
                },
                <Grid columns={2}>
                  {TRAINING_TYPE_OPTIONS.map((option) => (
                    <FChoice
                      key={option.value}
                      label={option.label}
                      selected={trainingTypes.includes(option.value)}
                      onPress={() => toggleTraining(option.value)}
                    />
                  ))}
                </Grid>,
              )
            : null}

          {stepId === 'steps'
            ? question(
                {
                  eyebrow: 'Your days',
                  title: 'How many steps a day?',
                  sub: `Every one of them feeds ${petName}`,
                  count: STEP_GOAL_PRESETS.length + 1,
                },
                <>
                  {STEP_GOAL_PRESETS.map((steps) => (
                    <FChoice
                      key={steps}
                      label={`${steps.toLocaleString()} steps`}
                      note={STEP_LABEL[steps]}
                      selected={picked.steps && stepGoal === steps}
                      onPress={() => answer(() => onStepGoalChange(steps))}
                    />
                  ))}
                  <FChoice label="Let Vitto choose" onPress={() => answer(() => onStepGoalChange(suggestStepGoal(profile)))} />
                </>,
              )
            : null}

          {stepId === 'motivation'
            ? question(
                {
                  eyebrow: 'Almost there',
                  title: 'What keeps you going?',
                  sub: `${PetName} will cheer you on the way you like. Pick any.`,
                  count: MOTIVATION_OPTIONS.length,
                  columns: 2,
                },
                <Grid columns={2}>
                  {MOTIVATION_OPTIONS.map((option) => (
                    <FChoice
                      key={option.value}
                      label={option.label}
                      small
                      selected={motivations.includes(option.value)}
                      onPress={() => toggleMotivation(option.value)}
                    />
                  ))}
                </Grid>,
              )
            : null}

          {stepId === 'plan' ? (
            <View style={styles.fill}>
              {pet(petRoom(120, 64 + 330), 'You got this!')}
              <View style={styles.planCard} testID="starter-plan">
                <View style={styles.planRings}>
                  {[0, 1, 2, 3, 4].map((n) => (
                    <View key={n} style={styles.planRing} />
                  ))}
                </View>
                <Text style={styles.planTitle}>{you ? `${you}’s starter plan` : 'Your starter plan'}</Text>
                <Text style={styles.planSub}>{`Try these easy goals with ${petName}!`}</Text>
                <PlanRow text={`Eat about ${targets.calories.toLocaleString()} kcal a day`} />
                <PlanRow text={`Get ${targets.proteinGrams}g of protein`} />
                <PlanRow text={`Walk ${stepGoal.toLocaleString()} steps`} />
                <PlanRow
                  text={profile.trainingDaysPerWeek > 0 ? `Train ${profile.trainingDaysPerWeek} days a week` : 'Try one workout this week'}
                />
                {goalChoice !== 'maintain' && profile.goal !== 'maintain' && profile.targetWeightKg !== undefined ? (
                  <PlanRow
                    text={`Reach ${toDisplayWeight(profile.targetWeightKg)} ${profile.weightUnit} by ${formatMonth(profile.goalTargetDate)}`}
                    last
                  />
                ) : (
                  <PlanRow text={`Hold steady around ${displayedWeight} ${profile.weightUnit}`} last />
                )}
              </View>
            </View>
          ) : null}

          {stepId === 'plusPersonality' ? (
            <View style={[styles.fill, styles.centred]}>
              <Text style={styles.plusKicker}>Vitto Plus</Text>
              <Text style={styles.title}>{`Make ${petName} truly yours`}</Text>
              <View style={styles.perkStage}>
                <View style={[styles.voice, styles.voiceLeft]}>
                  <Text style={styles.voiceTag}>Sweet</Text>
                  <Text style={styles.voiceLine}>You came back! I saved you a spot.</Text>
                </View>
                <View style={[styles.voice, styles.voiceRight]}>
                  <Text style={styles.voiceTag}>Savage</Text>
                  <Text style={styles.voiceLine}>Oh, you’re up. Groundbreaking.</Text>
                </View>
              </View>
              {pet(petRoom(120, 80 + 150 + 70 + 90))}
              {!short ? <Text style={styles.sub}>Pick a personality, or write them a whole character of your own.</Text> : null}
              <PerkCompare free="One easygoing voice" plus="Every personality, and your own" />
            </View>
          ) : null}

          {stepId === 'plusMeals' ? (
            <View style={[styles.fill, styles.centred]}>
              <Text style={styles.plusKicker}>Vitto Plus</Text>
              <Text style={styles.title}>Snap a photo, get the macros</Text>
              <View style={styles.mealCard}>
                {/* A viewfinder over a plate: the camera finding the meal. */}
                <View style={styles.viewfinder}>
                  {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
                    <View key={corner} style={[styles.corner, styles[`corner_${corner}`]]} />
                  ))}
                  <View style={styles.plate}>
                    <View style={styles.plateInner} />
                  </View>
                </View>
                <View style={styles.mealChips}>
                  {['520 kcal', '32g protein', '48g carbs', '18g fat'].map((chip) => (
                    <View key={chip} style={styles.mealChip}>
                      <Text style={styles.mealChipLabel}>{chip}</Text>
                    </View>
                  ))}
                </View>
              </View>
              {pet(petRoom(100, 80 + 200 + 70 + 90))}
              {!short ? (
                <Text
                  style={styles.sub}
                >{`Point your camera at a meal and Vitto works out the calories and macros, then feeds ${petName}.`}</Text>
              ) : null}
              <PerkCompare free="Search and log by hand" plus="Photo meal tracking" />
            </View>
          ) : null}

          {stepId === 'plusChat' ? (
            <View style={[styles.fill, styles.centred]}>
              <Text style={styles.plusKicker}>Vitto Plus</Text>
              <Text style={styles.title}>{`Talk with ${petName} anytime`}</Text>
              <View style={styles.chat}>
                <View style={[styles.chatBubble, styles.chatMine]}>
                  <Text style={[styles.chatText, styles.chatTextMine]}>Hit a new bench PR today!</Text>
                </View>
                <View style={[styles.chatBubble, styles.chatTheirs]}>
                  <Text style={styles.chatText}>No way! I KNEW you had it in you. What’s next, the squat?</Text>
                </View>
              </View>
              {pet(petRoom(110, 80 + 140 + 70 + 90))}
              {!short ? (
                <Text
                  style={styles.sub}
                >{`A sharper, more in-character ${petName} who remembers your week and checks in on you more.`}</Text>
              ) : null}
              <PerkCompare
                free={`${ai.TIER_LIMITS.free.messagesPerDay} messages a day`}
                plus={`${ai.TIER_LIMITS.plus.messagesPerDay} a day, and remembers you`}
              />
            </View>
          ) : null}

          {stepId === 'plusOffer' && paywall ? (
            <View style={styles.fill} testID="plus-offer">
              <Pressable accessibilityRole="button" onPress={() => goNext('plusOffer')} hitSlop={10} style={styles.offerSkip}>
                <Text style={styles.link}>Not now</Text>
              </Pressable>
              <Text style={styles.offerReady}>{trialDays !== null ? 'Your free trial is ready' : 'Everything your pet can be'}</Text>
              <Text style={[styles.title, short && styles.titleShort]}>
                {trialDays !== null ? `Start your ${trialDays}-day free trial` : 'Get Vitto Plus'}
              </Text>
              {trialDays !== null ? (
              <View style={styles.timeline}>
                <View style={styles.timelineBar} />
                {[
                  { title: 'Today', body: `Unlock everything in Plus and see what ${petName} can be.`, filled: true },
                  { title: `Day ${reminderDay}`, body: 'We’ll remind you with a notification that your trial is ending.' },
                  {
                    title: `Day ${trialDays}`,
                    body: `You’ll be charged on ${new Date(Date.now() + trialDays * 86_400_000).toLocaleDateString([], { month: 'short', day: 'numeric' })}. Cancel anytime before.`,
                  },
                ].map((row) => (
                  <View key={row.title} style={styles.timelineRow}>
                    <View style={styles.timelineMarkWrap}>
                      <View style={[styles.timelineMark, row.filled && styles.timelineMarkOn]} />
                    </View>
                    <View style={styles.timelineText}>
                      <Text style={styles.timelineTitle}>{row.title}</Text>
                      <Text style={styles.timelineBody}>{row.body}</Text>
                    </View>
                  </View>
                ))}
              </View>
              ) : null}
              {paywall.isDevAccount ? <Text style={styles.hint}>Dev account: Plus is always on here.</Text> : null}
              {plusStatus?.mode === 'test' ? <Text style={styles.hint}>Test mode: no real payment is taken.</Text> : null}
            </View>
          ) : null}

          {stepId === 'personality' ? (
            <View style={styles.fill}>
              <Text style={[styles.title, short && styles.titleShort]}>{`Choose a personality for ${petName}`}</Text>
              {!short ? <Text style={styles.sub}>Their personality: how they talk to you. Fine-tune it any time in Settings.</Text> : null}
              <View style={styles.choices}>
                <Grid columns={2}>
                  {personalities.map((option) => (
                    <FChoice
                      key={option.value}
                      label={option.label}
                      selected={Boolean(picked.personality) && personality === option.value}
                      onPress={() => {
                        tick();
                        pick('personality');
                        onPersonalityChange(option.value);
                        // The base's own slider positions; fine-tuning is for later, in Settings.
                        onDialsChange(companion.dialsFor(option.value));
                      }}
                    />
                  ))}
                </Grid>
              </View>
              {picked.personality && personality === 'custom' && profile.age >= MATURE_PERSONALITY_AGE ? (
                <View style={styles.personaBox}>
                  <Text style={styles.fieldLabel}>Who are they?</Text>
                  <FInput
                    multiline
                    style={styles.persona}
                    value={persona}
                    onChangeText={(value) => onPersonaChange(value.slice(0, PERSONA_MAX_LENGTH))}
                    placeholder="A grumpy old pirate who secretly adores us"
                    // Return closes the keyboard rather than starting a new line.
                    returnKeyType="done"
                    submitBehavior="blurAndSubmit"
                    onSubmitEditing={() => Keyboard.dismiss()}
                    maxLength={PERSONA_MAX_LENGTH}
                    accessibilityLabel="Their character"
                  />
                </View>
              ) : preview ? (
                <View style={styles.previewCard} testID={`personality-preview-${personality}`}>
                  <Text style={styles.previewAbout}>{preview.about}</Text>
                  {preview.sample ? <Text style={styles.previewQuote}>{`“${preview.sample}”`}</Text> : null}
                </View>
              ) : null}
            </View>
          ) : null}

          {stepId === 'notifications' ? (
            <View style={[styles.fill, styles.centred]}>
              <Text style={styles.title}>{`Get reminders from ${petName}`}</Text>
              <View style={styles.notification}>
                <View style={styles.notificationIcon}>
                  <SpriteFrame sheet={sheetByBreed(breed)} frame={portraitFrame(sheetByBreed(breed))} size={58} />
                </View>
                <View style={styles.notificationText}>
                  <Text style={styles.notificationTitle}>{`From ${PetName}`}</Text>
                  <Text style={styles.notificationBody}>A quick walk would make my whole day!</Text>
                </View>
                <Text style={styles.notificationTime}>now</Text>
              </View>
              {pet(petRoom(180, 80 + 100))}
            </View>
          ) : null}

          {stepId === 'commit' ? (
            <View style={styles.fill}>
              <Text style={[styles.title, short && styles.titleShort]}>{`How many days in a row will you take care of ${petName}?`}</Text>
              {pet(petRoom(110, 100 + 70 + listNeeds(COMMIT_OPTIONS.length)), commitDays ? 'You got this!' : undefined)}
              <View style={styles.choices}>
                {COMMIT_OPTIONS.map((option) => (
                  <FChoice
                    key={option.days}
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
            <View style={[styles.fill, styles.centred]}>
              <Text style={styles.dayKicker}>Day 1</Text>
              <Text style={styles.title}>{`Happy ${new Date().toLocaleDateString([], { weekday: 'long' })}!`}</Text>
              {pet(petRoom(190, 80 + 230 + (commitDays ? 40 : 0)))}
              <View style={styles.dayCard}>
                <Text style={styles.dayCardKicker}>A gentle reminder</Text>
                <Text style={styles.dayCardTitle}>Good things take time.</Text>
                <Text style={styles.dayCardBody}>{survival.detail}</Text>
              </View>
              {commitDays ? <Text style={styles.hint}>{`Your goal: ${commitDays} days in a row with ${petName}.`}</Text> : null}
            </View>
          ) : null}
        </Animated.View>
      </View>

      <View style={[styles.footer, { backgroundColor: F.bg }]}>
        <View style={styles.footerInner}>
          {(stepError ?? error) ? <Text style={styles.error}>{stepError ?? error}</Text> : null}
          {stepId === 'plusOffer' ? (
            <>
              <Text style={styles.offerPrice}>
                {trialDays !== null ? `${trialDays} days free, then ` : ''}
                <Text style={styles.offerPriceStrong}>{`${yearly.price} per year`}</Text>
                {yearly.note ? ` (${yearly.note.toLowerCase()})` : ''}
              </Text>
              <FButton
                label={trialDays !== null ? 'Start my free trial' : 'Get Plus yearly'}
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
                <Text style={styles.linkLarge}>{`Or ${monthly.price} a month${trialDays !== null ? ', no trial' : ''}`}</Text>
              </Pressable>
              {/* What the App Store requires on any screen that sells a subscription. */}
              <Text style={styles.offerLegal}>
                {'Renews automatically. Cancel anytime in Settings. '}
                <Text style={styles.offerLegalLink} accessibilityRole="link" onPress={() => void Linking.openURL(LEGAL_LINKS.terms)}>
                  Terms
                </Text>
                {LEGAL_LINKS.privacy ? (
                  <>
                    {' · '}
                    <Text
                      style={styles.offerLegalLink}
                      accessibilityRole="link"
                      onPress={() => void Linking.openURL(LEGAL_LINKS.privacy!)}
                    >
                      Privacy
                    </Text>
                  </>
                ) : null}
              </Text>
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
              <FButton label={footer.label} busy={busy || claiming} disabled={footer.disabled} onPress={() => void advance()} />
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

/** Answers in rows of `columns`, every row sharing the height the page can give. */
function Grid({ columns, children }: { columns: number; children: ReactNode }) {
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return (
    <>
      {rows.map((row, n) => (
        <View key={n} style={styles.gridRow}>
          {row.map((item, m) => (
            <View key={m} style={styles.gridCell}>
              {item}
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

/** A big rounded answer: grey edge, coral edge and a tick once chosen. It shrinks to fit a long list. */
function FChoice({
  label,
  detail,
  detailLines = 1,
  stats,
  note,
  selected,
  align = 'center',
  small,
  onPress,
  style,
}: {
  label: string;
  detail?: string;
  /** How many lines the detail may take; one by default, for the tight grids. */
  detailLines?: number;
  /** A short coral line under the detail: what it raises, "Strength · Energy". */
  stats?: string;
  note?: string;
  selected?: boolean;
  align?: 'center' | 'left';
  /** Smaller type, for long labels in a two-column grid. */
  small?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const centred = align === 'center' && !note && !detail;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, selected && styles.selected, pressed && styles.pressed, style]}
    >
      <View style={[styles.choiceText, centred && styles.choiceTextCentred]}>
        <Text
          style={[
            styles.choiceLabel,
            !centred && styles.choiceLabelLeft,
            small && styles.choiceLabelSmall,
            selected && styles.choiceLabelOn,
          ]}
          numberOfLines={2}
        >
          {label}
        </Text>
        {detail ? (
          <Text style={styles.choiceDetail} numberOfLines={detailLines}>
            {detail}
          </Text>
        ) : null}
        {stats ? (
          <Text style={styles.choiceStats} numberOfLines={1}>
            {stats}
          </Text>
        ) : null}
      </View>
      {note ? (
        <Text style={styles.choiceNote} numberOfLines={1}>
          {note}
        </Text>
      ) : null}
      {selected ? (
        <View style={styles.check}>
          <Text style={styles.checkMark}>✓</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** The chunky button: a solid face over a darker lip, which it presses down into. */

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

function PlanRow({ text, last }: { text: string; last?: boolean }) {
  return (
    <View style={[styles.planRow, !last && styles.planRowRuled]}>
      <View style={styles.planDot} />
      <Text style={styles.planText} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;
const MAX_WIDTH = 560;

const styles = themedStyles(() => {
  const F = palette();
  const dark = getColorScheme() === 'dark';
  return {
    screen: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 56, paddingHorizontal: 18, paddingBottom: 4 },
    headerEnd: { justifyContent: 'flex-end' },
    headerSpacer: { height: 56 },
    headerBalance: { width: 12 },
    backButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: F.soft },
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

    // The page: a fixed area, measured, that nothing scrolls inside.
    area: { flex: 1, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 4, overflow: 'hidden' },
    page: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
    fill: { flex: 1, minHeight: 0 },
    centred: { alignItems: 'center', justifyContent: 'center' },
    row: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
    rowSpaced: { marginTop: 12 },
    rowItem: { flex: 1 },

    eyebrow: {
      fontFamily: FONT.medium,
      fontSize: 14,
      lineHeight: 20,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      color: F.sub,
      textAlign: 'center',
    },
    title: { fontFamily: FONT.bold, fontSize: 26, lineHeight: 32, color: F.text, textAlign: 'center', marginTop: 6 },
    titleShort: { fontSize: 22, lineHeight: 28 },
    question: { fontFamily: FONT.bold, fontSize: 23, lineHeight: 29, color: F.text, textAlign: 'center', marginTop: 4 },
    questionShort: { fontSize: 20, lineHeight: 26 },
    sub: { fontFamily: FONT.regular, fontSize: 16, lineHeight: 22, color: F.sub, textAlign: 'center', marginTop: 4 },
    hint: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 20, color: F.sub, textAlign: 'center', marginTop: 10 },
    fieldLabel: { fontFamily: FONT.medium, fontSize: 16, lineHeight: 21, color: F.text, marginTop: 4 },
    link: { fontFamily: FONT.medium, fontSize: 15, lineHeight: 20, color: F.sub },
    linkLarge: { fontFamily: FONT.medium, fontSize: 17, lineHeight: 22, color: F.sub },
    linkRow: { alignItems: 'center', paddingVertical: 10 },
    error: { fontFamily: FONT.medium, fontSize: 14, lineHeight: 19, color: colors.danger, textAlign: 'center' },

    welcomePets: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 6 },
    welcomePet: { marginHorizontal: -14 },
    welcomePetMiddle: { zIndex: 1 },
    chosenName: { fontFamily: FONT.semibold, fontSize: 18, lineHeight: 24, color: F.text },
    mystery: {
      width: 110,
      height: 110,
      borderRadius: 55,
      backgroundColor: F.soft,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: F.border,
      borderStyle: 'dashed',
    },
    mysteryMark: { fontFamily: FONT.bold, fontSize: 46, lineHeight: 56, color: F.sub },
    petGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 6 },
    petTile: {
      borderRadius: 18,
      borderWidth: 2,
      borderColor: F.border,
      backgroundColor: F.bg,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },

    petArea: { alignItems: 'center', alignSelf: 'stretch', marginTop: 4 },
    // Full width, so the pet's soft glow fades out instead of stopping at a box edge.
    petPress: { alignSelf: 'stretch' },
    petStage: { backgroundColor: 'transparent', alignSelf: 'stretch' },
    bubble: {
      alignSelf: 'stretch',
      backgroundColor: F.soft,
      borderRadius: 24,
      paddingHorizontal: 20,
      paddingVertical: 14,
      marginBottom: 8,
    },
    bubbleText: { fontFamily: FONT.medium, fontSize: 17, lineHeight: 24, color: F.text },
    bubbleTail: {
      position: 'absolute',
      bottom: -8,
      left: 34,
      width: 20,
      height: 20,
      borderRadius: 4,
      backgroundColor: F.soft,
      transform: [{ rotate: '45deg' }],
    },

    // Answers: a column that hands each row an equal share, down to MIN_CHOICE.
    choices: { flex: 1, minHeight: 0, marginTop: 14, gap: CHOICE_GAP },
    gridRow: { flexDirection: 'row', gap: CHOICE_GAP, flexBasis: 64, flexShrink: 1, flexGrow: 0, minHeight: MIN_CHOICE, maxHeight: 68 },
    gridCell: { flex: 1 },
    // A choice with a two-line detail under its label.
    choiceTall: { flexBasis: 92, maxHeight: 104, paddingVertical: 10 },
    choice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flexBasis: 64,
      flexShrink: 1,
      flexGrow: 0,
      minHeight: MIN_CHOICE,
      maxHeight: 72,
      paddingHorizontal: 18,
      borderRadius: 22,
      borderWidth: 2,
      borderColor: F.border,
      backgroundColor: F.bg,
    },
    selected: { borderColor: F.green, borderWidth: 3 },
    pressed: { transform: [{ scale: 0.98 }] },
    choiceText: { flex: 1 },
    choiceTextCentred: { alignItems: 'center' },
    choiceLabel: { fontFamily: FONT.medium, fontSize: 18, lineHeight: 23, color: F.text, textAlign: 'center' },
    choiceLabelLeft: { textAlign: 'left' },
    choiceLabelSmall: { fontSize: 15, lineHeight: 19 },
    choiceLabelOn: { fontFamily: FONT.semibold },
    choiceDetail: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 18, color: F.sub, marginTop: 1 },
    // What a choice raises, in the accent, so it reads as a reward.
    choiceStats: { fontFamily: FONT.bold, fontSize: 12, lineHeight: 16, letterSpacing: 0.2, color: F.green, marginTop: 3 },
    choiceNote: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 20, color: F.sub, flexShrink: 1, textAlign: 'right' },
    check: { width: 26, height: 26, borderRadius: 13, backgroundColor: F.green, alignItems: 'center', justifyContent: 'center' },
    checkMark: { fontFamily: FONT.bold, fontSize: 14, lineHeight: 18, color: '#ffffff' },

    toggle: { flexDirection: 'row', gap: 10 },
    toggleOption: {
      flex: 1,
      height: 46,
      borderRadius: 23,
      borderWidth: 2,
      borderColor: F.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toggleOptionOn: { borderColor: F.green, backgroundColor: F.greenPale },
    toggleLabel: { fontFamily: FONT.medium, fontSize: 16, lineHeight: 21, color: F.sub },
    toggleLabelOn: { color: F.text, fontFamily: FONT.semibold },

    persona: { height: 96, fontSize: 16, textAlign: 'left', paddingTop: 12, textAlignVertical: 'top', lineHeight: 22 },
    personaBox: { marginTop: 10, gap: 6 },
    chipStrip: { flexGrow: 0 },
    chips: { flexDirection: 'row', gap: 10, paddingRight: 24, paddingVertical: 2 },
    chip: {
      height: 46,
      paddingHorizontal: 18,
      borderRadius: 23,
      borderWidth: 2,
      borderColor: F.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipOn: { borderColor: F.green, backgroundColor: F.greenPale },
    chipLabel: { fontFamily: FONT.medium, fontSize: 16, lineHeight: 21, color: F.sub },
    chipLabelOn: { color: F.text },

    join: { alignSelf: 'stretch', marginTop: 14, gap: 10 },

    previewCard: { marginTop: 12, padding: 16, borderRadius: 22, backgroundColor: F.greenPale, gap: 6 },
    previewAbout: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 21, color: F.text },
    previewQuote: { fontFamily: FONT.medium, fontSize: 16, lineHeight: 22, color: F.text, fontStyle: 'italic' },

    plusKicker: {
      fontFamily: FONT.semibold,
      fontSize: 14,
      lineHeight: 19,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      color: '#f29b0f',
    },
    perkStage: { alignSelf: 'stretch', marginTop: 12, gap: 8 },
    voice: { maxWidth: '80%', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: F.soft },
    voiceLeft: { alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
    voiceRight: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
    voiceTag: { fontFamily: FONT.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 1, textTransform: 'uppercase', color: F.green },
    voiceLine: { fontFamily: FONT.medium, fontSize: 16, lineHeight: 22, color: F.text, marginTop: 2 },
    mealCard: {
      alignSelf: 'stretch',
      marginTop: 12,
      padding: 14,
      borderRadius: 26,
      backgroundColor: dark ? colors.cardSoft : '#fff4e2',
      alignItems: 'center',
      gap: 12,
    },
    viewfinder: { width: 120, height: 92, alignItems: 'center', justifyContent: 'center' },
    corner: { position: 'absolute', width: 22, height: 22, borderColor: F.green },
    corner_tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 10 },
    corner_tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 10 },
    corner_bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 10 },
    corner_br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 10 },
    plate: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: '#ffffff',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: '#efe3cc',
    },
    plateInner: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#8cc56f' },
    mealChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
    mealChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: F.bg, borderWidth: 2, borderColor: F.border },
    mealChipLabel: { fontFamily: FONT.semibold, fontSize: 14, lineHeight: 19, color: F.text },
    chat: { alignSelf: 'stretch', marginTop: 12, gap: 10 },
    chatBubble: { maxWidth: '84%', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 22 },
    chatMine: { alignSelf: 'flex-end', backgroundColor: F.green, borderBottomRightRadius: 6 },
    chatTheirs: { alignSelf: 'flex-start', backgroundColor: F.soft, borderBottomLeftRadius: 6 },
    chatText: { fontFamily: FONT.medium, fontSize: 16, lineHeight: 22, color: F.text },
    chatTextMine: { color: '#ffffff' },
    compare: { alignSelf: 'stretch', flexDirection: 'row', gap: 10, marginTop: 12 },
    compareCell: { flex: 1, padding: 12, borderRadius: 20, borderWidth: 2, borderColor: F.border },
    compareCellPlus: { borderColor: F.green, backgroundColor: F.greenPale },
    compareLabel: { fontFamily: FONT.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 1, textTransform: 'uppercase', color: F.sub },
    compareLabelPlus: { color: F.green },
    compareValue: { fontFamily: FONT.medium, fontSize: 15, lineHeight: 20, color: F.sub, marginTop: 3 },
    compareValuePlus: { color: F.text },

    offerSkip: { alignSelf: 'flex-end', paddingVertical: 4 },
    offerReady: { fontFamily: FONT.semibold, fontSize: 16, lineHeight: 21, color: F.green, textAlign: 'center', marginTop: 4 },
    timeline: { marginTop: 16, gap: 14 },
    timelineBar: { position: 'absolute', left: 11, top: 10, bottom: 10, width: 6, borderRadius: 3, backgroundColor: F.greenPale },
    timelineRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
    timelineMarkWrap: { width: 28, paddingTop: 2, alignItems: 'center' },
    timelineMark: { width: 22, height: 22, borderRadius: 11, borderWidth: 4, borderColor: F.green, backgroundColor: F.bg },
    timelineMarkOn: { backgroundColor: F.green },
    timelineText: { flex: 1 },
    timelineTitle: { fontFamily: FONT.bold, fontSize: 18, lineHeight: 23, color: F.text },
    timelineBody: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 20, color: F.sub, marginTop: 1 },
    offerPrice: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 21, color: F.text, textAlign: 'center' },
    offerPriceStrong: { fontFamily: FONT.bold },
    offerLegal: { fontFamily: FONT.regular, fontSize: 12, lineHeight: 17, color: F.sub, textAlign: 'center' },
    offerLegalLink: { textDecorationLine: 'underline' },

    planCard: {
      flexShrink: 1,
      marginTop: 18,
      paddingTop: 24,
      paddingHorizontal: 18,
      paddingBottom: 6,
      borderRadius: 26,
      backgroundColor: dark ? colors.yellow : '#fdf6e8',
      borderWidth: 2,
      borderColor: dark ? colors.hairline : '#f3e7c9',
    },
    planRings: { position: 'absolute', top: -13, left: 34, right: 34, flexDirection: 'row', justifyContent: 'space-between' },
    planRing: { width: 12, height: 26, borderRadius: 6, backgroundColor: '#e2c46e' },
    planTitle: { fontFamily: FONT.bold, fontSize: 21, lineHeight: 27, color: F.text, textAlign: 'center' },
    planSub: {
      fontFamily: FONT.regular,
      fontSize: 15,
      lineHeight: 20,
      color: '#a39363',
      textAlign: 'center',
      marginTop: 2,
      marginBottom: 4,
    },
    planRow: { flexDirection: 'row', alignItems: 'center', gap: 14, flexBasis: 48, flexShrink: 1, minHeight: 34 },
    planRowRuled: { borderBottomWidth: 1.5, borderBottomColor: dark ? colors.hairline : '#f3e7c9' },
    planDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: F.green },
    planText: { flex: 1, fontFamily: FONT.medium, fontSize: 17, lineHeight: 22, color: F.text },

    notification: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginTop: 18,
      padding: 14,
      borderRadius: 24,
      backgroundColor: F.soft,
    },
    notificationIcon: {
      width: 50,
      height: 50,
      borderRadius: 12,
      backgroundColor: colors.tile,
      alignItems: 'center',
      justifyContent: 'flex-end',
      overflow: 'hidden',
    },
    notificationText: { flex: 1 },
    notificationTitle: { fontFamily: FONT.semibold, fontSize: 16, lineHeight: 21, color: F.text },
    notificationBody: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 20, color: F.text, marginTop: 1 },
    notificationTime: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 17, color: F.sub, alignSelf: 'flex-start' },

    dayKicker: { fontFamily: FONT.medium, fontSize: 15, lineHeight: 20, letterSpacing: 1.6, textTransform: 'uppercase', color: F.sub },
    dayCard: {
      alignSelf: 'stretch',
      marginTop: 8,
      padding: 18,
      borderRadius: 26,
      backgroundColor: dark ? colors.yellow : '#ffe9a6',
      borderWidth: 7,
      borderColor: dark ? colors.card : '#ffffff',
      alignItems: 'center',
      gap: 4,
      shadowColor: '#000000',
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      transform: [{ rotate: '-2deg' }],
    },
    dayCardKicker: {
      fontFamily: FONT.medium,
      fontSize: 12,
      lineHeight: 16,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: '#8a6d1d',
    },
    dayCardTitle: { fontFamily: FONT.bold, fontSize: 26, lineHeight: 32, color: '#f29b0f', textAlign: 'center' },
    dayCardBody: {
      fontFamily: FONT.regular,
      fontSize: 14,
      lineHeight: 20,
      color: dark ? colors.inkSoft : '#5c5440',
      textAlign: 'center',
      marginTop: 2,
    },

    footer: { paddingHorizontal: 30, paddingTop: 8, paddingBottom: HOME_INDICATOR_INSET + 8 },
    footerInner: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', gap: 10 },

  };
});
