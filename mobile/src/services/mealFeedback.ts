import * as Haptics from 'expo-haptics';

/**
 * The web build synthesised tones with the Web Audio API, which has no counterpart
 * on device. Haptics are the native idiom for this kind of small confirmation, and
 * every call is fire-and-forget so a device without a taptic engine simply no-ops.
 */
const tap = (style: Haptics.ImpactFeedbackStyle) => {
  void Haptics.impactAsync(style).catch(() => undefined);
};

export const playMealSound = () => tap(Haptics.ImpactFeedbackStyle.Medium);

export const playMunchSound = () => tap(Haptics.ImpactFeedbackStyle.Light);

export const playCelebrationSound = () => {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
};
