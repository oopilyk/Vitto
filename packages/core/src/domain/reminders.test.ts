import { describe, expect, it } from 'vitest';
import {
  MAX_REMINDERS,
  MAX_REMINDER_LABEL,
  type Reminder,
  type Weekday,
  describeReminderDays,
  formatReminderTime,
  isEveryDay,
  nextReminderOccurrence,
  normalizeReminderLabel,
  reminderError,
  weekdayOf,
} from './reminders';

const reminder = (over: Partial<Reminder> = {}): Reminder => ({
  id: 'r1',
  label: 'Take creatine',
  hour: 8,
  minute: 0,
  days: [],
  enabled: true,
  ...over,
});

describe('normalizeReminderLabel', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeReminderLabel('  take   creatine ')).toBe('take creatine');
  });

  it('caps the length so a label cannot overflow its row', () => {
    expect(normalizeReminderLabel('x'.repeat(200))).toHaveLength(MAX_REMINDER_LABEL);
  });
});

describe('reminderError', () => {
  it('accepts a valid draft', () => {
    expect(reminderError({ label: 'Creatine', hour: 8, minute: 30 }, 0)).toBeNull();
  });

  it('rejects a label that is only whitespace', () => {
    expect(reminderError({ label: '   ', hour: 8, minute: 0 }, 0)).toMatch(/name/i);
  });

  it('rejects times outside the clock', () => {
    expect(reminderError({ label: 'x', hour: 24, minute: 0 }, 0)).toMatch(/hour/i);
    expect(reminderError({ label: 'x', hour: -1, minute: 0 }, 0)).toMatch(/hour/i);
    expect(reminderError({ label: 'x', hour: 8, minute: 60 }, 0)).toMatch(/minute/i);
  });

  it('rejects a fractional time rather than silently rounding it', () => {
    expect(reminderError({ label: 'x', hour: 8.5, minute: 0 }, 0)).toMatch(/hour/i);
  });

  it('refuses past the cap, which exists because iOS limits pending notifications', () => {
    expect(reminderError({ label: 'x', hour: 8, minute: 0 }, MAX_REMINDERS - 1)).toBeNull();
    expect(reminderError({ label: 'x', hour: 8, minute: 0 }, MAX_REMINDERS)).toMatch(/most/i);
  });
});

describe('formatReminderTime', () => {
  it.each([
    [8, 0, '8:00 am'],
    [8, 5, '8:05 am'],
    [0, 0, '12:00 am'],
    [12, 0, '12:00 pm'],
    [13, 30, '1:30 pm'],
    [23, 59, '11:59 pm'],
  ])('formats %i:%i as %s', (hour, minute, expected) => {
    expect(formatReminderTime(hour, minute)).toBe(expected);
  });
});

describe('describeReminderDays', () => {
  it('treats no days and all seven as the same thing', () => {
    expect(isEveryDay([])).toBe(true);
    expect(describeReminderDays([])).toBe('Every day');
    expect(describeReminderDays([1, 2, 3, 4, 5, 6, 7])).toBe('Every day');
  });

  it('names the common runs', () => {
    expect(describeReminderDays([2, 3, 4, 5, 6])).toBe('Weekdays');
    expect(describeReminderDays([1, 7])).toBe('Weekends');
  });

  it('lists anything else Monday first, however the days were picked', () => {
    expect(describeReminderDays([6, 2, 4])).toBe('Mon, Wed, Fri');
    // Sunday reads last despite being 1 in the underlying numbering.
    expect(describeReminderDays([1, 2])).toBe('Mon, Sun');
  });
});

describe('nextReminderOccurrence', () => {
  // A Wednesday, 09:00 local.
  const wednesday = new Date(2026, 8, 9, 9, 0, 0, 0);

  it('is null while the reminder is switched off', () => {
    expect(nextReminderOccurrence(reminder({ enabled: false }), wednesday)).toBeNull();
  });

  it('rolls to tomorrow when today has already passed', () => {
    // 8am daily, asked at 9am: today is gone.
    const next = nextReminderOccurrence(reminder({ hour: 8 }), wednesday)!;
    expect(next.getDate()).toBe(wednesday.getDate() + 1);
    expect(next.getHours()).toBe(8);
  });

  it('stays today when the time is still ahead', () => {
    const next = nextReminderOccurrence(reminder({ hour: 20 }), wednesday)!;
    expect(next.getDate()).toBe(wednesday.getDate());
    expect(next.getHours()).toBe(20);
  });

  it('skips to the next selected weekday', () => {
    // Fridays only (6), asked on a Wednesday.
    const next = nextReminderOccurrence(reminder({ days: [6 as Weekday], hour: 7 }), wednesday)!;
    expect(weekdayOf(next)).toBe(6);
    expect(next.getDate()).toBe(wednesday.getDate() + 2);
  });

  it('wraps a week when the only day is the one that just passed', () => {
    // Wednesdays (4) at 8am, asked at 9am on Wednesday: a week out.
    const next = nextReminderOccurrence(reminder({ days: [4 as Weekday], hour: 8 }), wednesday)!;
    expect(weekdayOf(next)).toBe(4);
    expect(next.getDate()).toBe(wednesday.getDate() + 7);
  });

  it('never returns a time in the past', () => {
    for (const hour of [0, 8, 9, 12, 23]) {
      const next = nextReminderOccurrence(reminder({ hour }), wednesday);
      expect(next!.getTime()).toBeGreaterThan(wednesday.getTime());
    }
  });
});
