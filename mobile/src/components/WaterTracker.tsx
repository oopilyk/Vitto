import { useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/** The water blue: the glass, the cups and the week's chart (see WaterLog). */
export const WATER_BLUE = '#5b9bc4';

/**
 * Water taps that show at once and save one at a time behind the screen:
 * `shown` is the logged total plus taps still saving. Saves run one at a time,
 * each against the log the one before it left, so a quick run of taps is
 * counted exactly once each; a save that fails takes its taps back off the
 * screen (the app's error banner says why).
 */
export function useWaterTaps(ml: number, goalMl: number, onAdd: (ml: number) => Promise<void>) {
  /** Taps on screen but not yet saved, in mL. */
  const [pending, setPending] = useState(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  // The latest handler, so a queued save sees the log as the save before it left it.
  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  const shown = Math.max(0, ml + pending);

  const tap = (amount: number) => {
    if (amount === 0) return;
    setPending((current) => current + amount);
    buzz(amount > 0 && shown < goalMl && shown + amount >= goalMl ? 'goal' : 'tap');
    queue.current = queue.current.then(async () => {
      // Let the previous save's new log reach this component before the next one reads it.
      await new Promise((resolve) => setTimeout(resolve, 0));
      try {
        await onAddRef.current(amount);
      } catch {
        buzz('error');
      } finally {
        setPending((current) => current - amount);
      }
    });
  };
  return { shown, tap };
}

/** The water tracker's buzz: a light tick per cup, a success on the goal. */
const buzz = (kind: 'tap' | 'goal' | 'error') => {
  if (Platform.OS === 'web') return;
  const done =
    kind === 'tap'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.notificationAsync(
          kind === 'goal' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
        );
  void done.catch(() => {});
};
