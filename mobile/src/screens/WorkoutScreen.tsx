import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { type WorkoutExercise, type WorkoutMetadata, addSet, calculateWorkoutStats, createExercise, errorMessage, exerciseLibrary, updateSet } from '@vitto/core';
import { ErrorText, Kicker, PrimaryButton, TextButton } from '../components/ui';
import { colors, fonts, layout, text } from '../theme';

interface Props {
  onFinish: (metadata: WorkoutMetadata) => Promise<void>;
  onClose: () => void;
}

export function WorkoutScreen({ onFinish, onClose }: Props) {
  const [name, setName] = useState('Strength session');
  const [duration, setDuration] = useState('30');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = calculateWorkoutStats(exercises, Math.max(1, Number(duration) || 1));

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
      <View style={styles.sheet}>
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
                      createExercise(exerciseName, muscle, bodyweight === 'bodyweight'),
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
              {exercise.sets.map((set, index) => (
                <View key={set.id} style={styles.setRow}>
                  <Text style={styles.setIndex}>{index + 1}</Text>
                  <TextInput
                    style={[layout.input, styles.setInput]}
                    keyboardType="number-pad"
                    editable={!exercise.bodyweight}
                    value={exercise.bodyweight ? '' : String(set.weight ?? '')}
                    placeholder={exercise.bodyweight ? 'BW' : 'kg'}
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
                  setExercises(exercises.map((item) => (item.id === exercise.id ? addSet(item) : item)))
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
              {stats.completedSets} sets · {stats.totalReps} reps · {stats.totalVolume} kg volume
            </Text>
            <PrimaryButton
              label={saving ? 'Saving...' : 'Finish workout'}
              busy={saving}
              onPress={() => void finish()}
            />
          </View>
        </ScrollView>
      </View>
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
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10 },
  setIndex: { width: 18, fontFamily: fonts.mono, fontSize: 11, color: colors.faint },
  setInput: { flex: 1, paddingVertical: 9, textAlign: 'center' },
  done: {
    width: 42,
    height: 42,
    borderRadius: 21,
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
});
