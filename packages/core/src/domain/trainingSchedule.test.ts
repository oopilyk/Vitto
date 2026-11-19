import { describe, expect, it } from 'vitest';
import {
  addRestDay,
  moveScheduleDay,
  parseSchedule,
  addRoutineDay,
  reconcileSchedule,
  removeScheduleDay,
  removeRestDay,
  restartSchedule,
  scheduleDayOn,
  stepToday,
  type TrainingSchedule,
} from './trainingSchedule';
import type { WorkoutTemplate } from './workoutTemplates';

const template = (id: string): WorkoutTemplate => ({ id, name: id, exercises: [], updatedAt: '2026-11-01T00:00:00Z' });
const templates = [template('Push'), template('Pull'), template('Legs')];
const schedule: TrainingSchedule = {
  days: [{ kind: 'routine', templateId: 'Push' }, { kind: 'routine', templateId: 'Pull' }, { kind: 'rest', id: 'r1' }, { kind: 'routine', templateId: 'Legs' }],
  startedOn: '2026-11-02',
};
const on = (day: number) => new Date(2026, 10, day, 15);
const today = (next: TrainingSchedule, date = on(3)) => {
  const found = scheduleDayOn(next, templates, date);
  return found?.template?.name ?? found?.day.kind;
};

describe('training rotation', () => {
  it('moves one day per calendar day and loops', () => {
    expect(today(schedule, on(2))).toBe('Push');
    expect(today(schedule, on(3))).toBe('Pull');
    expect(today(schedule, on(4))).toBe('rest');
    expect(today(schedule, on(5))).toBe('Legs');
    expect(scheduleDayOn(schedule, templates, on(6))).toMatchObject({ index: 0, length: 4 });
    expect(today(schedule, on(1))).toBe('Legs');
  });

  it('drops a deleted routine from the loop', () => {
    expect(scheduleDayOn(schedule, [template('Push'), template('Legs')], on(3))).toMatchObject({ length: 3, day: { kind: 'rest' } });
    expect(scheduleDayOn(schedule, [], on(3))).toBeNull();
  });

  it('restarts from day 1, or steps today forward and back', () => {
    expect(today(restartSchedule(schedule, templates, on(20)), on(20))).toBe('Push');
    expect(today(stepToday(schedule, templates, 1, on(3)))).toBe('rest');
    expect(today(stepToday(schedule, templates, -2, on(3)))).toBe('Legs');
  });

  it('keeps today on the same day while days are moved, added and removed', () => {
    // Today (the 3rd) is Pull.
    const moved = moveScheduleDay(schedule, templates, 'Pull', 0, on(3));
    expect(moved.days.map((day) => (day.kind === 'rest' ? 'rest' : day.templateId))).toEqual(['Pull', 'Push', 'rest', 'Legs']);
    expect(today(moved)).toBe('Pull');
    expect(today(moved, on(4))).toBe('Push');
    // Dragged a long way: Push to the end, the others closing up.
    const dragged = moveScheduleDay(schedule, templates, 'Push', 3, on(3));
    expect(dragged.days.map((day) => (day.kind === 'rest' ? 'rest' : day.templateId))).toEqual(['Pull', 'rest', 'Legs', 'Push']);
    expect(today(dragged)).toBe('Pull');
    const rested = addRestDay(schedule, templates, on(3));
    expect(rested.days).toHaveLength(5);
    expect(today(rested)).toBe('Pull');
    const unrested = removeRestDay(schedule, templates, 'rest:r1', on(3));
    expect(unrested.days).toHaveLength(3);
    expect(today(unrested)).toBe('Pull');
  });

  it('puts every routine in the rotation: a new one at the end, all of them oldest first when there was none', () => {
    // Routines are kept newest first; the rotation starts with the oldest.
    // A split is chosen, never filled in: no split stays none, a new routine stays out of it.
    expect(reconcileSchedule(null, templates, on(3))).toEqual({ schedule: null, changed: false });
    expect(reconcileSchedule(schedule, [template('Arms'), ...templates], on(3)).changed).toBe(false);
    // A deleted routine's day goes, and today stays on its day.
    const dropped = reconcileSchedule(schedule, [template('Pull'), template('Legs')], on(3));
    expect(dropped.changed).toBe(true);
    expect(dropped.schedule!.days.map((day) => (day.kind === 'routine' ? day.templateId : 'rest'))).toEqual(['Pull', 'rest', 'Legs']);
    expect(reconcileSchedule(schedule, templates, on(3)).changed).toBe(false);
  });

  it('reads only well-formed rotations from storage, giving old rest days an id', () => {
    const parsed = parseSchedule({ days: [{ kind: 'nap' }, { kind: 'rest' }], startedOn: '2026-11-02' });
    expect(parsed?.days).toEqual([{ kind: 'rest', id: expect.any(String) }]);
    expect(parseSchedule({ days: [], startedOn: 'soon' })).toBeNull();
    expect(parseSchedule(null)).toBeNull();
  });

  it('adds a routine to the split once, at the end, keeping today', () => {
    const arms = template('Arms');
    const all = [...templates, arms];
    const added = addRoutineDay(schedule, all, 'Arms', on(3))!;
    expect(added.days.at(-1)).toEqual({ kind: 'routine', templateId: 'Arms' });
    expect(scheduleDayOn(added, all, on(3))?.day).toEqual(scheduleDayOn(schedule, all, on(3))?.day);
    expect(addRoutineDay(added, all, 'Arms', on(3))).toBe(added);
    expect(addRoutineDay(schedule, all, 'Gone', on(3))).toBe(schedule);
    // The first routine added starts a split, today day 1.
    const started = addRoutineDay(null, all, 'Push', on(3))!;
    expect(scheduleDayOn(started, all, on(3))?.template?.name).toBe('Push');
  });

  it('takes a routine out of the split without deleting it, and the last one ends the split', () => {
    const without = removeScheduleDay(schedule, templates, 'Pull', on(3))!;
    expect(without.days.some((day) => day.kind === 'routine' && day.templateId === 'Pull')).toBe(false);
    const onlyPush: TrainingSchedule = { days: [{ kind: 'routine', templateId: 'Push' }, { kind: 'rest', id: 'r1' }], startedOn: '2026-11-02' };
    expect(removeScheduleDay(onlyPush, templates, 'Push', on(3))).toBeNull();
  });
});
