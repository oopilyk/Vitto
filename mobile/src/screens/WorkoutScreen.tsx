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

export function WorkoutScreen({
  onFinish,
  onClose,
  weightUnit = 'kg',
  templates = [],
  onSaveTemplate,
  onDeleteTemplate,
}: Props) {
  const [name, setName] = useState('Strength session');
  const [duration, setDuration] = useState('30');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The routine this session was started from, so finishing can update it. */
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [managingRoutines, setManagingRoutines] = useState(false);
  const [routineMessage, setRoutineMessage] = useState<string | null>(null);

  const loadRoutine = (template: WorkoutTemplate) => {
    setName(template.name);
    setExercises(sessionFromTemplate(template));
    setActiveTemplateId(template.id);
    setSearch('');
    setError(null);
    setRoutineMessage(null);
  };

  const saveAsRoutine = async () => {
    if (!onSaveTemplate) return;
    const problem = templateError(name, exercises, templates, activeTemplateId ?? undefined);
    if (problem) {
      setRoutineMessage(problem);
      return;
    }
    const template = templateFromSession(name, exercises, activeTemplateId ?? undefined);
    await onSaveTemplate(template);
    setActiveTemplateId(template.id);
    setRoutineMessage(`Saved "${template.name}" — it's one tap next time.`);
  };

  /** Every set ticked at once: the "I did the whole routine as written" tap. */
  const tickAll = () => {
    setExercises((current) =>
      current.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((set) => ({ ...set, completed: true })),
      })),
    );
  };

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

  const matches = exerciseLibrary.filter(([exerciseName]) =>
    exerciseName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.sheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Kicker>Vitto / training</Kicker>
            <Text style={styles.title}>{name || 'Workout'}</Text>
          </View>
          <TextButton label="Exit" onPress={onClose} />
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
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
                <Text style={styles.routinesLabel}>ROUTINES</Text>
                {templates.length > 0 && onDeleteTemplate ? (
                  <TextButton
                    label={managingRoutines ? 'Done' : 'Manage'}
                    onPress={() => setManagingRoutines((current) => !current)}
                  />
                ) : null}
              </View>
              {templates.length === 0 ? (
                <Text style={styles.routinesHint}>
                  Build a session below, then save it as a routine — "Push", "Legs" — and it's one tap next time.
                </Text>
              ) : (
                <View style={styles.routineChips}>
                  {templates.map((template) => {
                    const active = template.id === activeTemplateId;
                    return (
                      <View key={template.id} style={styles.routineChipWrap}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Load routine ${template.name}`}
                          accessibilityState={{ selected: active }}
                          onPress={() => loadRoutine(template)}
                          style={({ pressed }) => [
                            styles.routineChip,
                            active && styles.routineChipOn,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text style={[styles.routineChipLabel, active && styles.routineChipLabelOn]}>
                            {template.name}
                          </Text>
                          <Text style={styles.routineChipMeta}>
                            {template.exercises.length} {template.exercises.length === 1 ? 'exercise' : 'exercises'}
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
                </View>
              )}
            </View>
          ) : null}

          <TextInput
            style={[layout.input, { marginTop: 12 }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search exercises to add"
            placeholderTextColor={colors.faint}
          />
          {search ? (
            <View style={styles.library}>
              {matches.map(([exerciseName, muscle, bodyweight]) => (
                <Pressable
                  key={exerciseName}
                  style={styles.libraryRow}
                  onPress={() => {
                    setExercises([
                      ...exercises,
                      createExercise(exerciseName, muscle, bodyweight === 'bodyweight', weightUnit),
                    ]);
                    setSearch('');
                  }}
                >
                  <Text style={styles.libraryName}>{exerciseName}</Text>
                  <Text style={styles.libraryMuscle}>{muscle}</Text>
                  <Text style={styles.libraryPlus}>+</Text>
                </Pressable>
              ))}
              {matches.length === 0 ? <Text style={styles.empty}>Nothing matched that search.</Text> : null}
            </View>
          ) : null}

          {exercises.map((exercise) => (
            <View key={exercise.id} style={styles.exercise}>
              <View style={styles.exerciseHead}>
                <Text style={styles.exerciseName}>{exercise.name}</Text>
                <TextButton
                  label="Delete"
                  onPress={() => setExercises(exercises.filter((item) => item.id !== exercise.id))}
                />
              </View>
              <View style={styles.setHead}>
                <Text style={[styles.setHeadLabel, styles.setIndex]}>#</Text>
                <Text style={[styles.setHeadLabel, styles.setInputHead]}>
                  {exercise.bodyweight ? 'body' : weightUnit}
                </Text>
                <Text style={[styles.setHeadLabel, styles.setInputHead]}>reps</Text>
                <Text style={[styles.setHeadLabel, styles.setDoneHead]}>done</Text>
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
                      setExercises(
                        exercises.map((item) =>
                          item.id === exercise.id
                            ? updateSet(item, set.id, { weight: Number(value) || 0 })
                            : item,
                        ),
                      )
                    }
                  />
                  <TextInput
                    style={[layout.input, styles.setInput]}
                    keyboardType="number-pad"
                    value={String(set.reps)}
                    placeholder="reps"
                    placeholderTextColor={colors.faint}
                    onChangeText={(value) =>
                      setExercises(
                        exercises.map((item) =>
                          item.id === exercise.id
                            ? updateSet(item, set.id, { reps: Number(value) || 0 })
                            : item,
                        ),
                      )
                    }
                  />
                  <Pressable
                    onPress={() =>
                      setExercises(
                        exercises.map((item) =>
                          item.id === exercise.id
                            ? updateSet(item, set.id, { completed: !set.completed })
                            : item,
                        ),
                      )
                    }
                    style={[styles.done, set.completed && styles.doneOn]}
                  >
                    <Text style={[styles.doneMark, set.completed && styles.doneMarkOn]}>
                      {set.completed ? '✓' : '○'}
                    </Text>
                  </Pressable>
                </View>
              ))}
              <TextButton
                label="+ Add set"
                onPress={() =>
                  setExercises(exercises.map((item) => (item.id === exercise.id ? addSet(item, weightUnit) : item)))
                }
              />
            </View>
          ))}

          <TextInput
            style={[layout.input, styles.notes]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional notes"
            placeholderTextColor={colors.faint}
            multiline
          />

          <ErrorText>{error}</ErrorText>

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
                {onSaveTemplate ? (
                  <TextButton
                    label={activeTemplateId ? 'Update routine' : 'Save as routine'}
                    onPress={() => void saveAsRoutine()}
                  />
                ) : null}
              </View>
            ) : null}
            {routineMessage ? <Text style={styles.routineMessage}>{routineMessage}</Text> : null}
            <PrimaryButton
              label={saving ? 'Saving...' : 'Finish workout'}
              busy={saving}
              onPress={() => void finish()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  routines: { marginTop: 14 },
  routinesHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  routinesLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.3, color: colors.faint },
  routinesHint: { ...text.small, marginTop: 6, lineHeight: 18 },
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
  routineDelete: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.coralWash,
  },
  routineDeleteMark: { fontSize: 16, color: colors.coralDeep, marginTop: -1 },
  sessionActions: { flexDirection: 'row', gap: 18, marginTop: -4 },
  routineMessage: { fontFamily: fonts.mono, fontSize: 11, color: colors.mintDeep, marginTop: -4 },
  pressed: { opacity: 0.75 },
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
  library: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    backgroundColor: colors.card,
    overflow: 'hidden',
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
  libraryName: { flex: 1, fontSize: 14, color: colors.ink },
  libraryMuscle: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint },
  libraryPlus: { fontSize: 17, color: colors.coral },
  empty: { padding: 14, fontSize: 13, color: colors.faint },
  exercise: {
    marginTop: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  exerciseHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exerciseName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  setHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  setHeadLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.faint, textAlign: 'center' },
  setInputHead: { flex: 1, minWidth: 0 },
  setDoneHead: { width: 38 },
  setIndex: { width: 18, fontFamily: fonts.mono, fontSize: 11, color: colors.faint },
  // minWidth 0 lets the field shrink; without it the row runs off the screen.
  setInput: { flex: 1, minWidth: 0, paddingVertical: 9, paddingHorizontal: 6, textAlign: 'center' },
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
  footer: { marginTop: 24, gap: 14 },
  stats: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted },
  statsHint: { fontFamily: fonts.mono, fontSize: 10, color: colors.faint, marginTop: -6 },
});
