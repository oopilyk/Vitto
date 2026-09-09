/**
 * Reminders: "take my creatine at 8am", "protein before bed".
 *
 * Pure — the scheduling itself is a platform edge (`mobile/src/services/
 * reminders.ts` hands these to expo-notifications). What lives here is the
 * shape, the validation and the wording, so all three are testable without a
 * device and identical wherever a reminder is shown.
 *
 * These are the user's own notes to themselves, deliberately not health events:
 * a reminder that fires is not evidence anything was done, so it never touches
 * the pet's stats. Logging the meal or workout it prompts is what does that.
 */

/**
 * Weekdays as expo-notifications numbers them: 1 = Sunday through 7 = Saturday.
 * Matched here rather than translated at the edge so an off-by-one cannot hide
 * between the two layers.
 */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** Short labels, Sunday first, to match the numbering above. */
export const WEEKDAY_LABEL: Record<Weekday, string> = {
  1: 'Sun',
  2: 'Mon',
  3: 'Tue',
  4: 'Wed',
  5: 'Thu',
  6: 'Fri',
  7: 'Sat',
};

export interface Reminder {
  id: string;
  /** What to be reminded of, e.g. "Take creatine". */
  label: string;
  /** 24-hour local time. */
  hour: number;
  minute: number;
  /**
   * Which days it fires on. Empty means every day — an explicit "all seven"
   * would be the same thing said twice, and the empty case is what a new
   * reminder starts as.
   */
  days: Weekday[];
  enabled: boolean;
}

/**
 * A ceiling on how many can exist. iOS caps an app at 64 pending local
 * notifications, and a weekly reminder costs one slot per selected day — so
 * eight reminders on all seven days already reaches 56. Kept well under.
 */
export const MAX_REMINDERS = 8;
export const MAX_REMINDER_LABEL = 40;

export const isEveryDay = (days: readonly Weekday[]): boolean =>
  days.length === 0 || days.length === WEEKDAYS.length;

/** Collapses whitespace and trims, so "  take   creatine " stores tidily. */
export const normalizeReminderLabel = (label: string): string =>
  label.trim().replace(/\s+/g, ' ').slice(0, MAX_REMINDER_LABEL);

/**
 * Why a reminder cannot be saved, or null when it can. Returns copy rather than
 * a code: there is exactly one place this is shown, and a message is easier to
 * keep honest than a lookup table on the other side of the app.
 */
export const reminderError = (
  draft: { label: string; hour: number; minute: number },
  existingCount: number,
): string | null => {
  if (normalizeReminderLabel(draft.label).length === 0) return 'Give the reminder a name.';
  if (!Number.isInteger(draft.hour) || draft.hour < 0 || draft.hour > 23) {
    return 'Hour must be between 0 and 23.';
  }
  if (!Number.isInteger(draft.minute) || draft.minute < 0 || draft.minute > 59) {
    return 'Minutes must be between 0 and 59.';
  }
  if (existingCount >= MAX_REMINDERS) return `That is the most reminders Vitto can keep (${MAX_REMINDERS}).`;
  return null;
};

/** "8:05 am" — a 12-hour clock, since that is how the time was spoken to set it. */
export const formatReminderTime = (hour: number, minute: number): string => {
  const suffix = hour < 12 ? 'am' : 'pm';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, '0')} ${suffix}`;
};

/** "Every day", "Weekdays", "Weekends", or "Mon, Wed, Fri". */
export const describeReminderDays = (days: readonly Weekday[]): string => {
  if (isEveryDay(days)) return 'Every day';
  const sorted = [...days].sort((a, b) => a - b);
  const isWeekdays = sorted.length === 5 && sorted.every((day) => day >= 2 && day <= 6);
  if (isWeekdays) return 'Weekdays';
  const isWeekends = sorted.length === 2 && sorted[0] === 1 && sorted[1] === 7;
  if (isWeekends) return 'Weekends';
  // Monday-first for reading, even though the numbering is Sunday-first.
  const reading = [...sorted].sort((a, b) => ((a + 5) % 7) - ((b + 5) % 7));
  return reading.map((day) => WEEKDAY_LABEL[day]).join(', ');
};

/** The weekday `date` falls on, in this module's numbering. */
export const weekdayOf = (date: Date): Weekday => (date.getDay() + 1) as Weekday;

/**
 * When the reminder next fires, or null if it is switched off.
 *
 * Used for the "next: tomorrow 8:00 am" line rather than for scheduling — the OS
 * owns the actual repeat. Strictly after `from`, so a reminder set for a time
 * that has just passed reads as tomorrow rather than as already due.
 */
export const nextReminderOccurrence = (reminder: Reminder, from: Date): Date | null => {
  if (!reminder.enabled) return null;
  const days = isEveryDay(reminder.days) ? WEEKDAYS : reminder.days;
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(from);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(reminder.hour, reminder.minute, 0, 0);
    if (candidate > from && days.includes(weekdayOf(candidate))) return candidate;
  }
  return null;
};
