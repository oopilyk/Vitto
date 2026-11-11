import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as Haptics from 'expo-haptics';
import { Alert, Pressable, ScrollView, Text, TextInput, View, Platform } from 'react-native';
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
  removeRestDay,
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
import { KM_PER_MILE, checkWorkout, exerciseBest, exerciseSessions, setRecord, type HealthEvent } from '@vitto/core';
import { CloseButton, ErrorText, Kicker, NumberInput, PressableScale, PrimaryButton, SheetKeyboardAvoidingView, TextButton, haptic, DoneTextInput, Mark } from '../components/ui';
import { DragList } from '../components/DragList';
import { DEFAULT_REST_MS, RestTimer, type Rest } from '../components/RestTimer';
import { TIER_COLOR } from '../components/StrengthMap';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { startRest, stopRest } from '../services/restTimer';
import { clearWorkoutDraft, loadWorkoutDraft, saveWorkoutDraft } from '../services/workoutDraft';
import { colors, fonts, layout, text, themedStyles } from '../theme';

interface Props {
  onFinish: (metadata: WorkoutMetadata) => Promise<void>;
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
  /** A rotation day being dragged: the page holds still under the finger. */
  const [draggingDay, setDraggingDay] = useState(false);
  const [routineMessage, setRoutineMessage] = useState<string | null>(null);
  /** In routine mode: which routine is being edited, or null for a new one. */
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [routineName, setRoutineName] = useState('');

  /** The exercise picker overlay. */
  const [picking, setPicking] = useState(startWithCardio);
  const keyboardHeight = useKeyboardHeight();
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
  useEffect(() => {
    if (startWithCardio || editing) return undefined;
    let cancelled = false;
    void loadWorkoutDraft().then((draft) => {
      if (cancelled) return;
      if (draft) {
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
        setRoutineMessage('Picked up where you left off.');
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

  const addExercise = (exerciseName: string, muscle: string, bodyweight: boolean) => {
    // Once each: more of the same exercise is more sets on its card.
    if (exercises.some((item) => item.name === exerciseName)) return;
    // A session that starts with a walk or a run is that, not a "Strength
    // session" (the name a tester saw on their walk).
    if (exercises.length === 0 && name === DEFAULT_SESSION_NAME && tracksDistance(exerciseName)) setName(exerciseName);
    setExercises((current) => [
      ...current,
      exerciseFromHistory(createExercise(exerciseName, muscle, bodyweight, weightUnit), lastSets?.get(exerciseName)),
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
    if (!draftChecked || mode !== 'log' || editing) return undefined;
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
    if (mode !== 'log' || exercises.length === 0) {
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
      void clearWorkoutDraft();
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

  const loadRoutine = (template: WorkoutTemplate) => {
    setName(template.name);
    setExercises(sessionFromTemplate(template));
    setActiveTemplateId(template.id);
    setError(null);
    setRoutineMessage(null);
  };

  /** Start defining a routine from scratch — the "make a routine" entry point. */
  const startNewRoutine = () => {
    setMode('routine');
    setEditingTemplateId(null);
    setRoutineName('');
    setExercises([]);
    setRoutineMessage(null);
    setError(null);
    setManagingRoutines(false);
  };

  const startEditingRoutine = (template: WorkoutTemplate) => {
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
    setMode('routine');
    setEditingTemplateId(activeTemplateId);
    // A session still called "Strength session" has no name worth keeping, so
    // the field opens empty against its placeholder rather than pre-filled.
    setRoutineName(name === DEFAULT_SESSION_NAME ? '' : name);
    setRoutineMessage(null);
  };

  const leaveRoutineMode = () => {
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

  const setStats = calculateWorkoutStats(exercises, 1);
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
          ...(stats.totalVolume > 0 ? [`${stats.totalVolume} ${weightUnit} volume`] : []),
        ]
      : []),
    ...(goesSomewhere && Number(distance) > 0 ? [`${Number(distance)} ${distanceUnit}`] : []),
    // A walk with no time yet has no length to show; "1 min" read as logged.
    goesSomewhere && stats.completedSets === 0 && !(Number(duration) > 0) ? 'Add the time' : `${stats.durationMinutes} min`,
  ].join(' · ');

  const finish = async (confirmed = false) => {
    if (!exercises.length) {
      setError('Add an exercise first.');
      return;
    }
    // With no sets there is no clock to fall back on: an empty time would log
    // the walk as a single minute.
    if (goesSomewhere && stats.completedSets === 0 && !(Number(duration) > 0)) {
      setError('Add how many minutes it took.');
      return;
    }
    // A typo is refused or questioned here, before it becomes a record.
    const check = checkWorkout({ exercises, durationMinutes: stats.durationMinutes, distanceKm });
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
        onClose();
        return;
      }
      await onFinish({
        workoutType: cardio ? 'cardio' : 'strength',
        durationMinutes: stats.durationMinutes,
        ...(distanceKm !== undefined ? { distanceKm } : {}),
        name,
        exercises,
        notes,
        stats,
      });
      // A routine remembers what you did last: today's ticked sets become next
      // time's starting point. Best effort — the workout itself is already saved.
      if (activeTemplateId && onSaveTemplate) {
        try {
          await onSaveTemplate(templateFromSession(name, exercises, activeTemplateId));
        } catch {
          // The routine keeps last week's numbers; nothing about the workout is lost.
        }
      }
      await clearWorkoutDraft();
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

  // The routine list is the rotation: every routine in it, in order, with any
  // rest days, looping one day per calendar day (trainingSchedule.ts). Squared
  // with the routines here too, so a routine just made shows before the saved
  // rotation catches up.
  const rotationSchedule = onSaveSchedule ? reconcileSchedule(schedule, templates).schedule : null;
  const rotation = scheduleDayOn(rotationSchedule, templates);
  const rotationDays: ScheduleDay[] = rotationSchedule
    ? resolvedDays(rotationSchedule, templates)
    : templates.map((template) => ({ kind: 'routine', templateId: template.id }));
  const saveRotation = (next: TrainingSchedule) => {
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
    rotationSchedule ? (
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
          {dayControls(handle, `rest day ${index + 1}`, () => rotationSchedule && saveRotation(removeRestDay(rotationSchedule, templates, scheduleDayId(day))))}
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
          <Text style={styles.routineGo}>{managingRoutines ? 'Edit' : 'Start'}</Text>
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

  const openPicker = () => {
    setSearch('');
    setCardioOnly(false);
    setPicking(true);
  };

  return (
    <SheetPage onBackPress={requestClose}>
      <SheetKeyboardAvoidingView style={styles.sheet}>
        <View style={styles.header}>
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
            ) : (
              <Kicker>{routineMode ? 'Vitto / routine' : 'Vitto / training'}</Kicker>
            )}
            <Text style={styles.title}>
              {routineMode
                ? editingTemplateId
                  ? routineName || 'Edit routine'
                  : routineName || 'New routine'
                : editing
                  ? 'Edit workout'
                  : empty
                    ? 'Log a workout'
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

        {recordBanner ? (
          <View style={styles.recordBanner} pointerEvents="none" accessibilityLiveRegion="assertive" testID="record-banner">
            <Text style={styles.recordKicker}>PERSONAL RECORD</Text>
            <Text style={styles.recordText}>{recordBanner.text}</Text>
          </View>
        ) : null}

        <ScrollView
          ref={bodyRef}
          scrollEnabled={!draggingDay}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {routineMode ? (
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

          {/* Nothing added yet: the whole screen is one question, how to start. */}
          {!routineMode && empty ? (
            <>
              <Text style={styles.lead}>What are you training today?</Text>

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
                        <Text style={styles.routinePreview} numberOfLines={1}>
                          {rotation.template.exercises.map((exercise) => exercise.name).join(', ')}
                        </Text>
                      </View>
                      <Text style={styles.routineGo}>Start</Text>
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
                      <Pressable accessibilityRole="button" accessibilityLabel="Previous day" hitSlop={6} onPress={() => saveRotation(stepToday(rotationSchedule, templates, -1))}>
                        <Text style={styles.todayLink}>‹ Previous</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel="Restart from day 1" hitSlop={6} onPress={() => saveRotation(restartSchedule(rotationSchedule, templates))}>
                        <Text style={styles.todayLink}>Restart from day 1</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel="Next day" hitSlop={6} onPress={() => saveRotation(stepToday(rotationSchedule, templates, 1))}>
                        <Text style={styles.todayLink}>Next ›</Text>
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
                style={({ pressed }) => [styles.startCard, pressed && styles.pressed]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.startTitle}>Pick exercises</Text>
                  <Text style={styles.startHint}>Choose from {exerciseLibrary.length} moves, then fill in your sets</Text>
                </View>
                <Text style={styles.startArrow}>→</Text>
              </PressableScale>

              {onSaveTemplate ? (
                <View style={styles.routines}>
                  {templates.length > 0 ? (
                    <>
                      <View style={styles.routinesHead}>
                        <Text style={styles.sectionLabel}>{rotationSchedule ? 'YOUR ROTATION' : 'OR START A ROUTINE'}</Text>
                        {onDeleteTemplate ? (
                          <TextButton
                            label={managingRoutines ? 'Done' : 'Edit'}
                            onPress={() => setManagingRoutines((current) => !current)}
                            tone="coral"
                          />
                        ) : null}
                      </View>
                      <DragList
                        items={rotationDays}
                        keyOf={scheduleDayId}
                        labelOf={(day) =>
                          day.kind === 'rest' ? 'rest day' : (templates.find((template) => template.id === day.templateId)?.name ?? 'routine')
                        }
                        renderItem={dayRow}
                        enabled={managingRoutines && rotationSchedule !== null}
                        onDragging={setDraggingDay}
                        onMove={(from, to) => {
                          const moved = rotationDays[from];
                          if (rotationSchedule && moved) saveRotation(moveScheduleDay(rotationSchedule, templates, scheduleDayId(moved), to));
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
            </>
          ) : null}

          {routineMode && empty ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Add exercises"
              onPress={openPicker}
              style={({ pressed }) => [styles.startCard, styles.routineStart, pressed && styles.pressed]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.startTitle}>Add exercises</Text>
                <Text style={styles.startHint}>Pick everything you do on this day</Text>
              </View>
              <Text style={styles.startArrow}>→</Text>
            </PressableScale>
          ) : null}

          {exercises.map((exercise, position) => (
            <View key={exercise.id} style={styles.exercise}>
              <View style={styles.exerciseHead}>
                <Text style={styles.exerciseNumber}>{position + 1}</Text>
                {/* The name opens its past sessions, once there are any. */}
                <Pressable
                  accessibilityRole={pastSessions(exercise.name) ? 'button' : undefined}
                  accessibilityHint={pastSessions(exercise.name) ? 'Shows past sessions' : undefined}
                  disabled={!pastSessions(exercise.name)}
                  onPress={() => setHistoryFor(exercise.name)}
                  style={({ pressed }) => [{ flex: 1 }, pressed && styles.pressed]}
                >
                  <Text style={styles.exerciseName}>{exercise.name}</Text>
                  <Text style={styles.exerciseMuscle}>
                    {exercise.muscleGroup}
                    {pastSessions(exercise.name) ? <Text style={styles.exerciseHistoryLink}>{'  ·  History ›'}</Text> : null}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${exercise.name}`}
                  hitSlop={8}
                  onPress={() => removeExercise(exercise.id)}
                  style={({ pressed }) => [styles.exerciseRemove, pressed && styles.pressed]}
                >
                  <Mark kind="cross" size={11} color={colors.muted} />
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
                      <Text style={styles.cardioLabel}>Time</Text>
                      <DoneTextInput
                        style={[layout.input, styles.cardioInput]}
                        value={duration}
                        onChangeText={setDuration}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={colors.faint}
                        accessibilityLabel="Minutes"
                      />
                      <Text style={styles.cardioUnit}>min</Text>
                    </View>
                    <View style={styles.cardioRow}>
                      <Text style={styles.cardioLabel}>
                        Distance <Text style={styles.cardioOptional}>(optional)</Text>
                      </Text>
                      <DoneTextInput
                        style={[layout.input, styles.cardioInput]}
                        value={distance}
                        onChangeText={setDistance}
                        keyboardType="decimal-pad"
                        placeholder="0.0"
                        placeholderTextColor={colors.faint}
                        accessibilityLabel={`Distance in ${distanceUnit === 'mi' ? 'miles' : 'kilometres'}, optional`}
                      />
                      <Text style={styles.cardioUnit}>{distanceUnit}</Text>
                    </View>
                  </View>
                )
              ) : (
                <>
                  <View style={styles.setHead}>
                    <Text style={[styles.setHeadLabel, styles.setIndex]}>SET</Text>
                    {exercise.sets.some((set) => set.previous) ? (
                      <Text style={[styles.setHeadLabel, styles.setPrevious]}>LAST</Text>
                    ) : null}
                    <Text style={[styles.setHeadLabel, styles.setInputHead]}>
                      {exercise.bodyweight ? 'body' : weightUnit}
                    </Text>
                    <Text style={[styles.setHeadLabel, styles.setInputHead]}>reps</Text>
                    {routineMode ? null : <View style={styles.tickSlot} />}
                    <View style={styles.setRemoveSlot} />
                  </View>
                  {exercise.sets.map((set, index) => (
                    <View key={set.id} style={[styles.setRow, ticked.has(set.id) && styles.setRowDone]}>
                      <Text style={[styles.setIndex, styles.setIndexValue]}>{index + 1}</Text>
                      {exercise.sets.some((candidate) => candidate.previous) ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={set.previous ? `Use last time for set ${index + 1}: ${previousLabel(set.previous, exercise.bodyweight)}` : `No last time for set ${index + 1}`}
                          disabled={!set.previous}
                          hitSlop={4}
                          onPress={() => fillFromPrevious(exercise.id, set)}
                          style={({ pressed }) => [styles.setPrevious, pressed && styles.pressed]}
                        >
                          <Text style={styles.setPreviousValue} numberOfLines={1}>
                            {previousLabel(set.previous, exercise.bodyweight)}
                          </Text>
                        </Pressable>
                      ) : null}
                      {/* Decimal: 22.5 lb and 2.5 kg plates are ordinary. */}
                      {exercise.bodyweight ? (
                        <DoneTextInput
                          style={[layout.input, styles.setInput, styles.setInputOff]}
                          editable={false}
                          value=""
                          placeholder="BW"
                          placeholderTextColor={colors.faint}
                          accessibilityLabel={`Set ${index + 1} weight`}
                        />
                      ) : (
                        <NumberInput
                          decimal
                          style={[layout.input, styles.setInput]}
                          selectTextOnFocus
                          value={set.weight}
                          placeholder={weightUnit}
                          placeholderTextColor={colors.faint}
                          accessibilityLabel={`Set ${index + 1} weight`}
                          onValue={(value) => patchSet(exercise.id, set.id, { weight: value })}
                        />
                      )}
                      <NumberInput
                        style={[layout.input, styles.setInput]}
                        selectTextOnFocus
                        value={set.reps}
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
                          {ticked.has(set.id) ? <Mark kind="check" size={13} weight={2.2} color="#fff" /> : null}
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
                    onPress={() =>
                      setExercises((current) =>
                        current.map((item) => (item.id === exercise.id ? addSet(item, weightUnit) : item)),
                      )
                    }
                    style={({ pressed }) => [styles.addSet, pressed && styles.pressed]}
                  >
                    <Text style={styles.addSetLabel}>+ Add set</Text>
                  </Pressable>
                </>
              )}
            </View>
          ))}

          {!empty ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Add another exercise"
              onPress={openPicker}
              style={({ pressed }) => [styles.addExercise, pressed && styles.pressed]}
            >
              <Text style={styles.addExerciseLabel}>+ Add another exercise</Text>
            </PressableScale>
          ) : null}

          {/* The session's details, once there is a session to describe. */}
          {!routineMode && !empty ? (
            <View style={styles.details}>
              <Text style={styles.sectionLabel}>DETAILS</Text>

              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={layout.input}
                value={name}
                onChangeText={setName}
                placeholder="Workout name"
                placeholderTextColor={colors.faint}
              />

              <Text style={styles.fieldLabel}>Notes (optional)</Text>
              <TextInput
                style={[layout.input, styles.notes]}
                value={notes}
                onChangeText={setNotes}
                placeholder="How did it feel?"
                placeholderTextColor={colors.faint}
                multiline
                onFocus={revealEnd}
              />

              {/* An ad-hoc session you decide afterwards is worth keeping. */}
              {onSaveTemplate ? (
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
        <View style={styles.footer}>
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
              <Text style={styles.stats}>{empty ? 'Add an exercise to finish' : summary}</Text>
              <PrimaryButton
                label={saving ? 'Saving...' : editing ? 'Save changes' : 'Finish workout'}
                busy={saving}
                disabled={empty}
                onPress={() => void finish()}
              />
            </>
          )}
        </View>
        ) : null}

        {/* The picker. An in-sheet overlay rather than a nested Modal: nested
            modals behave differently on iOS, Android and react-native-web, and
            this only has to cover the sheet it already lives in. */}
        {historyFor ? (
          <View style={styles.picker} testID="exercise-history">
            <View style={styles.pickerHead}>
              <View style={{ flex: 1 }}>
                <Kicker>Vitto / history</Kicker>
                <Text style={styles.title}>{historyFor}</Text>
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
                    {session.sets.map((set) => (set.weight ? `${set.weight} ${set.unit ?? weightUnit} × ${set.reps}` : `${set.reps} reps`)).join('   ·   ')}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {picking ? (
          <View style={styles.picker}>
            <View style={styles.pickerHead}>
              <View style={{ flex: 1 }}>
                <Kicker>{cardioOnly ? 'Vitto / outdoors' : 'Vitto / exercises'}</Kicker>
                <Text style={styles.title}>{cardioOnly ? 'What did you do?' : 'Add exercise'}</Text>
              </View>
              <CloseButton
                label={cardioOnly ? 'Close' : 'Close the exercise list'}
                onPress={() => (cardioOnly ? requestClose() : setPicking(false))}
              />
            </View>
            {/* Lifted by the keyboard's height, so Done always sits just above the keys. */}
            <View style={[styles.pickerBody, keyboardHeight > 0 && { paddingBottom: keyboardHeight + 12 }]}>
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
                      style={({ pressed }) => [styles.libraryRow, pressed && styles.pressed]}
                      onPress={() =>
                        added ? removeExerciseNamed(exerciseName) : addExercise(exerciseName, muscle, bodyweight === 'bodyweight')
                      }
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
                      {added ? (
                        <Mark kind="check" size={13} color={colors.mintDeep} />
                      ) : (
                        <Mark kind="plus" size={13} color={colors.coral} />
                      )}
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
      </SheetKeyboardAvoidingView>
    </SheetPage>
  );
}

const styles = themedStyles(() => ({
  sheet: { flex: 1, backgroundColor: colors.paper, paddingTop: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    gap: 12,
  },
  title: { ...text.title, marginTop: 8 },
  body: { padding: 22, paddingBottom: 40 },
  field: { marginTop: 8 },

  sectionLabel: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 0, color: colors.faint },
  sectionHint: { ...text.small, marginTop: 10, lineHeight: 18 },
  fieldLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, color: colors.muted, marginTop: 16, marginBottom: 6 },
  lead: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.ink },

  // The big "start here" button
  startCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: colors.coral,
  },
  routineStart: { marginTop: 20 },
  startTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.onCoral },
  startHint: { fontFamily: fonts.ui, fontSize: 13, color: colors.onCoral, opacity: 0.85, marginTop: 3 },
  startArrow: { fontFamily: fonts.ui, fontSize: 22, color: colors.onCoral },

  // Routines
  routines: { marginTop: 26 },
  backToStart: { alignSelf: 'flex-start' },
  backToStartLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.coralDeep },
  // Spaced like the Pick exercises card under it (startCard's marginTop).
  todayCard: {
    marginTop: 14,
    paddingTop: 12,
    paddingBottom: 6,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.coral,
    backgroundColor: colors.card,
  },
  todayKicker: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 11, letterSpacing: 0.6, color: colors.coralDeep },
  todayMain: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  todayName: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 20, color: colors.ink },
  todayLinks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingTop: 10,
    paddingBottom: 6,
  },
  todayLink: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 14, color: colors.coralDeep },
  routineRowToday: { borderColor: colors.coral, borderWidth: 2, paddingHorizontal: 15, paddingVertical: 13 },
  restRow: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  newChoices: { flexDirection: 'row', gap: 10, marginTop: 12 },
  newChoice: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  newChoiceMain: { backgroundColor: colors.coral, borderColor: colors.coral },
  newChoiceText: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.ink },
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
  routineList: { gap: 8 },
  routineRowWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routineRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  routineName: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.ink },
  routinePreview: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, marginTop: 3 },
  routineGo: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.coralDeep },
  routineDelete: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerWash,
  },
  routineDeleteMark: { fontFamily: fonts.ui, fontSize: 17, color: colors.danger, marginTop: -1 },
  newRoutine: {
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  newRoutineTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.ink },
  newRoutineHint: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, marginTop: 3, lineHeight: 18 },
  routineMessage: { fontFamily: fonts.ui, fontSize: 13, color: colors.mintDeep, marginBottom: 12 },
  routineError: { fontFamily: fonts.ui, fontSize: 13, color: colors.danger },

  // Exercise cards
  exercise: {
    marginTop: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    backgroundColor: colors.card,
  },
  exerciseHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  exerciseNumber: { fontFamily: fonts.ui, fontWeight: '600',
    width: 26,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 26,
    fontSize: 13,
    
    color: colors.coralDeep,
    backgroundColor: colors.coralWash,
  },
  exerciseName: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.ink },
  exerciseMuscle: { fontFamily: fonts.ui, fontSize: 13, color: colors.faint, marginTop: 1, textTransform: 'capitalize' },
  exerciseRemove: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tile,
  },
  exerciseRemoveMark: { fontFamily: fonts.ui, fontSize: 17, color: colors.muted, marginTop: -1 },
  setHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  setHeadLabel: {
    fontFamily: fonts.ui,
    fontSize: 12,
    letterSpacing: 0.6,
    color: colors.faint,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  setInputHead: { flex: 1, minWidth: 0 },
  setIndex: { width: 32, textAlign: 'center' },
  setIndexValue: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.muted },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, borderRadius: 10 },
  setRowDone: { backgroundColor: colors.mint },
  setPrevious: { width: 64, alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  setPreviousValue: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, fontVariant: ['tabular-nums'] },
  tickSlot: { width: 30, height: 30 },
  tick: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  tickOn: { backgroundColor: colors.mintDeep, borderColor: colors.mintDeep },
  tickMark: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 15, color: '#fff', lineHeight: 18 },
  // minWidth 0 lets the field shrink; without it the row runs off the screen.
  setInput: { fontFamily: fonts.ui, fontWeight: '600',
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 6,
    textAlign: 'center',
    fontSize: 17,
    
  },
  setInputOff: { opacity: 0.6 },
  setRemoveSlot: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  setRemoveMark: { fontFamily: fonts.ui, fontSize: 22, color: colors.faint, lineHeight: 24 },
  addSet: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.tile,
  },
  addSetLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.ink },
  cardioNote: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, marginTop: 10, lineHeight: 18 },
  cardioFields: { gap: 8, marginTop: 12 },
  cardioRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardioLabel: { fontFamily: fonts.ui, fontWeight: '600', flex: 1, fontSize: 17, color: colors.ink },
  cardioOptional: { fontWeight: '400', color: colors.muted },
  cardioInput: { fontFamily: fonts.ui, fontWeight: '600', width: 96, textAlign: 'center', fontSize: 20, },
  cardioUnit: { fontFamily: fonts.ui, width: 30, fontSize: 15, color: colors.muted },

  addExercise: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.coral,
    alignItems: 'center',
  },
  addExerciseLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 17, color: colors.coralDeep },

  // Details
  details: { marginTop: 28 },
  notes: { minHeight: 72, textAlignVertical: 'top' },
  sessionActions: { flexDirection: 'row', marginTop: 14 },

  footer: {
    gap: 10,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 30 : 18,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.paper,
  },
  stats: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted, textAlign: 'center' },
  empty: { fontFamily: fonts.ui, marginTop: 14, fontSize: 13, color: colors.faint, textAlign: 'center' },
  pressed: { opacity: 0.75 },

  // Picker overlay
  exerciseHistoryLink: { fontWeight: '600', color: colors.coral },
  tickRecord: { backgroundColor: RECORD_GOLD, borderColor: RECORD_GOLD },
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
  historyBody: { paddingHorizontal: 22, paddingBottom: 40, gap: 10 },
  historySession: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  historyDate: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.ink },
  historySets: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted, marginTop: 4, lineHeight: 19 },
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
  pickerList: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    backgroundColor: colors.card,
  },
  libraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  libraryName: { fontFamily: fonts.ui, fontSize: 15, color: colors.ink },
  libraryMuscle: { fontFamily: fonts.ui, fontSize: 12, color: colors.faint, marginTop: 2 },
  libraryAdded: { fontFamily: fonts.ui, fontSize: 17, color: colors.mintDeep },
  libraryPlus: { fontFamily: fonts.ui, fontSize: 17, color: colors.coral },
}));
