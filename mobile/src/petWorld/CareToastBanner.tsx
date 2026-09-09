import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import type { CareToast } from '@vitto/core';
import { fonts } from '../theme';
import { ENVIRONMENT_TRANSITION_MS } from './timing';

/**
 * The "that worked" confirmation for a care moment — what was logged, and what
 * it did to the pet.
 *
 * Sits just above the action row, at the bottom of the screen: a toast belongs
 * near the buttons that raise it, and the top of the screen is already three
 * deep with the name card, the status chips and each scene's own call to
 * action -- which is a coral pill too, so a coral toast landing beside it read
 * as a second button rather than as a confirmation.
 *
 * Slides UP from behind the action row rather than down from the top, so the
 * movement points away from the thumb that just tapped.
 */

const IN_MS = 220;
const OUT_MS = ENVIRONMENT_TRANSITION_MS;

/**
 * Clears the action row: the home-indicator inset every scene's `bottomRow`
 * uses, plus that row's own height (60px of button art + a 6px gap + roughly
 * 12px of label), plus a small breath. Verify on-device if the row's content
 * ever grows -- the same caveat `PET_STAGE_BOTTOM_PADDING` carries.
 */
const ACTION_ROW_CLEARANCE = (Platform.OS === 'ios' ? 28 : 16) + 78 + 12;

export function CareToastBanner({ toast, night }: { toast?: CareToast | null; night?: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  /**
   * The last thing worth showing, held through the fade-out. Reading `toast`
   * directly would blank the text the instant it cleared and animate an empty
   * pill off the screen.
   */
  const [shown, setShown] = useState<CareToast | null>(toast ?? null);

  useEffect(() => {
    if (toast) setShown(toast);
    Animated.timing(progress, {
      toValue: toast ? 1 : 0,
      duration: toast ? IN_MS : OUT_MS,
      easing: toast ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [toast, progress]);

  if (!shown) return null;

  return (
    <View style={styles.slot} pointerEvents="none">
      <Animated.View
        // Announced rather than focusable: it is confirmation of something the
        // user just did, so a screen reader should read it without stealing the
        // focus they still have on the button they pressed.
        accessibilityLiveRegion="polite"
        accessible={false}
        pointerEvents="none"
        style={[
          styles.toast,
          night && styles.toastNight,
          {
            opacity: progress,
            transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          },
        ]}
      >
        <Text style={styles.headline}>{shown.headline}</Text>
        {shown.detail ? <Text style={styles.detail}>{shown.detail}</Text> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: ACTION_ROW_CLEARANCE,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  toast: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    maxWidth: '100%',
    alignItems: 'center',
    // Dark glass, not coral: every scene's call to action is a coral pill, and a
    // confirmation that looks like one invites a tap it does not take.
    backgroundColor: 'rgba(20,18,38,0.82)',
    shadowColor: '#26312d',
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastNight: { backgroundColor: 'rgba(12,10,26,0.86)' },
  headline: { fontSize: 14, fontWeight: '700', color: '#fff', textAlign: 'center' },
  detail: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.4,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 4,
    textAlign: 'center',
  },
});
