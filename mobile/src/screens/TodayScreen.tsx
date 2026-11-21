import { type ReactNode, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import {
  type TrophyId,
  AILMENT_PRECEDENCE,
  type BodyProfile,
  type CareArea,
  type CareDiaryEntry,
  type DailyRecap,
  type ForcedPetForm,
  type ForcedPetStatus,
  type HealthEvent,
  type MealMetadata,
  type PetState,
  buildDailyRecap,
  calculateInsights,
  findWordPuzzleEventForDate,
  mindScoreLabel,
  toDateKey,
  tracksArea,
  describeSubMacros,
  estimateCaloriesBurned,
  getEventsForDay,
  measurementSystemOf,
  getMealsForDay,
  calorieEstimate,
  type companion,
  clampStepGoal,
  convertWeightValue,
  weighIns,
  MEAL_SLOTS,
  MEAL_SLOT_LABEL,
  mealSlotOf,
  caloriesMet,
} from '@vitto/core';
import { FitText } from '../components/FitText';
import { NutrientRing } from '../components/NutrientRing';
import { ChoiceRow, PressableScale, TextButton, DoneTextInput, Mark } from '../components/ui';
import { askEditOrDelete, changeable, describeRow, historyRows } from './ActivityHistoryScreen';
import { findScreenTimeForDate } from '../services/screenTimeMapping';
import { colors, fonts, getColorScheme, layout, paletteOf, themedStyles, type ColorScheme } from '../theme';
import { SETTINGS_MAX_WIDTH } from '../components/settingsKit';

/** "Dinner · 330 kcal · Spicy tuna nigiri…": the slot and calories first, so truncation only cuts the name. */
const mealLogName = (event: HealthEvent): string => {
  const meal = event as HealthEvent<MealMetadata>;
  const analysis = meal.metadata.analysis;
  const name = analysis?.foodDescription || analysis?.detectedFoods.join(', ') || analysis?.summary || 'Meal';
  return `${MEAL_SLOT_LABEL[mealSlotOf(meal)]} · ${Math.round(calorieEstimate(analysis?.macros))} kcal · ${name}`;
};

/**
 * Today: a daily game recap, not an event log and not a nutrition dashboard. It
 * answers one question — "how did I take care of myself and my pet today?" —
 * through the four pillars (GYM, OUTDOORS, MIND, FOOD) plus the XP the day
 * actually earned.
 *
 * Every number comes from `buildDailyRecap`, which folds the real event log
 * once: no second copy of the day's activity, no per-section recalculation of
 * calories / steps / XP. Styled in the app's palette (see `todayColors`),
 * light or dark as set in Settings.
 */
interface Props {
  /** Already projected to now by App; not decayed again here. */
  pet: PetState;
  events: HealthEvent[];
  profile: BodyProfile;
  stepGoal: number;
  onStepGoalChange: (goal: number) => void;
  onTrainMind: () => void;
  /** Optional: the mind pillar hides the action until the navigation is wired. */
  onOpenWordPuzzle?: () => void;
  /** "Full history →": the full activity history. */
  onOpenHistory?: () => void;
  /** Profile, for the history link when there is no history screen. */
  onOpenProfile: () => void;
  /** The Food, Outdoors and Gym cards' "more" rows. Each absent hides its row. */
  onOpenFoodTrends?: () => void;
  onOpenStepTrends?: () => void;
  onOpenLiftProgress?: () => void;
  /** Body weight over time; the row says the trend and how long since the last weigh-in. */
  onOpenWeight?: () => void;
  /** The last seven days against the seven before (WeeklyRecapScreen). */
  onOpenWeek?: () => void;
  /** A logged meal tapped: change it, or take it back. */
  onEditLog?: (event: HealthEvent) => void;
  onDeleteLog?: (event: HealthEvent) => void;
  /** Insights ("Miso noticed") are Plus. Locked, a found insight shows as a teaser that opens Plus. Defaults to unlocked. */
  insightsUnlocked?: boolean;
  onOpenPlus?: () => void;
  onClose: () => void;
  /**
   * Shared pets: the user's own events merged with the partner's care-log
   * shadows. Not consumed by the recap yet — see the deferred note in the
   * task report. Absent for a solo pet.
   */
  careDiary?: CareDiaryEntry[];
  /** Pull-to-refresh, wired only for a shared pet. */
  onRefresh?: () => Promise<void>;
  /** Dev tools. All absent for normal accounts, which hides every panel. */
  forcedAilment?: ForcedPetStatus | null;
  onForceAilment?: (status: ForcedPetStatus | null) => void;
  forcedForm?: ForcedPetForm | null;
  onForceForm?: (form: ForcedPetForm | null) => void;
  onSeedTestData?: () => void;
  onClearSeededData?: () => void;
  isSeeding?: boolean;
  /**
   * iPhone, while Apple Health is not connected: steps come only from there,
   * so the steps card offers the connection instead of sitting at 0.
   */
  onConnectHealth?: () => void;
  /**
   * Once Apple Health is connected: sync steps now, in case the count looks
   * wrong. Resolves to a line saying what happened, shown under the card.
   */
  onSyncSteps?: () => Promise<string>;
  forcedTrophies?: ForcedTrophies | null;
  onForceTrophies?: (state: ForcedTrophies | null) => void;
  /** Dev: streak freezes granted for testing, or null for only the earned ones. */
  forcedFreezes?: number | null;
  onForceFreezes?: (count: number | null) => void;
  /** Forgets which achievement unlocks have been shown, so every earned one pops again. */
  onReplayAchievements?: () => void;
  /** DEV: the companion's prompt, memories and triggers. Needs an account. */
  onOpenCompanionDebug?: () => void;
  /** DEV: has the pet say a neglect check-in now, in the room. Rejects with what went wrong. */
  onDevCheckIn?: (kind: companion.DevCheckIn) => Promise<void>;
}

/**
 * Dev-only override for the living-room shelf: a single trophy, all of them,
 * or none — so every plank can be checked without a month of logging. Nothing
 * here is saved; `earnedTrophies` is the only real source.
 */
export type ForcedTrophies = 'none' | TrophyId | 'all';
type DevTrophyChoice = 'live' | ForcedTrophies;
type DevAilmentChoice = ForcedPetStatus | 'live';
type DevFormChoice = ForcedPetForm | 'live';

const DEV_FREEZE_OPTIONS: { value: string; label: string; detail?: string }[] = [
  { value: 'live', label: 'Live', detail: 'earned only' },
  { value: '1', label: '+1' },
  { value: '2', label: '+2' },
];

const DEV_TROPHY_OPTIONS: { value: DevTrophyChoice; label: string; detail?: string }[] = [
  { value: 'live', label: 'Live', detail: 'earned from history' },
  { value: 'none', label: 'None' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'shoe', label: 'Shoe' },
  { value: 'drumstick', label: 'Drumstick' },
  { value: 'book', label: 'Book' },
  { value: 'all', label: 'All four' },
];
/**
 * Built from the precedence list so a new ailment shows up here for free.
 * 'Live' drops the override; 'Healthy' forces the well state.
 */
const DEV_AILMENT_OPTIONS: { value: DevAilmentChoice; label: string; detail?: string }[] = [
  { value: 'live', label: 'Live', detail: 'real stats' },
  { value: 'healthy', label: 'Healthy' },
  ...AILMENT_PRECEDENCE.map((ailment) => ({
    value: ailment as DevAilmentChoice,
    label: ailment.charAt(0).toUpperCase() + ailment.slice(1),
  })),
];
/** Neglect check-ins to hear on demand; each is days of real neglect otherwise. */
const DEV_CHECK_IN_OPTIONS: { value: companion.DevCheckIn; label: string }[] = [
  { value: 'absence', label: 'Away 3 days' },
  { value: 'absence_again', label: 'Still ignored' },
  { value: 'streak_at_risk', label: 'Streak at risk' },
  { value: 'unwell', label: 'Feeling sick' },
];
/** Forms to preview. An evolution is weeks of real training away otherwise. */
const DEV_FORM_OPTIONS: { value: DevFormChoice; label: string; detail?: string }[] = [
  { value: 'live', label: 'Live', detail: 'real form' },
  { value: 'base', label: 'Base', detail: 'unevolved' },
  { value: 'runner', label: 'Runner', detail: 'evolved' },
  { value: 'lifter', label: 'Lifter', detail: 'evolved · strength' },
  { value: 'scholar', label: 'Scholar', detail: 'evolved · mind' },
];

const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;

/** "2h 05m" for the screen-time panel. */
const formatScreenMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, '0')}m`;
};

export function TodayScreen({
  pet,
  events,
  profile,
  stepGoal,
  onStepGoalChange,
  onTrainMind,
  onOpenWordPuzzle,
  onOpenProfile,
  onOpenHistory,
  onOpenFoodTrends,
  onOpenStepTrends,
  onOpenLiftProgress,
  onOpenWeight,
  onOpenWeek,
  onEditLog,
  onDeleteLog,
  insightsUnlocked = true,
  onOpenPlus,
  onClose,
  onRefresh,
  forcedAilment,
  onForceAilment,
  forcedForm,
  onForceForm,
  onSeedTestData,
  onClearSeededData,
  isSeeding,
  onConnectHealth,
  onSyncSteps,
  forcedTrophies,
  forcedFreezes,
  onForceFreezes,
  onForceTrophies,
  onReplayAchievements,
  onOpenCompanionDebug,
  onDevCheckIn,
}: Props) {
  // The neglect check-in being fetched, and why the last one failed.
  const [checkingIn, setCheckingIn] = useState<companion.DevCheckIn | null>(null);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const devCheckIn = async (kind: companion.DevCheckIn) => {
    if (!onDevCheckIn || checkingIn) return;
    setCheckingIn(kind);
    setCheckInError(null);
    try {
      await onDevCheckIn(kind);
    } catch (cause) {
      setCheckInError(cause instanceof Error && cause.message ? cause.message : 'The pet did not answer.');
    } finally {
      setCheckingIn(null);
    }
  };
  // Today's meal list, folded until opened.
  const [foodLogOpen, setFoodLogOpen] = useState(false);
  // The steps card's own sync: 'syncing' while it runs, then what it found.
  const [stepSync, setStepSync] = useState<string | null>(null);
  const syncStepsNow = async () => {
    if (!onSyncSteps || stepSync === 'syncing') return;
    setStepSync('syncing');
    setStepSync(await onSyncSteps().catch(() => "Couldn't reach Apple Health. Try again."));
  };
  // The theme set in Settings (Appearance), not the hour: the panels and the
  // type on them both follow it, so they can never disagree.
  const night = getColorScheme() === 'dark';
  // Three rings across the food card: 84 each, less on a phone too narrow for
  // three (on a 320pt screen they overlapped). Page gutters 36, card padding 32,
  // gaps 8.
  const { width: windowWidth } = useWindowDimensions();
  const ringSize = Math.min(84, Math.floor((Math.min(windowWidth, SETTINGS_MAX_WIDTH) - 76) / 3));
  const c = todayColors(night);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const today = new Date();
  const todayKey = toDateKey(today);
  // Keyed on the day string, not the fresh `today` Date each render hands out.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `todayKey` stands in for `today`.
  const recap: DailyRecap = useMemo(
    () => buildDailyRecap({ events, profile, pet, stepGoal, day: today }),
    [events, profile, pet, stepGoal, todayKey],
  );
  const weightLine = useMemo(() => {
    const latest = weighIns(events).at(-1);
    if (!latest) return null;
    const unit = profile.weightUnit;
    const days = Math.floor((Date.now() - Date.parse(latest.at)) / 86_400_000);
    const when = days === 0 ? 'weighed today' : days === 1 ? 'weighed yesterday' : `${days} days since your last weigh-in`;
    return `${Math.round(convertWeightValue(latest.trendKg, 'kg', unit) * 10) / 10} ${unit} trend · ${when}`;
  }, [events, profile.weightUnit]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `todayKey` stands in for `today`.
  const topInsight = useMemo(() => calculateInsights(events, today)[0] ?? null, [events, todayKey]);
  // Today's own logs, newest first, each one tappable to change or take back.
  // Steps aren't among them: every sync logs the count so far, so the day's
  // steps are one line of their own, the recap's total.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `todayKey` stands in for `today`.
  const todayLogs = useMemo(() => {
    const day = getEventsForDay(events, today).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
    return historyRows(day.filter((event) => event.type !== 'STEP_ACTIVITY'));
  }, [events, todayKey]);
  const screenTimeToday = findScreenTimeForDate(events, today);
  const wordPuzzleToday = findWordPuzzleEventForDate(events, todayKey);

  const { gym, outdoors, mind, food, levelProgress } = recap;
  // The same burned and remaining figures the Profile screen used to show.
  const burned = estimateCaloriesBurned(getEventsForDay(events, new Date()));
  const remaining = food.targets.calories - food.consumed.calories + burned;
  // An area the person doesn't track (Settings > What affects your pet) is not a
  // goal: hidden, unless they did it anyway today, which is still worth seeing.
  const shows = (area: CareArea, didToday: boolean) =>
    didToday || tracksArea(pet.careAreas, area);
  const toLevel = levelProgress.level + 1;
  const petName = pet.name;

  return (
    <View style={[layout.screen, { backgroundColor: c.bg }]}>
      <View style={[styles.topbar, { borderBottomColor: c.hairline }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to your pet"
          onPress={onClose}
          hitSlop={8}
          style={styles.back}
        >
          <Text style={[styles.backMark, { color: c.accent }]}>‹</Text>
          <Text style={[styles.backLabel, { color: c.soft }]}>Pet</Text>
        </Pressable>
        <Text style={[styles.topTitle, { color: c.ink }]}>Today</Text>
        <View style={styles.back} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: 40 + HOME_INDICATOR_INSET }]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              tintColor={c.accent}
            />
          ) : undefined
        }
      >
        {/* --- Overview: you + the pet, the day's XP, overall progress ---
            Deliberately NOT boxed like the pillars below: this is the main
            section the screen leads with, not one panel among equals. */}
        <View style={[styles.overview, { borderBottomColor: c.hairline }]}>
          <Text style={[styles.overKicker, { color: c.soft }]}>You and {petName}, today</Text>
          <View style={styles.xpRow}>
            <Text style={[styles.xpValue, { color: c.ink }]}>+{recap.xp}</Text>
            <Text style={[styles.xpUnit, { color: c.soft }]}>XP earned</Text>
          </View>
          {/* This bar is level progress, not a daily quota -- there is no
              "XP due today". It reads left-to-right as one unit with the
              caption naming exactly what it shows. */}
          <ProgressBar
            percent={Math.round((levelProgress.xpIntoLevel / levelProgress.xpForLevel) * 100)}
            c={c}
          />
          <Text style={[styles.overMeta, { color: c.soft }]}>
            Level {levelProgress.level} · {levelProgress.xpIntoLevel}/{levelProgress.xpForLevel} to
            level {toLevel}
          </Text>

          <View style={[styles.glanceRow, { borderTopColor: c.hairline }]}>
            {shows('training', gym.done) ? (
              <Glance label="GYM" value={gym.trainingDone ? '✓' : '—'} on={gym.trainingDone} c={c} />
            ) : null}
            {shows('movement', outdoors.steps > 0) ? (
              <Glance
                label="OUTDOORS"
                value={outdoors.steps > 0 ? `${Math.round(outdoors.steps / 100) / 10}k` : '0'}
                on={outdoors.steps > 0}
                c={c}
              />
            ) : null}
            {shows('mind', mind.sessionCount > 0) ? (
              <Glance
                label="MIND"
                value={mind.sessionCount > 0 ? String(mind.sessionCount) : '—'}
                on={mind.sessionCount > 0}
                c={c}
              />
            ) : null}
            {shows('nutrition', food.mealCount > 0) ? (
              <Glance
                label="FOOD"
                value={food.mealCount > 0 ? String(food.mealCount) : '—'}
                on={food.mealCount > 0}
                c={c}
              />
            ) : null}
          </View>
        </View>

        {/* --- The four pillars --- */}
        {/* Food first: it is what the day is most often checked for. */}
        {shows('nutrition', food.mealCount > 0) ? (
          <Pillar
            c={c}
            night={night}
            kicker="FOOD"
            more={onOpenFoodTrends ? { label: 'Trends & averages', onPress: onOpenFoodTrends } : undefined}
            done={food.mealCount > 0 && caloriesMet(food.targets.calories, food.consumed.calories, burned, profile.goal)}
            xp={recap.xpByPillar.food}
            headline={
              food.mealCount > 0
                ? `${food.consumed.calories.toLocaleString()} / ${food.targets.calories.toLocaleString()} kcal`
                : 'No meals logged'
            }
            detail={
              food.mealCount === 0
                ? `Log a meal and ${petName} eats well too.`
                : food.someMealsUnanalyzed
                  ? `${food.mealCount} meal${food.mealCount > 1 ? 's' : ''} logged — one analysis was incomplete, so this total is approximate.`
                  : `${food.mealCount} meal${food.mealCount > 1 ? 's' : ''} · ${food.caloriePercent}% of today's calories`
            }
          >
            {/* What's been eaten, burned and left, as the day's three rings. */}
            <View style={styles.rings}>
              <NutrientRing
                value={food.consumed.calories}
                percent={(food.consumed.calories / food.targets.calories) * 100}
                label="Consumed"
                color={c.accent}
                size={ringSize}
                tone={c}
              />
              <NutrientRing
                value={burned}
                percent={(burned / food.targets.calories) * 100}
                label="Burned"
                color="#78a598"
                size={ringSize}
                tone={c}
              />
              <NutrientRing
                value={remaining}
                percent={(Math.abs(remaining) / food.targets.calories) * 100}
                label={remaining < 0 ? 'Over' : 'Remaining'}
                color={remaining < 0 ? c.danger : '#9c8dba'}
                emphasis={remaining < 0}
                size={ringSize}
                tone={c}
              />
            </View>
            {/* The macro targets are on their bars below; only the calorie target needs saying. */}
            <Text style={[styles.targetLine, { color: c.soft }]}>Target {food.targets.calories.toLocaleString()} kcal</Text>
            {/* Always shown, empty bars included: the day's targets are worth seeing before the first meal. */}
            <View style={styles.macros}>
                {(
                  [
                    ['Protein', food.consumed.proteinGrams, food.targets.proteinGrams, c.macro.protein],
                    ['Carbs', food.consumed.carbsGrams, food.targets.carbsGrams, c.macro.carbs],
                    ['Fat', food.consumed.fatGrams, food.targets.fatGrams, c.macro.fat],
                    // The one sub-macro with a target (14 g per 1,000 kcal).
                    ['Fiber', food.consumed.fiberGrams ?? 0, food.targets.fiberGrams ?? 0, c.macro.fiber],
                  ] as const
                ).map(([label, value, target, tint]) => (
                  <View key={label} style={styles.macroRow}>
                    <Text style={[styles.macroLabel, { color: c.soft }]} numberOfLines={1}>{label}</Text>
                    <View style={[styles.macroTrack, { backgroundColor: c.track }]}>
                      <View
                        style={[
                          styles.macroFill,
                          { backgroundColor: tint, width: `${Math.min(100, target > 0 ? (value / target) * 100 : 0)}%` },
                        ]}
                      />
                    </View>
                    <Text style={[styles.macroValue, { color: c.ink }]} numberOfLines={1}>
                      {Math.round(value)}
                      <Text style={[styles.macroTarget, { color: c.soft }]}> / {target}g</Text>
                    </Text>
                  </View>
                ))}
                {/* The rest as plain totals, no bars and no targets. */}
                {describeSubMacros(food.consumed, { includeFiber: false }) ? (
                  <Text style={[styles.subMacros, { color: c.soft }]}>{describeSubMacros(food.consumed, { includeFiber: false })}</Text>
                ) : null}
              </View>
            {/* What was eaten, meal by meal: the totals above say how much, this
                says what. */}
            {food.mealCount > 0 ? (
              <View style={[styles.foodLog, { borderTopColor: c.hairline }]} testID="food-log">
                {/* Folded by default: the totals above are the headline, the list
                    is a tap away rather than a long scroll every visit. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: foodLogOpen }}
                  accessibilityLabel={`Logged today, ${food.mealCount} meal${food.mealCount > 1 ? 's' : ''}`}
                  onPress={() => setFoodLogOpen((open) => !open)}
                  hitSlop={8}
                  style={styles.foodLogHeader}
                >
                  <Text style={[styles.foodLogTitle, { color: c.soft }]}>LOGGED TODAY</Text>
                  <Text style={[styles.foodLogTitle, { color: c.soft }]}>
                    {`${food.mealCount} meal${food.mealCount > 1 ? 's' : ''}  ${foodLogOpen ? '▾' : '▸'}`}
                  </Text>
                </Pressable>
                {/* By meal of the day, each a tap from Edit or Delete. */}
                {foodLogOpen &&
                  MEAL_SLOTS.map((slot) => {
                    const meals = getMealsForDay(events, today)
                      .filter((meal) => mealSlotOf(meal) === slot)
                      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
                    if (meals.length === 0) return null;
                    const kcal = meals.reduce((sum, meal) => sum + calorieEstimate(meal.metadata.analysis?.macros), 0);
                    return (
                      <View key={slot}>
                        <View style={styles.foodSlotHead}>
                          <Text style={[styles.foodSlotTitle, { color: c.soft }]}>{MEAL_SLOT_LABEL[slot].toUpperCase()}</Text>
                          <Text style={[styles.foodSlotTitle, { color: c.soft }]}>{`${kcal.toLocaleString()} kcal`}</Text>
                        </View>
                        {meals.map((meal) => {
                          const analysis = meal.metadata.analysis;
                          const name = analysis?.foodDescription || analysis?.detectedFoods.join(', ') || analysis?.summary || 'Meal';
                          const row = (
                            <>
                              <Text style={[styles.foodLogTime, { color: c.soft }]} numberOfLines={1}>
                                {new Date(meal.occurredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                              </Text>
                              <Text style={[styles.foodLogName, { color: c.ink }]} numberOfLines={2}>{name}</Text>
                              <Text style={[styles.foodLogKcal, { color: c.ink }]} numberOfLines={1}>
                                {analysis ? `${calorieEstimate(analysis.macros).toLocaleString()} kcal` : '—'}
                              </Text>
                            </>
                          );
                          return onEditLog || onDeleteLog ? (
                            <Pressable
                              key={meal.id}
                              accessibilityRole="button"
                              accessibilityLabel={`${name}, edit or delete`}
                              onPress={() => askEditOrDelete(meal, { onEdit: onEditLog, onDelete: onDeleteLog })}
                              style={({ pressed }) => [styles.foodLogRow, pressed && { opacity: 0.6 }]}
                            >
                              {row}
                            </Pressable>
                          ) : (
                            <View key={meal.id} style={styles.foodLogRow}>
                              {row}
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
              </View>
            ) : null}
          </Pillar>
        ) : null}

        {shows('movement', outdoors.steps > 0) ? (
          <Pillar
            c={c}
            night={night}
            kicker="OUTDOORS"
            more={onOpenStepTrends ? { label: 'Trends & averages', onPress: onOpenStepTrends } : undefined}
            done={outdoors.goalReached || outdoors.cardioDone}
            xp={outdoors.xp}
            headline={`${outdoors.steps.toLocaleString()} / ${outdoors.goal.toLocaleString()} steps`}
            actions={
              onConnectHealth
                ? [{ label: 'Connect Apple Health', onPress: onConnectHealth }]
                : onSyncSteps
                  ? [{ label: stepSync === 'syncing' ? 'Syncing…' : 'Steps look off? Sync now', onPress: () => void syncStepsNow() }]
                  : undefined
            }
            detail={
              onConnectHealth && outdoors.steps === 0
                ? `Connect Apple Health and ${petName} counts every step you take, on its own.`
                : outdoors.steps > 0
                ? outdoors.goalReached
                  ? `${petName} explored every corner with you today.`
                  : `${outdoors.percent}% of today's goal — ${petName} is enjoying the walk.`
                : `${petName} is waiting for today's adventure.`
            }
            progressPercent={outdoors.percent}
          >
            {outdoors.steps > 0 ? (
              <Text style={[styles.caloriesLine, { color: c.soft }]}>
                🔥 {outdoors.caloriesBurned.toLocaleString()} cal burned
                {outdoors.caloriesBurnedFromHealth ? '' : ' (estimate)'}
              </Text>
            ) : null}
            {stepSync && stepSync !== 'syncing' ? (
              <Text style={[styles.syncNote, { color: c.soft }]} accessibilityLiveRegion="polite">{stepSync}</Text>
            ) : null}
            <View style={styles.goalEdit}>
              <Text style={[styles.goalEditLabel, { color: c.soft }]}>Daily goal</Text>
              <StepGoalField
                style={[styles.goalInput, { color: c.ink, borderColor: c.hairline }]}
                goal={stepGoal}
                onChange={onStepGoalChange}
              />
            </View>
          </Pillar>
        ) : null}

        {shows('training', gym.done) ? (
          <Pillar
            c={c}
            night={night}
            kicker="GYM"
            more={onOpenLiftProgress ? { label: 'Lift progress', onPress: onOpenLiftProgress } : undefined}
            done={gym.trainingDone}
            xp={gym.xp}
            headline={
              gym.done
                ? gym.workoutCount > 1
                  ? `${gym.workoutCount} workouts`
                  : (gym.lastName ?? 'Workout complete')
                : 'No workout yet'
            }
            detail={
              gym.done
                ? [
                    gym.totalMinutes > 0 ? `${gym.totalMinutes} min` : null,
                    gym.exerciseCount > 0
                      ? `${gym.exerciseCount} exercise${gym.exerciseCount > 1 ? 's' : ''}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Logged'
                : `${petName} trains hard when you do.`
            }
          />
        ) : null}

        {shows('mind', mind.sessionCount > 0) ? (
          <Pillar
            c={c}
            night={night}
            kicker="MIND"
            done={mind.sessionCount > 0}
            xp={mind.xp}
            headline={
              mind.sessionCount > 0
                ? mind.bestScore > 0
                  ? `Best score ${mind.bestScore}`
                  : `${mind.sessionCount} session${mind.sessionCount > 1 ? 's' : ''}`
                : 'Nothing completed yet'
            }
            detail={
              mind.sessionCount > 0
                ? `${mindScoreLabel(mind.bestScore)} — ${petName} felt you thinking.`
                : `${petName} is up for a puzzle whenever you are.`
            }
            actions={[
              { label: 'Train the mind →', onPress: onTrainMind },
              ...(onOpenWordPuzzle
                ? [
                    {
                      label: wordPuzzleToday
                        ? `Word puzzle · done (${wordPuzzleToday.metadata.score})`
                        : "Today's word puzzle →",
                      onPress: onOpenWordPuzzle,
                    },
                  ]
                : []),
            ]}
          />
        ) : null}

        {onOpenWeek ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Your week"
            onPress={onOpenWeek}
            scaleTo={0.98}
            style={[...panelOf(c, true), styles.weightRow]}
            testID="today-week"
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.weightRowTitle, { color: c.ink }]}>Your week</Text>
              <Text style={[styles.activityEmpty, { color: c.soft }]}>Training, food, steps and XP over the last seven days.</Text>
            </View>
            <Text style={[styles.moreChevron, { color: c.soft }]}>›</Text>
          </PressableScale>
        ) : null}

        {onOpenWeight ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={weightLine ? `Weight, ${weightLine}` : 'Weight, log your first weigh-in'}
            onPress={onOpenWeight}
            scaleTo={0.98}
            style={[...panelOf(c, true), styles.weightRow]}
            testID="today-weight"
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.weightRowTitle, { color: c.ink }]}>Weight</Text>
              <Text style={[styles.activityEmpty, { color: c.soft }]}>{weightLine ?? 'Log a weigh-in to start your trend.'}</Text>
            </View>
            <Text style={[styles.moreChevron, { color: c.soft }]}>›</Text>
          </PressableScale>
        ) : null}

        {/* --- Today's activity: aggregated, meaningful only --- */}
        <View style={[...panelOf(c, true), styles.activity]}>
          <Text style={[styles.activityTitle, { color: c.ink }]}>Today's activity</Text>
          {recap.outdoors.steps > 0 ? (
            <View style={styles.activityRow}>
              <Mark kind="check" size={11} weight={2.2} color={c.positive} />
              <Text style={[styles.activityLabel, { color: c.ink }]}>{`Walked ${recap.outdoors.steps.toLocaleString()} steps`}</Text>
            </View>
          ) : null}
          {todayLogs.length === 0 && recap.outdoors.steps === 0 ? (
            <Text style={[styles.activityEmpty, { color: c.soft }]}>
              Nothing yet today. Every workout, walk, meal and puzzle counts.
            </Text>
          ) : (
            todayLogs.map(({ key, events: group }) => {
              const event = group[0]!;
              const tappable = Boolean(onEditLog || onDeleteLog) && changeable(event);
              const row = (
                <View style={styles.activityRow}>
                  <Mark kind="check" size={11} weight={2.2} color={c.positive} />
                  <Text style={[styles.activityLabel, { color: c.ink }]} numberOfLines={1}>
                    {event.type === 'MEAL' ? mealLogName(event) : describeRow(group, measurementSystemOf(profile))}
                  </Text>
                  <Text style={[styles.activityTime, { color: c.soft }]} numberOfLines={1}>
                    {new Date(event.occurredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                  {tappable ? <Text style={[styles.moreChevron, { color: c.soft }]}>›</Text> : null}
                </View>
              );
              return tappable ? (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityHint="Edit or delete"
                  onPress={() => askEditOrDelete(event, { onEdit: onEditLog, onDelete: onDeleteLog })}
                  style={({ pressed }) => pressed && { opacity: 0.6 }}
                  testID="today-log"
                >
                  {row}
                </Pressable>
              ) : (
                <View key={key}>{row}</View>
              );
            })
          )}
          {todayLogs.some(({ events: group }) => changeable(group[0]!)) && (onEditLog || onDeleteLog) ? (
            <Text style={[styles.activityHint, { color: c.soft }]}>Tap a log to change or remove it.</Text>
          ) : null}
          <Pressable onPress={onOpenHistory ?? onOpenProfile} hitSlop={6} accessibilityRole="link">
            <Text style={[styles.activityMore, { color: c.accent }]}>Full history →</Text>
          </Pressable>
        </View>

        {topInsight && insightsUnlocked ? (
          <View style={[...panelOf(c, true), styles.softPanel]}>
            <Text style={[styles.softKicker, { color: c.soft }]}>{`${petName} noticed`}</Text>
            <Text style={[styles.softHeadline, { color: c.ink }]}>{topInsight.headline}</Text>
            <Text style={[styles.softDetail, { color: c.soft }]}>{topInsight.detail}</Text>
          </View>
        ) : topInsight ? (
          // Plus: say there is something to see, never what it is.
          <Pressable
            accessibilityRole="button"
            onPress={onOpenPlus}
            disabled={!onOpenPlus}
            style={[...panelOf(c, true), styles.softPanel]}
            testID="insight-locked"
          >
            <Text style={[styles.softKicker, { color: c.soft }]}>{`${petName} noticed`}</Text>
            <Text
              style={[styles.softHeadline, { color: c.ink }]}
            >{`${petName} spotted a pattern in your habits`}</Text>
            <Text style={[styles.softDetail, { color: c.accent }]}>
              See what it is with Plus →
            </Text>
          </Pressable>
        ) : null}

        {screenTimeToday ? (
          <View style={[...panelOf(c, true), styles.softPanel]}>
            <Text style={[styles.softKicker, { color: c.soft }]}>Screen time</Text>
            <Text style={[styles.softHeadline, { color: c.ink }]}>
              {formatScreenMinutes(screenTimeToday.metadata.minutes)}
              {screenTimeToday.metadata.budgetMinutes !== undefined
                ? ` / ${formatScreenMinutes(screenTimeToday.metadata.budgetMinutes)} budget`
                : ''}
            </Text>
            <Text style={[styles.softDetail, { color: c.soft }]}>
              {screenTimeToday.metadata.withinBudget === undefined
                ? `Logged. Set a budget in Profile and ${petName} will notice the quiet days.`
                : screenTimeToday.metadata.withinBudget
                  ? `Under budget — ${petName} feels clearer for it.`
                  : 'Over budget today. Tomorrow is a fresh screen.'}
            </Text>
          </View>
        ) : null}

        {/* --- Dev panels (dev accounts only — setters simply not passed otherwise) --- */}
        {onForceAilment ? (
          <DevPanel
            c={c}
            title="Dev · force status"
            hint={`Rewrites the stats shown on the pet. Nothing saved; real care clears it back to whatever ${petName} is.`}
          >
            <ChoiceRow
              options={DEV_AILMENT_OPTIONS}
              value={forcedAilment ?? 'live'}
              onChange={(next) => onForceAilment(next === 'live' ? null : next)}
            />
          </DevPanel>
        ) : null}
        {onDevCheckIn ? (
          <DevPanel
            c={c}
            title="Dev · neglect lines"
            hint={`Closes this and ${petName} says it in the room, in its own voice. For "Feeling sick", force a status above first.`}
          >
            <View style={styles.devButtonGrid}>
              {DEV_CHECK_IN_OPTIONS.map((option) => (
                <TextButton
                  key={option.value}
                  label={checkingIn === option.value ? 'Asking…' : option.label}
                  onPress={() => void devCheckIn(option.value)}
                  disabled={checkingIn !== null}
                />
              ))}
            </View>
            {checkInError ? <Text style={[styles.devHint, { color: colors.coral }]}>{checkInError}</Text> : null}
          </DevPanel>
        ) : null}
        {onForceForm ? (
          <DevPanel
            c={c}
            title="Dev · force form"
            hint="Moves level, endurance, strength and mind so the sprite, kicker and stat bars agree."
          >
            <ChoiceRow
              options={DEV_FORM_OPTIONS}
              value={forcedForm ?? 'live'}
              onChange={(next) => onForceForm(next === 'live' ? null : next)}
            />
          </DevPanel>
        ) : null}
        {onForceTrophies ? (
          <DevPanel
            c={c}
            title="Dev · force trophies"
            hint="Puts trophies on the living-room shelf without earning them. Nothing here is saved."
          >
            <ChoiceRow
              options={DEV_TROPHY_OPTIONS}
              value={forcedTrophies ?? 'live'}
              onChange={(next) => onForceTrophies(next === 'live' ? null : next)}
            />
            {onOpenCompanionDebug ? (
              <TextButton label="Companion debug" onPress={onOpenCompanionDebug} />
            ) : null}
            {onReplayAchievements ? (
              <View style={{ marginTop: 12 }}>
                <TextButton label="Replay achievement unlocks" onPress={onReplayAchievements} />
              </View>
            ) : null}
          </DevPanel>
        ) : null}
        {onForceFreezes ? (
          <DevPanel
            c={c}
            title="Dev · streak freezes"
            hint="Adds freezes as if earned a week ago, so a day missed this week shows one used. Nothing here is saved."
          >
            <ChoiceRow
              options={DEV_FREEZE_OPTIONS}
              value={forcedFreezes ? String(forcedFreezes) : 'live'}
              onChange={(next) => onForceFreezes(next === 'live' ? null : Number(next))}
            />
          </DevPanel>
        ) : null}
        {onSeedTestData ? (
          <DevPanel
            c={c}
            title="Dev · test data"
            hint={`Writes ~90 days of synthetic events. Fills the event log only — ${petName}'s stats and decay anchor are untouched. Use a throwaway account.`}
          >
            <View style={styles.devButtons}>
              <TextButton
                label={isSeeding ? 'Working…' : 'Seed 90 days'}
                onPress={onSeedTestData}
                disabled={isSeeding}
              />
              <TextButton
                label="Clear seeded"
                onPress={() => onClearSeededData?.()}
                disabled={isSeeding}
              />
            </View>
          </DevPanel>
        ) : null}
      </ScrollView>
    </View>
  );
}

// --- pieces ----------------------------------------------------------------

interface Palette {
  bg: string;
  ink: string;
  soft: string;
  hairline: string;
  track: string;
  /** A card on the page, and its hairline edge. */
  card: string;
  edge: string;
  accent: string;
  accentDeep: string;
  positive: string;
  danger: string;
  /** One colour per macro bar, so the four tell apart at a glance. */
  macro: { protein: string; carbs: string; fat: string; fiber: string };
  night: boolean;
}

/**
 * The daily step goal, typed freely and kept on Done or on leaving the field.
 * Saving each keystroke snapped a cleared field straight to 1,000, so the next
 * digits landed after it (100000 typed became 1,010,000,000).
 */
function StepGoalField({ goal, onChange, style }: { goal: number; onChange: (goal: number) => void; style: StyleProp<TextStyle> }) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const typed = Number(text);
    const next = text === '' || !Number.isFinite(typed) ? goal : clampStepGoal(typed);
    setText(null);
    if (next !== goal) onChange(next);
  };
  return (
    <DoneTextInput
      style={style}
      keyboardType="number-pad"
      accessibilityLabel="Daily step goal"
      value={text ?? String(goal)}
      selectTextOnFocus
      onChangeText={(value) => setText(value.replace(/[^0-9]/g, ''))}
      onBlur={commit}
      onSubmitEditing={commit}
    />
  );
}

function ProgressBar({ percent, c }: { percent: number; c: Palette }) {
  return (
    <View style={[styles.progressTrack, { backgroundColor: c.track }]}>
      <View
        style={[
          styles.progressFill,
          { width: `${Math.min(100, Math.max(0, percent))}%`, backgroundColor: c.accent },
        ]}
      />
    </View>
  );
}

function Glance({
  label,
  value,
  on,
  c,
}: {
  label: string;
  value: string;
  on: boolean;
  c: Palette;
}) {
  return (
    <View style={styles.glance}>
      <Text style={[styles.glanceValue, { color: on ? c.ink : c.soft }]}>{value}</Text>
      <Text style={[styles.glanceLabel, { color: c.soft }]}>{label}</Text>
    </View>
  );
}

function Pillar({
  c,
  night,
  kicker,
  done,
  xp,
  headline,
  detail,
  progressPercent,
  actions,
  more,
  children,
}: {
  c: Palette;
  night: boolean;
  kicker: string;
  done: boolean;
  xp?: number;
  headline: string;
  detail: string;
  progressPercent?: number;
  actions?: { label: string; onPress: () => void }[];
  /** A row along the card's foot to its own page: averages, history. */
  more?: { label: string; onPress: () => void };
  children?: ReactNode;
}) {
  return (
    <View style={[...panelOf(c), styles.pillar]}>
      <View style={styles.pillarHead}>
        <View style={{ flex: 1 }}>
          <View style={styles.pillarKickerRow}>
            <Text style={[styles.pillarKicker, { color: c.soft }]}>{kicker}</Text>
            {done ? (
              // Sits on the capitals' line: a tick's weight is at its bottom, so
              // centred on the text it reads low, and it is lifted a point.
              <View accessible accessibilityLabel="Done for today" testID="pillar-done" style={styles.pillarDoneMark}>
                <Mark kind="check" size={12} weight={2.4} color={c.positive} />
              </View>
            ) : null}
          </View>
          {/* "8,432 / 10,000 steps" beside the XP chip on a 320pt phone: shrinks a
              little rather than leaving "steps" alone on a second line. */}
          <FitText style={[styles.pillarHeadline, { color: c.ink }]} minScale={0.8}>
            {headline}
          </FitText>
        </View>
        {xp && xp > 0 ? (
          <View style={[styles.xpChip, { borderColor: c.accent }]}>
            <Text style={[styles.xpChipText, { color: c.accentDeep }]} numberOfLines={1}>+{xp} XP</Text>
          </View>
        ) : null}
      </View>
      {progressPercent !== undefined ? (
        <ProgressBar percent={progressPercent} c={c} />
      ) : null}
      <Text style={[styles.pillarDetail, { color: c.soft }]}>{detail}</Text>
      {children}
      {actions?.length ? (
        <View style={styles.pillarActions}>
          {actions.map((action) => (
            <Pressable key={action.label} onPress={action.onPress} hitSlop={8}>
              <Text style={[styles.pillarAction, { color: c.accent }]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {more ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={more.label}
          onPress={more.onPress}
          scaleTo={0.98}
          style={[styles.more, { borderTopColor: c.hairline }]}
        >
          <Text style={[styles.moreLabel, { color: c.ink }]}>{more.label}</Text>
          <Text style={[styles.moreChevron, { color: c.soft }]}>›</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

function DevPanel({
  c,
  title,
  hint,
  children,
}: {
  c: Palette;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <View style={[styles.devPanel, { borderTopColor: c.hairline }]}>
      <Text style={[styles.devKicker, { color: c.soft }]}>{title}</Text>
      <View style={{ marginTop: 12 }}>{children}</View>
      <Text style={[styles.devHint, { color: c.soft }]}>{hint}</Text>
    </View>
  );
}

// --- palette --------------------------------------------------------------

/** Today in the app's palette: light or dark as set in Settings (Appearance). */
const todayColors = (night: boolean): Palette => {
  const scheme: ColorScheme = night ? 'dark' : 'light';
  const p = paletteOf(scheme);
  return {
    bg: p.paper,
    ink: p.ink,
    soft: p.muted,
    hairline: p.hairline,
    track: p.track,
    card: p.card,
    edge: p.hairline,
    accent: p.coral,
    accentDeep: p.coralDeep,
    positive: p.mintDeep,
    danger: p.danger,
    macro: night
      ? { protein: '#7aa7ec', carbs: '#e3b552', fat: '#a99be0', fiber: '#73c08f' }
      : { protein: '#3f78c8', carbs: '#c9962a', fat: '#8b7bc4', fiber: '#4f9a6b' },
    night,
  };
};

/** A card on Today: lifted (`quiet` false) or sitting back on a hairline. */
const panelOf = (c: Palette, quiet = false) => [
  styles.panel,
  { backgroundColor: c.card },
  quiet ? { borderWidth: StyleSheet.hairlineWidth, borderColor: c.edge } : c.night ? styles.panelLiftNight : styles.panelLift,
];

const styles = themedStyles(() => ({
  rings: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, marginTop: 12 },
  targetLine: { fontFamily: fonts.ui, fontSize: 12, lineHeight: 18, marginTop: 10 },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 62,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  backMark: { fontFamily: fonts.ui, fontSize: 34, lineHeight: 36, marginTop: -4, color: colors.coral },
  backLabel: { fontFamily: fonts.ui, fontSize: 17, color: colors.coral },
  topTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, letterSpacing: 0 },
  // One readable column on a tablet, as Settings has; no change on a phone.
  body: { paddingHorizontal: 18, paddingTop: 18, gap: 14, width: '100%', maxWidth: SETTINGS_MAX_WIDTH, alignSelf: 'center' },

  overview: { paddingHorizontal: 2, paddingTop: 4, paddingBottom: 20, borderBottomWidth: 1 },
  overKicker: {
    fontFamily: fonts.ui, fontWeight: '600',
    fontSize: 12,
    letterSpacing: 0.6,
    
    textTransform: 'uppercase',
  },
  xpRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 8, marginBottom: 12 },
  xpValue: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 41, letterSpacing: 0 },
  xpUnit: {
    fontFamily: fonts.ui, fontWeight: '600',
    fontSize: 12,
    letterSpacing: 0.6,
    
    textTransform: 'uppercase',
  },
  overMeta: {
    fontFamily: fonts.ui,
    fontSize: 12,
    letterSpacing: 0,
    marginTop: 6,
    lineHeight: 18,
  },
  glanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  glance: { alignItems: 'center', flex: 1 },
  glanceValue: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 20, },
  glanceLabel: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 0, marginTop: 3 },

  pillar: { padding: 16, gap: 8 },
  panel: { borderRadius: 18, borderCurve: 'continuous' },
  panelLift: { shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 2 },
  panelLiftNight: { shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 2 },
  pillarHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pillarKickerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pillarDoneMark: { transform: [{ translateY: -1 }] },
  pillarKicker: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 12, letterSpacing: 0, },
  pillarDone: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, },
  pillarHeadline: {
    fontFamily: fonts.ui, fontWeight: '600',
    fontSize: 17,
    
    marginTop: 4,
    letterSpacing: 0,
  },
  pillarDetail: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 18 },
  foodSlotHead: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 2 },
  foodSlotTitle: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 0.6 },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  weightRowTitle: {
    fontFamily: fonts.ui, fontWeight: '600',
    fontSize: 12,
    letterSpacing: 0.6,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  moreLabel: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600' },
  moreChevron: { fontFamily: fonts.ui, fontSize: 22, lineHeight: 22, marginTop: -2 },
  pillarActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 4 },
  pillarAction: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 0 },
  xpChip: { flexShrink: 0, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  xpChipText: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 12, letterSpacing: 0 },
  caloriesLine: { fontFamily: fonts.ui, fontSize: 12, marginTop: 2 },
  syncNote: { fontFamily: fonts.ui, fontSize: 12, lineHeight: 17, marginTop: 8 },
  goalEdit: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  goalEditLabel: {
    fontFamily: fonts.ui,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  goalInput: {
    width: 88,
    textAlign: 'center',
    fontFamily: fonts.ui,
    fontSize: 15,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 6,
  },

  macros: { gap: 9, marginTop: 4 },
  subMacros: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 18, marginTop: 6 },
  foodLog: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, gap: 9 },
  foodLogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  foodLogTitle: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 0 },
  foodLogRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  foodLogTime: { fontFamily: fonts.ui, fontSize: 12, lineHeight: 18, width: 62, flexShrink: 0 },
  foodLogName: { flex: 1, fontFamily: fonts.ui, fontSize: 13, lineHeight: 16 },
  foodLogKcal: { fontFamily: fonts.ui, fontSize: 12, lineHeight: 16, flexShrink: 0 },
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  macroLabel: { width: 48, flexShrink: 0, fontFamily: fonts.ui, fontSize: 11, letterSpacing: 0 },
  macroTrack: { flex: 1, minWidth: 0, height: 4, borderRadius: 6, overflow: 'hidden' },
  macroFill: { height: '100%' },
  macroValue: {
    fontFamily: fonts.ui, fontWeight: '600',
    fontSize: 12,
    
    minWidth: 72,
    flexShrink: 0,
    textAlign: 'right',
  },
  macroTarget: { fontWeight: '400' },

  progressTrack: { height: 6, borderRadius: 6, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 6 },

  activity: { padding: 16 },
  activityTitle: {
    fontFamily: fonts.ui, fontWeight: '600',
    fontSize: 12,
    letterSpacing: 0.6,
    
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  activityEmpty: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 20 },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  activityCheck: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, },
  activityLabel: { fontFamily: fonts.ui, fontSize: 13, flex: 1 },
  activityTime: { fontFamily: fonts.ui, fontSize: 12, flexShrink: 0 },
  activityHint: { fontFamily: fonts.ui, fontSize: 12, marginTop: 8 },
  activityMore: { fontFamily: fonts.ui, fontSize: 12, marginTop: 10 },

  softPanel: { padding: 16, gap: 6 },
  softKicker: {
    fontFamily: fonts.ui, fontWeight: '600',
    fontSize: 12,
    letterSpacing: 0.6,
    
    textTransform: 'uppercase',
  },
  softHeadline: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, },
  softDetail: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 18 },

  devPanel: { paddingVertical: 16, borderTopWidth: 1 },
  devKicker: {
    fontFamily: fonts.ui, fontWeight: '600',
    fontSize: 12,
    letterSpacing: 0.6,
    
    textTransform: 'uppercase',
  },
  devHint: { fontFamily: fonts.ui, fontSize: 12, lineHeight: 17, marginTop: 10 },
  devButtons: { flexDirection: 'row', gap: 16 },
  devButtonGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 10 },
}));
