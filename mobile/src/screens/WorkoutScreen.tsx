import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as Haptics from 'expo-haptics';
import { Alert, Animated, Pressable, ScrollView, Text, TextInput, View, Platform, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { SheetPage } from '../components/SheetPage';
import {
  type WeightUnit,
  type WorkoutExercise,
  type WorkoutMetadata,
  type WorkoutTemplate,
  type WorkoutSet,
  addSet,
  calculateWorkoutStats,
  sessionMinutes,
  tracksDistance,
  createExercise,
  errorMessage,
  exerciseFromHistory,
  exerciseLibrary,
  MAX_TEMPLATE_NAME,
  addRestDay,
  moveScheduleDay,
  reconcileSchedule,
  removeScheduleDay,
  addRoutineDay,
  restartSchedule,
  resolvedDays,
  scheduleDayId,
  scheduleDayOn,
  stepToday,
  type ScheduleDay,
  type TrainingSchedule,
  sessionFromTemplate,
  templateError,
  templateFromSession,
  updateSet,
} from '@vitto/core';
import { KM_PER_MILE, checkWorkout, convertWeightValue, exerciseBest, exerciseSessions, setRecord, type HealthEvent } from '@vitto/core';
import { FitText } from '../components/FitText';
import { CloseButton, ErrorText, NumberInput, PressableScale, PrimaryButton, TextButton, haptic, DoneTextInput, Mark, useKeyboardFade } from '../components/ui';
import { LogProgress, logHaptic } from '../components/logKit';
import { whenLabel } from '../petWorld/whenLabel';
import { DragList } from '../components/DragList';
import { DEFAULT_REST_MS, RestTimer, type Rest } from '../components/RestTimer';
import { TIER_COLOR } from '../components/StrengthMap';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { startRest, stopRest } from '../services/restTimer';
import { clearWorkoutDraft, loadWorkoutDraft, saveWorkoutDraft } from '../services/workoutDraft';
import { colors, fonts, layout, text, themedStyles } from '../theme';
import { RoomWindowSlot, useRoomKeyboardGap } from '../petWorld/RoomPanel';

interface Props {
  onFinish: (metadata: WorkoutMetadata) => Promise<void>;
  /**
   * Shown as the Gym's own page, under the room's window (see RoomPanel), not
   * as a sheet over the app: no title or × on the page you start from (there
   * is nothing to close), the week's bar scrolls with the page, and past
   * sessions are listed to do again.
   */
  inRoom?: boolean;
  /** Opens a past workout to fix it: a tap on one of the Gym page's recent sessions. */
  onOpenPast?: (event: HealthEvent) => void;
  /**
   * The Outside room's logger: keeps the activity, with the time and distance
   * typed on its card, as a routine that then logs in one tap. Resolves to why
   * it could not be saved, or null.
   */
  onSaveOutdoorRoutine?: (name: string, activity: string, minutes: number, distanceKm?: number) => Promise<string | null>;
  /**
   * The Gym room: a workout is its own page. Once one starts here (a routine,
   * a repeat, exercises picked) it is kept as the session in progress and
   * handed to that page; the room keeps the routines and a Resume card.
   */
  onOpenSession?: () => void;
  /** The session page opened from the room: it picks the session up without saying so. */
  quietResume?: boolean;
  onClose: () => void;
  /**
   * The lifter's own unit, from their profile. Labels every weight field and
   * stamps each set, so a workout logged in pounds still reads as pounds later.
   * Defaults to kg only so a caller that has no profile still type-checks.
   */
  weightUnit?: WeightUnit;
  /**
   * Saved routines. Tapping one loads its exercises with last time's sets
   * pre-filled; finishing writes today's numbers back into it. Optional so a
   * caller without storage (tests, web) still renders the plain screen.
   */
  templates?: readonly WorkoutTemplate[];
  onSaveTemplate?: (template: WorkoutTemplate) => Promise<void> | void;
  onDeleteTemplate?: (id: string) => Promise<void> | void;
  /** The training rotation; with it, the screen opens on what today is for. */
  schedule?: TrainingSchedule | null;
  onSaveSchedule?: (schedule: TrainingSchedule | null) => Promise<void> | void;
  /**
   * Open straight on the runs-and-rides list (the Outdoors room's "Log a
   * run"): only the activities logged by distance, and one tap picks it.
   */
  startWithCardio?: boolean;
  /**
   * What each exercise had the last time it was logged (lastSetsByExercise).
   * An exercise picked by hand starts on those sets, and every set shows them
   * as "Previous", the way a routine already does.
   */
  lastSets?: ReadonlyMap<string, WorkoutSet[]>;
  /**
   * A logged workout opened to fix it: the screen starts on its exercises and
   * Finish becomes Save changes (`onSaveEdit`), with no draft, routine or PR
   * along the way. Its XP and place in the day stay as they were.
   */
  editing?: WorkoutMetadata;
  onSaveEdit?: (metadata: WorkoutMetadata) => Promise<void>;
  /**
   * Past workouts, for a record the moment a set beats it (exerciseBest) and
   * each exercise's history a tap on its name away (exerciseSessions).
   */
  history?: readonly HealthEvent[];
  /**
   * How many days a week they said they train (the profile's
   * trainingDaysPerWeek): the bar at the top counts the last seven days
   * against it, the same rolling week the dumbbell trophy counts. 0 or unset
   * leaves the bar out rather than inventing a target.
   */
  weeklyWorkoutGoal?: number;
}

/** "60 × 8", or "8" for bodyweight: what a set's Previous cell reads. */
export const previousLabel = (previous: WorkoutSet['previous'], bodyweight?: boolean): string => {
  if (!previous) return '—';
  return bodyweight || !previous.weight ? String(previous.reps) : `${previous.weight} × ${previous.reps}`;
};

/** How long a new record's banner stays up. */
const RECORD_BANNER_MS = 3500;
/** A record's colour: the Gold strength rank's (StrengthMap). */
const RECORD_GOLD = TIER_COLOR[2]!;

/** The unnamed session. Saving a routine still called this asks for a real name. */
const DEFAULT_SESSION_NAME = 'Strength session';
/** As long as a meal or reminder name may be: past it, the title is a wall of text everywhere it shows. */
const MAX_SESSION_NAME = 60;
/** Below this width the set row's fixed columns tighten (see `narrow`). */
const NARROW_SCREEN = 360;

/** A run's −/+ steps: five minutes, half a kilometre or mile. Typing is still there for anything finer. */
const MINUTE_STEP = 5;
const DISTANCE_STEP = 0.5;

/**
 * Distinct days with a workout in the last seven, today included, and whether
 * today is one of them: what the bar at the top counts. Calendar days stepped
 * with setDate, so a clock change does not shift the window by an hour.
 */
export const workoutDaysThisWeek = (history: readonly HealthEvent[], now = new Date()): { days: number; today: boolean } => {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  from.setDate(from.getDate() - 6);
  const days = new Set<string>();
  for (const event of history) {
    if (event.type !== 'WORKOUT') continue;
    const at = new Date(event.occurredAt);
    if (at >= from && at <= now) days.add(at.toDateString());
  }
  return { days: days.size, today: days.has(now.toDateString()) };
};

/** Two decimals at most, so 0.1 + 0.2 never reads as 0.30000000000000004. */
const tidy = (value: number) => Math.round(value * 100) / 100;

/**
 * −, the value, + for a run's minutes or distance, always on show the way the
 * meal page's portions are. The field is the screen's own string state, so a
 * blank one stays blank while it is retyped; − stops at nothing rather than
 * going below it.
 */
function CardioStepper({
  value,
  onChange,
  step,
  decimal,
  noun,
  accessibilityLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  step: number;
  decimal?: boolean;
  /** "minutes", "miles": what the − and + say they change. */
  noun: string;
  accessibilityLabel: string;
}) {
  const current = Number(value) || 0;
  const atZero = current <= 0;
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Fewer ${noun}`}
        accessibilityState={{ disabled: atZero }}
        disabled={atZero}
        hitSlop={6}
        onPress={() => {
          haptic('select');
          const next = tidy(Math.max(0, current - step));
          onChange(next > 0 ? String(next) : '');
        }}
        style={[styles.stepButton, atZero && styles.stepButtonOff]}
      >
        <Mark kind="minus" size={10} color={colors.inkSoft} />
      </Pressable>
      <DoneTextInput
        style={[layout.input, styles.cardioInput]}
        value={value}
        onChangeText={(next) => onChange(decimal ? next.replace(/[^0-9.,]/g, '').replace(',', '.') : next.replace(/[^0-9]/g, ''))}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        placeholder={decimal ? '0.0' : '0'}
        placeholderTextColor={colors.faint}
        selectTextOnFocus
        accessibilityLabel={accessibilityLabel}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`More ${noun}`}
        hitSlop={6}
        onPress={() => {
          haptic('select');
          onChange(String(tidy(current + step)));
        }}
        style={styles.stepButton}
      >
        <Mark kind="plus" size={10} color={colors.inkSoft} />
      </Pressable>
    </View>
  );
}

/**
 * Two jobs on one builder.
 *
 * `log` is a workout you are doing now: sets get ticked, minutes and notes
 * matter, and it ends in "Finish workout".
 *
 * `routine` is a workout you are DEFINING for later — "Push", "Pull", "Legs".
 * The same exercise/set editor, minus everything that only makes sense while
 * training (the done circles, the duration, the notes, the volume readout), and
 * it ends in "Save routine". Building a routine used to mean logging a fake
 * session and saving it afterwards, which is a strange thing to ask of someone
 * who just wants to write down their split.
 */
type Mode = 'log' | 'routine';

export function WorkoutScreen({
  onFinish,
  onClose,
  weightUnit = 'kg',
  templates = [],
  onSaveTemplate,
  onDeleteTemplate,
  startWithCardio = false,
  lastSets,
  editing,
  onSaveEdit,
  history = [],
  schedule = null,
  onSaveSchedule,
  weeklyWorkoutGoal = 0,
  inRoom = false,
  onOpenPast,
  onSaveOutdoorRoutine,
  onOpenSession,
  quietResume = false,
}: Props) {
  const [mode, setMode] = useState<Mode>('log');
  const [name, setName] = useState(editing?.name ?? DEFAULT_SESSION_NAME);
  /** A run's own minutes, typed on its card. Everything else is timed (see sessionMinutes). */
  const [duration, setDuration] = useState(editing?.workoutType === 'cardio' ? String(editing.durationMinutes ?? '') : '');
  /** Distance for a cardio session, typed in the lifter's own unit (mi for lb, km for kg). */
  const [distance, setDistance] = useState(
    editing?.distanceKm ? String(Math.round((editing.distanceKm / (weightUnit === 'lb' ? KM_PER_MILE : 1)) * 100) / 100) : '',
  );
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [exercises, setExercises] = useState<WorkoutExercise[]>(editing?.exercises ?? []);
  /** When the first exercise went in: the session's clock, for timing it without asking. */
  const [startedAt, setStartedAt] = useState<number | null>(null);
  useEffect(() => {
    if (exercises.length > 0 && startedAt === null) setStartedAt(Date.now());
    else if (exercises.length === 0 && startedAt !== null) setStartedAt(null);
  }, [exercises.length, startedAt]);
  /**
   * Sets ticked off as they are done. Only progress and the rest timer: every
   * set on the list still counts whether ticked or not (see newSet in
   * @vitto/core), so finishing without ticking anything loses nothing.
   */
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
  // A phone under 360pt wide leaves the weight and reps fields too little room
  // for "102.5" beside the fixed columns, so those columns tighten there.
  const narrow = useWindowDimensions().width < NARROW_SCREEN;
  const [rest, setRest] = useState<Rest | null>(null);
  /** How long a rest runs, nudged by −15/+15 and kept for the next one. */
  const [restLength, setRestLength] = useState(DEFAULT_REST_MS);
  // The alert and the Island's countdown go when the screen does.
  useEffect(() => () => void stopRest(), []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The routine this session was started from, so finishing can update it. */
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [managingRoutines, setManagingRoutines] = useState(false);
  /** The Gym page's split, being set up: which routines, in what order, with rest days. */
  const [editingSplit, setEditingSplit] = useState(false);
  /** A rotation day being dragged: the page holds still under the finger. */
  const [draggingDay, setDraggingDay] = useState(false);
  const [routineMessage, setRoutineMessage] = useState<string | null>(null);
  /** In routine mode: which routine is being edited, or null for a new one. */
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [routineName, setRoutineName] = useState('');

  /** The exercise picker overlay. */
  const [picking, setPicking] = useState(startWithCardio);
  const keyboardHeight = useKeyboardHeight();
  // On iPhone nothing is laid out again for the keyboard: it slides over the
  // page (and over Finish, which nobody presses mid-number) and the scroller
  // takes iOS's own keyboard insets, which move with the keys and keep the
  // field being typed in above them. Lifting the footer over the keyboard
  // instead left room for one set and a half, and trailed behind the keys.
  const rides = Platform.OS === 'ios';
  // How far this screen's foot is from the screen's (the room's bars, in a room).
  const keyboardGap = useRoomKeyboardGap();
  const underKeys = useKeyboardFade();
  /** The picker as a "what did you do?" list of runs, rides and swims, until something is picked. */
  const [cardioOnly, setCardioOnly] = useState(startWithCardio);
  const [search, setSearch] = useState('');

  // ---- the draft ------------------------------------------------------------
  // The session in progress is kept on the phone as it changes and picked up
  // again on the next open, so a killed app does not lose it (see
  // services/workoutDraft). Nothing is written until the old draft has been
  // read, or the empty screen would overwrite it.
  // An edit is not a session in progress: no draft read, none written.
  const [draftChecked, setDraftChecked] = useState(startWithCardio || Boolean(editing));
  /**
   * Whether this screen is the session kept on the phone. The Outside room's
   * logger is not: a walk is logged in one go, and saving it as the draft
   * replaced a gym session left half done (and then showed up in the Gym as
   * "picked up where you left off").
   */
  // The Gym room hands its sessions to their own page, which keeps the draft.
  const handsOff = inRoom && Boolean(onOpenSession) && !startWithCardio && !editing;
  const keepsDraft = !startWithCardio && !editing && !handsOff;
  /** In the Gym room: the session waiting on its page, by name, if one is. */
  const [waiting, setWaiting] = useState<string | null>(null);
  useEffect(() => {
    if (startWithCardio || editing) return undefined;
    let cancelled = false;
    void loadWorkoutDraft().then((draft) => {
      if (cancelled) return;
      if (draft && handsOff) {
        // Its page has it: the room only offers to go back to it.
        if (draft.exercises.length > 0) setWaiting(draft.name);
      } else if (draft) {
        setName(draft.name);
        setExercises(draft.exercises);
        setNotes(draft.notes);
        setDuration(draft.duration);
        setDistance(draft.distance);
        setStartedAt(draft.startedAt);
        setActiveTemplateId(draft.activeTemplateId);
        setTicked(new Set(draft.ticked));
        setRestLength(draft.restLength);
        if (draft.rest && draft.rest.endsAt > Date.now()) {
          setRest(draft.rest);
          void startRest(draft.rest.endsAt, draft.rest.startedAt, draft.rest.label);
        }
        if (!quietResume) setRoutineMessage('Picked up where you left off.');
      }
      setDraftChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [startWithCardio]);

  const routineMode = mode === 'routine';

  // Notes sit at the foot of the session, so the keyboard opens over them:
  // once it has made room, bring the end of the page up to meet it.
  const bodyRef = useRef<ScrollView>(null);
  const revealEnd = () => setTimeout(() => bodyRef.current?.scrollToEnd({ animated: true }), 300);

  /**
   * An exercise picked by hand while logging starts blank: the sets are there
   * (as many as last time) with last time in the Last column, a tap away, but
   * nothing typed in for you, so what is logged is what was lifted. A routine
   * still starts on its numbers, and one being defined on a starting point.
   */
  const blankForLogging = (exercise: WorkoutExercise): WorkoutExercise =>
    mode === 'log' && !exercise.distance
      ? { ...exercise, sets: exercise.sets.map((set) => ({ ...set, reps: 0, weight: undefined })) }
      : exercise;

  const addExercise = (exerciseName: string, muscle: string, bodyweight: boolean) => {
    // Once each: more of the same exercise is more sets on its card.
    if (exercises.some((item) => item.name === exerciseName)) return;
    // A session that starts with a walk or a run is that, not a "Strength
    // session" (the name a tester saw on their walk).
    if (exercises.length === 0 && name === DEFAULT_SESSION_NAME && tracksDistance(exerciseName)) setName(exerciseName);
    setExercises((current) => [
      ...current,
      blankForLogging(exerciseFromHistory(createExercise(exerciseName, muscle, bodyweight, weightUnit), lastSets?.get(exerciseName))),
    ]);
    setError(null);
    // A run is one thing: picking it is the whole choice, so straight to its
    // distance and minutes, and the session takes its name.
    if (cardioOnly) {
      setCardioOnly(false);
      setPicking(false);
      if (name === DEFAULT_SESSION_NAME) setName(exerciseName);
    }
  };

  const removeExercise = (id: string) =>
    setExercises((current) => current.filter((item) => item.id !== id));

  /** Undo from the picker: a second tap on an added exercise takes it out. */
  const removeExerciseNamed = (exerciseName: string) =>
    setExercises((current) => current.filter((item) => item.name !== exerciseName));

  const patchSet = (exerciseId: string, setId: string, patch: Parameters<typeof updateSet>[2]) =>
    setExercises((current) =>
      current.map((item) => (item.id === exerciseId ? updateSet(item, setId, patch) : item)),
    );

  useEffect(() => {
    if (!draftChecked || mode !== 'log' || !keepsDraft) return undefined;
    if (exercises.length === 0) {
      void clearWorkoutDraft();
      return undefined;
    }
    const timer = setTimeout(() => {
      void saveWorkoutDraft({
        name,
        exercises,
        notes,
        duration,
        distance,
        startedAt,
        activeTemplateId,
        ticked: [...ticked],
        rest,
        restLength,
        savedAt: Date.now(),
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [draftChecked, mode, name, exercises, notes, duration, distance, startedAt, activeTemplateId, ticked, rest, restLength]);

  /**
   * The × with a session under way asks first: keep it for later (the draft
   * stays and reopens), or throw it away. With nothing entered it just closes.
   */
  const requestClose = () => {
    // Editing: the logged workout stays as it was unless Save changes is used.
    if (editing) {
      const changed =
        JSON.stringify(exercises) !== JSON.stringify(editing.exercises ?? []) || name !== (editing.name ?? DEFAULT_SESSION_NAME) || notes !== (editing.notes ?? '');
      if (!changed || Platform.OS === 'web') {
        onClose();
        return;
      }
      Alert.alert('Discard your changes?', 'The workout stays as it was logged.', [
        { text: 'Discard', style: 'destructive', onPress: onClose },
        { text: 'Keep editing', style: 'cancel' },
      ]);
      return;
    }
    // Nothing kept for later here: closing is just closing.
    if (mode !== 'log' || exercises.length === 0 || !keepsDraft) {
      onClose();
      return;
    }
    // react-native-web has no buttons on Alert; there the draft is simply kept.
    if (Platform.OS === 'web') {
      onClose();
      return;
    }
    Alert.alert('Leave this workout?', 'Keep it to finish later, or discard it.', [
      { text: 'Keep for later', onPress: onClose },
      {
        text: 'Discard workout',
        style: 'destructive',
        onPress: () => {
          void clearWorkoutDraft();
          onClose();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  /**
   * Back to "What are you training today?" from a session, to pick a
   * different routine. Clears the session; asks first when that would lose
   * something (a ticked set, or exercises picked by hand rather than a
   * routine loaded as it was).
   */
  const backToStart = () => {
    const reset = () => {
      void stopRest();
      setRest(null);
      setTicked(new Set());
      setExercises([]);
      setActiveTemplateId(null);
      setName(DEFAULT_SESSION_NAME);
      setNotes('');
      setDuration('');
      setDistance('');
      setError(null);
      setRoutineMessage(null);
      if (keepsDraft) void clearWorkoutDraft();
    };
    if ((ticked.size === 0 && activeTemplateId) || Platform.OS === 'web') {
      reset();
      return;
    }
    Alert.alert('Start over?', 'This clears the workout so you can pick another.', [
      { text: 'Start over', style: 'destructive', onPress: reset },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  /**
   * Back from an activity's card to the list it was picked from (the Outside
   * room's logger): there is no workout start page behind a walk.
   */
  const backToActivities = () => {
    setExercises([]);
    setName(DEFAULT_SESSION_NAME);
    setDuration('');
    setDistance('');
    setError(null);
    setSearch('');
    setCardioOnly(true);
    setPicking(true);
  };
  // The same when its one activity is taken off the card.
  useEffect(() => {
    if (inRoom && startWithCardio && exercises.length === 0 && !picking) {
      setCardioOnly(true);
      setPicking(true);
    }
  }, [inRoom, startWithCardio, exercises.length, picking]);

  // The Gym room: a session that has begun here (a routine loaded, a repeat,
  // exercises picked and the list closed) goes to its own page, kept as the
  // session in progress so that page opens on it. The room goes back to its
  // start, with the session's Resume card.
  useEffect(() => {
    if (!handsOff || mode !== 'log' || exercises.length === 0 || picking) return;
    const handed = { name, exercises, activeTemplateId };
    setExercises([]);
    setName(DEFAULT_SESSION_NAME);
    setActiveTemplateId(null);
    setWaiting(handed.name);
    void saveWorkoutDraft({
      name: handed.name,
      exercises: handed.exercises,
      notes: '',
      duration: '',
      distance: '',
      startedAt: Date.now(),
      activeTemplateId: handed.activeTemplateId,
      ticked: [],
      rest: null,
      restLength,
      savedAt: Date.now(),
    }).then(() => onOpenSession?.());
  }, [handsOff, mode, exercises, picking]);

  // ---- ticking and resting -------------------------------------------------

  const beginRest = (length: number, label: string) => {
    const startedAt = Date.now();
    const next = { startedAt, endsAt: startedAt + length, label };
    setRest(next);
    void startRest(next.endsAt, startedAt, label);
  };

  const endRest = () => {
    setRest(null);
    void stopRest();
  };

  /** Ticks a set off and starts the rest after it; a second tap unticks it. */
  // Records set today: the sets that earned one, and the moment's banner.
  const [recordSets, setRecordSets] = useState<ReadonlySet<string>>(() => new Set());
  const [recordBanner, setRecordBanner] = useState<{ text: string; key: string } | null>(null);
  useEffect(() => {
    if (!recordBanner) return undefined;
    const timer = setTimeout(() => setRecordBanner(null), RECORD_BANNER_MS);
    return () => clearTimeout(timer);
  }, [recordBanner]);
  /** The exercise whose past sessions are open over the page. */
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const sessionsOf = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof exerciseSessions>>();
    return (name: string) => {
      if (!cache.has(name)) cache.set(name, exerciseSessions(history as HealthEvent[], name));
      return cache.get(name)!;
    };
  }, [history]);
  const pastSessions = (name: string) => !editing && sessionsOf(name).length > 0;

  /**
   * A ticked set that beats everything before it (the logged history and the
   * sets already ticked today) is a record, said there and then, as the
   * lifting apps do: a buzz, a banner, a trophy on the row.
   */
  const checkRecord = (exercise: WorkoutExercise, setId: string) => {
    if (editing) return;
    const set = exercise.sets.find((candidate) => candidate.id === setId);
    if (!set) return;
    const earlierToday = exercise.sets.filter((candidate) => candidate.id !== setId && ticked.has(candidate.id));
    const today = exerciseBest(
      [{ id: 'today', userId: '', type: 'WORKOUT', source: 'manual', occurredAt: '', metadata: { workoutType: 'strength', durationMinutes: 0, exercises: [{ ...exercise, sets: earlierToday.map((candidate) => ({ ...candidate, completed: true })) }] } }],
      exercise.name,
    );
    const before = exerciseBest(history as HealthEvent[], exercise.name);
    const best = before && today
      ? { weightKg: Math.max(before.weightKg, today.weightKg), oneRepMaxKg: Math.max(before.oneRepMaxKg, today.oneRepMaxKg) }
      : before;
    const record = setRecord({ ...set, unit: set.unit ?? weightUnit }, best);
    if (!record) return;
    if (Platform.OS !== 'web') void Haptics.notificationAsync?.(Haptics.NotificationFeedbackType.Success)?.catch(() => undefined);
    setRecordSets((current) => new Set(current).add(setId));
    const unit = set.unit ?? weightUnit;
    setRecordBanner({
      key: setId,
      text: record === 'weight' ? `New heaviest ${exercise.name}: ${set.weight} ${unit}` : `New best ${exercise.name}: ${set.weight} ${unit} × ${set.reps}`,
    });
  };

  const toggleTick = (exercise: WorkoutExercise, setId: string) => {
    const on = !ticked.has(setId);
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(setId);
      else next.delete(setId);
      return next;
    });
    haptic('press');
    if (on) {
      beginRest(restLength, exercise.name);
      checkRecord(exercise, setId);
    } else if (recordSets.has(setId)) {
      setRecordSets((current) => {
        const next = new Set(current);
        next.delete(setId);
        return next;
      });
    }
  };

  const adjustRest = (delta: number) => {
    if (!rest) return;
    haptic('select');
    const endsAt = Math.max(Date.now() + 5_000, rest.endsAt + delta);
    setRestLength((length) => Math.max(15_000, length + delta));
    const next = { ...rest, endsAt };
    setRest(next);
    void startRest(endsAt, rest.startedAt, rest.label);
  };

  /** Fills a set in with what it was last time: one tap instead of two fields. */
  const fillFromPrevious = (exerciseId: string, set: WorkoutSet) => {
    if (!set.previous) return;
    haptic('select');
    patchSet(exerciseId, set.id, { reps: set.previous.reps, weight: set.previous.weight });
  };

  // ---- routines -----------------------------------------------------------

  /**
   * In the Gym room a new start replaces the workout waiting on its own page,
   * so one tap on the wrong Start used to wipe a session half done. With one
   * waiting, ask first: back to it, or replace it. Read from the saved draft,
   * not `waiting`, so a workout finished since doesn't raise a stale question.
   */
  const unlessUnderWay = (label: string, begin: () => void) => {
    if (!handsOff) {
      begin();
      return;
    }
    void loadWorkoutDraft().then((draft) => {
      if (!draft || draft.exercises.length === 0) {
        setWaiting(null);
        begin();
        return;
      }
      const current = draft.name || DEFAULT_SESSION_NAME;
      Alert.alert(`${current} is in progress`, `Starting ${label} replaces it.`, [
        { text: `Resume ${current}`, style: 'cancel', onPress: () => onOpenSession?.() },
        { text: `Start ${label}`, style: 'destructive', onPress: begin },
      ]);
    });
  };

  const loadRoutine = (template: WorkoutTemplate) =>
    unlessUnderWay(template.name, () => beginRoutine(template));

  const beginRoutine = (template: WorkoutTemplate) => {
    setName(template.name);
    setExercises(sessionFromTemplate(template));
    setActiveTemplateId(template.id);
    setError(null);
    setRoutineMessage(null);
  };

  /**
   * A past session done again: its exercises and numbers, as a fresh session.
   * Not a routine: nothing is written back to one.
   */
  const repeatSession = (past: HealthEvent<WorkoutMetadata>) =>
    unlessUnderWay(past.metadata.name || DEFAULT_SESSION_NAME, () => beginRepeat(past));

  const beginRepeat = (past: HealthEvent<WorkoutMetadata>) => {
    const pastName = past.metadata.name || DEFAULT_SESSION_NAME;
    setName(pastName);
    setExercises(sessionFromTemplate(templateFromSession(pastName, past.metadata.exercises ?? [])));
    setActiveTemplateId(null);
    setError(null);
    setRoutineMessage(null);
  };

  /**
   * Whether the routine being defined was opened from the start page (new, or
   * one being edited) rather than made out of the session under way. Cancel
   * then goes back to the start page: it used to leave the routine's
   * exercises behind as a session nobody started.
   */
  const routineFromStart = useRef(false);

  /** Start defining a routine from scratch — the "make a routine" entry point. */
  const startNewRoutine = () => {
    routineFromStart.current = true;
    setMode('routine');
    setEditingTemplateId(null);
    setRoutineName('');
    setExercises([]);
    setRoutineMessage(null);
    setError(null);
    setManagingRoutines(false);
  };

  const startEditingRoutine = (template: WorkoutTemplate) => {
    routineFromStart.current = true;
    setMode('routine');
    setEditingTemplateId(template.id);
    setRoutineName(template.name);
    setExercises(sessionFromTemplate(template));
    setRoutineMessage(null);
    setError(null);
    setManagingRoutines(false);
  };

  /** Turn the session you just built into a routine, keeping you in log mode. */
  const saveSessionAsRoutine = () => {
    routineFromStart.current = false;
    setMode('routine');
    setEditingTemplateId(activeTemplateId);
    // A session still called "Strength session" has no name worth keeping, so
    // the field opens empty against its placeholder rather than pre-filled.
    setRoutineName(name === DEFAULT_SESSION_NAME ? '' : name);
    setRoutineMessage(null);
  };

  const leaveRoutineMode = () => {
    if (routineFromStart.current) setExercises([]);
    routineFromStart.current = false;
    setMode('log');
    setEditingTemplateId(null);
    setRoutineMessage(null);
    setError(null);
  };

  const saveRoutine = async () => {
    if (!onSaveTemplate) return;
    const problem = templateError(routineName, exercises, templates, editingTemplateId ?? undefined);
    if (problem) {
      setRoutineMessage(problem);
      return;
    }
    setSaving(true);
    try {
      const template = templateFromSession(routineName, exercises, editingTemplateId ?? undefined);
      await onSaveTemplate(template);
      // Back to logging, with the new routine loaded and ready to train.
      setMode('log');
      setEditingTemplateId(null);
      setActiveTemplateId(template.id);
      setName(template.name);
      setExercises(sessionFromTemplate(template));
      setRoutineMessage(`Saved "${template.name}" — one tap next time.`);
    } catch (cause) {
      setRoutineMessage(errorMessage(cause, 'Could not save that routine.'));
    } finally {
      setSaving(false);
    }
  };

  // ---- logging ------------------------------------------------------------

  // Each set keeps the unit it was lifted in (one pulled from history may be in
  // kg while the person now uses lb), so totals are added up in today's unit:
  // summed raw, kg sets were shown as that many "lb".
  const inShownUnit = (list: WorkoutExercise[]): WorkoutExercise[] =>
    list.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) =>
        set.weight !== undefined && set.unit && set.unit !== weightUnit
          ? { ...set, weight: convertWeightValue(set.weight, set.unit, weightUnit), unit: weightUnit }
          : set,
      ),
    }));
  // A set left blank (no reps typed) is not a set: it neither counts nor is saved.
  const filled = exercises.map((exercise) =>
    exercise.distance ? exercise : { ...exercise, sets: exercise.sets.filter((set) => set.reps > 0) },
  );
  const setStats = calculateWorkoutStats(inShownUnit(filled), 1);
  const stats = {
    ...setStats,
    durationMinutes: sessionMinutes({
      cardioMinutes: Number(duration) || undefined,
      completedSets: setStats.completedSets,
      elapsedMs: startedAt === null ? null : Date.now() - startedAt,
    }),
  };
  const cardio = stats.muscleGroups.includes('cardio');
  // Only a session that actually goes somewhere gets a distance box: a round of
  // burpees is cardio and has none.
  const goesSomewhere = exercises.some((exercise) => exercise.distance);
  const distanceUnit = weightUnit === 'lb' ? 'mi' : 'km';
  const distanceKm = goesSomewhere && Number(distance) > 0
    ? Math.round(Number(distance) * (distanceUnit === 'mi' ? KM_PER_MILE : 1) * 1000) / 1000
    : undefined;

  /**
   * The footer line, from whatever this session actually has. A run has no sets,
   * reps or volume to report, and printing three zeroes for one read as the log
   * having failed to record it.
   */
  const summary = [
    ...(stats.completedSets > 0
      ? [
          `${stats.completedSets} ${stats.completedSets === 1 ? 'set' : 'sets'}`,
          `${stats.totalReps} reps`,
          ...(stats.totalVolume > 0 ? [`${Math.round(stats.totalVolume).toLocaleString('en-US')} ${weightUnit} volume`] : []),
        ]
      : []),
    ...(goesSomewhere && Number(distance) > 0 ? [`${Number(distance)} ${distanceUnit}`] : []),
    // A walk with no time yet has no length to show; "1 min" read as logged.
    goesSomewhere && stats.completedSets === 0 && !(Number(duration) > 0) ? 'Add the time' : `${stats.durationMinutes} min`,
  ].join(' · ');

  // The week so far, and the day this session would add if today has none
  // yet: a second workout on the same day is not another training day.
  const week = useMemo(() => workoutDaysThisWeek(history), [history]);
  const weekAdding = !editing && !routineMode && exercises.length > 0 && !week.today ? 1 : 0;

  const finish = async (confirmed = false) => {
    if (!exercises.length) {
      setError('Add an exercise first.');
      return;
    }
    const unfilled = filled.find((exercise) => !exercise.distance && exercise.sets.length === 0);
    if (unfilled && !editing) {
      setError(`Fill in the reps for ${unfilled.name}, or take it off.`);
      return;
    }
    // With no sets there is no clock to fall back on: an empty time would log
    // the walk as a single minute.
    if (goesSomewhere && stats.completedSets === 0 && !(Number(duration) > 0)) {
      setError('Add how many minutes it took.');
      return;
    }
    // A typo is refused or questioned here, before it becomes a record.
    const check = checkWorkout({ exercises: filled, durationMinutes: stats.durationMinutes, distanceKm });
    if (check?.level === 'refuse') {
      setError(check.message);
      return;
    }
    if (check && !confirmed && !(Platform.OS === 'web' && globalThis.confirm?.(check.message))) {
      if (Platform.OS === 'web') return;
      Alert.alert(check.message, 'Check the numbers before this goes in your log.', [
        { text: 'Fix it', style: 'cancel' },
        { text: 'Log it', onPress: () => void finish(true) },
      ]);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing && onSaveEdit) {
        // A lifting session's clock ran when it was logged; opening it again
        // later must not re-time it from now. A run keeps its typed minutes.
        const minutes = goesSomewhere ? stats.durationMinutes : editing.durationMinutes;
        await onSaveEdit({
          ...editing,
          workoutType: cardio ? 'cardio' : 'strength',
          durationMinutes: minutes,
          ...(distanceKm !== undefined ? { distanceKm } : {}),
          name,
          exercises,
          notes,
          stats: { ...stats, durationMinutes: minutes },
        });
        logHaptic();
        onClose();
        return;
      }
      await onFinish({
        workoutType: cardio ? 'cardio' : 'strength',
        durationMinutes: stats.durationMinutes,
        ...(distanceKm !== undefined ? { distanceKm } : {}),
        name,
        exercises: filled,
        notes,
        stats,
      });
      // The log has landed: felt now, not after the routine write-back below.
      logHaptic();
      // A routine remembers what you did last: today's ticked sets become next
      // time's starting point. Best effort — the workout itself is already saved.
      if (activeTemplateId && onSaveTemplate) {
        try {
          await onSaveTemplate(templateFromSession(name, filled, activeTemplateId));
        } catch {
          // The routine keeps last week's numbers; nothing about the workout is lost.
        }
      }
      if (keepsDraft) await clearWorkoutDraft();
      onClose();
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save workout.'));
    } finally {
      setSaving(false);
    }
  };

  const query = search.trim().toLowerCase();
  // Best match first: a name that starts with the search, then a word in it
  // that does, then the rest. "run" put Crunches above Running.
  const rank = (exerciseName: string) => {
    const lower = exerciseName.toLowerCase();
    if (lower.startsWith(query)) return 0;
    if (lower.split(/[\s-]+/).some((word) => word.startsWith(query))) return 1;
    return 2;
  };
  const matches = exerciseLibrary
    .filter(([exerciseName, muscle, kind]) => {
      if (cardioOnly && kind !== 'distance') return false;
      if (!query) return true;
      return exerciseName.toLowerCase().includes(query) || muscle.toLowerCase().includes(query);
    })
    .map((entry, index) => ({ entry, index, rank: query ? rank(entry[0]) : 0 }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ entry }) => entry);

  /** Whether this exercise is already in the session — shown on its picker row. */
  const isAdded = (exerciseName: string) => exercises.some((exercise) => exercise.name === exerciseName);

  const empty = exercises.length === 0;

  // The split: the routines chosen for the loop, in order, with any rest days,
  // one day per calendar day (trainingSchedule.ts). Not every routine is in it.
  // Squared with the routines here too, so a deleted one is gone at once.
  const rotationSchedule = onSaveSchedule ? reconcileSchedule(schedule, templates).schedule : null;
  const rotation = scheduleDayOn(rotationSchedule, templates);
  const rotationDays: ScheduleDay[] = rotationSchedule ? resolvedDays(rotationSchedule, templates) : [];
  const inSplit = (id: string) => rotationDays.some((day) => day.kind === 'routine' && day.templateId === id);
  // The sheet lists the split, then the routines kept out of it.
  const sheetDays: ScheduleDay[] = [
    ...rotationDays,
    ...templates.filter((template) => !inSplit(template.id)).map((template): ScheduleDay => ({ kind: 'routine', templateId: template.id })),
  ];
  const saveRotation = (next: TrainingSchedule | null) => {
    haptic('select');
    void onSaveSchedule?.(next);
  };

  /** In Edit, beside each day: remove, and the grip to drag it by. */
  const dayControls = (handle: ReactNode, label: string, onRemove: (() => void) | null) =>
    managingRoutines ? (
      <>
        {onRemove ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${label}`} hitSlop={8} onPress={onRemove} style={styles.routineDelete}>
            <Mark kind="cross" size={11} color={colors.danger} />
          </Pressable>
        ) : null}
        {handle}
      </>
    ) : null;

  /** Which day of the rotation a row is, over its name; today's in coral. */
  const dayLabel = (index: number) =>
    rotationSchedule && index < rotationDays.length ? (
      <Text style={[styles.dayLabel, rotation?.index === index && styles.dayLabelToday]}>
        {rotation?.index === index ? `DAY ${index + 1} · TODAY` : `DAY ${index + 1}`}
      </Text>
    ) : null;

  /** One day of the rotation as a full-width row: a routine (what is in it, what a tap does), or a rest day. */
  const dayRow = (day: ScheduleDay, index: number, handle: ReactNode, lifted = false) => {
    const isToday = rotationSchedule !== null && rotation?.index === index;
    if (day.kind === 'rest') {
      return (
        <View key={scheduleDayId(day)} style={styles.routineRowWrap}>
          <View
            style={[styles.routineRow, styles.restRow, isToday && styles.routineRowToday, lifted && styles.rowLifted]}
            testID={`rest-day-${index}`}
          >
            <View style={{ flex: 1 }}>
              {dayLabel(index)}
              <Text style={[styles.routineName, styles.restName]}>Rest day</Text>
            </View>
          </View>
          {dayControls(handle, `rest day ${index + 1}`, () => rotationSchedule && saveRotation(removeScheduleDay(rotationSchedule, templates, scheduleDayId(day))))}
        </View>
      );
    }
    const template = templates.find((candidate) => candidate.id === day.templateId);
    if (!template) return null;
    const preview = template.exercises.slice(0, 3).map((exercise) => exercise.name).join(', ');
    const more = template.exercises.length - 3;
    return (
      <View key={template.id} style={styles.routineRowWrap}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={managingRoutines ? `Edit routine ${template.name}` : `Load routine ${template.name}`}
          onPress={() => (managingRoutines ? startEditingRoutine(template) : loadRoutine(template))}
          style={({ pressed }) => [styles.routineRow, isToday && styles.routineRowToday, lifted && styles.rowLifted, pressed && styles.pressed]}
        >
          <View style={{ flex: 1 }}>
            {dayLabel(index)}
            <Text style={styles.routineName} numberOfLines={1}>{template.name}</Text>
            <Text style={styles.routinePreview} numberOfLines={1}>
              {preview}
              {more > 0 ? ` +${more} more` : ''}
            </Text>
          </View>
          {/* A light pill, not a coral one: today's card above holds the one loud Start. */}
          <View style={styles.goPill}>
            <Text style={styles.goPillLabel} numberOfLines={1}>{managingRoutines ? 'Edit' : 'Start'}</Text>
          </View>
        </PressableScale>
        {dayControls(
          handle,
          `routine ${template.name}`,
          onDeleteTemplate
            ? () => {
                void onDeleteTemplate(template.id);
                if (activeTemplateId === template.id) setActiveTemplateId(null);
              }
            : null,
        )}
      </View>
    );
  };

  /**
   * "Create a routine", or, with a rotation to put it in, a rest day: the card
   * opens on the two choices in place. Not a native action sheet: one cut off
   * by a reload can leave iOS holding a sheet nobody sees, and every later one
   * then fails to show, so the card seemed dead.
   */
  const [choosingDay, setChoosingDay] = useState(false);
  const createDay = () => {
    if (!rotationSchedule) {
      startNewRoutine();
      return;
    }
    haptic('select');
    setChoosingDay((open) => {
      // The card is the last thing on the page: bring the choices into view.
      if (!open) setTimeout(() => bodyRef.current?.scrollToEnd({ animated: true }), 50);
      return !open;
    });
  };

  const openPicker = () =>
    unlessUnderWay('a new workout', () => {
      setSearch('');
      setCardioOnly(false);
      setPicking(true);
    });

  /**
   * With today's routine on its card, Start there is the one loud button and
   * picking by hand steps back to a quiet row; without one, picking is the way in.
   */
  const pickIsMain = !rotation?.template;

  /**
   * The bold figure on an exercise's card, right-aligned like the meal page's
   * calories: its volume, or for bodyweight work its reps. Not while defining a
   * routine (no volume readout there) or for a run, whose card is its numbers.
   */
  const exerciseFigure = (exercise: WorkoutExercise): { value: string; unit: string } | null => {
    if (routineMode || exercise.distance) return null;
    const own = calculateWorkoutStats(inShownUnit([exercise]), 1);
    if (own.totalVolume > 0) return { value: Math.round(own.totalVolume).toLocaleString('en-US'), unit: weightUnit };
    if (own.totalReps > 0) return { value: own.totalReps.toLocaleString('en-US'), unit: own.totalReps === 1 ? 'rep' : 'reps' };
    return null;
  };

  /** The week against the days they said they train, and the day this session would add. */
  const weekBar = (style?: StyleProp<ViewStyle>) => (
    <LogProgress
      style={style}
      items={[
        {
          label: 'Last 7 days',
          value: week.days,
          goal: weeklyWorkoutGoal,
          adding: weekAdding,
          unit: weeklyWorkoutGoal === 1 ? 'workout' : 'workouts',
        },
      ]}
    />
  );

  // The Gym page's recent sessions: the last few lifts, each a tap from doing again.
  const recentSessions = onOpenPast
    ? history
        .filter(
          (event): event is HealthEvent<WorkoutMetadata> =>
            event.type === 'WORKOUT' && (event.metadata as WorkoutMetadata).workoutType !== 'cardio',
        )
        .slice(0, 3)
    : [];

  /** Naming the activity on the card to keep it as a routine: null while not. */
  const [outdoorName, setOutdoorName] = useState<string | null>(null);
  const [savingOutdoor, setSavingOutdoor] = useState(false);
  const outdoorActivity = startWithCardio && exercises.length === 1 && exercises[0]!.distance ? exercises[0]! : null;
  const canSaveOutdoor = inRoom && Boolean(onSaveOutdoorRoutine) && outdoorActivity !== null;
  const saveOutdoor = async () => {
    if (!onSaveOutdoorRoutine || !outdoorActivity || outdoorName === null) return;
    const minutes = Number(duration);
    if (!(minutes > 0)) {
      setError('Add the time first: the routine logs it each time.');
      return;
    }
    setSavingOutdoor(true);
    try {
      const refused = await onSaveOutdoorRoutine(outdoorName, outdoorActivity.name, Math.round(minutes), distanceKm);
      if (refused) {
        setError(refused);
        return;
      }
      // Back to the Outside page, where the new routine is waiting with its Log.
      onClose();
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save that routine.'));
    } finally {
      setSavingOutdoor(false);
    }
  };

  const recentBlock = recentSessions.length > 0 ? (
    <View style={styles.routines} testID="recent-sessions">
      <View style={styles.routinesHead}>
        <Text style={styles.sectionLabel}>RECENT</Text>
      </View>
      <View style={styles.recentList}>
        {recentSessions.map((past) => {
          const pastName = past.metadata.name || 'Workout';
          const minutes = past.metadata.stats?.durationMinutes ?? past.metadata.durationMinutes;
          const canRepeat = (past.metadata.exercises ?? []).length > 0;
          return (
            <PressableScale
              key={past.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${pastName}, ${whenLabel(past.occurredAt)}`}
              onPress={() => onOpenPast?.(past)}
              style={({ pressed }) => [styles.routineRow, pressed && styles.pressed]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.routineName} numberOfLines={1}>{pastName}</Text>
                <Text style={styles.routinePreview} numberOfLines={1}>
                  {`${whenLabel(past.occurredAt)} · ${minutes} min`}
                </Text>
              </View>
              {canRepeat ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Do ${pastName} again`}
                  hitSlop={8}
                  onPress={() => repeatSession(past)}
                  style={({ pressed }) => [styles.goPill, pressed && styles.pressed]}
                >
                  <Text style={styles.goPillLabel} numberOfLines={1}>Repeat</Text>
                </Pressable>
              ) : null}
            </PressableScale>
          );
        })}
      </View>
    </View>
  ) : null;

  /**
   * The Gym page's start, once there are routines: short, so the whole of it
   * shows under the room's window without hunting.
   *
   * Routines and the split are two things. A routine is one day's workout
   * (Push); the split is which routines you do, in order, with rest days
   * (Push, Pull, Legs, Rest). So the page has today's card (from the split),
   * the routines (each a Start), and the split as one line with its own Edit.
   * Editing either is a mode of its own, out of the way of training.
   */
  const todayTemplate = rotation?.template ?? null;
  // Outside's one-tap routines (a walk with its time) are kept there.
  const gymRoutines = templates.filter((template) => !(template.exercises.length === 1 && template.exercises[0]!.distance && template.minutes));
  const listed = gymRoutines.filter((template) => template.id !== todayTemplate?.id || managingRoutines);
  const splitLine = rotationDays
    .map((day) => (day.kind === 'rest' ? 'Rest' : (templates.find((template) => template.id === day.templateId)?.name ?? '')))
    .join(' → ');
  const notInSplit = gymRoutines.filter((template) => !inSplit(template.id));

  /** One day of the split while editing it: its place, its name, take it out, and the grip. */
  const splitRow = (day: ScheduleDay, index: number, handle: ReactNode, lifted = false) => {
    const isToday = rotation?.index === index;
    const name = day.kind === 'rest' ? 'Rest day' : (templates.find((template) => template.id === day.templateId)?.name ?? 'Routine');
    return (
      <View key={scheduleDayId(day)} style={styles.routineRowWrap}>
        <View style={[styles.routineRow, styles.routineRowRoom, isToday && styles.routineRowToday, lifted && styles.rowLifted]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>{isToday ? `DAY ${index + 1} · TODAY` : `DAY ${index + 1}`}</Text>
            <Text style={[styles.routineName, day.kind === 'rest' && styles.restName]} numberOfLines={1}>{name}</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Take ${name} out of the split`}
          hitSlop={8}
          onPress={() => rotationSchedule && saveRotation(removeScheduleDay(rotationSchedule, templates, scheduleDayId(day)))}
          style={styles.routineDelete}
        >
          <Mark kind="cross" size={11} color={colors.danger} />
        </Pressable>
        {handle}
      </View>
    );
  };

  const roomHub =
    inRoom && !startWithCardio && onSaveTemplate && templates.length > 0 ? (
      editingSplit ? (
        // ---- the split, being set up
        <>
          <View style={[styles.roomListHead, { marginTop: 0 }]}>
            <Text style={styles.sectionLabel}>YOUR SPLIT</Text>
            <TextButton label="Done" onPress={() => setEditingSplit(false)} tone="coral" />
          </View>
          {rotationDays.length > 0 ? (
            <DragList
              items={rotationDays}
              keyOf={scheduleDayId}
              labelOf={(day) =>
                day.kind === 'rest' ? 'rest day' : (templates.find((template) => template.id === day.templateId)?.name ?? 'routine')
              }
              renderItem={splitRow}
              enabled={rotationSchedule !== null}
              onDragging={setDraggingDay}
              onMove={(from, to) => {
                const moved = rotationDays[from];
                if (rotationSchedule && moved) saveRotation(moveScheduleDay(rotationSchedule, templates, scheduleDayId(moved), to));
              }}
            />
          ) : (
            <Text style={styles.splitHint}>
              Pick the routines you rotate through, in order. Each day the next one is today's, and a rest day is a day off.
            </Text>
          )}
          <Text style={[styles.sectionLabel, { marginTop: 16, marginBottom: 6 }]}>ADD A DAY</Text>
          <View style={styles.addDayChips}>
            {notInSplit.map((template) => (
              <Pressable
                key={template.id}
                accessibilityRole="button"
                accessibilityLabel={`Add ${template.name} to the split`}
                onPress={() => saveRotation(addRoutineDay(rotationSchedule, templates, template.id))}
                style={({ pressed }) => [styles.addDayChip, pressed && styles.pressed]}
              >
                <Text style={styles.addDayChipLabel} numberOfLines={1}>{`+ ${template.name}`}</Text>
              </Pressable>
            ))}
            {rotationSchedule ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add a rest day to the split"
                onPress={() => saveRotation(addRestDay(rotationSchedule, templates))}
                style={({ pressed }) => [styles.addDayChip, styles.addDayChipRest, pressed && styles.pressed]}
                testID="add-rest-day"
              >
                <Text style={[styles.addDayChipLabel, styles.addDayChipRestLabel]}>+ Rest day</Text>
              </Pressable>
            ) : null}
          </View>
          {notInSplit.length === 0 && !rotationSchedule ? (
            <Text style={styles.splitHint}>Make a routine first: it is one day of the split.</Text>
          ) : null}
          {rotationSchedule && rotation && rotation.length > 1 ? (
            <View style={styles.roomRestart}>
              <TextButton label="Restart from day 1" onPress={() => saveRotation(restartSchedule(rotationSchedule, templates))} />
            </View>
          ) : null}
        </>
      ) : (
        <>
          {/* ---- today, from the split */}
          {rotation ? (
            <View style={[styles.todayCard, styles.todayCardRoom]} testID="rotation-today">
              <View style={styles.todayHeadRoom}>
                <Text style={styles.todayKicker}>{`TODAY · DAY ${rotation.index + 1} OF ${rotation.length}`}</Text>
                {rotationSchedule && rotation.length > 1 ? (
                  <View style={styles.dayNudge}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Previous day"
                      hitSlop={8}
                      onPress={() => saveRotation(stepToday(rotationSchedule, templates, -1))}
                      style={({ pressed }) => [styles.dayNudgeButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.dayNudgeLabel}>‹</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Next day"
                      hitSlop={8}
                      onPress={() => saveRotation(stepToday(rotationSchedule, templates, 1))}
                      style={({ pressed }) => [styles.dayNudgeButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.dayNudgeLabel}>›</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              {todayTemplate ? (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Start ${todayTemplate.name}, today's routine`}
                  onPress={() => loadRoutine(todayTemplate)}
                  style={({ pressed }) => [styles.todayMain, styles.todayMainRoom, pressed && styles.pressed]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.todayName} numberOfLines={1}>{todayTemplate.name}</Text>
                    <Text style={styles.routinePreview} numberOfLines={1}>
                      {todayTemplate.exercises.map((exercise) => exercise.name).join(', ')}
                    </Text>
                  </View>
                  <View style={styles.todayStart}>
                    <Text style={styles.todayStartLabel} numberOfLines={1}>Start</Text>
                  </View>
                </PressableScale>
              ) : (
                <View style={[styles.todayMain, styles.todayMainRoom]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.todayName}>Rest day</Text>
                    <Text style={styles.routinePreview} numberOfLines={1}>Nothing due. You can still train below.</Text>
                  </View>
                </View>
              )}
            </View>
          ) : null}

          {/* ---- the routines: one day's workout each */}
          {listed.length > 0 || managingRoutines ? (
            <>
              <View style={[styles.roomListHead, !rotation && { marginTop: 0 }]}>
                <Text style={styles.sectionLabel}>{managingRoutines ? 'EDIT ROUTINES' : todayTemplate ? 'OTHER ROUTINES' : 'ROUTINES'}</Text>
                {onDeleteTemplate ? (
                  <TextButton
                    label={managingRoutines ? 'Done' : 'Edit'}
                    onPress={() => setManagingRoutines((current) => !current)}
                    tone="coral"
                  />
                ) : null}
              </View>
              <View style={styles.recentList}>
                {listed.map((template) => (
                  <View key={template.id} style={styles.routineRowWrap}>
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={managingRoutines ? `Edit routine ${template.name}` : `Load routine ${template.name}`}
                      onPress={() => (managingRoutines ? startEditingRoutine(template) : loadRoutine(template))}
                      style={({ pressed }) => [styles.routineRow, styles.routineRowRoom, pressed && styles.pressed]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.routineName} numberOfLines={1}>{template.name}</Text>
                        <Text style={styles.routinePreview} numberOfLines={1}>
                          {template.exercises.map((exercise) => exercise.name).join(', ')}
                        </Text>
                      </View>
                      <View style={styles.goPill}>
                        <Text style={styles.goPillLabel} numberOfLines={1}>{managingRoutines ? 'Edit' : 'Start'}</Text>
                      </View>
                    </PressableScale>
                    {managingRoutines && onDeleteTemplate ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete routine ${template.name}`}
                        hitSlop={8}
                        onPress={() => {
                          void onDeleteTemplate(template.id);
                          if (activeTemplateId === template.id) setActiveTemplateId(null);
                        }}
                        style={styles.routineDelete}
                      >
                        <Mark kind="cross" size={11} color={colors.danger} />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <View style={[styles.roomButtons, { marginTop: 12 }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pick exercises"
              onPress={openPicker}
              style={({ pressed }) => [styles.roomButton, pressed && styles.pressed]}
            >
              <Text style={styles.roomButtonLabel} numberOfLines={1}>Pick exercises</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New routine"
              onPress={startNewRoutine}
              style={({ pressed }) => [styles.roomButton, pressed && styles.pressed]}
              testID="add-routine"
            >
              <Text style={styles.roomButtonLabel} numberOfLines={1}>+ New routine</Text>
            </Pressable>
          </View>

          {/* ---- the split: one line, and its own Edit */}
          {onSaveSchedule && !managingRoutines ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={rotationSchedule ? `Your split: ${splitLine}. Edit it` : 'Set up a split'}
              onPress={() => setEditingSplit(true)}
              style={({ pressed }) => [styles.splitRow, pressed && styles.pressed]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionLabel}>SPLIT</Text>
                <Text style={styles.splitLine} numberOfLines={1}>
                  {rotationSchedule ? splitLine : 'Rotate routines, like Push → Pull → Legs'}
                </Text>
              </View>
              <Text style={styles.splitEdit}>{rotationSchedule ? 'Edit' : 'Set up'}</Text>
            </PressableScale>
          ) : null}

          {managingRoutines ? null : recentBlock}

          {!managingRoutines && weeklyWorkoutGoal > 0 ? (
            <Text style={styles.roomWeek}>
              {`${week.days} of ${weeklyWorkoutGoal} ${weeklyWorkoutGoal === 1 ? 'workout' : 'workouts'} in the last 7 days`}
            </Text>
          ) : null}
        </>
      )
    ) : null;

  return (
    <SheetPage onBackPress={requestClose}>
      <View style={[styles.sheet, inRoom && styles.sheetInRoom]}>
        {/* In the room the window above is the heading. What is left is one
            line: a routine's name is the field you type it in, a session's
            sits beside the way back, and the start page has none. */}
        {inRoom ? (
          routineMode ? (
            <View style={styles.roomBar}>
              <TextInput
                style={[layout.input, styles.roomNameInput]}
                value={routineName}
                onChangeText={setRoutineName}
                placeholder="Routine name (Push, Legs...)"
                placeholderTextColor={colors.faint}
                accessibilityLabel="Routine name"
                maxLength={MAX_TEMPLATE_NAME}
                autoFocus={!editingTemplateId}
                returnKeyType="done"
              />
              <TextButton label="Cancel" onPress={leaveRoutineMode} tone="coral" />
            </View>
          ) : !empty ? (
            <View style={styles.roomBar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={startWithCardio ? 'Back to the activities' : 'Back to all workouts'}
                onPress={startWithCardio ? backToActivities : backToStart}
                hitSlop={8}
                style={({ pressed }) => [styles.roomBack, pressed && styles.pressed]}
                testID="workout-back"
              >
                <Text style={styles.backToStartLabel}>‹ Back</Text>
              </Pressable>
              <Text style={styles.roomTitle} numberOfLines={1}>{name || 'Workout'}</Text>
              {/* Outside, the logger sits over the room's page: × puts it away. */}
              {startWithCardio ? <CloseButton onPress={requestClose} /> : null}
            </View>
          ) : null
        ) : (
          <View style={styles.header}>
            {/* Flexed, so a long title at large text wraps instead of pushing × off the sheet. */}
            <View style={{ flex: 1 }}>
              {/* With a session under way, the way back to picking one. */}
              {!routineMode && !editing && exercises.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to all workouts"
                  onPress={backToStart}
                  hitSlop={8}
                  style={styles.backToStart}
                  testID="workout-back"
                >
                  <Text style={styles.backToStartLabel}>‹ Back</Text>
                </Pressable>
              ) : null}
              {/* A routine's or session's own name can run long: two lines at most,
                  not a pixel-type wall pushing the whole sheet down. */}
              <Text
                style={styles.title}
                numberOfLines={(routineMode ? Boolean(routineName) : !editing && !empty) ? 2 : undefined}
              >
                {routineMode
                  ? editingTemplateId
                    ? routineName || 'Edit routine'
                    : routineName || 'New routine'
                  : editing
                    ? 'Edit workout'
                    : empty
                      ? 'What are you training?'
                      : name || 'Workout'}
              </Text>
            </View>
            {/* Cancel leaves the routine editor, not the sheet, so it stays a word. */}
            {routineMode ? (
              <TextButton label="Cancel" onPress={leaveRoutineMode} tone="coral" />
            ) : (
              <CloseButton onPress={requestClose} />
            )}
          </View>
        )}

        {/* The week against the days they said they train, and the day this
            session would add. Not while defining a routine or fixing an old
            workout: neither changes the count. */}
        {!routineMode && !editing && !inRoom ? weekBar() : null}

        {recordBanner ? (
          <View style={[styles.recordBanner, inRoom && { top: 8 }]} pointerEvents="none" accessibilityLiveRegion="assertive" testID="record-banner">
            <Text style={styles.recordKicker}>PERSONAL RECORD</Text>
            <Text style={styles.recordText}>{recordBanner.text}</Text>
          </View>
        ) : null}

        <ScrollView
          ref={bodyRef}
          scrollEnabled={!draggingDay}
          contentContainerStyle={[styles.body, inRoom && styles.bodyInRoom, inRoom && (routineMode || !empty) && styles.bodyInRoomWorking]}
          automaticallyAdjustKeyboardInsets={rides}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {inRoom ? <RoomWindowSlot spacing={14} /> : null}
          {routineMode && !inRoom ? (
            <>
              <Text style={styles.sectionLabel}>ROUTINE NAME</Text>
              <TextInput
                style={[layout.input, styles.field]}
                value={routineName}
                onChangeText={setRoutineName}
                placeholder="Push, Pull, Legs"
                placeholderTextColor={colors.faint}
                maxLength={MAX_TEMPLATE_NAME}
                autoFocus={!editingTemplateId}
              />
              <Text style={styles.sectionHint}>
                Add the exercises you do on this day. The weights and reps are a starting point:
                each time you train it, they update to what you actually did.
              </Text>
            </>
          ) : null}

          {routineMessage && !routineMode ? <Text style={styles.routineMessage}>{routineMessage}</Text> : null}

          {/* A workout under way on its own page: the way back to it leads. */}
          {handsOff && waiting && !routineMode ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`Resume ${waiting}`}
              onPress={() => onOpenSession?.()}
              style={({ pressed }) => [styles.startCard, styles.resumeCard, pressed && styles.pressed]}
              testID="resume-workout"
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.startTitle} numberOfLines={1}>{`Resume ${waiting}`}</Text>
                <Text style={styles.startHint}>A workout in progress</Text>
              </View>
              <Text style={styles.startArrow}>→</Text>
            </PressableScale>
          ) : null}

          {/* Nothing added yet: the whole screen is one question, how to start. */}
          {!routineMode && empty && roomHub ? roomHub : null}
          {!routineMode && empty && !roomHub ? (
            <>
              {/* Their rotation's answer, first: today's routine, or a rest day. */}
              {rotation ? (
                <View style={styles.todayCard} testID="rotation-today">
                  <Text style={styles.todayKicker}>{`TODAY · DAY ${rotation.index + 1} OF ${rotation.length}`}</Text>
                  {rotation.template ? (
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={`Start ${rotation.template.name}, today's routine`}
                      onPress={() => loadRoutine(rotation.template!)}
                      style={({ pressed }) => [styles.todayMain, pressed && styles.pressed]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.todayName} numberOfLines={1}>{rotation.template.name}</Text>
                        <Text style={styles.routinePreview} numberOfLines={2}>
                          {rotation.template.exercises.map((exercise) => exercise.name).join(', ')}
                        </Text>
                      </View>
                      <View style={styles.todayStart}>
                        <Text style={styles.todayStartLabel} numberOfLines={1}>Start</Text>
                      </View>
                    </PressableScale>
                  ) : (
                    <View style={styles.todayMain}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.todayName}>Rest day</Text>
                        <Text style={styles.routinePreview}>Nothing due today. You can still train below.</Text>
                      </View>
                    </View>
                  )}
                  {/* Out of step after time away: nudge today, or start the loop over. */}
                  {rotationSchedule ? (
                    <View style={styles.todayLinks}>
                      <Pressable accessibilityRole="button" accessibilityLabel="Previous day" hitSlop={6} onPress={() => saveRotation(stepToday(rotationSchedule, templates, -1))} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                        <Text style={styles.chipLabel}>‹ Previous</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel="Restart from day 1" hitSlop={6} onPress={() => saveRotation(restartSchedule(rotationSchedule, templates))} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                        <Text style={styles.chipLabel}>Restart from day 1</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel="Next day" hitSlop={6} onPress={() => saveRotation(stepToday(rotationSchedule, templates, 1))} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                        <Text style={styles.chipLabel}>Next ›</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <PressableScale
                accessibilityRole="button"
                // Each label is the words on the button, so Voice Control's
                // "tap Pick exercises" finds it.
                accessibilityLabel="Pick exercises"
                onPress={openPicker}
                style={({ pressed }) => [styles.startCard, !pickIsMain && styles.startCardQuiet, pressed && styles.pressed]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.startTitle, !pickIsMain && styles.startTitleQuiet]}>Pick exercises</Text>
                  <Text style={[styles.startHint, !pickIsMain && styles.startHintQuiet]}>
                    {pickIsMain
                      ? `Choose from ${exerciseLibrary.length} moves, then fill in your sets`
                      : `Something else today? Choose from ${exerciseLibrary.length} moves`}
                  </Text>
                </View>
                {pickIsMain ? (
                  <Text style={styles.startArrow}>→</Text>
                ) : (
                  <View style={styles.roundAdd}>
                    <Mark kind="plus" size={12} color={colors.coral} />
                  </View>
                )}
              </PressableScale>

              {onSaveTemplate ? (
                <View style={styles.routines}>
                  {templates.length > 0 ? (
                    <>
                      <View style={styles.routinesHead}>
                        <Text style={styles.sectionLabel}>{rotationSchedule ? 'YOUR SPLIT AND ROUTINES' : 'OR START A ROUTINE'}</Text>
                        {onDeleteTemplate ? (
                          <TextButton
                            label={managingRoutines ? 'Done' : 'Edit'}
                            onPress={() => setManagingRoutines((current) => !current)}
                            tone="coral"
                          />
                        ) : null}
                      </View>
                      <DragList
                        items={sheetDays}
                        keyOf={scheduleDayId}
                        labelOf={(day) =>
                          day.kind === 'rest' ? 'rest day' : (templates.find((template) => template.id === day.templateId)?.name ?? 'routine')
                        }
                        renderItem={dayRow}
                        enabled={managingRoutines && rotationSchedule !== null}
                        onDragging={setDraggingDay}
                        onMove={(from, to) => {
                          const moved = sheetDays[from];
                          if (rotationSchedule && moved && from < rotationDays.length && to < rotationDays.length) saveRotation(moveScheduleDay(rotationSchedule, templates, scheduleDayId(moved), to));
                        }}
                      />
                    </>
                  ) : null}

                  {/* The way to MAKE one. Always here, so building a routine never
                      means logging a session first. */}
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel="Create a routine"
                    onPress={createDay}
                    style={({ pressed }) => [styles.newRoutine, pressed && styles.pressed]}
                  >
                    <Text style={styles.newRoutineTitle}>{choosingDay ? 'Add to your rotation' : '+ Create a routine'}</Text>
                    {choosingDay && rotationSchedule ? (
                      <View style={styles.newChoices}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="New routine"
                          onPress={() => {
                            setChoosingDay(false);
                            startNewRoutine();
                          }}
                          style={({ pressed }) => [styles.newChoice, styles.newChoiceMain, pressed && styles.pressed]}
                          testID="add-routine"
                        >
                          <Text style={[styles.newChoiceText, styles.newChoiceMainText]}>New routine</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Rest day"
                          onPress={() => {
                            setChoosingDay(false);
                            saveRotation(addRestDay(rotationSchedule, templates));
                          }}
                          style={({ pressed }) => [styles.newChoice, pressed && styles.pressed]}
                          testID="add-rest-day"
                        >
                          <Text style={styles.newChoiceText}>Rest day</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Text style={styles.newRoutineHint}>
                        {templates.length === 0
                          ? 'Same workout every week? Set it up once, then start it in one tap.'
                          : 'Another day of your split, or a rest day.'}
                      </Text>
                    )}
                  </PressableScale>
                </View>
              ) : null}

              {recentBlock}
            </>
          ) : null}

          {routineMode && empty ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Add exercises"
              onPress={openPicker}
              style={({ pressed }) => [styles.startCard, styles.routineStart, inRoom && styles.routineStartInRoom, pressed && styles.pressed]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.startTitle}>Add exercises</Text>
                <Text style={styles.startHint}>Pick everything you do on this day</Text>
              </View>
              <Text style={styles.startArrow}>→</Text>
            </PressableScale>
          ) : null}

          {exercises.map((exercise, position) => {
            const figure = exerciseFigure(exercise);
            return (
            <View key={exercise.id} style={styles.exercise}>
              <View style={styles.exerciseHead}>
                <Text style={styles.exerciseNumber} numberOfLines={1}>{position + 1}</Text>
                {/* The name opens its past sessions, once there are any. */}
                <Pressable
                  accessibilityRole={pastSessions(exercise.name) ? 'button' : undefined}
                  accessibilityHint={pastSessions(exercise.name) ? 'Shows past sessions' : undefined}
                  disabled={!pastSessions(exercise.name)}
                  onPress={() => setHistoryFor(exercise.name)}
                  style={({ pressed }) => [{ flex: 1 }, pressed && styles.pressed]}
                >
                  <Text style={styles.exerciseName} numberOfLines={2}>{exercise.name}</Text>
                  <Text style={styles.exerciseMuscle}>
                    {exercise.muscleGroup}
                    {pastSessions(exercise.name) ? <Text style={styles.exerciseHistoryLink}>{'  ·  History ›'}</Text> : null}
                  </Text>
                </Pressable>
                {figure ? (
                  <View style={styles.figureBox}>
                    <Text style={styles.figure} numberOfLines={1}>{figure.value}</Text>
                    <Text style={styles.figureUnit} numberOfLines={1}>{figure.unit}</Text>
                  </View>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${exercise.name}`}
                  hitSlop={8}
                  onPress={() => removeExercise(exercise.id)}
                  style={({ pressed }) => [styles.exerciseRemove, pressed && styles.pressed]}
                >
                  <Mark kind="cross" size={10} color={colors.muted} />
                </Pressable>
              </View>
              {exercise.distance ? (
                // A run, ride or swim: distance and time are its whole record,
                // so they are asked for right here on its card. Burpees and jump
                // rope are cardio too but go nowhere, so they keep the set table.
                routineMode ? (
                  <Text style={styles.cardioNote}>Distance and time are filled in each time you log it.</Text>
                ) : (
                  // Time first and on its own row: it is the one that matters
                  // (a session with no sets has no clock to fall back on).
                  // Distance is extra, and says so. Side by side, testers
                  // could not tell which of the two was required.
                  <View style={styles.cardioFields}>
                    <View style={styles.cardioRow}>
                      <View style={styles.cardioLabelBox}>
                        <Text style={styles.cardioLabel}>Time</Text>
                      </View>
                      <CardioStepper value={duration} onChange={setDuration} step={MINUTE_STEP} noun="minutes" accessibilityLabel="Minutes" />
                      <Text style={styles.cardioUnit} numberOfLines={1}>min</Text>
                    </View>
                    <View style={styles.cardioRow}>
                      <View style={styles.cardioLabelBox}>
                        {/* Beside the stepper on a 320pt phone this column is ~55pt: shrinks rather than breaking the word. */}
                        <FitText style={styles.cardioLabel} minScale={0.75}>Distance</FitText>
                        <Text style={styles.cardioOptional}>(optional)</Text>
                      </View>
                      <CardioStepper
                        decimal
                        value={distance}
                        onChange={setDistance}
                        step={DISTANCE_STEP}
                        noun={distanceUnit === 'mi' ? 'miles' : 'kilometres'}
                        accessibilityLabel={`Distance in ${distanceUnit === 'mi' ? 'miles' : 'kilometres'}, optional`}
                      />
                      <Text style={styles.cardioUnit} numberOfLines={1}>{distanceUnit}</Text>
                    </View>
                  </View>
                )
              ) : (
                <>
                  <View style={[styles.setHead, narrow && styles.setGapNarrow]}>
                    <Text style={[styles.setHeadLabel, styles.setIndex, narrow && styles.setIndexNarrow]}>SET</Text>
                    {exercise.sets.some((set) => set.previous) ? (
                      <Text style={[styles.setHeadLabel, styles.setPrevious, narrow && styles.setPreviousNarrow]}>LAST</Text>
                    ) : null}
                    <Text style={[styles.setHeadLabel, styles.setInputHead]}>
                      {exercise.bodyweight ? 'body' : weightUnit}
                    </Text>
                    <Text style={[styles.setHeadLabel, styles.setInputHead]}>reps</Text>
                    {/* Says what the circle under it does: a tap ticks the set and starts the rest timer. */}
                    {routineMode ? null : (
                      <Text style={[styles.setHeadLabel, styles.tickHead]} numberOfLines={1} accessible={false}>
                        REST
                      </Text>
                    )}
                    <View style={styles.setRemoveSlot} />
                  </View>
                  {exercise.sets.map((set, index) => (
                    <View key={set.id} style={[styles.setRow, narrow && styles.setGapNarrow, ticked.has(set.id) && styles.setRowDone]}>
                      <Text style={[styles.setIndex, styles.setIndexValue, narrow && styles.setIndexNarrow]}>{index + 1}</Text>
                      {exercise.sets.some((candidate) => candidate.previous) ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={set.previous ? `Use last time for set ${index + 1}: ${previousLabel(set.previous, exercise.bodyweight)}` : `No last time for set ${index + 1}`}
                          disabled={!set.previous}
                          hitSlop={4}
                          onPress={() => fillFromPrevious(exercise.id, set)}
                          style={({ pressed }) => [styles.setPrevious, narrow && styles.setPreviousNarrow, pressed && styles.pressed]}
                        >
                          {/* "102.5 × 12" is wider than the column: shrinks, never "102.5 × 1…". */}
                          <FitText style={styles.setPreviousValue} minScale={0.75}>
                            {previousLabel(set.previous, exercise.bodyweight)}
                          </FitText>
                        </Pressable>
                      ) : null}
                      {/* Decimal: 22.5 lb and 2.5 kg plates are ordinary. */}
                      {exercise.bodyweight ? (
                        <DoneTextInput
                          style={[layout.input, styles.setInput, narrow && styles.setInputNarrow, styles.setInputOff]}
                          editable={false}
                          value=""
                          placeholder="BW"
                          placeholderTextColor={colors.faint}
                          accessibilityLabel={`Set ${index + 1} weight`}
                        />
                      ) : (
                        <NumberInput
                          decimal
                          style={[layout.input, styles.setInput, narrow && styles.setInputNarrow]}
                          selectTextOnFocus
                          value={set.weight}
                          placeholder={weightUnit}
                          placeholderTextColor={colors.faint}
                          accessibilityLabel={`Set ${index + 1} weight`}
                          onValue={(value) => patchSet(exercise.id, set.id, { weight: value })}
                        />
                      )}
                      <NumberInput
                        style={[layout.input, styles.setInput, narrow && styles.setInputNarrow]}
                        selectTextOnFocus
                        value={set.reps > 0 ? set.reps : undefined}
                        placeholder="reps"
                        placeholderTextColor={colors.faint}
                        accessibilityLabel={`Set ${index + 1} reps`}
                        onValue={(value) => patchSet(exercise.id, set.id, { reps: value ?? 0 })}
                      />
                      {/* The tick is for the rest timer and your own place in
                          the session; the set counts either way. One you did not
                          do comes off with the − beside it. */}
                      {routineMode ? null : (
                        <Pressable
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: ticked.has(set.id) }}
                          accessibilityLabel={`Set ${index + 1} of ${exercise.name} done`}
                          hitSlop={7}
                          onPress={() => toggleTick(exercise, set.id)}
                          style={[styles.tickSlot, styles.tick, ticked.has(set.id) && styles.tickOn, recordSets.has(set.id) && styles.tickRecord]}
                          testID={`tick-${exercise.name}-${index + 1}`}
                        >
                          {ticked.has(set.id) ? <Mark kind="check" size={13} weight={2.2} color={colors.onCoral} /> : null}
                        </Pressable>
                      )}
                      {exercise.sets.length > 1 ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove set ${index + 1} of ${exercise.name}`}
                          hitSlop={8}
                          onPress={() =>
                            setExercises((current) =>
                              current.map((item) =>
                                item.id === exercise.id
                                  ? { ...item, sets: item.sets.filter((candidate) => candidate.id !== set.id) }
                                  : item,
                              ),
                            )
                          }
                          style={styles.setRemoveSlot}
                        >
                          <Mark kind="minus" size={12} color={colors.faint} />
                        </Pressable>
                      ) : (
                        <View style={styles.setRemoveSlot} />
                      )}
                    </View>
                  ))}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Add a set to ${exercise.name}`}
                    onPress={() => {
                      haptic('select');
                      setExercises((current) =>
                        current.map((item) => (item.id === exercise.id ? addSet(item, weightUnit) : item)),
                      );
                    }}
                    style={({ pressed }) => [styles.addSet, pressed && styles.pressed]}
                  >
                    <Text style={styles.addSetLabel}>+ Add set</Text>
                  </Pressable>
                </>
              )}
            </View>
            );
          })}

          {/* Outside: the activity with its time and distance can be kept as a
              routine, in place of adding more to it (a walk is one thing). */}
          {canSaveOutdoor ? (
            outdoorName === null ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Save as a routine"
                onPress={() => {
                  setError(null);
                  setOutdoorName('');
                }}
                style={({ pressed }) => [styles.addExercise, pressed && styles.pressed]}
              >
                <View style={styles.roundAdd}>
                  <Mark kind="plus" size={12} color={colors.coral} />
                </View>
                <Text style={styles.addExerciseLabel}>Save as a routine</Text>
              </PressableScale>
            ) : (
              <View style={[styles.addExercise, styles.outdoorSave]}>
                <TextInput
                  style={[layout.input, styles.outdoorName]}
                  value={outdoorName}
                  onChangeText={setOutdoorName}
                  placeholder="Name it (Morning walk...)"
                  placeholderTextColor={colors.faint}
                  accessibilityLabel="Routine name"
                  maxLength={MAX_TEMPLATE_NAME}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => void saveOutdoor()}
                />
                <View style={styles.outdoorActions}>
                  <TextButton label="Cancel" onPress={() => setOutdoorName(null)} />
                  <View style={{ flex: 1 }}>
                    <PrimaryButton label={savingOutdoor ? 'Saving...' : 'Save routine'} busy={savingOutdoor} onPress={() => void saveOutdoor()} />
                  </View>
                </View>
              </View>
            )
          ) : null}

          {!empty && !(inRoom && startWithCardio) ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Add another exercise"
              onPress={openPicker}
              style={({ pressed }) => [styles.addExercise, pressed && styles.pressed]}
            >
              <View style={styles.roundAdd}>
                <Mark kind="plus" size={12} color={colors.coral} />
              </View>
              <Text style={styles.addExerciseLabel}>Add another exercise</Text>
            </PressableScale>
          ) : null}

          {/* The session's details, once there is a session to describe. */}
          {!routineMode && !empty ? (
            <View style={styles.details}>
              <Text style={styles.sectionLabel}>DETAILS</Text>
              <View style={styles.detailsCard}>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  style={[layout.input, styles.cardInput]}
                  value={name}
                  onChangeText={setName}
                  maxLength={MAX_SESSION_NAME}
                  placeholder="Workout name"
                  placeholderTextColor={colors.faint}
                />

                <Text style={styles.fieldLabel}>Notes (optional)</Text>
                <TextInput
                  style={[layout.input, styles.cardInput, styles.notes]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="How did it feel?"
                  placeholderTextColor={colors.faint}
                  multiline
                  onFocus={revealEnd}
                />
              </View>

              {/* An ad-hoc session you decide afterwards is worth keeping. Not in
                  the Gym room: + New routine is right on its page, a routine
                  started there updates itself on Finish, and Outside keeps its
                  own Save as a routine on the activity's card. */}
              {onSaveTemplate && !inRoom ? (
                <View style={styles.sessionActions}>
                  <TextButton
                    label={activeTemplateId ? 'Update routine' : 'Save as routine'}
                    onPress={saveSessionAsRoutine}
                  />
                </View>
              ) : null}
            </View>
          ) : null}

          <ErrorText>{error}</ErrorText>
        </ScrollView>

        {/* Pinned, so the way out is always in the same place. Not before
            there is anything to finish: a button that cannot do anything yet. */}
        {routineMode || !empty || editing || rest ? (
        <Animated.View style={[styles.footer, inRoom && styles.footerInRoom, { opacity: underKeys }]}>
          {routineMode ? (
            <>
              {routineMessage ? <Text style={styles.routineError}>{routineMessage}</Text> : null}
              <PrimaryButton
                label={saving ? 'Saving...' : editingTemplateId ? 'Save changes' : 'Save routine'}
                busy={saving}
                onPress={() => void saveRoutine()}
              />
            </>
          ) : (
            <>
              {rest ? <RestTimer rest={rest} onAdjust={adjustRest} onSkip={endRest} onDone={endRest} /> : null}
              {inRoom ? (
                <View style={styles.footerRow}>
                  <Text style={[styles.stats, styles.statsInRoom]} numberOfLines={2}>
                    {empty ? 'Add an exercise to finish' : summary}
                  </Text>
                  <View style={styles.footerFinish}>
                    <PrimaryButton label={saving ? 'Saving...' : 'Finish'} busy={saving} disabled={empty} onPress={() => void finish()} />
                  </View>
                </View>
              ) : (
                <>
                  <Text style={styles.stats}>{empty ? 'Add an exercise to finish' : summary}</Text>
                  <PrimaryButton
                    label={saving ? 'Saving...' : editing ? 'Save changes' : 'Finish workout'}
                    busy={saving}
                    disabled={empty}
                    onPress={() => void finish()}
                  />
                </>
              )}
            </>
          )}
        </Animated.View>
        ) : null}

        {/* The picker. An in-sheet overlay rather than a nested Modal: nested
            modals behave differently on iOS, Android and react-native-web, and
            this only has to cover the sheet it already lives in. */}
        {historyFor ? (
          <View style={[styles.picker, inRoom && styles.pickerInRoom]} testID="exercise-history">
            <View style={styles.pickerHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={2}>{historyFor}</Text>
              </View>
              <CloseButton onPress={() => setHistoryFor(null)} label="Close history" />
            </View>
            <ScrollView contentContainerStyle={styles.historyBody}>
              {sessionsOf(historyFor).map((session) => (
                <View key={`${session.id}-${session.at}`} style={styles.historySession}>
                  <Text style={styles.historyDate}>
                    {new Date(session.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Text>
                  <Text style={styles.historySets}>
                    {/* Non-breaking inside a set: lines break between sets, never in "60 kg × 8". */}
                    {session.sets.map((set) => (set.weight ? `${set.weight}\u00a0${set.unit ?? weightUnit}\u00a0×\u00a0${set.reps}` : `${set.reps}\u00a0reps`)).join('   ·   ')}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {picking ? (
          <View style={[styles.picker, inRoom && styles.pickerInRoom]}>
            {/* In the room the search field says what the list is: no title over it, Done under it. */}
            {inRoom && !cardioOnly ? null : (
              <View style={[styles.pickerHead, inRoom && styles.pickerHeadInRoom]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{cardioOnly ? 'What did you do?' : 'Add exercise'}</Text>
                </View>
                <CloseButton
                  label={cardioOnly ? 'Close' : 'Close the exercise list'}
                  onPress={() => (cardioOnly ? requestClose() : setPicking(false))}
                />
              </View>
            )}
            {/* Lifted by the keyboard's height, so Done always sits just above the keys. */}
            <View style={[styles.pickerBody, inRoom && styles.pickerBodyInRoom, keyboardHeight > 0 && { paddingBottom: Math.max(0, keyboardHeight - keyboardGap) + 12 }]}>
              {/* A short list needs no search, and no keyboard over it. */}
              {cardioOnly ? null : (
                <TextInput
                  style={layout.input}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search exercises to add"
                  placeholderTextColor={colors.faint}
                  autoFocus
                />
              )}
              <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
                {matches.map(([exerciseName, muscle, bodyweight]) => {
                  const added = isAdded(exerciseName);
                  return (
                    <Pressable
                      key={exerciseName}
                      accessibilityRole="button"
                      accessibilityLabel={`${added ? 'Remove' : 'Add'} ${exerciseName}`}
                      accessibilityState={{ selected: added }}
                      style={({ pressed }) => [styles.libraryRow, added && styles.libraryRowOn, pressed && styles.pressed]}
                      onPress={() => {
                        haptic('select');
                        if (added) removeExerciseNamed(exerciseName);
                        else addExercise(exerciseName, muscle, bodyweight === 'bodyweight');
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.libraryName}>{exerciseName}</Text>
                        <Text style={styles.libraryMuscle}>
                          {muscle}
                          {bodyweight === 'bodyweight' ? ' · bodyweight' : bodyweight === 'distance' ? ' · distance' : ''}
                        </Text>
                      </View>
                      {/* Stays open after a tap so a whole day goes in at once. Each
                          exercise goes in once (repeats are sets on its card), so a
                          tick marks what is in, and tapping it again takes it out. */}
                      <View style={[styles.roundAdd, added && styles.roundAddOn]}>
                        {added ? (
                          <Mark kind="check" size={12} weight={2.2} color={colors.onCoral} />
                        ) : (
                          <Mark kind="plus" size={12} color={colors.coral} />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
                {matches.length === 0 ? (
                  <Text style={styles.empty}>Nothing matched that search.</Text>
                ) : null}
              </ScrollView>
              <PrimaryButton
                label={exercises.length > 0 ? `Done · ${exercises.length} in this workout` : 'Done'}
                onPress={() => setPicking(false)}
              />
            </View>
          </View>
        ) : null}
      </View>
    </SheetPage>
  );
}

const styles = themedStyles(() => ({
  sheet: { flex: 1, backgroundColor: colors.paper, paddingTop: 20 },
  // Under the room's window: no gap for a sheet's top edge.
  sheetInRoom: { paddingTop: 0 },
  // The room's one-line header.
  roomBar: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 16, paddingTop: 4 },
  roomBack: { height: 36, justifyContent: 'center' },
  roomTitle: { flex: 1, fontFamily: fonts.ui, fontWeight: '700', fontSize: 18, color: colors.ink },
  roomNameInput: { flex: 1, height: 44, fontWeight: '600' },
  bodyInRoomWorking: { paddingTop: 0 },
  pickerHeadInRoom: { paddingHorizontal: 16, paddingTop: 4 },
  // The room's start page.
  todayCardRoom: { marginTop: 0, paddingTop: 12, paddingBottom: 6 },
  todayHeadRoom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 },
  todayMainRoom: { paddingVertical: 6 },
  todayHeadActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayNudge: { flexDirection: 'row', gap: 6 },
  dayNudgeButton: { width: 30, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardSoft },
  dayNudgeLabel: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 16, lineHeight: 18, color: colors.inkSoft },
  roomListHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 6, minHeight: 28 },
  routineRowRoom: { paddingVertical: 10 },
  roomButtons: { flexDirection: 'row', gap: 8, marginTop: 8 },
  roomButton: {
    flex: 1,
    minWidth: 0,
    height: 46,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roomButtonLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.ink },
  roomRestart: { alignItems: 'center', marginTop: 14 },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  splitLine: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.ink, marginTop: 3 },
  splitEdit: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.coralDeep },
  splitHint: { fontFamily: fonts.ui, fontSize: 14, lineHeight: 20, color: colors.muted, marginTop: 4 },
  addDayChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addDayChip: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.coralWash,
  },
  addDayChipLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 14, color: colors.coralDeep },
  addDayChipRest: { backgroundColor: colors.cardSoft },
  addDayChipRestLabel: { color: colors.inkSoft },
  roomWeek: { fontFamily: fonts.ui, fontSize: 13, color: colors.faint, textAlign: 'center', marginTop: 18 },
  routineStartInRoom: { marginTop: 8 },
  resumeCard: { marginTop: 0, marginBottom: 12 },
  // The room bar is right under it: no home-indicator gap, and less air.
  footerInRoom: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerFinish: { flexShrink: 0, minWidth: 124 },
  statsInRoom: { flex: 1, textAlign: 'left' },
  pickerInRoom: { paddingTop: 6 },
  pickerBodyInRoom: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 10, gap: 8 },
  recentList: { gap: 8 },
  // The room's page keeps the window's side margins, and starts close under it.
  bodyInRoom: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    gap: 12,
  },
  title: { ...text.title, marginTop: 6 },
  body: { padding: 22, paddingBottom: 40 },
  field: { marginTop: 8 },

  // One caption style for every section, the meal page's plate title.
  sectionLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 12, letterSpacing: 0.6, color: colors.muted },
  sectionHint: { ...text.small, marginTop: 10, lineHeight: 18 },
  fieldLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, color: colors.muted, marginTop: 12, marginBottom: 6 },

  // The big "start here" button: coral when it is the way in, a quiet card
  // row when today's routine holds the Start.
  startCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: colors.coral,
  },
  startCardQuiet: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.card },
  routineStart: { marginTop: 20 },
  startTitle: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 17, color: colors.onCoral },
  startTitleQuiet: { fontWeight: '600', color: colors.ink },
  startHint: { fontFamily: fonts.ui, fontSize: 13, color: colors.onCoral, opacity: 0.85, marginTop: 3 },
  startHintQuiet: { color: colors.muted, opacity: 1 },
  startArrow: { fontFamily: fonts.ui, fontSize: 22, color: colors.onCoral },
  // The round add of every list here (and the meal page's): a coral plus on a
  // wash, coral with a white check once it is in.
  roundAdd: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coralWash },
  roundAddOn: { backgroundColor: colors.coral },

  // Routines
  routines: { marginTop: 26 },
  backToStart: { alignSelf: 'flex-start' },
  backToStartLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.coralDeep },
  // Today's routine is the card the page leads with; Start on it is the one coral button.
  todayCard: {
    marginTop: 4,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  todayKicker: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 11, letterSpacing: 0.6, color: colors.muted },
  todayMain: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  todayName: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 20, color: colors.ink },
  todayStart: {
    flexShrink: 0,
    minHeight: 40,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.coral,
  },
  todayStartLabel: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 15, color: colors.onCoral },
  todayLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  // Light secondary actions: borderless chips, quieter than anything coral.
  chip: { minHeight: 30, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: colors.cardSoft },
  chipLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, color: colors.inkSoft },
  // Today in the list: filled, not outlined, the way a selected row is.
  routineRowToday: { backgroundColor: colors.selectedFill },
  restRow: { backgroundColor: colors.cardSoft },
  newChoices: { flexDirection: 'row', gap: 8, marginTop: 12 },
  newChoice: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: colors.cardSoft,
  },
  newChoiceMain: { backgroundColor: colors.coral },
  newChoiceText: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.inkSoft },
  newChoiceMainText: { color: colors.onCoral },
  // Being dragged: the card itself lifts, so the shadow follows its rounded
  // corners, and a rest day gets a fill so the rows under it do not show through.
  rowLifted: {
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  restName: { fontWeight: '500', color: colors.muted },
  dayLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 11, letterSpacing: 0.5, color: colors.faint, marginBottom: 2 },
  dayLabelToday: { color: colors.coralDeep },
  routinesHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  routineRowWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routineRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  routineName: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.ink },
  routinePreview: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, marginTop: 3, lineHeight: 18 },
  goPill: { flexShrink: 0, minHeight: 32, paddingHorizontal: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coralWash },
  goPillLabel: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 14, color: colors.coralDeep },
  routineDelete: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerWash,
  },
  newRoutine: {
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  newRoutineTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 16, color: colors.coralDeep },
  newRoutineHint: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, marginTop: 3, lineHeight: 18 },
  routineMessage: { fontFamily: fonts.ui, fontSize: 13, color: colors.mintDeep, marginBottom: 12 },
  routineError: { fontFamily: fonts.ui, fontSize: 13, color: colors.danger },

  // Exercise cards
  exercise: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  exerciseHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Its place in the session, in a neutral tile: coral is kept for what can be pressed.
  exerciseNumber: {
    fontFamily: fonts.ui,
    fontWeight: '700',
    width: 26,
    flexShrink: 0,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 26,
    fontSize: 13,
    color: colors.muted,
    backgroundColor: colors.cardSoft,
  },
  exerciseName: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.ink },
  exerciseMuscle: { fontFamily: fonts.ui, fontSize: 13, color: colors.faint, marginTop: 1, textTransform: 'capitalize' },
  // The card's figure over its unit, right-aligned like a price.
  figureBox: { alignItems: 'flex-end', minWidth: 44, flexShrink: 0 },
  figure: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 17, color: colors.ink, fontVariant: ['tabular-nums'] },
  figureUnit: { fontFamily: fonts.ui, fontSize: 11, color: colors.faint },
  exerciseRemove: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  setHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  setHeadLabel: {
    fontFamily: fonts.ui,
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.faint,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  setInputHead: { flex: 1, minWidth: 0 },
  setIndex: { width: 28, flexShrink: 0, textAlign: 'center' },
  setIndexValue: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 15, color: colors.muted, fontVariant: ['tabular-nums'] },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, paddingVertical: 2, borderRadius: 12, borderCurve: 'continuous' },
  setRowDone: { backgroundColor: colors.selectedFill },
  setPrevious: { width: 60, flexShrink: 0, alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  setPreviousValue: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, fontVariant: ['tabular-nums'], textAlign: 'center' },
  tickSlot: { width: 30, height: 30 },
  // Takes the circle's 30pt in the row (38 less the margins), the word a little wider than it rather than wrapped.
  tickHead: { width: 38, textAlign: 'center', marginHorizontal: -4, flexShrink: 0 },
  tick: { borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coralWash },
  tickOn: { backgroundColor: colors.coral },
  // A filled field on the card, no outline: the numbers are the row.
  // minWidth 0 lets the field shrink; without it the row runs off the screen.
  setInput: {
    fontFamily: fonts.ui,
    fontWeight: '700',
    flex: 1,
    minWidth: 0,
    paddingVertical: 9,
    paddingHorizontal: 6,
    textAlign: 'center',
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    borderWidth: 0,
    borderRadius: 10,
    backgroundColor: colors.cardSoft,
  },
  setInputOff: { opacity: 0.6 },
  // Under NARROW_SCREEN: each fixed column gives back a little so the two
  // fields get about 50pt each at 320pt, room for "102.5" at 15pt.
  setGapNarrow: { gap: 5 },
  setIndexNarrow: { width: 20 },
  setPreviousNarrow: { width: 50 },
  setInputNarrow: { fontSize: 15, paddingHorizontal: 3 },
  setRemoveSlot: { width: 24, height: 28, alignItems: 'center', justifyContent: 'center' },
  addSet: {
    marginTop: 10,
    minHeight: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardSoft,
  },
  addSetLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.coralDeep },
  cardioNote: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, marginTop: 10, lineHeight: 18 },
  cardioFields: { gap: 12, marginTop: 14 },
  cardioRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardioLabelBox: { flex: 1, minWidth: 0 },
  cardioLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 16, color: colors.ink },
  cardioOptional: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint, marginTop: 1 },
  cardioInput: {
    fontFamily: fonts.ui,
    fontWeight: '700',
    // 64, not 72: "12.5" still fits, and on a 320pt phone "Distance" keeps room beside it.
    width: 64,
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 6,
    textAlign: 'center',
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    borderWidth: 0,
    borderRadius: 10,
    backgroundColor: colors.cardSoft,
  },
  cardioUnit: { fontFamily: fonts.ui, width: 28, flexShrink: 0, fontSize: 13, color: colors.muted },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.cardSoft, alignItems: 'center', justifyContent: 'center' },
  stepButtonOff: { opacity: 0.35 },

  addExercise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  addExerciseLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 16, color: colors.coralDeep },
  outdoorSave: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  outdoorName: { fontWeight: '600' },
  outdoorActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },

  // Details
  details: { marginTop: 28 },
  detailsCard: { marginTop: 8, paddingHorizontal: 14, paddingTop: 2, paddingBottom: 14, borderRadius: 18, borderCurve: 'continuous', backgroundColor: colors.card },
  cardInput: { borderWidth: 0, backgroundColor: colors.cardSoft },
  notes: { minHeight: 72, textAlignVertical: 'top' },
  sessionActions: { flexDirection: 'row', marginTop: 14 },

  footer: {
    gap: 8,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 30 : 18,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.paper,
  },
  stats: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSoft, textAlign: 'center', fontVariant: ['tabular-nums'] },
  empty: { fontFamily: fonts.ui, marginTop: 14, fontSize: 13, color: colors.faint, textAlign: 'center' },
  pressed: { opacity: 0.75 },

  // Records and history
  exerciseHistoryLink: { fontWeight: '600', color: colors.coralDeep },
  tickRecord: { backgroundColor: RECORD_GOLD },
  recordBanner: {
    position: 'absolute',
    top: 92,
    left: 22,
    right: 22,
    zIndex: 5,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.ink,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  recordKicker: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 0.8, fontWeight: '700', color: RECORD_GOLD },
  recordText: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.paper, marginTop: 2 },
  historyBody: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 40, gap: 8 },
  historySession: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderCurve: 'continuous', backgroundColor: colors.card },
  historyDate: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.ink },
  historySets: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, marginTop: 4, lineHeight: 19, fontVariant: ['tabular-nums'] },

  // Picker overlay
  picker: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.paper,
    paddingTop: 20,
  },
  pickerHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    gap: 12,
  },
  pickerBody: { flex: 1, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 28, gap: 12 },
  // Rows straight on the page, as the meal page's results are: no box, no rules.
  pickerList: { flex: 1, marginHorizontal: -8 },
  libraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderCurve: 'continuous',
  },
  libraryRowOn: { backgroundColor: colors.selectedFill },
  libraryName: { fontFamily: fonts.ui, fontSize: 15, color: colors.ink },
  libraryMuscle: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint, marginTop: 2 },
}));
