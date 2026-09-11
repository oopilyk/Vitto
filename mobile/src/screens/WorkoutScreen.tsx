import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform } from 'react-native';
import {
  type WeightUnit,
  type WorkoutExercise,
  type WorkoutMetadata,
  type WorkoutTemplate,
  addSet,
  calculateWorkoutStats,
  createExercise,
  errorMessage,
  exerciseLibrary,
  MAX_TEMPLATE_NAME,
  sessionFromTemplate,
  templateError,
  templateFromSession,
  updateSet,
} from '@vitto/core';
import { ErrorText, Kicker, PrimaryButton, TextButton } from '../components/ui';
import { colors, fonts, layout, text } from '../theme';

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
}: Props) {
  const [mode, setMode] = useState<Mode>('log');
  const [name, setName] = useState(DEFAULT_SESSION_NAME);
  const [duration, setDuration] = useState('30');
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
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
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');

  const routineMode = mode === 'routine';

  const addExercise = (exerciseName: string, muscle: string, bodyweight: boolean) => {
    setExercises((current) => [
      ...current,
      createExercise(exerciseName, muscle, bodyweight, weightUnit),
    ]);
    setError(null);
  };

  const removeExercise = (id: string) =>
    setExercises((current) => current.filter((item) => item.id !== id));

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

  /** Every set ticked at once: the "I did the whole routine as written" tap. */
  const tickAll = () =>
    setExercises((current) =>
      current.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((set) => ({ ...set, completed: true })),
      })),
    );

  const stats = calculateWorkoutStats(exercises, Math.max(1, Number(duration) || 1));
  // Only ticked sets count toward the workout, so show the entered total too.
  const totalSets = exercises.reduce((count, exercise) => count + exercise.sets.length, 0);

  const finish = async () => {
    if (!exercises.length) {
      setError('Add an exercise first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onFinish({
        workoutType: stats.muscleGroups.includes('cardio') ? 'cardio' : 'strength',
        durationMinutes: stats.durationMinutes,
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

  const matches = exerciseLibrary.filter(([exerciseName, muscle]) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return exerciseName.toLowerCase().includes(query) || muscle.toLowerCase().includes(query);
  });

  /** How many of this exercise are already in the session — shown on its picker row. */
  const countOf = (exerciseName: string) =>
    exercises.filter((exercise) => exercise.name === exerciseName).length;

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
                Add the exercises you do on this day. The weights and reps here are just your
                starting point — each time you train it, they update to what you actually did.
              </Text>
            </>
          ) : (
            <>
              <View style={styles.toolbar}>
                <TextInput
                  style={[layout.input, { flex: 1 }]}
                  value={name}
                  onChangeText={setName}
                  placeholder="Workout name"
                  placeholderTextColor={colors.faint}
                />
                <TextInput
                  style={[layout.input, styles.minutes]}
                  value={duration}
                  onChangeText={setDuration}
                  keyboardType="number-pad"
                  placeholder="Min"
                  placeholderTextColor={colors.faint}
                />
              </View>

              {onSaveTemplate ? (
                <View style={styles.routines}>
                  <View style={styles.routinesHead}>
                    <Text style={styles.sectionLabel}>ROUTINES</Text>
                    {templates.length > 0 && onDeleteTemplate ? (
                      <TextButton
                        label={managingRoutines ? 'Done' : 'Manage'}
                        onPress={() => setManagingRoutines((current) => !current)}
                      />
                    ) : null}
                  </View>

                  <View style={styles.routineChips}>
                    {templates.map((template) => {
                      const active = template.id === activeTemplateId;
                      return (
                        <View key={template.id} style={styles.routineChipWrap}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={
                              managingRoutines
                                ? `Edit routine ${template.name}`
                                : `Load routine ${template.name}`
                            }
                            accessibilityState={{ selected: active }}
                            onPress={() =>
                              managingRoutines ? startEditingRoutine(template) : loadRoutine(template)
                            }
                            style={({ pressed }) => [
                              styles.routineChip,
                              active && !managingRoutines && styles.routineChipOn,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.routineChipLabel,
                                active && !managingRoutines && styles.routineChipLabelOn,
                              ]}
                            >
                              {template.name}
                            </Text>
                            <Text style={styles.routineChipMeta}>
                              {managingRoutines
                                ? 'tap to edit'
                                : `${template.exercises.length} ${template.exercises.length === 1 ? 'exercise' : 'exercises'}`}
                            </Text>
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
                    })}

                    {/* The way to MAKE one, sitting in the strip where routines
                        live. Always available — building a routine no longer
                        requires logging a session first. */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Make a new routine"
                      onPress={startNewRoutine}
                      style={({ pressed }) => [
                        styles.routineChip,
                        styles.routineAdd,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.routineAddLabel}>+ New routine</Text>
                      <Text style={styles.routineChipMeta}>push · pull · legs</Text>
                    </Pressable>
                  </View>

                  {templates.length === 0 ? (
                    <Text style={styles.routinesHint}>
                      Do the same split every week? Make a routine once — next time it is one tap to
                      load the whole thing.
                    </Text>
                  ) : null}
                  {routineMessage ? <Text style={styles.routineMessage}>{routineMessage}</Text> : null}
                </View>
              ) : null}
            </>
          )}

          {/* One obvious way to add an exercise, in both modes. The library used
              to appear only if you happened to type into a search box, which
              hid the whole catalogue behind a guess. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add exercise"
            onPress={() => {
              setSearch('');
              setPicking(true);
            }}
            style={({ pressed }) => [styles.addExercise, pressed && styles.pressed]}
          >
            <Text style={styles.addExerciseMark}>+</Text>
            <Text style={styles.addExerciseLabel}>Add exercise</Text>
          </Pressable>

          {exercises.length === 0 ? (
            <Text style={styles.empty}>
              {routineMode
                ? 'No exercises yet. Add the ones you do on this day.'
                : 'No exercises yet. Add one, or load a routine above.'}
            </Text>
          ) : null}

          {exercises.map((exercise) => (
            <View key={exercise.id} style={styles.exercise}>
              <View style={styles.exerciseHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exerciseName}>{exercise.name}</Text>
                  <Text style={styles.exerciseMuscle}>{exercise.muscleGroup}</Text>
                </View>
                <TextButton label="Delete" onPress={() => removeExercise(exercise.id)} />
              </View>
              <View style={styles.setHead}>
                <Text style={[styles.setHeadLabel, styles.setIndex]}>#</Text>
                <Text style={[styles.setHeadLabel, styles.setInputHead]}>
                  {exercise.bodyweight ? 'body' : weightUnit}
                </Text>
                <Text style={[styles.setHeadLabel, styles.setInputHead]}>reps</Text>
                {/* No "done" column while defining a routine — there is nothing
                    to tick off a workout you have not done yet. */}
                {routineMode ? null : (
                  <Text style={[styles.setHeadLabel, styles.setDoneHead]}>done</Text>
                )}
              </View>
              {exercise.sets.map((set, index) => (
                <View key={set.id} style={styles.setRow}>
                  <Text style={styles.setIndex}>{index + 1}</Text>
                  <TextInput
                    style={[layout.input, styles.setInput]}
                    keyboardType="number-pad"
                    editable={!exercise.bodyweight}
                    value={exercise.bodyweight ? '' : String(set.weight ?? '')}
                    placeholder={exercise.bodyweight ? 'BW' : weightUnit}
                    placeholderTextColor={colors.faint}
                    onChangeText={(value) =>
                      patchSet(exercise.id, set.id, { weight: Number(value) || 0 })
                    }
                  />
                  <TextInput
                    style={[layout.input, styles.setInput]}
                    keyboardType="number-pad"
                    value={String(set.reps)}
                    placeholder="reps"
                    placeholderTextColor={colors.faint}
                    onChangeText={(value) =>
                      patchSet(exercise.id, set.id, { reps: Number(value) || 0 })
                    }
                  />
                  {routineMode ? null : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Mark set ${index + 1} of ${exercise.name} done`}
                      accessibilityState={{ selected: set.completed }}
                      onPress={() => patchSet(exercise.id, set.id, { completed: !set.completed })}
                      style={[styles.done, set.completed && styles.doneOn]}
                    >
                      <Text style={[styles.doneMark, set.completed && styles.doneMarkOn]}>
                        {set.completed ? '✓' : '○'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              ))}
              <View style={styles.setActions}>
                <TextButton
                  label="+ Add set"
                  onPress={() =>
                    setExercises((current) =>
                      current.map((item) => (item.id === exercise.id ? addSet(item, weightUnit) : item)),
                    )
                  }
                />
                {exercise.sets.length > 1 ? (
                  <TextButton
                    label="Remove set"
                    onPress={() =>
                      setExercises((current) =>
                        current.map((item) =>
                          item.id === exercise.id
                            ? { ...item, sets: item.sets.slice(0, -1) }
                            : item,
                        ),
                      )
                    }
                  />
                ) : null}
              </View>
            </View>
          ))}

          {routineMode ? null : (
            <TextInput
              style={[layout.input, styles.notes]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional notes"
              placeholderTextColor={colors.faint}
              multiline
            />
          )}

          <ErrorText>{error}</ErrorText>

          {routineMode ? (
            <View style={styles.footer}>
              {routineMessage ? <Text style={styles.routineError}>{routineMessage}</Text> : null}
              <PrimaryButton
                label={saving ? 'Saving...' : editingTemplateId ? 'Save changes' : 'Save routine'}
                busy={saving}
                onPress={() => void saveRoutine()}
              />
              <TextButton label="Cancel" onPress={leaveRoutineMode} />
            </View>
          ) : (
            <View style={styles.footer}>
              <Text style={styles.stats}>
                {stats.completedSets} of {totalSets} sets done · {stats.totalReps} reps ·{' '}
                {stats.totalVolume} {weightUnit} volume
              </Text>
              {totalSets > 0 && stats.completedSets === 0 ? (
                <Text style={styles.statsHint}>Tap the circle on a set to count it.</Text>
              ) : null}
              {exercises.length > 0 ? (
                <View style={styles.sessionActions}>
                  {stats.completedSets < totalSets ? (
                    <TextButton label="Tick all sets" onPress={tickAll} />
                  ) : null}
                  {/* An ad-hoc session you decide afterwards is worth keeping. */}
                  {onSaveTemplate ? (
                    <TextButton
                      label={activeTemplateId ? 'Update routine' : 'Save as routine'}
                      onPress={saveSessionAsRoutine}
                    />
                  ) : null}
                </View>
              ) : null}
              <PrimaryButton
                label={saving ? 'Saving...' : 'Finish workout'}
                busy={saving}
                onPress={() => void finish()}
              />
            </View>
          )}
        </ScrollView>

        {/* The picker. An in-sheet overlay rather than a nested Modal: nested
            modals behave differently on iOS, Android and react-native-web, and
            this only has to cover the sheet it already lives in. */}
        {picking ? (
          <View style={styles.picker}>
            <View style={styles.pickerHead}>
              <View style={{ flex: 1 }}>
                <Kicker>Vitto / exercises</Kicker>
                <Text style={styles.title}>Add exercise</Text>
              </View>
              <TextButton label="Done" onPress={() => setPicking(false)} />
            </View>
            <View style={styles.pickerBody}>
              <TextInput
                style={layout.input}
                value={search}
                onChangeText={setSearch}
                placeholder="Search exercises to add"
                placeholderTextColor={colors.faint}
                autoFocus
              />
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
                          {bodyweight === 'bodyweight' ? ' · bodyweight' : ''}
                        </Text>
                      </View>
                      {/* Stays open after a tap so a whole day goes in at once,
                          with a count so you can see what you have added. */}
                      {added > 0 ? <Text style={styles.libraryAdded}>{added} added</Text> : null}
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

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.paper, paddingTop: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    gap: 12,
  },
  title: { ...text.title, marginTop: 8 },
  body: { padding: 22, paddingBottom: 60 },
  toolbar: { flexDirection: 'row', gap: 10 },
  minutes: { width: 84, textAlign: 'center' },
  field: { marginTop: 8 },

  sectionLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.3, color: colors.faint },
  sectionHint: { ...text.small, marginTop: 10, lineHeight: 18 },

  // Routines strip
  routines: { marginTop: 18 },
  routinesHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  routinesHint: { ...text.small, marginTop: 10, lineHeight: 18 },
  routineChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  routineChipWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  routineChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardSoft,
  },
  routineChipOn: { borderColor: colors.coral, backgroundColor: colors.coralWash },
  routineChipLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  routineChipLabelOn: { color: colors.coralDeep },
  routineChipMeta: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, marginTop: 2 },
  // Dashed, like every "add one" tile — reads as a slot to fill, not a saved item.
  routineAdd: { borderStyle: 'dashed', borderColor: colors.coral, backgroundColor: 'transparent' },
  routineAddLabel: { fontSize: 14, fontWeight: '600', color: colors.coralDeep },
  routineDelete: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.coralWash,
  },
  routineDeleteMark: { fontSize: 16, color: colors.coralDeep, marginTop: -1 },
  routineMessage: { fontFamily: fonts.mono, fontSize: 11, color: colors.mintDeep, marginTop: 10 },
  routineError: { fontFamily: fonts.mono, fontSize: 11, color: colors.danger },

  // Add-exercise button
  addExercise: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.coral,
  },
  addExerciseMark: { fontSize: 18, color: colors.coralDeep, marginTop: -2 },
  addExerciseLabel: { fontSize: 15, fontWeight: '600', color: colors.coralDeep },

  // Exercise cards
  exercise: {
    marginTop: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  exerciseHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  exerciseName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  exerciseMuscle: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 2 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  setHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  setHeadLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.faint, textAlign: 'center' },
  setInputHead: { flex: 1, minWidth: 0 },
  setDoneHead: { width: 38 },
  setIndex: { width: 18, fontFamily: fonts.mono, fontSize: 11, color: colors.faint },
  // minWidth 0 lets the field shrink; without it the row runs off the screen.
  setInput: { flex: 1, minWidth: 0, paddingVertical: 9, paddingHorizontal: 6, textAlign: 'center' },
  setActions: { flexDirection: 'row', gap: 18, marginTop: 4 },
  done: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneOn: { backgroundColor: colors.mint, borderColor: colors.mintDeep },
  doneMark: { fontSize: 16, color: colors.faint },
  doneMarkOn: { color: colors.mintDeep },

  notes: { marginTop: 16, minHeight: 80, textAlignVertical: 'top' },
  empty: { marginTop: 14, fontSize: 13, color: colors.faint, textAlign: 'center' },
  footer: { marginTop: 24, gap: 14 },
  stats: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted },
  statsHint: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: -6 },
  sessionActions: { flexDirection: 'row', gap: 18, marginTop: -4 },
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
    borderBottomColor: '#eee9e1',
  },
  libraryName: { fontSize: 14, color: colors.ink },
  libraryMuscle: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: 2 },
  libraryAdded: { fontFamily: fonts.mono, fontSize: 10, color: colors.mintDeep },
  libraryPlus: { fontSize: 17, color: colors.coral },
});
