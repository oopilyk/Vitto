import { describe, expect, it } from 'vitest';
import {
  MAX_WORKOUT_TEMPLATES,
  removeTemplate,
  sessionFromTemplate,
  templateError,
  templateFromSession,
  upsertTemplate,
} from './workoutTemplates';
import { addSet, createExercise } from './workout';

const NOW = new Date('2026-09-11T10:00:00Z');

const push = () => {
  const bench = addSet(createExercise('Bench Press', 'chest', false, 'lb'), 'lb');
  const press = createExercise('Shoulder Press', 'shoulders', false, 'lb');
  return [bench, press];
};

describe('templateFromSession', () => {
  it('remembers the exercises and sets, ready to log, with last time carried as previous', () => {
    const exercises = push();
    exercises[0].sets[0].weight = 135;

    const routine = templateFromSession('Push', exercises, undefined, NOW);

    expect(routine.name).toBe('Push');
    expect(routine.exercises.map((e) => e.name)).toEqual(['Bench Press', 'Shoulder Press']);
    const first = routine.exercises[0].sets[0];
    // A set on the list is a set you did, so it comes back counted rather than
    // waiting to be ticked off.
    expect(first.completed).toBe(true);
    expect(first.weight).toBe(135);
    expect(first.previous).toEqual({ reps: 8, weight: 135, unit: 'lb' });
    // Fresh ids: a routine never shares set ids with the session it came from.
    expect(first.id).not.toBe(exercises[0].sets[0].id);
  });

  it('keeps every set, because every set on the list was done', () => {
    const routine = templateFromSession('Push', push(), undefined, NOW);
    expect(routine.exercises[0].sets).toHaveLength(2);
    expect(routine.exercises).toHaveLength(2);
  });

  it('still drops the skipped sets of a session logged under the old tick-to-count rule', () => {
    // Sessions stored before a set counted on sight carry genuinely unticked
    // sets. Those were not trained and must not be written into the routine.
    const exercises = push();
    exercises[0].sets[1].completed = false; // bench set 2 skipped back then
    const routine = templateFromSession('Push', exercises, undefined, NOW);
    expect(routine.exercises[0].sets).toHaveLength(1);
  });

  it('drops an exercise from an old session where every set was skipped', () => {
    const exercises = push();
    exercises[1].sets[0].completed = false; // shoulder press: nothing done
    const routine = templateFromSession('Push', exercises, undefined, NOW);
    expect(routine.exercises.map((e) => e.name)).toEqual(['Bench Press']);
  });

  it('tidies the name', () => {
    expect(templateFromSession('  push   day  ', push(), undefined, NOW).name).toBe('push day');
  });
});

describe('sessionFromTemplate', () => {
  it('starts a fresh session, already counted, with new ids each time', () => {
    const routine = templateFromSession('Push', push(), undefined, NOW);
    const a = sessionFromTemplate(routine);
    const b = sessionFromTemplate(routine);
    // Loading Push and doing four of its five exercises means deleting the
    // fifth, not leaving it untouched and trusting it not to count.
    expect(a[0].sets.every((set) => set.completed)).toBe(true);
    expect(a[0].id).not.toBe(b[0].id);
    expect(a[0].sets[0].id).not.toBe(routine.exercises[0].sets[0].id);
    expect(a[0].sets[0].weight).toBe(routine.exercises[0].sets[0].weight);
  });
});

describe('upsertTemplate', () => {
  it('replaces a routine of the same name, case-insensitively, and puts it first', () => {
    const old = templateFromSession('Push', push(), undefined, NOW);
    const legs = templateFromSession('Legs', push(), undefined, NOW);
    const updated = templateFromSession('push', push(), undefined, NOW);
    const list = upsertTemplate([legs, old], updated);
    expect(list.map((t) => t.name)).toEqual(['push', 'Legs']);
    expect(list).toHaveLength(2);
  });

  it('updates by id even if the name changed', () => {
    const old = templateFromSession('Push', push(), undefined, NOW);
    const renamed = templateFromSession('Push A', push(), old.id, NOW);
    expect(upsertTemplate([old], renamed).map((t) => t.name)).toEqual(['Push A']);
  });

  it('caps the list', () => {
    let list = [] as ReturnType<typeof templateFromSession>[];
    for (let n = 0; n < MAX_WORKOUT_TEMPLATES + 3; n += 1) {
      list = upsertTemplate(list, templateFromSession(`R${n}`, push(), undefined, NOW));
    }
    expect(list).toHaveLength(MAX_WORKOUT_TEMPLATES);
  });
});

describe('templateError', () => {
  it('needs a name and at least one exercise', () => {
    expect(templateError('', push(), [])).toMatch(/name/);
    expect(templateError('Push', [], [])).toMatch(/exercise/);
    expect(templateError('Push', push(), [])).toBeNull();
  });

  it('allows overwriting a same-named routine even at the cap', () => {
    const list = Array.from({ length: MAX_WORKOUT_TEMPLATES }, (_, n) =>
      templateFromSession(`R${n}`, push(), undefined, NOW),
    );
    expect(templateError('R3', push(), list)).toBeNull();
    expect(templateError('Brand new', push(), list)).toMatch(/up to/);
  });
});

describe('removeTemplate', () => {
  it('removes by id', () => {
    const a = templateFromSession('A', push(), undefined, NOW);
    const b = templateFromSession('B', push(), undefined, NOW);
    expect(removeTemplate([a, b], a.id).map((t) => t.name)).toEqual(['B']);
  });
});
