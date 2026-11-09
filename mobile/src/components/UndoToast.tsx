import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, Text, View } from 'react-native';
import { haptic } from './ui';
import { colors, fonts, themedStyles } from '../theme';

export interface UndoOffer {
  /** What just happened: "Meal deleted", "Workout logged". */
  message: string;
  /** Puts it back. */
  undo: () => void | Promise<void>;
  /** Tells offers apart, so the same words twice still restart the clock. */
  key: string;
}

/** Long enough to read and reach, short enough not to linger over the next thing. */
export const UNDO_MS = 6000;

const BOTTOM = Platform.OS === 'ios' ? 104 : 88;

/**
 * "Meal deleted · Undo", across the bottom of the app for a few seconds after
 * something is logged or taken back, as Mail and Photos do. Drawn above every
 * pushed screen; `onDone` clears it, by timeout or once Undo is used.
 */
export function UndoToast({ offer, onDone }: { offer: UndoOffer | null; onDone: () => void }) {
  const shown = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!offer) return undefined;
    shown.setValue(0);
    Animated.timing(shown, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const timer = setTimeout(onDone, UNDO_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.key]);
  if (!offer) return null;
  return (
    <View style={styles.slot} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.toast,
          { opacity: shown, transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
        ]}
        accessibilityLiveRegion="polite"
        testID="undo-toast"
      >
        <Text style={styles.message} numberOfLines={2}>{offer.message}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Undo"
          hitSlop={10}
          onPress={() => {
            haptic('press');
            onDone();
            void offer.undo();
          }}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionLabel}>Undo</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = themedStyles(() => ({
  slot: { position: 'absolute', left: 16, right: 16, bottom: BOTTOM, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    alignSelf: 'stretch',
    paddingLeft: 18,
    paddingRight: 8,
    minHeight: 52,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: colors.ink,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  message: { flex: 1, fontFamily: fonts.ui, fontSize: 15, color: colors.paper },
  action: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  pressed: { opacity: 0.6 },
  actionLabel: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 15, color: colors.coral },
}));
