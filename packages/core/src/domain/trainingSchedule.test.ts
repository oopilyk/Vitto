import { describe, expect, it } from 'vitest';
import {
  addRestDay,
  moveScheduleDay,
  parseSchedule,
  reconcileSchedule,
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
    const fresh = reconcileSchedule(null, [template('Legs'), template('Pull'), template('Push')], on(3));
    expect(fresh.changed).toBe(true);
    expect(fresh.schedule!.days.map((day) => (day.kind === 'routine' ? day.templateId : 'rest'))).toEqual(['Push', 'Pull', 'Legs']);
    expect(today(fresh.schedule!)).toBe('Push');
    const added = reconcileSchedule(schedule, [template('Arms'), ...templates], on(3));
    expect(added.schedule!.days.at(-1)).toEqual({ kind: 'routine', templateId: 'Arms' });
    expect(scheduleDayOn(added.schedule, [template('Arms'), ...templates], on(3))?.template?.name).toBe('Pull');
    expect(reconcileSchedule(schedule, templates, on(3)).changed).toBe(false);
  });

  it('reads only well-formed rotations from storage, giving old rest days an id', () => {
    const parsed = parseSchedule({ days: [{ kind: 'nap' }, { kind: 'rest' }], startedOn: '2026-11-02' });
    expect(parsed?.days).toEqual([{ kind: 'rest', id: expect.any(String) }]);
    expect(parseSchedule({ days: [], startedOn: 'soon' })).toBeNull();
    expect(parseSchedule(null)).toBeNull();
  });
});
