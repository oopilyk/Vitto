import * as Notifications from 'expo-notifications';
import { type Reminder, WEEKDAYS, isEveryDay } from '@vitto/core';

/**
 * Turns saved reminders into scheduled local notifications.
 *
 * Local only: nothing leaves the device, there is no push token and no server.
 * The OS owns the repeat, so Vitto does not need to be running — which is the
 * entire point of a reminder to take your creatine.
 *
 * Everything here degrades to a no-op where notifications are unavailable (web,
 * Expo Go without the module, a denied permission), so callers can schedule
 * unguarded and the app behaves the same minus the alert.
 */

/** Marks every notification this app schedules, so a resync only clears its own. */
const REMINDER_TAG = 'vitto.reminder';

export type NotificationPermission = 'unknown' | 'granted' | 'denied' | 'unavailable';

const available = (): boolean => typeof Notifications.scheduleNotificationAsync === 'function';

/**
 * Asks once, and reports what happened. Called when the user adds their first
 * reminder rather than at launch: a permission prompt makes sense in the moment
 * someone asks to be reminded, and is noise before that.
 */
export const requestReminderPermission = async (): Promise<NotificationPermission> => {
  if (!available()) return 'unavailable';
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return 'granted';
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
};

export const reminderPermissionStatus = async (): Promise<NotificationPermission> => {
  if (!available()) return 'unavailable';
  try {
    const existing = await Notifications.getPermissionsAsync();
    return existing.granted ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
};

/**
 * Rewrites the schedule to match `reminders` exactly.
 *
 * Cancels this app's reminders and reschedules rather than diffing: the set is
 * tiny (capped at `MAX_REMINDERS`), and a diff would have to track OS-assigned
 * identifiers across edits, which is a lot of state to keep correct for no gain.
 *
 * A daily reminder is one notification; a weekly one costs a slot per selected
 * day, since the trigger only matches a single weekday. That is what
 * `MAX_REMINDERS` is sized against.
 */
export const syncScheduledReminders = async (reminders: readonly Reminder[]): Promise<void> => {
  if (!available()) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((item) => (item.content.data as { tag?: string } | undefined)?.tag === REMINDER_TAG)
        .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
    );

    for (const reminder of reminders) {
      if (!reminder.enabled) continue;
      const content = {
        title: reminder.label,
        body: 'A reminder you set in Vitto.',
        data: { tag: REMINDER_TAG, reminderId: reminder.id },
      };
      if (isEveryDay(reminder.days)) {
        // eslint-disable-next-line no-await-in-loop
        await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: reminder.hour,
            minute: reminder.minute,
          },
        });
        continue;
      }
      for (const weekday of reminder.days.length ? reminder.days : WEEKDAYS) {
        // eslint-disable-next-line no-await-in-loop
        await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour: reminder.hour,
            minute: reminder.minute,
          },
        });
      }
    }
  } catch {
    // A reminder that fails to schedule is not worth breaking the screen over;
    // the saved list is still correct and the next sync will try again.
  }
};
