import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { colors, fonts, themedStyles } from '../theme';
import { ROOM_ACTION_HEIGHT, RoomActionSlot } from './RoomActionSlot';

/**
 * A room's call to action ("Log meal", "Log workout", "Log a run", "Train
 * mind"): the one thing to do in that room, so it has to be found at a glance
 * on top of busy room art, day or night. A coral pill with 12px mono text
 * read as a label rather than a button, and testers missed it. This one keeps
 * that pill's size but is ringed in white so it lifts off the art, leads with
 * a "+" badge, has a bold label, and breathes a soft glow round itself (still,
 * with Reduce Motion on).
 */
export function RoomActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  const reduceMotion = useReducedMotion();
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      glow.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.delay(600),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow, reduceMotion]);

  return (
    <RoomActionSlot>
      <View>
        {reduceMotion ? null : (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.glow,
              {
                opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
                transform: [
                  { scaleX: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
                  { scaleY: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) },
                ],
              },
            ]}
          />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          hitSlop={8}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <View style={styles.badge}>
            <Text style={styles.plus}>+</Text>
          </View>
          <Text style={styles.label}>{label}</Text>
        </Pressable>
      </View>
    </RoomActionSlot>
  );
}

const styles = themedStyles(() => ({
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: colors.coral,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.coral,
    // The old pill's height (ROOM_ACTION_HEIGHT): 2 + 6 + 22 + 6 + 2.
    height: ROOM_ACTION_HEIGHT,
    paddingLeft: 6,
    paddingRight: 18,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#1b1f1d',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.96 }] },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: { fontFamily: fonts.body, fontSize: 18, lineHeight: 20, fontWeight: '800', color: colors.coral, marginTop: -1 },
  label: { fontFamily: fonts.body, fontSize: 14, fontWeight: '700', letterSpacing: 0.2, color: '#fff' },
}));
