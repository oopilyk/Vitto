import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { fonts } from '../theme';

/**
 * The pet's name in a small, low-opacity retro textbox that floats just above
 * the pet — shown while the pointer hovers the pet (web) or briefly after a tap
 * (native), per the product owner's note that the name should "pop up in a
 * little retro textbox with low opacity when you hover over the pet" rather than
 * living permanently in a HUD card.
 *
 * Purely presentational: the parent (`EnvironmentStage`) owns the hover/tap
 * state and passes `visible`.
 */
export function PetNameBubble({
  name,
  visible,
  night,
}: {
  name: string;
  visible: boolean;
  night?: boolean;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 140 : 120,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.bubble,
        night ? styles.bubbleNight : styles.bubbleDay,
        {
          opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.82] }),
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
          ],
        },
      ]}
    >
      <Text style={[styles.name, night && styles.nameNight]} numberOfLines={1}>
        {name}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 2,
  },
  bubbleDay: {
    backgroundColor: '#f7f2e4',
    borderColor: '#26312d',
  },
  bubbleNight: {
    backgroundColor: '#141226',
    borderColor: '#4b4870',
  },
  name: {
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#26312d',
    textTransform: 'uppercase',
  },
  nameNight: { color: '#f7f5ff' },
});
