import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View, KeyboardAvoidingView, Platform } from 'react-native';
import {
  type WeightUnit,
  type WorkoutExercise,
  type WorkoutMetadata,
  type WorkoutTemplate,
  addSet,
  calculateWorkoutStats,
  sessionMinutes,
  tracksDistance,
  createExercise,
  errorMessage,
  exerciseLibrary,
  MAX_TEMPLATE_NAME,
  sessionFromTemplate,
  templateError,
  templateFromSession,
  updateSet,
} from '@vitto/core';
import { KM_PER_MILE } from '@vitto/core';
import { ErrorText, Kicker, PrimaryButton, TextButton } from '../components/ui';
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
  /**
   * Open straight on the runs-and-rides list (the Outdoors room's "Log a
   * run"): only the activities logged by distance, and one tap picks it.
   */
  startWithCardio?: boolean;
}

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
}: Props) {
  const [mode, setMode] = useState<Mode>('log');
  const [name, setName] = useState(DEFAULT_SESSION_NAME);
  /** A run's own minutes, typed on its card. Everything else is timed (see sessionMinutes). */
  const [duration, setDuration] = useState('');
  /** Distance for a cardio session, typed in the lifter's own unit (mi for lb, km for kg). */
  const [distance, setDistance] = useState('');
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  /** When the first exercise went in: the session's clock, for timing it without asking. */
  const [startedAt, setStartedAt] = useState<number | null>(null);
  useEffect(() => {
    if (exercises.length > 0 && startedAt === null) setStartedAt(Date.now());
    else if (exercises.length === 0 && startedAt !== null) setStartedAt(null);
  }, [exercises.length, startedAt]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The routine this session was started from, so finishing can update it. */
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [managingRoutines, setManagingRoutines] = useState(false);
  const [routineMessage, setRoutineMessage] = useState<string | null>(null);
  /** In routine mode: which routine is being edited, or null for a new one. */
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [routineName, setRoutineName] = useState('');

  /** The exercise picker overlay. */
  const [picking, setPicking] = useState(startWithCardio);
  /** The picker as a "what did you do?" list of runs, rides and swims, until something is picked. */
  const [cardioOnly, setCardioOnly] = useState(startWithCardio);
  const [search, setSearch] = useState('');

  const routineMode = mode === 'routine';

  const addExercise = (exerciseName: string, muscle: string, bodyweight: boolean) => {
    // A session that starts with a walk or a run is that, not a "Strength
    // session" (the name a tester saw on their walk).
    if (exercises.length === 0 && name === DEFAULT_SESSION_NAME && tracksDistance(exerciseName)) setName(exerciseName);
    setExercises((current) => [
      ...current,
      createExercise(exerciseName, muscle, bodyweight, weightUnit),
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

  /** Undo from the picker: drops the last-added copy of that exercise. */
  const removeLastOf = (exerciseName: string) =>
    setExercises((current) => {
      const index = current.map((item) => item.name).lastIndexOf(exerciseName);
      return index < 0 ? current : current.filter((_, i) => i !== index);
    });

  const patchSet = (exerciseId: string, setId: string, patch: Parameters<typeof updateSet>[2]) =>
    setExercises((current) =>
      current.map((item) => (item.id === exerciseId ? updateSet(item, setId, patch) : item)),
    );

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

  const finish = async () => {
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
    setSaving(true);
    setError(null);
    try {
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
      onClose();
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save workout.'));
    } finally {
      setSaving(false);
    }
  };

  const matches = exerciseLibrary.filter(([exerciseName, muscle, kind]) => {
    if (cardioOnly && kind !== 'distance') return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return exerciseName.toLowerCase().includes(query) || muscle.toLowerCase().includes(query);
  });

  /** How many of this exercise are already in the session — shown on its picker row. */
  const countOf = (exerciseName: string) =>
    exercises.filter((exercise) => exercise.name === exerciseName).length;

  const empty = exercises.length === 0;

  /** One routine as a full-width row: its name, what is in it, and what a tap does. */
  const routineRow = (template: WorkoutTemplate) => {
    const preview = template.exercises.slice(0, 3).map((exercise) => exercise.name).join(', ');
    const more = template.exercises.length - 3;
    return (
      <View key={template.id} style={styles.routineRowWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={managingRoutines ? `Edit routine ${template.name}` : `Load routine ${template.name}`}
          onPress={() => (managingRoutines ? startEditingRoutine(template) : loadRoutine(template))}
          style={({ pressed }) => [styles.routineRow, pressed && styles.pressed]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.routineName}>{template.name}</Text>
            <Text style={styles.routinePreview} numberOfLines={1}>
              {preview}
              {more > 0 ? ` +${more} more` : ''}
            </Text>
          </View>
          <Text style={styles.routineGo}>{managingRoutines ? 'Edit' : 'Start'}</Text>
        </Pressable>
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
            <Text style={styles.routineDeleteMark}>×</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const openPicker = () => {
    setSearch('');
    setCardioOnly(false);
    setPicking(true);
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.sheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Kicker>{routineMode ? 'Vitto / routine' : 'Vitto / training'}</Kicker>
            <Text style={styles.title}>
              {routineMode
                ? editingTemplateId
                  ? routineName || 'Edit routine'
                  : routineName || 'New routine'
                : empty
                  ? 'Log a workout'
                  : name || 'Workout'}
            </Text>
          </View>
          <TextButton
            label={routineMode ? 'Cancel' : 'Exit'}
            onPress={routineMode ? leaveRoutineMode : onClose}
          />
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
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

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add exercise"
                onPress={openPicker}
                style={({ pressed }) => [styles.startCard, pressed && styles.pressed]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.startTitle}>Pick exercises</Text>
                  <Text style={styles.startHint}>Choose from {exerciseLibrary.length} moves, then fill in your sets</Text>
                </View>
                <Text style={styles.startArrow}>→</Text>
              </Pressable>

              {onSaveTemplate ? (
                <View style={styles.routines}>
                  {templates.length > 0 ? (
                    <>
                      <View style={styles.routinesHead}>
                        <Text style={styles.sectionLabel}>OR START A ROUTINE</Text>
                        {onDeleteTemplate ? (
                          <TextButton
                            label={managingRoutines ? 'Done' : 'Edit'}
                            onPress={() => setManagingRoutines((current) => !current)}
                          />
                        ) : null}
                      </View>
                      <View style={styles.routineList}>{templates.map(routineRow)}</View>
                    </>
                  ) : null}

                  {/* The way to MAKE one. Always here, so building a routine never
                      means logging a session first. */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Make a new routine"
                    onPress={startNewRoutine}
                    style={({ pressed }) => [styles.newRoutine, pressed && styles.pressed]}
                  >
                    <Text style={styles.newRoutineTitle}>+ Create a routine</Text>
                    <Text style={styles.newRoutineHint}>
                      {templates.length === 0
                        ? 'Same workout every week? Set it up once, then start it in one tap.'
                        : 'Save another day of your split.'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          ) : null}

          {routineMode && empty ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add exercise"
              onPress={openPicker}
              style={({ pressed }) => [styles.startCard, styles.routineStart, pressed && styles.pressed]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.startTitle}>Add exercises</Text>
                <Text style={styles.startHint}>Pick everything you do on this day</Text>
              </View>
              <Text style={styles.startArrow}>→</Text>
            </Pressable>
          ) : null}

          {exercises.map((exercise, position) => (
            <View key={exercise.id} style={styles.exercise}>
              <View style={styles.exerciseHead}>
                <Text style={styles.exerciseNumber}>{position + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exerciseName}>{exercise.name}</Text>
                  <Text style={styles.exerciseMuscle}>{exercise.muscleGroup}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${exercise.name}`}
                  hitSlop={8}
                  onPress={() => removeExercise(exercise.id)}
                  style={({ pressed }) => [styles.exerciseRemove, pressed && styles.pressed]}
                >
                  <Text style={styles.exerciseRemoveMark}>×</Text>
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
                      <TextInput
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
                      <TextInput
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
                    <Text style={[styles.setHeadLabel, styles.setInputHead]}>
                      {exercise.bodyweight ? 'body' : weightUnit}
                    </Text>
                    <Text style={[styles.setHeadLabel, styles.setInputHead]}>reps</Text>
                    <View style={styles.setRemoveSlot} />
                  </View>
                  {exercise.sets.map((set, index) => (
                    <View key={set.id} style={styles.setRow}>
                      <Text style={[styles.setIndex, styles.setIndexValue]}>{index + 1}</Text>
                      <TextInput
                        style={[layout.input, styles.setInput, exercise.bodyweight && styles.setInputOff]}
                        keyboardType="number-pad"
                        selectTextOnFocus
                        editable={!exercise.bodyweight}
                        value={exercise.bodyweight ? '' : String(set.weight ?? '')}
                        placeholder={exercise.bodyweight ? 'BW' : weightUnit}
                        placeholderTextColor={colors.faint}
                        accessibilityLabel={`Set ${index + 1} weight`}
                        onChangeText={(value) => patchSet(exercise.id, set.id, { weight: Number(value) || 0 })}
                      />
                      <TextInput
                        style={[layout.input, styles.setInput]}
                        keyboardType="number-pad"
                        selectTextOnFocus
                        value={String(set.reps)}
                        placeholder="reps"
                        placeholderTextColor={colors.faint}
                        accessibilityLabel={`Set ${index + 1} reps`}
                        onChangeText={(value) => patchSet(exercise.id, set.id, { reps: Number(value) || 0 })}
                      />
                      {/* No tick: a set on the list is a set you did. One you did
                          not do comes off here. */}
                      {exercise.sets.length > 1 ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove set ${index + 1} of ${exercise.name}`}
                          hitSlop={6}
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
                          <Text style={styles.setRemoveMark}>−</Text>
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add exercise"
              onPress={openPicker}
              style={({ pressed }) => [styles.addExercise, pressed && styles.pressed]}
            >
              <Text style={styles.addExerciseLabel}>+ Add another exercise</Text>
            </Pressable>
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

        {/* Pinned, so the way out is always in the same place. */}
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
              <Text style={styles.stats}>{empty ? 'Add an exercise to finish' : summary}</Text>
              <PrimaryButton
                label={saving ? 'Saving...' : 'Finish workout'}
                busy={saving}
                disabled={empty}
                onPress={() => void finish()}
              />
            </>
          )}
        </View>

        {/* The picker. An in-sheet overlay rather than a nested Modal: nested
            modals behave differently on iOS, Android and react-native-web, and
            this only has to cover the sheet it already lives in. */}
        {picking ? (
          <View style={styles.picker}>
            <View style={styles.pickerHead}>
              <View style={{ flex: 1 }}>
                <Kicker>{cardioOnly ? 'Vitto / outdoors' : 'Vitto / exercises'}</Kicker>
                <Text style={styles.title}>{cardioOnly ? 'What did you do?' : 'Add exercise'}</Text>
              </View>
              <TextButton label={cardioOnly ? 'Close' : 'Done'} onPress={() => (cardioOnly ? onClose() : setPicking(false))} />
            </View>
            <View style={styles.pickerBody}>
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
              <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
                {matches.map(([exerciseName, muscle, bodyweight]) => {
                  const added = countOf(exerciseName);
                  return (
                    <Pressable
                      key={exerciseName}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${exerciseName}`}
                      style={({ pressed }) => [styles.libraryRow, pressed && styles.pressed]}
                      onPress={() => addExercise(exerciseName, muscle, bodyweight === 'bodyweight')}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.libraryName}>{exerciseName}</Text>
                        <Text style={styles.libraryMuscle}>
                          {muscle}
                          {bodyweight === 'bodyweight' ? ' · bodyweight' : bodyweight === 'distance' ? ' · distance' : ''}
                        </Text>
                      </View>
                      {/* Stays open after a tap so a whole day goes in at once,
                          with a count so you can see what you have added, and a
                          minus so a mis-tap is undone without leaving the list. */}
                      {added > 0 ? (
                        <>
                          <Text style={styles.libraryAdded}>{added} added</Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${exerciseName}`}
                            hitSlop={8}
                            onPress={() => removeLastOf(exerciseName)}
                            style={({ pressed }) => [styles.libraryMinus, pressed && styles.pressed]}
                          >
                            <Text style={styles.libraryMinusMark}>−</Text>
                          </Pressable>
                        </>
                      ) : null}
                      <Text style={styles.libraryPlus}>+</Text>
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
      </KeyboardAvoidingView>
    </Modal>
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

  sectionLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.3, color: colors.faint },
  sectionHint: { ...text.small, marginTop: 10, lineHeight: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 16, marginBottom: 6 },
  lead: { fontSize: 17, fontWeight: '600', color: colors.ink },

  // The big "start here" button
  startCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: colors.coral,
  },
  routineStart: { marginTop: 20 },
  startTitle: { fontSize: 17, fontWeight: '700', color: colors.onCoral },
  startHint: { fontSize: 13, color: colors.onCoral, opacity: 0.85, marginTop: 3 },
  startArrow: { fontSize: 22, color: colors.onCoral },

  // Routines
  routines: { marginTop: 26 },
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  routineName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  routinePreview: { fontSize: 12, color: colors.muted, marginTop: 3 },
  routineGo: { fontSize: 14, fontWeight: '600', color: colors.coralDeep },
  routineDelete: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerWash,
  },
  routineDeleteMark: { fontSize: 17, color: colors.danger, marginTop: -1 },
  newRoutine: {
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  newRoutineTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  newRoutineHint: { fontSize: 12, color: colors.muted, marginTop: 3, lineHeight: 17 },
  routineMessage: { fontSize: 13, color: colors.mintDeep, marginBottom: 12 },
  routineError: { fontSize: 13, color: colors.danger },

  // Exercise cards
  exercise: {
    marginTop: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 16,
    backgroundColor: colors.card,
  },
  exerciseHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  exerciseNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 26,
    fontSize: 13,
    fontWeight: '700',
    color: colors.coralDeep,
    backgroundColor: colors.coralWash,
  },
  exerciseName: { fontSize: 16, fontWeight: '600', color: colors.ink },
  exerciseMuscle: { fontSize: 12, color: colors.faint, marginTop: 1, textTransform: 'capitalize' },
  exerciseRemove: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tile,
  },
  exerciseRemoveMark: { fontSize: 17, color: colors.muted, marginTop: -1 },
  setHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  setHeadLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.faint,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  setInputHead: { flex: 1, minWidth: 0 },
  setIndex: { width: 32, textAlign: 'center' },
  setIndexValue: { fontSize: 14, fontWeight: '600', color: colors.muted },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  // minWidth 0 lets the field shrink; without it the row runs off the screen.
  setInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 6,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
  },
  setInputOff: { opacity: 0.6 },
  setRemoveSlot: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  setRemoveMark: { fontSize: 20, color: colors.faint, lineHeight: 22 },
  addSet: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.tile,
  },
  addSetLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  cardioNote: { fontSize: 13, color: colors.muted, marginTop: 10, lineHeight: 18 },
  cardioFields: { gap: 8, marginTop: 12 },
  cardioRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardioLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink },
  cardioOptional: { fontWeight: '400', color: colors.muted },
  cardioInput: { width: 96, textAlign: 'center', fontSize: 18, fontWeight: '600' },
  cardioUnit: { width: 30, fontSize: 14, color: colors.muted },

  addExercise: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.coral,
    alignItems: 'center',
  },
  addExerciseLabel: { fontSize: 15, fontWeight: '600', color: colors.coralDeep },

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
  stats: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, textAlign: 'center' },
  empty: { marginTop: 14, fontSize: 13, color: colors.faint, textAlign: 'center' },
  pressed: { opacity: 0.75 },

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
  libraryName: { fontSize: 14, color: colors.ink },
  libraryMuscle: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 2 },
  libraryAdded: { fontFamily: fonts.mono, fontSize: 10, color: colors.mintDeep },
  libraryPlus: { fontSize: 17, color: colors.coral },
  libraryMinus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryMinusMark: { fontSize: 16, color: colors.faint, lineHeight: 18 },
}));
