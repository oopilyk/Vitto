import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { planAffirmations } from '@vitto/core';

/**
 * The pet's affirmations, as local notifications (see the planner in
 * @vitto/core). Scheduled on the phone, so they need no server and no push
 * token, cost nothing, and work on a build that cannot receive remote push.
 *
 * Re-synced on every app open: the planner pins them to fixed days, so a
 * re-sync lands on the same moments and only tops the queue back up.
 */

/** Marks this app's affirmations, so a resync clears only its own. */
const AFFIRMATION_TAG = 'vitto.affirmation';
const STORAGE_KEY = 'vitto.affirmations';
/** How many are queued ahead: about a week, so a phone left closed still hears from the pet. */
const QUEUED = 4;

const available = (): boolean => typeof Notifications.scheduleNotificationAsync === 'function';

/** On unless turned off: they only ever schedule once notifications are allowed anyway. */
export const loadAffirmationsEnabled = async (): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) !== 'off';
  } catch {
    return true;
  }
};

export const saveAffirmationsEnabled = async (enabled: boolean): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // The toggle still applies for this session; it just will not survive a restart.
  }
};

/**
 * Makes the queue match: cleared, and refilled when on. Never asks for
 * permission -- that is the toggle's job, in the moment someone turns it on --
 * so calling it at launch is silent. Quietly does nothing where notifications
 * cannot work.
 */
export const syncAffirmations = async ({ enabled, petName, petId }: { enabled: boolean; petName: string; petId: string }) => {
  if (!available()) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((item) => (item.content.data as { tag?: string } | undefined)?.tag === AFFIRMATION_TAG)
        .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
    );
    if (!enabled || !(await Notifications.getPermissionsAsync()).granted) return;

    for (const { at, body } of planAffirmations(new Date(), petId, QUEUED)) {
      // eslint-disable-next-line no-await-in-loop
      await Notifications.scheduleNotificationAsync({
        content: { title: petName, body, data: { tag: AFFIRMATION_TAG } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
      });
    }
  } catch {
    // An affirmation that fails to schedule is not worth surfacing; the next
    // app open tries again.
  }
};
