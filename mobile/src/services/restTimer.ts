import * as Notifications from 'expo-notifications';
import { setIslandRest } from './petIsland';

/**
 * The rest between sets, outside the workout screen: a local notification for
 * when it is up (the phone is usually locked on the bench by then) and the
 * countdown on the pet's Live Activity.
 *
 * Never asks for notification permission: a prompt in the middle of a set is
 * the wrong moment. Someone who allowed reminders gets the buzz; anyone else
 * still has the Island and the timer on screen.
 */

/** Marks the rest alert, so the foreground handler can keep it quiet (the screen already says so). */
export const REST_TAG = 'vitto.rest';
const REST_ID = 'vitto-rest';

const available = (): boolean => typeof Notifications.scheduleNotificationAsync === 'function';

export const cancelRestAlert = async (): Promise<void> => {
  if (!available()) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(REST_ID);
  } catch {
    // Nothing was scheduled.
  }
};

const scheduleRestAlert = async (endsAt: number, next: string): Promise<void> => {
  if (!available()) return;
  try {
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;
    await Notifications.scheduleNotificationAsync({
      identifier: REST_ID,
      content: { title: 'Rest is up', body: next, sound: true, data: { tag: REST_TAG } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(endsAt) },
    });
  } catch {
    // The on-screen timer still runs.
  }
};

/** Starts or moves the rest: `endsAt` is epoch ms, `label` the exercise resting from. */
export const startRest = async (endsAt: number, startedAt: number, label: string): Promise<void> => {
  await cancelRestAlert();
  await Promise.all([
    scheduleRestAlert(endsAt, `Time for your next set of ${label}.`),
    setIslandRest({ startedAt, endsAt, label }),
  ]);
};

export const stopRest = async (): Promise<void> => {
  await Promise.all([cancelRestAlert(), setIslandRest(null)]);
};
