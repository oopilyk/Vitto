import { newId } from './ids';
import type { HealthEvent, WorkoutExercise, WorkoutMetadata, WorkoutSet } from './health';

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
 * A set as a routine remembers it: fresh id, and what was done last time carried
 * as `previous` so the row can show it. Weight and reps are kept as the starting
 * values — most people repeat or nudge, so pre-filling beats a blank.
 *
 * Loaded already done, to match the rule everywhere else: the row is the claim.
 * Loading Push and doing four of its five exercises means deleting the fifth,
 * not leaving it untouched and hoping it does not count.
 */
const rememberSet = (set: WorkoutSet): WorkoutSet => ({
  id: newId(),
  reps: set.reps,
  weight: set.weight,
  unit: set.unit,
  completed: true,
  previous: { reps: set.reps, weight: set.weight, unit: set.unit },
});

const rememberExercise = (exercise: WorkoutExercise): WorkoutExercise => ({
  ...exercise,
  id: newId(),
  sets: exercise.sets.map(rememberSet),
});

/**
 * Turns a finished (or half-built) session into a routine. Every set on the
 * list is kept, since every set on the list was done. The filter below only
 * still bites on a session stored under the old tick-to-count rule, where a
 * genuinely skipped set should not become part of the routine.
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
    // An exercise that never had sets is a run, logged by distance and time, and
    // belongs in the routine. One that HAD sets and lost every one of them to the
    // filter above was skipped, and does not.
    .filter((exercise, index) => exercise.sets.length > 0 || exercises[index]!.sets.length === 0);
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

/**
 * The sets each exercise had the last time it was logged, by exercise name:
 * what the "Previous" column shows, and what an exercise added by hand starts
 * from, the way a routine starts from last time. Newest first, so the first
 * session to mention an exercise wins. Sets that were never done (stored under
 * the old tick-to-count rule) and empty ones are left out.
 */
export const lastSetsByExercise = (events: readonly HealthEvent[]): Map<string, WorkoutSet[]> => {
  const last = new Map<string, WorkoutSet[]>();
  const newestFirst = [...events]
    .filter((event) => event.type === 'WORKOUT')
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  for (const event of newestFirst) {
    for (const exercise of (event.metadata as WorkoutMetadata).exercises ?? []) {
      if (last.has(exercise.name)) continue;
      const done = exercise.sets.filter((set) => set.completed && set.reps > 0);
      if (done.length > 0) last.set(exercise.name, done);
    }
  }
  return last;
};

/**
 * An exercise picked from the library, starting on what was done last time
 * (same sets, same numbers, each carrying `previous`), or as it is when it has
 * never been logged.
 */
export const exerciseFromHistory = (exercise: WorkoutExercise, lastSets: readonly WorkoutSet[] | undefined): WorkoutExercise =>
  lastSets && lastSets.length > 0 && !exercise.distance ? { ...exercise, sets: lastSets.map(rememberSet) } : exercise;
