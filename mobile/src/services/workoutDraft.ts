import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WorkoutExercise } from '@vitto/core';
import type { Rest } from '../components/RestTimer';

/**
 * The workout being logged, kept on the phone as it changes, so a session
 * survives the app being closed. iOS ends backgrounded apps freely, and a
 * gym session is exactly when the phone sits locked for minutes at a time:
 * losing fifty sets to that was the worst thing testers found in logging.
 *
 * One draft at a time, device-local, gone once the workout is finished or
 * discarded. A draft older than a day is a session someone walked away from.
 */
export interface WorkoutDraft {
  name: string;
  exercises: WorkoutExercise[];
  notes: string;
  duration: string;
  distance: string;
  startedAt: number | null;
  activeTemplateId: string | null;
  ticked: string[];
  rest: Rest | null;
  restLength: number;
  savedAt: number;
}

const KEY = 'vitto.workoutDraft';
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const loadWorkoutDraft = async (now: number = Date.now()): Promise<WorkoutDraft | null> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as WorkoutDraft;
    if (!Array.isArray(draft.exercises) || draft.exercises.length === 0) return null;
    if (!(now - draft.savedAt < DRAFT_MAX_AGE_MS)) {
      await clearWorkoutDraft();
      return null;
    }
    return draft;
  } catch {
    return null;
  }
};

export const saveWorkoutDraft = async (draft: WorkoutDraft): Promise<void> => {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // A full disk or a storage hiccup: the session on screen is unaffected.
  }
};

export const clearWorkoutDraft = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing kept, or nothing that can be removed: either way, nothing to restore.
  }
};
