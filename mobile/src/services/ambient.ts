import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import {
  type GeoPoint,
  type StepSample,
  WALKING_WINDOW_MS,
  isAtPlace,
  isWalking,
  trimStepSamples,
} from '@vitto/core';

/**
 * Ambient signals, foreground only: whether the user is walking right now, and
 * whether they are at the gym they saved. See mobile/AMBIENT.md.
 *
 * Both hooks are deliberately dumb about persistence. They hold a few seconds
 * of step deltas or one position fix in memory, compare, and forget. There is
 * no history to sync, no background task, and nothing that outlives the screen
 * the pet is on — which is also why neither asks for "always" permissions.
 */

/** Re-evaluate the cadence this often; a pedometer can go quiet mid-window. */
const WALKING_TICK_MS = 2_000;
/** Re-check position this often while the app is open. A gym visit is long. */
const GYM_POLL_MS = 60_000;

/**
 * True while the user is walking, from live pedometer deltas.
 *
 * Subscribes only while the app is in the foreground and unsubscribes on
 * background: an ambient cue nobody can see is not worth a sensor. Resolves to
 * false everywhere the pedometer is unavailable (web, simulator, Expo Go without
 * motion permission), so callers can spread it into `isExploring` unguarded.
 */
export const useWalking = (): boolean => {
  const [walking, setWalking] = useState(false);
  const samples = useRef<StepSample[]>([]);

  useEffect(() => {
    let subscription: { remove: () => void } | null = null;
    let tick: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const stop = () => {
      subscription?.remove();
      subscription = null;
      if (tick) clearInterval(tick);
      tick = null;
      samples.current = [];
      setWalking(false);
    };

    const start = async () => {
      if (subscription) return;
      try {
        if (!(await Pedometer.isAvailableAsync())) return;
        const permission = await Pedometer.requestPermissionsAsync();
        if (cancelled || !permission.granted) return;
        subscription = Pedometer.watchStepCount(({ steps }) => {
          const now = Date.now();
          samples.current = trimStepSamples([...samples.current, { at: now, steps }], now, WALKING_WINDOW_MS * 2);
          setWalking(isWalking(samples.current, now));
        });
        // The pedometer only speaks on a step, so standing still would leave the
        // last verdict frozen at "walking". This ages it out.
        tick = setInterval(() => {
          const now = Date.now();
          samples.current = trimStepSamples(samples.current, now, WALKING_WINDOW_MS * 2);
          setWalking(isWalking(samples.current, now));
        }, WALKING_TICK_MS);
      } catch {
        // Missing native module, denied permission, unsupported device: no cue.
      }
    };

    if (AppState.currentState === 'active') void start();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void start();
      else stop();
    });
    return () => {
      cancelled = true;
      foreground.remove();
      stop();
    };
  }, []);

  return walking;
};

/** One foreground fix, for "set my gym to here". Throws a readable error if it cannot. */
export const readCurrentLocation = async (): Promise<GeoPoint> => {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Vitto needs location access to remember where your gym is.');
  }
  const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: fix.coords.latitude, longitude: fix.coords.longitude };
};

/**
 * True while the user is within range of `gym`, polled while the app is open.
 *
 * Silent about permission: it never prompts on its own. The prompt belongs to
 * the moment the user saves a gym (`readCurrentLocation`), and if it was
 * refused this simply stays false rather than nagging on every launch.
 */
export const useAtGym = (gym: GeoPoint | null): boolean => {
  const [atGym, setAtGym] = useState(false);

  useEffect(() => {
    if (!gym) {
      setAtGym(false);
      return;
    }
    let poll: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const check = async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (cancelled || !permission.granted) return;
        const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        setAtGym(isAtPlace({ latitude: fix.coords.latitude, longitude: fix.coords.longitude }, gym));
      } catch {
        // No fix right now: keep the last answer rather than flickering the prop.
      }
    };
    const start = () => {
      if (poll) return;
      void check();
      poll = setInterval(() => void check(), GYM_POLL_MS);
    };
    const stop = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };

    if (AppState.currentState === 'active') start();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });
    return () => {
      cancelled = true;
      foreground.remove();
      stop();
    };
  }, [gym]);

  return atGym;
};
