import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import appConfig from '../../app.json';
import { companionService } from './companionService';

/**
 * Registering this device so the pet can reach it while the app is closed.
 *
 * Distinct from `reminders.ts`, which schedules LOCAL notifications the OS
 * fires on a timer and which never leave the phone. These are remote: the
 * server decides there is something worth saying (see the `notify` edge
 * function) and pushes it. The only thing stored here is an Expo token, which
 * identifies a device install and nothing about the person.
 *
 * Everything degrades to a no-op where push cannot work — web, a simulator, a
 * denied permission, a project without EAS configured — so callers can register
 * unguarded and the app behaves the same minus the notifications.
 */

export type PushStatus =
  | 'ready'
  | 'denied'
  /** No EAS project id, so Expo cannot mint a token. See the README. */
  | 'unconfigured'
  /** Web, a simulator, or Expo Go without the module. */
  | 'unsupported';

export interface PushRegistration {
  status: PushStatus;
  /** What the server has stored for this device; absent unless it answered. */
  enabled?: boolean;
}

/**
 * Expo mints push tokens per EAS project, so this id is required. It is read
 * from app.json rather than `expo-constants` to avoid a dependency for one
 * string, and its absence is reported rather than thrown: a project that has
 * not run `eas init` yet should still build and run.
 */
const projectId: string | undefined =
  (appConfig as { expo?: { extra?: { eas?: { projectId?: string } } } }).expo?.extra?.eas?.projectId;

const available = (): boolean =>
  Platform.OS !== 'web' && typeof Notifications.getExpoPushTokenAsync === 'function';

/**
 * How a notification behaves while the app is already open.
 *
 * The pet speaks on screen when the app is foregrounded — the speech bubble
 * over its head — so a banner carrying the same sentence is the message twice.
 * Reminders are the opposite: a reminder the user set is worth interrupting for.
 */
export const installNotificationHandler = (): void => {
  if (typeof Notifications.setNotificationHandler !== 'function') return;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const fromPet = notification.request.content.data?.screen === 'companion';
      return {
        shouldShowBanner: !fromPet,
        shouldShowList: true,
        shouldPlaySound: !fromPet,
        shouldSetBadge: false,
      };
    },
  });
};

/**
 * Asks, mints a token and hands it to the server. Safe to call on every launch:
 * the server upserts on the token, so this refreshes the timezone and the
 * last-seen time rather than piling up rows.
 *
 * Called once there is a pet worth being notified about, not at first launch —
 * a permission prompt before anyone has met their pet is asking for a "no".
 */
export const registerForPush = async (): Promise<PushRegistration> => {
  if (!available()) return { status: 'unsupported' };
  if (!projectId) return { status: 'unconfigured' };
  try {
    const existing = await Notifications.getPermissionsAsync();
    const granted = existing.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return { status: 'denied' };

    if (Platform.OS === 'android' && typeof Notifications.setNotificationChannelAsync === 'function') {
      await Notifications.setNotificationChannelAsync('companion', {
        name: 'Your pet',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    // No `enabled` here on purpose: this runs on every launch, and saying
    // "enabled: true" would overrule a person who turned notifications off.
    const { enabled } = await companionService.registerDevice({
      token,
      platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'unknown',
      // Negated: getTimezoneOffset counts minutes WEST of UTC. This is what
      // lets the server work out whether it is the evening where THEY are.
      utcOffsetMinutes: -new Date().getTimezoneOffset(),
    });
    return { status: 'ready', enabled };
  } catch (error) {
    console.warn('[push] registration failed', error);
    return { status: 'unsupported' };
  }
};

/** Stops notifications for this device without touching the OS permission. */
export const setPushEnabled = async (enabled: boolean): Promise<PushStatus> => {
  if (!available()) return 'unsupported';
  if (!projectId) return 'unconfigured';
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await companionService.registerDevice({
      token,
      platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'unknown',
      utcOffsetMinutes: -new Date().getTimezoneOffset(),
      enabled,
    });
    return 'ready';
  } catch (error) {
    console.warn('[push] could not change the setting', error);
    return 'unsupported';
  }
};

/**
 * Calls back when a notification is tapped, including the one that launched a
 * cold app. Returns an unsubscribe.
 *
 * The cold-start case is the one that is easy to miss and the one that matters
 * most: tapping a notification on a phone where the app is not running is the
 * whole point of sending it, and it arrives as a value to be read once rather
 * than as an event.
 */
export const onNotificationTap = (handler: (data: Record<string, unknown>) => void): (() => void) => {
  if (typeof Notifications.addNotificationResponseReceivedListener !== 'function') return () => {};
  let live = true;
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    handler((response.notification.request.content.data ?? {}) as Record<string, unknown>);
  });
  Notifications.getLastNotificationResponseAsync?.()
    .then((response) => {
      if (live && response) handler((response.notification.request.content.data ?? {}) as Record<string, unknown>);
    })
    .catch(() => {});
  return () => { live = false; subscription.remove(); };
};

/** Signing out: this device should stop hearing from a pet it no longer shows. */
export const forgetThisDevice = async (): Promise<void> => {
  if (!available() || !projectId) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await companionService.forgetDevice(token);
  } catch {
    // Signing out must never fail because a token could not be cleared.
  }
};
