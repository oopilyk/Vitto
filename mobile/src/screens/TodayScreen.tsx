import { type ReactNode, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
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
  type MeasurementSystem,
  WATER_CUP_ML,
  formatWater,
  measurementSystemOf,
  getMealsForDay,
  calorieEstimate,
} from '@vitto/core';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { NutrientRing } from '../components/NutrientRing';
import { ChoiceRow, TextButton } from '../components/ui';
import { isNightTime } from '../petWorld/timeOfDay';
import { retro } from '../petWorld/retroStyle';
import { findScreenTimeForDate } from '../services/screenTimeMapping';
import { fonts, getColorScheme, layout, world, themedStyles } from '../theme';

/**
 * Today: a daily game recap, not an event log and not a nutrition dashboard. It
 * answers one question — "how did I take care of myself and my pet today?" —
 * through the four pillars (GYM, OUTDOORS, MIND, FOOD) plus the XP the day
 * actually earned.
 *
 * Every number comes from `buildDailyRecap`, which folds the real event log
 * once: no second copy of the day's activity, no per-section recalculation of
 * calories / steps / XP. Styled in the same warm parchment / dark-brown /
 * muted-world palette and hard-edged panels as the world screen, day and night.
 */
interface Props {
  /** Already projected to now by App; not decayed again here. */
  pet: PetState;
  events: HealthEvent[];
  profile: BodyProfile;
  stepGoal: number;
  onStepGoalChange: (goal: number) => void;
  onTrainMind: () => void;
  /** Logs a drink of water, in mL. Absent hides the tracker. */
  onLogWater?: (ml: number) => Promise<void>;
  /** Optional: the mind pillar hides the action until the navigation is wired. */
  onOpenWordPuzzle?: () => void;
  /** "Full history →" — Profile lists the user's own events. */
  onOpenProfile: () => void;
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
  /** Forgets which achievement unlocks have been shown, so every earned one pops again. */
  onReplayAchievements?: () => void;
  /** DEV: the companion's prompt, memories and triggers. Needs an account. */
  onOpenCompanionDebug?: () => void;
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
  onLogWater,
  onOpenWordPuzzle,
  onOpenProfile,
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
  onForceTrophies,
  onReplayAchievements,
  onOpenCompanionDebug,
}: Props) {
  // Today's meal list, folded until opened.
  const [foodLogOpen, setFoodLogOpen] = useState(false);
  // The steps card's own sync: 'syncing' while it runs, then what it found.
  const [stepSync, setStepSync] = useState<string | null>(null);
  const syncStepsNow = async () => {
    if (!onSyncSteps || stepSync === 'syncing') return;
    setStepSync('syncing');
    setStepSync(await onSyncSteps().catch(() => "Couldn't reach Apple Health. Try again."));
  };
  // Dark mode takes the night palette, whatever the hour: the panels as well
  // as the type on them. Deciding those two separately once put the night's
  // cream type on the day's cream panels in dark mode.
  const night = isNightTime() || getColorScheme() === 'dark';
  const c = night ? nightColors : dayColors;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `todayKey` stands in for `today`.
  const topInsight = useMemo(() => calculateInsights(events, today)[0] ?? null, [events, todayKey]);
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
          <Text style={[styles.backMark, { color: world.accent }]}>←</Text>
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
              tintColor={world.accent}
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
            track={c.track}
          />
          <Text style={[styles.overMeta, { color: c.soft }]}>
            Level {levelProgress.level} · {levelProgress.xpIntoLevel}/{levelProgress.xpForLevel} to
            level {toLevel}
          </Text>

          <View style={[styles.glanceRow, { borderTopColor: c.hairline }]}>
            {shows('training', gym.done) ? (
              <Glance label="GYM" value={gym.done ? '✓' : '—'} on={gym.done} c={c} />
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
            done={food.caloriePercent >= 90 && food.caloriePercent <= 110}
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
                  : `${food.mealCount} meal${food.mealCount > 1 ? 's' : ''} · ${food.caloriePercent}% of today's fuel`
            }
          >
            {/* What's been eaten, burned and left, as the day's three rings. */}
            <View style={styles.rings}>
              <NutrientRing
                value={food.consumed.calories}
                percent={(food.consumed.calories / food.targets.calories) * 100}
                label="Consumed"
                color="#c56a4e"
                size={84}
                tone={c}
              />
              <NutrientRing
                value={burned}
                percent={(burned / food.targets.calories) * 100}
                label="Burned"
                color="#78a598"
                size={84}
                tone={c}
              />
              <NutrientRing
                value={remaining}
                percent={(Math.abs(remaining) / food.targets.calories) * 100}
                label={remaining < 0 ? 'Over' : 'Remaining'}
                color={remaining < 0 ? '#c0503d' : '#9c8dba'}
                emphasis={remaining < 0}
                size={84}
                tone={c}
              />
            </View>
            <Text style={[styles.targetLine, { color: c.soft }]}>
              Target {food.targets.calories.toLocaleString()} kcal · {food.targets.proteinGrams}g protein · {food.targets.carbsGrams}g carbs ·{' '}
              {food.targets.fatGrams}g fat · {food.targets.fiberGrams ?? 0}g fiber
            </Text>
            {food.mealCount > 0 ? (
              <View style={styles.macros}>
                {(
                  [
                    ['Protein', food.consumed.proteinGrams, food.targets.proteinGrams],
                    ['Carbs', food.consumed.carbsGrams, food.targets.carbsGrams],
                    ['Fat', food.consumed.fatGrams, food.targets.fatGrams],
                    // The one sub-macro with a target (14 g per 1,000 kcal).
                    ['Fiber', food.consumed.fiberGrams ?? 0, food.targets.fiberGrams ?? 0],
                  ] as const
                ).map(([label, value, target]) => (
                  <View key={label} style={styles.macroRow}>
                    <Text style={[styles.macroLabel, { color: c.soft }]}>{label}</Text>
                    <View style={[styles.macroTrack, { backgroundColor: c.track }]}>
                      <View
                        style={[
                          styles.macroFill,
                          { width: `${Math.min(100, target > 0 ? (value / target) * 100 : 0)}%` },
                        ]}
                      />
                    </View>
                    <Text style={[styles.macroValue, { color: c.ink }]}>
                      {value}
                      <Text style={[styles.macroTarget, { color: c.soft }]}> / {target}g</Text>
                    </Text>
                  </View>
                ))}
                {/* The rest as plain totals, no bars and no targets. */}
                {describeSubMacros(food.consumed, { includeFiber: false }) ? (
                  <Text style={[styles.subMacros, { color: c.soft }]}>{describeSubMacros(food.consumed, { includeFiber: false })}</Text>
                ) : null}
              </View>
            ) : null}
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
                {foodLogOpen && getMealsForDay(events, today)
                  .slice()
                  .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
                  .map((meal) => {
                    const analysis = meal.metadata.analysis;
                    const name = analysis?.foodDescription || analysis?.detectedFoods.join(', ') || analysis?.summary || 'Meal';
                    return (
                      <View key={meal.id} style={styles.foodLogRow}>
                        <Text style={[styles.foodLogTime, { color: c.soft }]}>
                          {new Date(meal.occurredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </Text>
                        <Text style={[styles.foodLogName, { color: c.ink }]} numberOfLines={2}>{name}</Text>
                        <Text style={[styles.foodLogKcal, { color: c.ink }]}>
                          {analysis ? `${calorieEstimate(analysis.macros).toLocaleString()} kcal` : '—'}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            ) : null}
            {onLogWater ? (
              <WaterTracker
                ml={food.waterMl}
                goalMl={food.waterGoalMl}
                system={measurementSystemOf(profile)}
                onAdd={onLogWater}
                c={c}
              />
            ) : null}
          </Pillar>
        ) : null}

        {shows('movement', outdoors.steps > 0) ? (
          <Pillar
            c={c}
            night={night}
            kicker="OUTDOORS"
            done={outdoors.goalReached}
            xp={outdoors.xp}
            headline={`${outdoors.steps.toLocaleString()} / ${outdoors.goal.toLocaleString()} steps`}
            actions={
              onConnectHealth
                ? [{ label: 'Connect Apple Health', onPress: onConnectHealth }]
                : onSyncSteps
                  ? [{ label: stepSync === 'syncing' ? 'Syncing…' : 'Sync steps', onPress: () => void syncStepsNow() }]
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
              <TextInput
                style={[styles.goalInput, { color: c.ink, borderColor: c.hairline }]}
                keyboardType="number-pad"
                value={String(stepGoal)}
                onChangeText={(value) =>
                  onStepGoalChange(Number(value.replace(/[^0-9]/g, '')) || 1000)
                }
              />
            </View>
          </Pillar>
        ) : null}

        {shows('training', gym.done) ? (
          <Pillar
            c={c}
            night={night}
            kicker="GYM"
            done={gym.done}
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

        {/* --- Today's activity: aggregated, meaningful only --- */}
        <View style={[retro.panelQuiet, night && retro.panelQuietNight, styles.activity]}>
          <Text style={[styles.activityTitle, { color: c.ink }]}>Today's activity</Text>
          {recap.activity.length === 0 ? (
            <Text style={[styles.activityEmpty, { color: c.soft }]}>
              Nothing yet today. Every workout, walk, meal and puzzle counts.
            </Text>
          ) : (
            recap.activity.map((item) => (
              <View key={item.id} style={styles.activityRow}>
                <Text style={[styles.activityCheck, { color: world.positive }]}>✓</Text>
                <Text style={[styles.activityLabel, { color: c.ink }]}>{item.label}</Text>
              </View>
            ))
          )}
          <Pressable onPress={onOpenProfile} hitSlop={6}>
            <Text style={[styles.activityMore, { color: world.accent }]}>Full history →</Text>
          </Pressable>
        </View>

        {topInsight && insightsUnlocked ? (
          <View style={[retro.panelQuiet, night && retro.panelQuietNight, styles.softPanel]}>
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
            style={[retro.panelQuiet, night && retro.panelQuietNight, styles.softPanel]}
            testID="insight-locked"
          >
            <Text style={[styles.softKicker, { color: c.soft }]}>{`${petName} noticed`}</Text>
            <Text
              style={[styles.softHeadline, { color: c.ink }]}
            >{`${petName} spotted a pattern in your habits`}</Text>
            <Text style={[styles.softDetail, { color: world.accent }]}>
              See what it is with Plus →
            </Text>
          </Pressable>
        ) : null}

        {screenTimeToday ? (
          <View style={[retro.panelQuiet, night && retro.panelQuietNight, styles.softPanel]}>
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
}

function ProgressBar({ percent, track }: { percent: number; track: string }) {
  return (
    <View style={[styles.progressTrack, { backgroundColor: track }]}>
      <View
        style={[
          styles.progressFill,
          { width: `${Math.min(100, Math.max(0, percent))}%`, backgroundColor: world.accent },
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
  children?: ReactNode;
}) {
  return (
    <View style={[retro.panel, night && retro.panelNight, styles.pillar]}>
      <View style={styles.pillarHead}>
        <View style={{ flex: 1 }}>
          <View style={styles.pillarKickerRow}>
            <Text style={[styles.pillarKicker, { color: c.soft }]}>{kicker}</Text>
            {done ? <Text style={[styles.pillarDone, { color: world.positive }]}>✓</Text> : null}
          </View>
          <Text style={[styles.pillarHeadline, { color: c.ink }]}>{headline}</Text>
        </View>
        {xp && xp > 0 ? (
          <View style={[styles.xpChip, { borderColor: world.accent }]}>
            <Text style={[styles.xpChipText, { color: world.accentDeep }]}>+{xp} XP</Text>
          </View>
        ) : null}
      </View>
      {progressPercent !== undefined ? (
        <ProgressBar percent={progressPercent} track={c.track} />
      ) : null}
      <Text style={[styles.pillarDetail, { color: c.soft }]}>{detail}</Text>
      {children}
      {actions?.length ? (
        <View style={styles.pillarActions}>
          {actions.map((action) => (
            <Pressable key={action.label} onPress={action.onPress} hitSlop={8}>
              <Text style={[styles.pillarAction, { color: world.accent }]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Today's water, Cronometer-style: a row of cups that fill as the day's water
 * comes in, with − and + either side to take a cup back or add one. Whole cups
 * only. Past the target the cups just stay full.
 *
 * A tap shows at once, with a buzz: the cups move before the save does. Saves
 * run one at a time behind the screen, each against the log the one before it
 * left, so a quick run of taps is counted exactly once each. A save that fails
 * takes its cup back off the screen (the app's error banner says why).
 */
function WaterTracker({
  ml,
  goalMl,
  system,
  onAdd,
  c,
}: {
  ml: number;
  goalMl: number;
  system: MeasurementSystem;
  onAdd: (ml: number) => Promise<void>;
  c: Palette;
}) {
  /** Taps on screen but not yet saved, in mL. */
  const [pending, setPending] = useState(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  // The latest handler, so a queued save sees the log as the save before it left it.
  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;

  const shown = Math.max(0, ml + pending);
  const cups = Math.max(1, Math.round(goalMl / WATER_CUP_ML));
  // Whole cups: water logged before the tracker was cups-only rounds to the nearest.
  const full = Math.round(shown / WATER_CUP_ML);

  const tap = (amount: number) => {
    if (amount === 0) return;
    setPending((current) => current + amount);
    buzz(amount > 0 && shown < goalMl && shown + amount >= goalMl ? 'goal' : 'tap');
    queue.current = queue.current.then(async () => {
      // Let the previous save's new log reach this component before the next one reads it.
      await new Promise((resolve) => setTimeout(resolve, 0));
      try {
        await onAddRef.current(amount);
      } catch {
        buzz('error');
      } finally {
        setPending((current) => current - amount);
      }
    });
  };

  return (
    <View style={[styles.water, { borderTopColor: c.hairline }]}>
      <View style={styles.waterHead}>
        <Text style={[styles.waterLabel, { color: c.soft }]}>Water</Text>
        <Text style={[styles.waterCount, { color: c.ink }]}>
          {formatWater(shown, system)}
          <Text style={[styles.macroTarget, { color: c.soft }]}> / {formatWater(goalMl, system)}</Text>
        </Text>
      </View>
      <View style={styles.waterCupsRow}>
        <WaterStep
          sign="−"
          label="Remove a cup of water"
          disabled={shown <= 0}
          onPress={() => tap(-Math.min(WATER_CUP_ML, shown))}
        />
        <View style={styles.waterCups}>
          {Array.from({ length: cups }, (_, index) => (
            <WaterCup key={index} full={index < full} />
          ))}
        </View>
        <WaterStep sign="+" label="Add a cup of water" onPress={() => tap(WATER_CUP_ML)} />
      </View>
      <Text style={[styles.waterHint, { color: c.soft }]}>
        1 cup = {system === 'imperial' ? '8.5 fl oz' : '250 mL'}
      </Text>
    </View>
  );
}

/** The water tracker's buzz: a light tick per cup, a success on the goal. */
const buzz = (kind: 'tap' | 'goal' | 'error') => {
  if (Platform.OS === 'web') return;
  const done =
    kind === 'tap'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.notificationAsync(
          kind === 'goal' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
        );
  void done.catch(() => {});
};

/** One cup on the water row: a tapered glass, full of water or empty. */
function WaterCup({ full }: { full: boolean }) {
  return (
    <Svg width={22} height={30} viewBox="0 0 22 30">
      <Path
        d="M2 3 L20 3 L18 27 L4 27 Z"
        fill={full ? WATER_BLUE : 'none'}
        stroke={WATER_BLUE}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** The − and + either side of the cups. */
function WaterStep({
  sign,
  label,
  onPress,
  disabled,
}: {
  sign: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        styles.waterStep,
        pressed && { backgroundColor: WATER_BLUE },
        disabled && { opacity: 0.35 },
      ]}
    >
      {({ pressed }) => <Text style={[styles.waterStepText, pressed && { color: '#fff' }]}>{sign}</Text>}
    </Pressable>
  );
}

const WATER_BLUE = '#5b9bc4';

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

const dayColors: Palette = {
  bg: '#f4ecdb',
  ink: world.ink,
  soft: world.inkSoft,
  hairline: 'rgba(67,55,44,0.18)',
  track: '#e0d3ba',
};
const nightColors: Palette = {
  bg: world.nightSurface,
  ink: world.nightText,
  soft: world.nightTextSoft,
  hairline: 'rgba(239,229,208,0.14)',
  track: 'rgba(239,229,208,0.14)',
};

const styles = themedStyles(() => ({
  rings: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, marginTop: 12 },
  targetLine: { fontFamily: fonts.pixel, fontSize: 13, lineHeight: 19, marginTop: 10 },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 62,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 60 },
  backMark: { fontFamily: fonts.pixel, fontSize: 23 },
  backLabel: { fontFamily: fonts.pixel, fontSize: 16 },
  topTitle: { fontFamily: fonts.pixelBold, fontSize: 18, letterSpacing: 2 },
  body: { paddingHorizontal: 18, paddingTop: 18, gap: 14 },

  overview: { paddingHorizontal: 2, paddingTop: 4, paddingBottom: 20, borderBottomWidth: 1 },
  overKicker: {
    fontFamily: fonts.pixelBold,
    fontSize: 13,
    letterSpacing: 1.4,
    
    textTransform: 'uppercase',
  },
  xpRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 8, marginBottom: 12 },
  xpValue: { fontFamily: fonts.pixelBold, fontSize: 52, letterSpacing: 0.5 },
  xpUnit: {
    fontFamily: fonts.pixelBold,
    fontSize: 14,
    letterSpacing: 1,
    
    textTransform: 'uppercase',
  },
  overMeta: {
    fontFamily: fonts.pixel,
    fontSize: 13,
    letterSpacing: 0.4,
    marginTop: 6,
    lineHeight: 20,
  },
  glanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  glance: { alignItems: 'center', flex: 1 },
  glanceValue: { fontFamily: fonts.pixelBold, fontSize: 23, },
  glanceLabel: { fontFamily: fonts.pixel, fontSize: 10, letterSpacing: 1, marginTop: 3 },

  pillar: { padding: 16, gap: 8 },
  pillarHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pillarKickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillarKicker: { fontFamily: fonts.pixelBold, fontSize: 13, letterSpacing: 1.6, },
  pillarDone: { fontFamily: fonts.pixelBold, fontSize: 16, },
  pillarHeadline: {
    fontFamily: fonts.pixelBold,
    fontSize: 22,
    
    marginTop: 4,
    letterSpacing: 0.5,
  },
  pillarDetail: { fontFamily: fonts.pixel, fontSize: 16, lineHeight: 22 },
  pillarActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 4 },
  pillarAction: { fontFamily: fonts.pixel, fontSize: 14, letterSpacing: 0.3 },
  xpChip: { borderWidth: 2, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
  xpChipText: { fontFamily: fonts.pixelBold, fontSize: 14, letterSpacing: 0.4 },
  caloriesLine: { fontFamily: fonts.pixel, fontSize: 14, marginTop: 2 },
  syncNote: { fontFamily: fonts.pixel, fontSize: 13, lineHeight: 18, marginTop: 8 },
  goalEdit: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  goalEditLabel: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  goalInput: {
    width: 88,
    textAlign: 'center',
    fontFamily: fonts.pixel,
    fontSize: 18,
    borderWidth: 2,
    borderRadius: 4,
    paddingVertical: 6,
  },

  macros: { gap: 9, marginTop: 4 },
  water: { borderTopWidth: 1, marginTop: 8, paddingTop: 12, gap: 10 },
  waterHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  waterLabel: { fontFamily: fonts.pixelBold, fontSize: 13, letterSpacing: 1.6, textTransform: 'uppercase' },
  waterCount: { fontFamily: fonts.pixelBold, fontSize: 16 },
  waterCupsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waterCups: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  waterStep: {
    width: 34,
    height: 34,
    borderWidth: 2,
    borderColor: WATER_BLUE,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waterStepText: { fontFamily: fonts.pixelBold, fontSize: 22, lineHeight: 24, color: WATER_BLUE },
  waterHint: { fontFamily: fonts.pixel, fontSize: 12, letterSpacing: 0.4, textAlign: 'center', marginTop: -4 },
  subMacros: { fontFamily: fonts.pixel, fontSize: 16, lineHeight: 22, marginTop: 6 },
  foodLog: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, gap: 9 },
  foodLogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  foodLogTitle: { fontFamily: fonts.pixel, fontSize: 12, letterSpacing: 1.2 },
  foodLogRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  foodLogTime: { fontFamily: fonts.pixel, fontSize: 13, lineHeight: 19, width: 62 },
  foodLogName: { flex: 1, fontFamily: fonts.pixel, fontSize: 15, lineHeight: 19 },
  foodLogKcal: { fontFamily: fonts.pixel, fontSize: 14, lineHeight: 19 },
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  macroLabel: { width: 48, fontFamily: fonts.pixel, fontSize: 12, letterSpacing: 0.4 },
  macroTrack: { flex: 1, minWidth: 0, height: 4, borderRadius: 2, overflow: 'hidden' },
  macroFill: { height: '100%', backgroundColor: world.accent },
  macroValue: {
    fontFamily: fonts.pixelBold,
    fontSize: 14,
    
    minWidth: 72,
    textAlign: 'right',
  },
  macroTarget: { fontWeight: '400' },

  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },

  activity: { padding: 16 },
  activityTitle: {
    fontFamily: fonts.pixelBold,
    fontSize: 14,
    letterSpacing: 1.6,
    
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  activityEmpty: { fontFamily: fonts.pixel, fontSize: 16, lineHeight: 23 },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  activityCheck: { fontFamily: fonts.pixelBold, fontSize: 17, },
  activityLabel: { fontFamily: fonts.pixel, fontSize: 17, flex: 1 },
  activityMore: { fontFamily: fonts.pixel, fontSize: 14, marginTop: 10 },

  softPanel: { padding: 16, gap: 6 },
  softKicker: {
    fontFamily: fonts.pixelBold,
    fontSize: 13,
    letterSpacing: 1.4,
    
    textTransform: 'uppercase',
  },
  softHeadline: { fontFamily: fonts.pixelBold, fontSize: 20, },
  softDetail: { fontFamily: fonts.pixel, fontSize: 16, lineHeight: 22 },

  devPanel: { paddingVertical: 16, borderTopWidth: 1 },
  devKicker: {
    fontFamily: fonts.pixelBold,
    fontSize: 13,
    letterSpacing: 1.2,
    
    textTransform: 'uppercase',
  },
  devHint: { fontFamily: fonts.pixel, fontSize: 14, lineHeight: 21, marginTop: 10 },
  devButtons: { flexDirection: 'row', gap: 16 },
}));
