import { type ReactNode, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  type TrophyId,
  AILMENT_PRECEDENCE,
  type BodyProfile,
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
} from '@vitto/core';
import { ChoiceRow, TextButton } from '../components/ui';
import { isNightTime } from '../petWorld/timeOfDay';
import { retro } from '../petWorld/retroStyle';
import { findScreenTimeForDate } from '../services/screenTimeMapping';
import { fonts, layout, world } from '../theme';

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
  /**
   * The pet's real total xp (`totalPetXp`) as of the start of today, if a
   * reading has been taken (see App.tsx). Preferred source for the day's xp
   * total — see `DailyRecap.xp`. Undefined until the first reading lands.
   */
  dayStartTotalXp?: number;
  onTrainMind: () => void;
  /** Optional: the mind pillar hides the action until the navigation is wired. */
  onOpenWordPuzzle?: () => void;
  /** "Full history →" — Profile lists the user's own events. */
  onOpenProfile: () => void;
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
  /** Dev tool: pretend to be walking or at the gym, so both ambient cues (see
   * mobile/AMBIENT.md) can be checked at a desk without real sensors. */
  forcedAmbient?: ForcedAmbient | null;
  onForceAmbient?: (state: ForcedAmbient | null) => void;
  forcedTrophies?: ForcedTrophies | null;
  onForceTrophies?: (state: ForcedTrophies | null) => void;
  /** Forgets which achievement unlocks have been shown, so every earned one pops again. */
  onReplayAchievements?: () => void;
  /**
   * What the sensors are actually reporting. Both ambient hooks fail quietly by
   * design, so on a device "permission denied", "no such sensor" and "you are
   * standing still" are indistinguishable from the outside — this is how you
   * tell them apart while testing.
   */
  ambientDebug?: {
    walkingPermission: string;
    steps: number;
    gymPermission: string;
    gymSaved: boolean;
    distance: number | null;
  };
}

export type ForcedAmbient = 'walking' | 'gym';

/**
 * Dev-only override for the living-room shelf: a single trophy, all of them,
 * or none — so every plank can be checked without a month of logging. Nothing
 * here is saved; `earnedTrophies` is the only real source.
 */
export type ForcedTrophies = 'none' | TrophyId | 'all';
type DevTrophyChoice = 'live' | ForcedTrophies;
type DevAmbientChoice = ForcedAmbient | 'live';
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
const DEV_AMBIENT_OPTIONS: { value: DevAmbientChoice; label: string; detail?: string }[] = [
  { value: 'live', label: 'Live', detail: 'real sensors' },
  { value: 'walking', label: 'Walking' },
  { value: 'gym', label: 'At gym' },
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
  dayStartTotalXp,
  onTrainMind,
  onOpenWordPuzzle,
  onOpenProfile,
  onClose,
  onRefresh,
  forcedAilment,
  onForceAilment,
  forcedForm,
  onForceForm,
  onSeedTestData,
  onClearSeededData,
  isSeeding,
  forcedAmbient,
  onForceAmbient,
  forcedTrophies,
  onForceTrophies,
  onReplayAchievements,
  ambientDebug,
}: Props) {
  const night = isNightTime();
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
    () => buildDailyRecap({ events, profile, pet, stepGoal, day: today, dayStartTotalXp }),
    [events, profile, pet, stepGoal, todayKey, dayStartTotalXp],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `todayKey` stands in for `today`.
  const topInsight = useMemo(() => calculateInsights(events, today)[0] ?? null, [events, todayKey]);
  const screenTimeToday = findScreenTimeForDate(events, today);
  const wordPuzzleToday = findWordPuzzleEventForDate(events, todayKey);

  const { gym, outdoors, mind, food, levelProgress } = recap;
  const toLevel = levelProgress.level + 1;
  const petName = pet.name;
  const dayComplete = recap.dailyProgress >= 100;

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
          <Text style={[styles.overKicker, { color: c.soft }]}>
            You and {petName}, today
          </Text>
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
          <Text style={[styles.overMeta, { color: c.soft }]}>
            {dayComplete
              ? `Every pillar tended — ${petName} had a good day.`
              : `${recap.dailyProgress}% of your day so far`}
          </Text>

          <View style={[styles.glanceRow, { borderTopColor: c.hairline }]}>
            <Glance label="GYM" value={gym.done ? '✓' : '—'} on={gym.done} c={c} />
            <Glance
              label="OUTDOORS"
              value={outdoors.steps > 0 ? `${Math.round(outdoors.steps / 100) / 10}k` : '0'}
              on={outdoors.steps > 0}
              c={c}
            />
            <Glance
              label="MIND"
              value={mind.sessionCount > 0 ? String(mind.sessionCount) : '—'}
              on={mind.sessionCount > 0}
              c={c}
            />
            <Glance
              label="FOOD"
              value={food.mealCount > 0 ? String(food.mealCount) : '—'}
              on={food.mealCount > 0}
              c={c}
            />
          </View>
        </View>

        {/* --- The four pillars --- */}
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
                : gym.lastName ?? 'Workout complete'
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

        <Pillar
          c={c}
          night={night}
          kicker="OUTDOORS"
          done={outdoors.goalReached}
          xp={outdoors.xp}
          headline={`${outdoors.steps.toLocaleString()} / ${outdoors.goal.toLocaleString()} steps`}
          detail={
            outdoors.steps > 0
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
          {food.mealCount > 0 ? (
            <View style={styles.macros}>
              {(
                [
                  ['Protein', food.consumed.proteinGrams, food.targets.proteinGrams],
                  ['Carbs', food.consumed.carbsGrams, food.targets.carbsGrams],
                  ['Fat', food.consumed.fatGrams, food.targets.fatGrams],
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
            </View>
          ) : null}
        </Pillar>

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

        {topInsight ? (
          <View style={[retro.panelQuiet, night && retro.panelQuietNight, styles.softPanel]}>
            <Text style={[styles.softKicker, { color: c.soft }]}>{`${petName} noticed`}</Text>
            <Text style={[styles.softHeadline, { color: c.ink }]}>{topInsight.headline}</Text>
            <Text style={[styles.softDetail, { color: c.soft }]}>{topInsight.detail}</Text>
          </View>
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
        {onForceAmbient ? (
          <DevPanel
            c={c}
            title="Dev · force ambient"
            hint="Pretends the user is walking or at the gym so both cues can be checked without real sensors."
          >
            <ChoiceRow
              options={DEV_AMBIENT_OPTIONS}
              value={forcedAmbient ?? 'live'}
              onChange={(next) => onForceAmbient(next === 'live' ? null : next)}
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
            {onReplayAchievements ? (
              <View style={{ marginTop: 12 }}>
                <TextButton label="Replay achievement unlocks" onPress={onReplayAchievements} />
              </View>
            ) : null}
          </DevPanel>
        ) : null}
        {ambientDebug ? (
          <DevPanel
            c={c}
            title="Dev · sensors"
            hint="Live, not forced. `denied` / `unavailable` means the cue can never fire — walking needs a real device."
          >
            <Text style={[styles.devReadout, { color: c.ink }]}>
              walking: {ambientDebug.walkingPermission} · {ambientDebug.steps} steps in window
            </Text>
            <Text style={[styles.devReadout, { color: c.ink }]}>
              gym: {ambientDebug.gymPermission} ·{' '}
              {ambientDebug.gymSaved
                ? ambientDebug.distance === null
                  ? 'saved, no fix yet'
                  : `${ambientDebug.distance}m away`
                : 'not set'}
            </Text>
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

const styles = StyleSheet.create({
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
  backMark: { fontSize: 18 },
  backLabel: { fontFamily: fonts.mono, fontSize: 12 },
  topTitle: { fontFamily: fonts.mono, fontSize: 14, fontWeight: '700', letterSpacing: 2 },
  body: { paddingHorizontal: 18, paddingTop: 18, gap: 14 },

  overview: { paddingHorizontal: 2, paddingTop: 4, paddingBottom: 20, borderBottomWidth: 1 },
  overKicker: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  xpRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 8, marginBottom: 12 },
  xpValue: { fontFamily: fonts.mono, fontSize: 40, fontWeight: '700', letterSpacing: -1 },
  xpUnit: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  overMeta: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.4, marginTop: 6, lineHeight: 15 },
  glanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  glance: { alignItems: 'center', flex: 1 },
  glanceValue: { fontFamily: fonts.mono, fontSize: 18, fontWeight: '700' },
  glanceLabel: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1, marginTop: 3 },

  pillar: { padding: 16, gap: 8 },
  pillarHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pillarKickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillarKicker: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.6, fontWeight: '700' },
  pillarDone: { fontSize: 12, fontWeight: '700' },
  pillarHeadline: {
    fontFamily: fonts.mono,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: -0.2,
  },
  pillarDetail: { fontSize: 12, lineHeight: 17 },
  pillarActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 4 },
  pillarAction: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.3 },
  xpChip: { borderWidth: 2, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
  xpChipText: { fontFamily: fonts.mono, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  caloriesLine: { fontFamily: fonts.mono, fontSize: 11, marginTop: 2 },
  goalEdit: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  goalEditLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },
  goalInput: {
    width: 88,
    textAlign: 'center',
    fontFamily: fonts.mono,
    fontSize: 14,
    borderWidth: 2,
    borderRadius: 4,
    paddingVertical: 6,
  },

  macros: { gap: 9, marginTop: 4 },
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  macroLabel: { width: 48, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.4 },
  macroTrack: { flex: 1, minWidth: 0, height: 4, borderRadius: 2, overflow: 'hidden' },
  macroFill: { height: '100%', backgroundColor: world.accent },
  macroValue: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    minWidth: 72,
    textAlign: 'right',
  },
  macroTarget: { fontWeight: '400' },

  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },

  activity: { padding: 16 },
  activityTitle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  activityEmpty: { fontSize: 12, lineHeight: 18 },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  activityCheck: { fontSize: 13, fontWeight: '700' },
  activityLabel: { fontSize: 13, flex: 1 },
  activityMore: { fontFamily: fonts.mono, fontSize: 11, marginTop: 10 },

  softPanel: { padding: 16, gap: 6 },
  softKicker: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  softHeadline: { fontSize: 15, fontWeight: '700' },
  softDetail: { fontSize: 12, lineHeight: 17 },

  devPanel: { paddingVertical: 16, borderTopWidth: 1 },
  devKicker: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  devHint: { fontSize: 11, lineHeight: 16, marginTop: 10 },
  devReadout: { fontFamily: fonts.mono, fontSize: 11, marginTop: 6 },
  devButtons: { flexDirection: 'row', gap: 16 },
});
