import { newId } from './ids';
import type { WorkoutTemplate } from './workoutTemplates';

/**
 * A split: routines and rest days in order, looped — Push, Pull, Legs, Rest —
 * so the app can say what today is for, rather than guessing a rest day from
 * how many workouts the week already has.
 *
 * A routine is one day's workout ("Push"); the split is which of them you do,
 * in what order. They are not the same list: a routine joins the split only
 * when it is added to it (addRoutineDay), and one can be kept for now and then
 * (an arms day, a run) without ever being part of the loop.
 *
 * It runs on the calendar. Day 1 is `startedOn`, the next day is day 2, and
 * after the last day it loops. A missed day still passes, the way a split does
 * in a gym, which is why it can be restarted from day 1, or stepped to the
 * right day.
 */
export type ScheduleDay = { kind: 'routine'; templateId: string } | { kind: 'rest'; id: string };

export interface TrainingSchedule {
  days: ScheduleDay[];
  /** Day 1 of the current loop, as a local date key (YYYY-MM-DD). */
  startedOn: string;
}

/** Two weeks of days: enough for any split, short enough to read on one screen. */
export const MAX_SCHEDULE_DAYS = 14;

export interface ScheduleToday {
  /** Index into the (resolved) days. */
  index: number;
  length: number;
  day: ScheduleDay;
  /** The routine, on a routine day. */
  template?: WorkoutTemplate;
}

/** A day's identity, the same however it moves: its routine, or the rest day's own id. */
export const scheduleDayId = (day: ScheduleDay): string => (day.kind === 'rest' ? `rest:${day.id}` : day.templateId);

const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const fromKey = (key: string): Date => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
};

/** Whole local days from `from` to `to`; rounded, since a clock change makes a day 23 or 25 hours. */
const daysBetween = (from: Date, to: Date): number => Math.round((to.getTime() - from.getTime()) / 86_400_000);

/** The days whose routine still exists. A deleted routine drops out of the loop rather than leaving a hole. */
export const resolvedDays = (schedule: TrainingSchedule, templates: readonly WorkoutTemplate[]): ScheduleDay[] =>
  schedule.days.filter((day) => day.kind === 'rest' || templates.some((template) => template.id === day.templateId));

const indexOn = (days: readonly ScheduleDay[], startedOn: string, date: Date): number => {
  const offset = daysBetween(fromKey(startedOn), new Date(date.getFullYear(), date.getMonth(), date.getDate()));
  return ((offset % days.length) + days.length) % days.length;
};

/** Which day of the rotation `date` is, or null with no rotation (or one with no routine in it). */
export const scheduleDayOn = (
  schedule: TrainingSchedule | null | undefined,
  templates: readonly WorkoutTemplate[],
  date: Date = new Date(),
): ScheduleToday | null => {
  if (!schedule) return null;
  const days = resolvedDays(schedule, templates);
  if (!days.some((day) => day.kind === 'routine')) return null;
  const index = indexOn(days, schedule.startedOn, date);
  const day = days[index]!;
  return {
    index,
    length: days.length,
    day,
    ...(day.kind === 'routine' ? { template: templates.find((template) => template.id === day.templateId) } : {}),
  };
};

/** `days` starting so that `date` is day `index + 1`. */
const startingAt = (days: ScheduleDay[], date: Date, index: number): TrainingSchedule => {
  const clamped = Math.max(0, Math.min(index, days.length - 1));
  return { days, startedOn: dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - clamped)) };
};

/**
 * The rotation started over so that `date` is day `index + 1`: from day 1
 * after a break, or from whichever day today should be. The index is into the
 * resolved days, as `scheduleDayOn` reports it.
 */
export const restartSchedule = (
  schedule: TrainingSchedule,
  templates: readonly WorkoutTemplate[],
  date: Date = new Date(),
  index = 0,
): TrainingSchedule => startingAt(resolvedDays(schedule, templates), date, index);

/** Today one day further on (or back): for putting the rotation right without starting over. */
export const stepToday = (
  schedule: TrainingSchedule,
  templates: readonly WorkoutTemplate[],
  by: number,
  date: Date = new Date(),
): TrainingSchedule => {
  const days = resolvedDays(schedule, templates);
  if (days.length === 0) return schedule;
  const index = indexOn(days, schedule.startedOn, date);
  return startingAt(days, date, (((index + by) % days.length) + days.length) % days.length);
};

/**
 * New days, with today kept on the same day: moving Legs up, or adding a rest
 * day at the end, must not change what today is for. When today's day itself
 * is gone, the loop carries on from where it was.
 */
const withDays = (schedule: TrainingSchedule | null, templates: readonly WorkoutTemplate[], next: ScheduleDay[], date: Date): TrainingSchedule => {
  if (!schedule) return startingAt(next, date, 0);
  const days = resolvedDays(schedule, templates);
  if (days.length === 0 || next.length === 0) return { days: next, startedOn: schedule.startedOn };
  const todayId = scheduleDayId(days[indexOn(days, schedule.startedOn, date)]!);
  const index = next.findIndex((day) => scheduleDayId(day) === todayId);
  return index >= 0 ? startingAt(next, date, index) : { days: next, startedOn: schedule.startedOn };
};

/**
 * The split squared with the routines there are: a day whose routine was
 * deleted is gone, everything else as it was. A routine is never added here:
 * the split is the person's choice (see addRoutineDay). `changed` says whether
 * it differs from what was saved.
 */
export const reconcileSchedule = (
  schedule: TrainingSchedule | null,
  templates: readonly WorkoutTemplate[],
  date: Date = new Date(),
): { schedule: TrainingSchedule | null; changed: boolean } => {
  if (!schedule) return { schedule, changed: false };
  const kept = resolvedDays(schedule, templates);
  if (kept.length === schedule.days.length) return { schedule, changed: false };
  // Nothing left to train: no split, rather than a loop of rest days.
  if (!kept.some((day) => day.kind === 'routine')) return { schedule: null, changed: true };
  return { schedule: withDays(schedule, templates, kept, date), changed: true };
};

/** A routine added as the split's last day. Already in it, or a full split: as it was. */
export const addRoutineDay = (
  schedule: TrainingSchedule | null,
  templates: readonly WorkoutTemplate[],
  templateId: string,
  date: Date = new Date(),
): TrainingSchedule | null => {
  const days = schedule ? resolvedDays(schedule, templates) : [];
  if (days.length >= MAX_SCHEDULE_DAYS || days.some((day) => day.kind === 'routine' && day.templateId === templateId)) return schedule;
  if (!templates.some((template) => template.id === templateId)) return schedule;
  return withDays(schedule, templates, [...days, { kind: 'routine', templateId }], date);
};

/**
 * A day taken out of the split: a rest day, or a routine (which stays a
 * routine, only not part of the loop). Taking the last routine out ends the split.
 */
export const removeScheduleDay = (
  schedule: TrainingSchedule,
  templates: readonly WorkoutTemplate[],
  id: string,
  date: Date = new Date(),
): TrainingSchedule | null => {
  const next = resolvedDays(schedule, templates).filter((day) => scheduleDayId(day) !== id);
  if (!next.some((day) => day.kind === 'routine')) return null;
  return withDays(schedule, templates, next, date);
};

/** A day moved to position `to` (dragged there), the days between closing up. */
export const moveScheduleDay = (
  schedule: TrainingSchedule,
  templates: readonly WorkoutTemplate[],
  id: string,
  to: number,
  date: Date = new Date(),
): TrainingSchedule => {
  const days = [...resolvedDays(schedule, templates)];
  const from = days.findIndex((day) => scheduleDayId(day) === id);
  if (from < 0 || to < 0 || to >= days.length || to === from) return schedule;
  const [moved] = days.splice(from, 1);
  days.splice(to, 0, moved!);
  return withDays(schedule, templates, days, date);
};

/** A rest day added at the end of the loop. */
export const addRestDay = (
  schedule: TrainingSchedule | null,
  templates: readonly WorkoutTemplate[],
  date: Date = new Date(),
): TrainingSchedule => {
  const days = schedule ? resolvedDays(schedule, templates) : [];
  if (days.length >= MAX_SCHEDULE_DAYS) return schedule!;
  return withDays(schedule, templates, [...days, { kind: 'rest', id: newId() }], date);
};

/** A rest day taken out. (A routine leaves the rotation by being deleted.) */
export const removeRestDay = (
  schedule: TrainingSchedule,
  templates: readonly WorkoutTemplate[],
  id: string,
  date: Date = new Date(),
): TrainingSchedule =>
  withDays(
    schedule,
    templates,
    resolvedDays(schedule, templates).filter((day) => scheduleDayId(day) !== id),
    date,
  );

/** Only a well-formed rotation, from storage that may hold anything. */
export const parseSchedule = (value: unknown): TrainingSchedule | null => {
  if (!value || typeof value !== 'object') return null;
  const { days, startedOn } = value as Partial<TrainingSchedule>;
  if (!Array.isArray(days) || typeof startedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startedOn)) return null;
  const clean = days.flatMap((day): ScheduleDay[] => {
    if (!day || typeof day !== 'object') return [];
    const raw = day as { kind?: unknown; templateId?: unknown; id?: unknown };
    if (raw.kind === 'routine' && typeof raw.templateId === 'string') return [{ kind: 'routine', templateId: raw.templateId }];
    // A rest day from before rest days had ids gets one.
    if (raw.kind === 'rest') return [{ kind: 'rest', id: typeof raw.id === 'string' ? raw.id : newId() }];
    return [];
  });
  return clean.length > 0 ? { days: clean.slice(0, MAX_SCHEDULE_DAYS), startedOn } : null;
};
