import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Keyboard, ScrollView, View } from 'react-native';
import {
  KM_PER_MILE,
  checkWorkout,
  createExercise,
  getEventsForDay,
  mindGamesPlayedOn,
  stepsForDay,
  toDateKey,
  type HealthEvent,
  type MacroTotals,
  type WorkoutMetadata,
  type WorkoutTemplate,
  type SavedMeal,
  type RepeatableMeal,
  normalizeSavedMealName,
  foodNameText,
} from '@vitto/core';
import { MIND_GAMES } from '../mind/registry';
import { availableMindGames, featuredMindGame, isMindGamePlayed, type MindRouteHandlers } from '../mind/hub';
import type { MindGameEntry, MindStage } from '../mind/types';
import { whenLabel } from './whenLabel';
import { LogProgress } from '../components/logKit';
import { WaterLog, type WaterLogProps } from '../components/WaterLog';
import { layout } from '../theme';
import { formatLocale, msg, t, tx } from '../i18n';
import {
  PanelActionBar,
  PanelButton,
  PanelButtonRow,
  PanelChips,
  PanelEmpty,
  PanelHeader,
  PanelNumberField,
  PanelProgress,
  PanelPage,
  useRoomBarInset,
  PanelRow,
  PanelSection,
  useRoomTask,
  RoomWindowSlot,
  useScrollToWindowOnLog,
} from './RoomPanel';

/**
 * What each room's page holds (see RoomPanel): the room's logging, laid out
 * so the usual thing is one tap and nothing is more than two.
 *
 *   Kitchen  the meal logger itself, open on Search: the meals eaten lately
 *            are right there to log again. The Camera (barcodes and photos),
 *            Describe, Meals and Water are tabs pinned at the page's foot.
 *   Gym      the workout screen itself: today's routine and the rotation
 *            (edit, reorder, create), exercises picked by hand, past sessions
 *            to repeat, and the session, all in the page.
 *   Outside  a walk, run or ride logs from the page: the activity and minutes
 *            used last are already chosen, so the usual one is a single tap,
 *            with a distance if they want one; a past one logs again with a +.
 *            Kept as a routine ("Morning walk", made in Other activity), it
 *            is listed first and Log logs it, as the Gym lists its routines.
 *   Study    today's game is the one big button; the rest are a tap each,
 *            and every one opens on its own page.
 */

// --- Food ------------------------------------------------------------------

/**
 * The meal logger's ways in. `recent` is search with the keyboard down, as the
 * Kitchen opens. `camera` is barcodes and meal photos through one viewfinder
 * (`photo` and `scan` open it on that mode); `describe` is the meal in a sentence.
 */
export type MealEntry = 'search' | 'camera' | 'photo' | 'scan' | 'describe' | 'recent';

type FoodTab = 'search' | 'camera' | 'describe' | 'meals' | 'water';

export interface FoodPanelProps {
  /**
   * The meal logger, opened in the page on this way in; `close` is what it
   * calls when done. The page's pinned bar switches between the ways in, so
   * the logger's own switch is not needed.
   */
  renderMealLogger: (entry: MealEntry, close: () => void) => ReactNode;
  /** Eaten so far against the day's targets, at the top of the Meals tab. */
  today?: { consumed: MacroTotals; targets: MacroTotals };
  /** Meals kept to log again in one tap. */
  savedMeals?: readonly SavedMeal[];
  /**
   * What they have eaten lately: the Meals tab offers each to keep, in one
   * tap, under its own name. Nothing is typed, and logging is never interrupted.
   */
  recentMeals?: readonly RepeatableMeal[];
  onSaveMeal?: (name: string, analysis: RepeatableMeal['analysis']) => Promise<string | null>;
  /** Today's water and how to add to it: shows a Water tab when given. */
  water?: WaterLogProps;
  onLogSavedMeal?: (meal: SavedMeal) => Promise<void>;
  onDeleteSavedMeal?: (id: string) => Promise<void> | void;
}

/**
 * The Kitchen's page is the meal logger itself, opened on Search with the
 * keyboard down, so the meals eaten lately are the first thing under the
 * window. The pinned bar's tabs switch to the Camera (barcodes and photos),
 * Describe, Meals or Water; logging a meal (or putting the logger away) comes
 * back to Search.
 */
export function FoodPanel({ renderMealLogger, today, savedMeals = [], onLogSavedMeal, onDeleteSavedMeal, recentMeals, onSaveMeal, water }: FoodPanelProps) {
  const task = useRoomTask();
  const [tab, setTab] = useState<FoodTab>('search');
  // The open tab renders from these on every pass, so it never shows a stale
  // day: the logger and the water count are the app's latest.
  const latest = useRef({ renderMealLogger, today, savedMeals, onLogSavedMeal, onDeleteSavedMeal, recentMeals, onSaveMeal, water });
  latest.current = { renderMealLogger, today, savedMeals, onLogSavedMeal, onDeleteSavedMeal, recentMeals, onSaveMeal, water };

  const show = useCallback(
    (next: FoodTab, arriving = false) => {
      setTab(next);
      if (next === 'water') {
        task.open(() => <WaterTab water={latest.current.water} />, { keepBars: true });
        return;
      }
      if (next === 'meals') {
        task.open(() => <MealsTab {...latest.current} />, { keepBars: true });
        return;
      }
      // Search with the keyboard up when it is asked for; down on the way in.
      const entry: MealEntry = next === 'search' && arriving ? 'recent' : next;
      task.open(() => latest.current.renderMealLogger(entry, () => show('search', true)), { keepBars: true });
    },
    [task.open],
  );

  // The room opens on Search. Before the first paint, so the page never shows empty.
  useLayoutEffect(() => {
    show('search', true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs: { icon: FoodTab; label: string; hint: string }[] = [
    { icon: 'search', label: t('Search'), hint: t('Search foods') },
    { icon: 'camera', label: t('Camera'), hint: t('Scan a barcode or photograph a meal') },
    { icon: 'describe', label: t('Describe'), hint: t('Say or type what you ate') },
    { icon: 'meals', label: t('Meals'), hint: t('Your saved meals') },
    ...(water ? [{ icon: 'water' as const, label: t('Water'), hint: t('Log water') }] : []),
  ];
  return (
    <PanelPage
      footer={
        <PanelActionBar
          active={tab}
          actions={tabs.map((item) => ({
            ...item,
            onPress: () => {
              if (item.icon !== tab) show(item.icon);
            },
          }))}
        />
      }
    >
      {null}
    </PanelPage>
  );
}

/** The Kitchen's Water tab: the day's cups, big, a tap each. */
function WaterTab({ water }: { water: FoodPanelProps['water'] }) {
  const barInset = useRoomBarInset();
  const scroller = useRef<ScrollView>(null);
  useScrollToWindowOnLog(scroller);
  return (
    <ScrollView ref={scroller} contentContainerStyle={{ padding: 16, paddingBottom: 16 + barInset, gap: 14 }} showsVerticalScrollIndicator={false}>
      <RoomWindowSlot />
      {water ? <WaterLog {...water} /> : null}
    </ScrollView>
  );
}

/** A row of LogProgress's bars without its own card: the Water tab's card holds two. */
const MACRO_ROW = { marginHorizontal: 0, marginTop: 0, padding: 0, backgroundColor: 'transparent' } as const;

/**
 * The Kitchen's Meals tab: where the day's eating stands, then the meals kept
 * for meal prep, each logged in one tap.
 */
function MealsTab({
  today,
  savedMeals = [],
  onLogSavedMeal,
  onDeleteSavedMeal,
  recentMeals = [],
  onSaveMeal,
}: Pick<FoodPanelProps, 'today' | 'savedMeals' | 'onLogSavedMeal' | 'onDeleteSavedMeal' | 'recentMeals' | 'onSaveMeal'>) {
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const barInset = useRoomBarInset();
  const scroller = useRef<ScrollView>(null);
  useScrollToWindowOnLog(scroller);
  // Eaten lately and not kept yet: each a tap from being one of their meals.
  const kept = new Set(savedMeals.map((meal) => meal.name.toLowerCase()));
  const toKeep = onSaveMeal
    ? recentMeals.filter((meal) => !kept.has(normalizeSavedMealName(meal.name).toLowerCase())).slice(0, 6)
    : [];
  return (
    <ScrollView ref={scroller} contentContainerStyle={{ padding: 16, paddingBottom: 16 + barInset, gap: 14 }} showsVerticalScrollIndicator={false}>
      <RoomWindowSlot />
      {today ? (
        // Two by two: four bars in one row left each too narrow for its figures.
        <View style={[layout.card, { padding: 18, gap: 14 }]}>
          <LogProgress
            style={MACRO_ROW}
            items={[
              { label: t('Calories'), value: today.consumed.calories, goal: today.targets.calories, unit: 'kcal' },
              { label: t('Protein'), value: today.consumed.proteinGrams, goal: today.targets.proteinGrams, unit: 'g' },
            ]}
          />
          <LogProgress
            style={MACRO_ROW}
            items={[
              { label: t('Carbs'), value: today.consumed.carbsGrams, goal: today.targets.carbsGrams, unit: 'g' },
              { label: t('Fat'), value: today.consumed.fatGrams, goal: today.targets.fatGrams, unit: 'g' },
            ]}
          />
        </View>
      ) : null}
      <PanelSection
        title={t('Your meals')}
        action={savedMeals.length > 0 && onDeleteSavedMeal ? { label: editing ? t('Done') : t('Edit'), onPress: () => setEditing((on) => !on) } : undefined}
      >
        {savedMeals.length === 0 ? (
          <PanelEmpty>
            {t('Prep the same meals? Keep one from the list below, and it logs in one tap from here.')}
          </PanelEmpty>
        ) : (
          savedMeals.map((meal) => (
            <PanelRow
              key={meal.id}
              title={foodNameText(meal.name)}
              detail={t('{calories} kcal · {protein}g protein', { calories: Math.round(meal.analysis.macros.calories).toLocaleString(formatLocale()), protein: Math.round(meal.analysis.macros.proteinGrams) })}
              more={t('{carbs}g carbs · {fat}g fat', { carbs: Math.round(meal.analysis.macros.carbsGrams), fat: Math.round(meal.analysis.macros.fatGrams) })}
              action={
                editing
                  ? { label: t('Delete {name}', { name: meal.name }), text: t('Delete'), onPress: () => onDeleteSavedMeal?.(meal.id) }
                  : onLogSavedMeal
                    ? { label: t('Log {name} now', { name: meal.name }), text: tx('button: log this now', 'Log'), onPress: () => onLogSavedMeal(meal) }
                    : undefined
              }
            />
          ))
        )}
      </PanelSection>
      {toKeep.length > 0 && !editing ? (
        <PanelSection title={t("Add from what you've eaten")}>
          {problem ? <PanelEmpty>{problem}</PanelEmpty> : null}
          {toKeep.map((meal) => (
            <PanelRow
              key={meal.key}
              title={foodNameText(meal.name)}
              detail={t('{calories} kcal · {protein}g protein', { calories: Math.round(meal.analysis.macros.calories).toLocaleString(formatLocale()), protein: Math.round(meal.analysis.macros.proteinGrams) })}
              more={t('{carbs}g carbs · {fat}g fat', { carbs: Math.round(meal.analysis.macros.carbsGrams), fat: Math.round(meal.analysis.macros.fatGrams) })}
              action={{
                label: t('Keep {name} in your meals', { name: meal.name }),
                text: t('+ Add'),
                onPress: async () => {
                  const refused = await onSaveMeal!(meal.name, meal.analysis);
                  setProblem(refused);
                  if (refused) throw new Error(refused);
                },
              }}
            />
          ))}
        </PanelSection>
      ) : null}
    </ScrollView>
  );
}

// --- Gym -------------------------------------------------------------------

export interface GymPanelProps {
  /**
   * The workout screen as the Gym's own page (its `inRoom`): today's routine,
   * the rotation with its Edit, creating a routine, picking exercises, recent
   * sessions, and then the session itself, all under the window. `reopen` is
   * what it calls when a workout is finished or put away: back to a fresh page.
   */
  renderWorkout: (reopen: () => void) => ReactNode;
}

/**
 * The Gym's page is the workout screen itself, as the Kitchen's is the meal
 * logger: nothing to tap through to. A session left half done is picked up
 * where it was (the screen keeps it on the phone).
 */
export function GymPanel({ renderWorkout }: GymPanelProps) {
  const task = useRoomTask();
  const latest = useRef(renderWorkout);
  latest.current = renderWorkout;
  const show = useCallback(
    () => task.open(() => latest.current(show), { keepBars: true }),
    [task.open],
  );
  // Before the first paint, so the page never shows empty.
  useLayoutEffect(() => {
    show();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <PanelPage>{null}</PanelPage>;
}

// --- Outside ---------------------------------------------------------------

/** The activities the page logs itself, by the name the exercise list knows them by. */
const CARDIO = [
  { value: 'Walking', label: t('Walk') },
  { value: 'Running', label: t('Run') },
  { value: 'Cycling', label: t('Ride') },
] as const;
export type CardioName = (typeof CARDIO)[number]['value'];

const USUAL_MINUTES = [15, 30, 45, 60];

/**
 * What the quick log starts on: the activity and minutes logged last, since a
 * daily walk is the same walk. The minutes offered are the usual four, with
 * theirs in place of its neighbours when it is none of them.
 */
export const quickCardioDefaults = (
  events: readonly HealthEvent[],
): { activity: CardioName; minutes: number; options: number[] } => {
  const last = events.find(
    (event): event is HealthEvent<WorkoutMetadata> =>
      event.type === 'WORKOUT' &&
      (event.metadata as WorkoutMetadata).workoutType === 'cardio' &&
      CARDIO.some((kind) => kind.value === (event.metadata as WorkoutMetadata).exercises?.[0]?.name),
  );
  const activity = (last?.metadata.exercises?.[0]?.name as CardioName | undefined) ?? 'Walking';
  const lastMinutes = Math.round(last?.metadata.durationMinutes ?? 0);
  const minutes = lastMinutes >= 5 && lastMinutes <= 180 ? lastMinutes : 30;
  const options = USUAL_MINUTES.includes(minutes)
    ? USUAL_MINUTES
    : [...USUAL_MINUTES.filter((option) => Math.abs(option - minutes) > 7), minutes].sort((a, b) => a - b);
  return { activity, minutes, options };
};

/** A distance kept in km, in the unit they read: "5 km", "3.1 mi". */
export const distanceLabel = (km: number, unit: 'km' | 'mi'): string =>
  `${Math.round((unit === 'mi' ? km / KM_PER_MILE : km) * 100) / 100} ${unit}`;

export interface OutsidePanelProps {
  events: readonly HealthEvent[];
  stepGoal: number;
  /** The unit distances are typed and shown in: miles for someone who lifts in pounds. */
  distanceUnit: 'km' | 'mi';
  /**
   * Logs a walk, run, ride (or a routine, or a past activity again) of this
   * many minutes, now. `name` is what the log is called: a routine's own name.
   */
  onQuickCardio: (activity: string, minutes: number, distanceKm?: number, name?: string) => Promise<void>;
  /**
   * Saved outdoor routines ("Morning walk": a walk, 30 min, 2 mi), as the Gym
   * has its routines: Log logs one, now. They are made in the full logger
   * (Other activity: pick it, give it a time, Save as a routine).
   */
  routines?: readonly WorkoutTemplate[];
  onDeleteRoutine?: (id: string) => Promise<void> | void;
  /** The full logger (swims, hikes, anything else), opened in the page; `close` puts it away. */
  renderCardio: (close: () => void) => ReactNode;
  /** Pulls today's steps from Apple Health. Absent where it is not connected. */
  onSyncSteps?: () => void;
  onOpenLog: (event: HealthEvent) => void;
}

/** "Walk", "Run", "Ride", or the activity's own name. */
const activityLabel = (activity: string): string => CARDIO.find((kind) => kind.value === activity)?.label ?? t(activity);
/** The quick log's button, whole: "Log 30 min walk", or "Log 5 km walk · 30 min" with a distance. */
const quickLogLabel = (activity: CardioName, minutes: number, distance?: string): string => {
  if (activity === 'Running') {
    return distance ? t('Log {distance} run · {minutes} min', { distance, minutes }) : t('Log {minutes} min run', { minutes });
  }
  if (activity === 'Cycling') {
    return distance ? t('Log {distance} ride · {minutes} min', { distance, minutes }) : t('Log {minutes} min ride', { minutes });
  }
  return distance ? t('Log {distance} walk · {minutes} min', { distance, minutes }) : t('Log {minutes} min walk', { minutes });
};

export function OutsidePanel({
  events,
  stepGoal,
  distanceUnit,
  onQuickCardio,
  routines = [],
  onDeleteRoutine,
  renderCardio,
  onSyncSteps,
  onOpenLog,
}: OutsidePanelProps) {
  const task = useRoomTask();
  const steps = useMemo(() => stepsForDay(getEventsForDay([...events], new Date())), [events]);
  const usual = useMemo(() => quickCardioDefaults(events), [events]);
  const [activity, setActivity] = useState<CardioName>(usual.activity);
  const [minutes, setMinutes] = useState(usual.minutes);
  /** Typed in their unit; optional. */
  const [distance, setDistance] = useState<number | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  /** The log a "does that look right?" was asked about: the same one again goes through. */
  const asked = useRef('');
  const [editingRoutines, setEditingRoutines] = useState(false);
  const recent = useMemo(
    () =>
      events
        .filter(
          (event): event is HealthEvent<WorkoutMetadata> =>
            event.type === 'WORKOUT' && (event.metadata as WorkoutMetadata).workoutType === 'cardio',
        )
        .slice(0, 4),
    [events],
  );
  const toKm = (typed: number) => Math.round(typed * (distanceUnit === 'mi' ? KM_PER_MILE : 1) * 1000) / 1000;
  const distanceKm = distance && distance > 0 ? toKm(distance) : undefined;

  const log = async () => {
    // The same check the full logger makes: a typo is refused or questioned
    // here, before it becomes a record.
    const check = checkWorkout({ exercises: [createExercise(activity, 'cardio')], durationMinutes: minutes, distanceKm });
    const key = `${activity}|${minutes}|${distanceKm ?? ''}`;
    if (check?.level === 'refuse') {
      setProblem(check.message);
      return;
    }
    if (check && asked.current !== key) {
      asked.current = key;
      setProblem(t('{message} Tap again to log it anyway.', { message: check.message }));
      return;
    }
    asked.current = '';
    setProblem(null);
    Keyboard.dismiss();
    await onQuickCardio(activity, minutes, distanceKm);
    setDistance(undefined);
  };

  return (
    <PanelPage>
      <PanelHeader
        title={t('Outside')}
        status={
          stepGoal > 0
            ? t('{steps} / {goal} steps', { steps: steps.toLocaleString(formatLocale()), goal: stepGoal.toLocaleString(formatLocale()) })
            : t('{count} steps', { count: steps.toLocaleString(formatLocale()) })
        }
      />
      {stepGoal > 0 ? <PanelProgress fraction={steps / stepGoal} /> : null}
      {routines.length > 0 ? (
        <PanelSection
          title={t('Routines')}
          action={onDeleteRoutine ? { label: editingRoutines ? t('Done') : t('Edit'), onPress: () => setEditingRoutines((on) => !on) } : undefined}
        >
          {routines.map((routine) => {
            const routineActivity = routine.exercises[0]!.name;
            return (
              <PanelRow
                key={routine.id}
                title={t(routine.name)}
                detail={[
                  // "Walking · Walk" says it twice.
                  routine.name.toLowerCase() === routineActivity.toLowerCase() ? null : activityLabel(routineActivity),
                  routine.minutes ? t('{minutes} min', { minutes: routine.minutes }) : null,
                  routine.distanceKm ? distanceLabel(routine.distanceKm, distanceUnit) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                action={
                  editingRoutines
                    ? { label: t('Delete {name}', { name: t(routine.name) }), text: t('Delete'), onPress: () => onDeleteRoutine?.(routine.id) }
                    : {
                        label: t('Log {name} now', { name: t(routine.name) }),
                        text: tx('button: log this now', 'Log'),
                        onPress: () => onQuickCardio(routineActivity, routine.minutes ?? 30, routine.distanceKm, routine.name),
                      }
                }
              />
            );
          })}
        </PanelSection>
      ) : null}
      <PanelSection title={t('Quick log')}>
        <PanelChips options={CARDIO} value={activity} onChange={setActivity} />
        <PanelChips
          options={usual.options.map((option) => ({ value: option, label: t('{minutes} min', { minutes: option }) }))}
          value={minutes}
          onChange={setMinutes}
        />
        <PanelNumberField
          label={t('Distance')}
          hint={t('optional')}
          unit={distanceUnit}
          value={distance}
          onValue={(next) => {
            setDistance(next);
            setProblem(null);
          }}
        />
        {problem ? <PanelEmpty>{problem}</PanelEmpty> : null}
        <PanelButtonRow>
          <PanelButton
            label={quickLogLabel(activity, minutes, distanceKm ? distanceLabel(distanceKm, distanceUnit) : undefined)}
            primary
            onPress={log}
          />
        </PanelButtonRow>
      </PanelSection>
      <PanelButtonRow>
        <PanelButton label={t('Other activity')} onPress={() => task.open((close) => renderCardio(close), { keepBars: true })} />
        {onSyncSteps ? <PanelButton label={t('Sync steps')} onPress={onSyncSteps} style={{ flex: 0, flexBasis: 120 }} /> : null}
      </PanelButtonRow>
      <PanelSection title={t('Recent')}>
        {recent.length === 0 ? (
          <PanelEmpty>{t('No runs, walks or rides logged yet.')}</PanelEmpty>
        ) : (
          recent.map((workout) => {
            const name = workout.metadata.name || msg('Cardio');
            const exercises = workout.metadata.exercises ?? [];
            // One activity logged by distance: the same again is one tap.
            const again = exercises.length === 1 && exercises[0]!.distance ? exercises[0]!.name : null;
            return (
              <PanelRow
                key={workout.id}
                title={t(name)}
                detail={[
                  whenLabel(workout.occurredAt),
                  workout.metadata.distanceKm ? distanceLabel(workout.metadata.distanceKm, distanceUnit) : null,
                  t('{minutes} min', { minutes: workout.metadata.durationMinutes }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={() => onOpenLog(workout)}
                action={
                  again
                    ? {
                        label: t('Log {name} again', { name: t(name) }),
                        onPress: () => onQuickCardio(again, workout.metadata.durationMinutes, workout.metadata.distanceKm, name),
                      }
                    : undefined
                }
              />
            );
          })
        )}
      </PanelSection>
    </PanelPage>
  );
}

// --- Mind ------------------------------------------------------------------

export interface MindPanelProps {
  events: readonly HealthEvent[];
  routes: MindRouteHandlers;
  /**
   * Opens a game that plays in the mind gym (maths, recall, word garden,
   * countries) on its page. Every game is a page of its own, never played in
   * the room's page: the ones with a whole screen go through `routes`.
   */
  openStage: (stage: MindStage) => void;
}

export function MindPanel({ events, routes, openStage }: MindPanelProps) {
  const play = (game: MindGameEntry) => {
    const { launch } = game;
    if (launch.kind === 'stage') openStage(launch.stage);
    else routes[launch.route]?.();
  };
  const { played, games, featured } = useMemo(() => {
    const day = new Date();
    const playedToday = mindGamesPlayedOn([...events], day);
    const available = availableMindGames(MIND_GAMES, routes);
    return { played: playedToday, games: available, featured: featuredMindGame(available, toDateKey(day), playedToday) };
  }, [events, routes]);
  const playedCount = games.filter((game) => isMindGamePlayed(game, played)).length;
  return (
    <PanelPage>
      <PanelHeader
        title={t('Mind')}
        status={playedCount > 0 ? t('{played} of {total} played today', { played: playedCount, total: games.length }) : t('Nothing played today')}
      />
      {featured ? (
        <PanelButtonRow>
          <PanelButton label={t('Play {game} · {minutes} min', { game: featured.name, minutes: featured.minutes })} primary onPress={() => play(featured)} />
        </PanelButtonRow>
      ) : null}
      <PanelSection title={t('All games')}>
        {games
          .filter((game) => game !== featured)
          .map((game) => (
            <PanelRow
              key={game.id}
              title={game.name}
              detail={`${t('{minutes} min', { minutes: game.minutes })} · ${game.blurb}`}
              done={isMindGamePlayed(game, played)}
              onPress={() => play(game)}
            />
          ))}
      </PanelSection>
    </PanelPage>
  );
}
