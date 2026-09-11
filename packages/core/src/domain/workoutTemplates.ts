import { newId } from './ids';
import type { WorkoutExercise, WorkoutSet } from './health';

/**
 * Saved routines — "Push", "Pull", "Legs" — so logging a workout you do every
 * week is one tap to load and one tap to finish, not a search per exercise.
 *
 * A routine is the exercises and the sets you did LAST time. Loading one gives
 * you those sets pre-filled but unticked; finishing it writes what you actually
 * did back into the routine, so next week opens on this week's numbers. That is
 * how progression carries forward without a separate "edit routine" chore.
 *
 * Device-local like reminders and the gym pin: personal setup, not history.
 */
export interface WorkoutTemplate {
  id: string;
  name: string;
  exercises: WorkoutExercise[];
  updatedAt: string;
}

/** Enough for a full split with variants; past this the strip stops being a strip. */
export const MAX_WORKOUT_TEMPLATES = 12;
export const MAX_TEMPLATE_NAME = 24;

export const normalizeTemplateName = (name: string): string =>
  name.trim().replace(/\s+/g, ' ').slice(0, MAX_TEMPLATE_NAME);

const sameName = (a: string, b: string): boolean =>
  normalizeTemplateName(a).toLowerCase() === normalizeTemplateName(b).toLowerCase();

/**
 * A set as a routine remembers it: fresh id, unticked, and what was done last
 * time carried as `previous` so the row can show it. Weight and reps are kept
 * as the starting values — most people repeat or nudge, so pre-filling beats a
 * blank.
 */
const rememberSet = (set: WorkoutSet): WorkoutSet => ({
  id: newId(),
  reps: set.reps,
  weight: set.weight,
  unit: set.unit,
  completed: false,
  previous: { reps: set.reps, weight: set.weight, unit: set.unit },
});

const rememberExercise = (exercise: WorkoutExercise): WorkoutExercise => ({
  ...exercise,
  id: newId(),
  sets: exercise.sets.map(rememberSet),
});

/**
 * Turns a finished (or half-built) session into a routine. Only ticked sets
 * are kept when any were ticked — a set you skipped this week is not part of
 * the routine — but a session with nothing ticked keeps everything, so "save
 * this as a routine" works before you have trained it once.
 */
export const templateFromSession = (
  name: string,
  exercises: WorkoutExercise[],
  existingId?: string,
  now: Date = new Date(),
): WorkoutTemplate => {
  const anyTicked = exercises.some((exercise) => exercise.sets.some((set) => set.completed));
  const kept = exercises
    .map((exercise) => ({
      ...exercise,
      sets: anyTicked ? exercise.sets.filter((set) => set.completed) : exercise.sets,
    }))
    .filter((exercise) => exercise.sets.length > 0);
  return {
    id: existingId ?? newId(),
    name: normalizeTemplateName(name),
    exercises: kept.map(rememberExercise),
    updatedAt: now.toISOString(),
  };
};

/** A fresh session from a routine: new ids every time, nothing ticked. */
export const sessionFromTemplate = (template: WorkoutTemplate): WorkoutExercise[] =>
  template.exercises.map(rememberExercise);

/** Replace a routine of the same name (case-insensitive) or append. Newest first. */
export const upsertTemplate = (
  templates: readonly WorkoutTemplate[],
  template: WorkoutTemplate,
): WorkoutTemplate[] => {
  const rest = templates.filter(
    (candidate) => candidate.id !== template.id && !sameName(candidate.name, template.name),
  );
  return [template, ...rest].slice(0, MAX_WORKOUT_TEMPLATES);
};

export const removeTemplate = (
  templates: readonly WorkoutTemplate[],
  id: string,
): WorkoutTemplate[] => templates.filter((template) => template.id !== id);

/** Why a routine cannot be saved, or null. */
export const templateError = (
  name: string,
  exercises: readonly WorkoutExercise[],
  templates: readonly WorkoutTemplate[],
  existingId?: string,
): string | null => {
  const clean = normalizeTemplateName(name);
  if (!clean) return 'Give the routine a name.';
  if (exercises.length === 0) return 'Add an exercise before saving a routine.';
  const replacing = templates.some(
    (candidate) => candidate.id !== existingId && sameName(candidate.name, clean),
  );
  if (!replacing && !existingId && templates.length >= MAX_WORKOUT_TEMPLATES) {
    return `You can keep up to ${MAX_WORKOUT_TEMPLATES} routines.`;
  }
  return null;
};
