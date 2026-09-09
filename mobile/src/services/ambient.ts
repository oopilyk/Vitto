import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import {
  type GeoPoint,
  type StepSample,
  WALKING_WINDOW_MS,
  distanceMeters,
  isAtPlace,
  isWalking,
  stepsInWindow,
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

/**
 * Why a cue is off. Both hooks swallow failures so the pet degrades quietly, but
 * that makes "denied", "unsupported" and "you are standing still" identical from
 * the outside — which is unusable when testing on a device. The dev readout
 * shows this.
 */
export type SensorPermission = 'unknown' | 'granted' | 'denied' | 'unavailable';

export interface WalkingState {
  walking: boolean;
  permission: SensorPermission;
  /** Steps inside the cadence window right now. */
  steps: number;
}

export interface GymState {
  atGym: boolean;
  permission: SensorPermission;
  /** Metres from the saved gym at the last fix; null until one lands. */
  distance: number | null;
}

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
export const useWalking = (): WalkingState => {
  const [state, setState] = useState<WalkingState>({ walking: false, permission: 'unknown', steps: 0 });
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
      setState((current) => ({ ...current, walking: false, steps: 0 }));
    };

    const start = async () => {
      if (subscription) return;
      try {
        if (!(await Pedometer.isAvailableAsync())) {
          setState((current) => ({ ...current, permission: 'unavailable' }));
          return;
        }
        const permission = await Pedometer.requestPermissionsAsync();
        if (cancelled) return;
        if (!permission.granted) {
          setState((current) => ({ ...current, permission: 'denied' }));
          return;
        }
        setState((current) => ({ ...current, permission: 'granted' }));
        subscription = Pedometer.watchStepCount(({ steps }) => {
          const now = Date.now();
          samples.current = trimStepSamples([...samples.current, { at: now, steps }], now, WALKING_WINDOW_MS * 2);
          setState((current) => ({
            ...current,
            walking: isWalking(samples.current, now),
            steps: stepsInWindow(samples.current, now),
          }));
        });
        // The pedometer only speaks on a step, so standing still would leave the
        // last verdict frozen at "walking". This ages it out.
        tick = setInterval(() => {
          const now = Date.now();
          samples.current = trimStepSamples(samples.current, now, WALKING_WINDOW_MS * 2);
          setState((current) => ({
            ...current,
            walking: isWalking(samples.current, now),
            steps: stepsInWindow(samples.current, now),
          }));
        }, WALKING_TICK_MS);
      } catch {
        // Missing native module or a sensor that refuses to start: no cue.
        setState((current) => ({ ...current, permission: 'unavailable' }));
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

  return state;
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
export const useAtGym = (gym: GeoPoint | null): GymState => {
  const [state, setState] = useState<GymState>({ atGym: false, permission: 'unknown', distance: null });

  useEffect(() => {
    if (!gym) {
      setState({ atGym: false, permission: 'unknown', distance: null });
      return;
    }
    let poll: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const check = async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (!permission.granted) {
          setState((current) => ({ ...current, permission: 'denied' }));
          return;
        }
        const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const here = { latitude: fix.coords.latitude, longitude: fix.coords.longitude };
        setState({
          atGym: isAtPlace(here, gym),
          permission: 'granted',
          distance: Math.round(distanceMeters(here, gym)),
        });
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

  return state;
};
