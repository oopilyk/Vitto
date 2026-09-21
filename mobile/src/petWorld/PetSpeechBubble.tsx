import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, world } from '../theme';
import { RETRO_BORDER_WIDTH, retro } from './retroStyle';

/** How long the bubble stays up before it goes; the unread dot on CHAT outlives it. */
export const SPEECH_BUBBLE_MS = 30_000;

/**
 * Sized so that what the pet says unprompted fits whole: those are asked to stay
 * under 120 characters (see `renderProactiveInstruction`), and at this width a
 * line holds about 35, so six lines carries well past that. Only a message that
 * ignored the ask gets an ellipsis, and the conversation still has all of it.
 */
const MAX_LINES = 6;

/**
 * What the pet just said, unprompted, as a speech bubble over its head with a
 * tail pointing down at it — so it reads as the pet talking, not as chrome.
 *
 * A glance, not a notification to clear: it shows for half a minute per
 * message (keyed on the message id, so a re-render never replays it) and then
 * goes; the unread dot on CHAT keeps the record. A tap opens the conversation.
 */
export function PetSpeechBubble({
  said,
  petName,
  onPress,
  night,
}: {
  said?: { id: string; text: string } | null;
  petName: string;
  onPress?: () => void;
  night?: boolean;
}) {
  const [shownFor, setShownFor] = useState<string | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const saidId = said?.id ?? null;

  useEffect(() => {
    if (!saidId) return undefined;
    setShownFor(saidId);
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const timer = setTimeout(() => setShownFor(null), SPEECH_BUBBLE_MS);
    return () => clearTimeout(timer);
  }, [saidId, anim]);

  if (!said || shownFor !== said.id) return null;

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
          ],
        },
      ]}
    >
      <Pressable
        testID="companion-bubble"
        accessibilityRole="button"
        accessibilityLabel={`${petName} says: ${said.text}`}
        onPress={onPress}
        disabled={!onPress}
        style={[retro.panel, night && retro.panelNight, styles.bubble]}
      >
        <Text numberOfLines={MAX_LINES} style={[styles.text, night && retro.labelNight]}>
          {said.text}
        </Text>
      </Pressable>
      {/* The tail: a square turned on its corner, tucked under the panel's edge. */}
      <View pointerEvents="none" style={[retro.panel, night && retro.panelNight, styles.tail]} />
      <View pointerEvents="none" style={[styles.tailMask, night && styles.tailMaskNight]} />
    </Animated.View>
  );
}

const TAIL = 16;
// The tail is a square turned 45°, centred on the bubble's bottom edge. The
// mask paints over the stretch of the bubble's bottom border that would
// otherwise cut across the tail's mouth; its width is the tail's inner opening
// at that line (half-diagonal, less the slanted border, less the mask's height).
const TAIL_MOUTH = Math.floor(2 * (TAIL * 0.707 - RETRO_BORDER_WIDTH * 1.414 - RETRO_BORDER_WIDTH));

const styles = StyleSheet.create({
  // Wide, but never wider than a narrow phone leaves beside the side rails.
  wrap: { alignItems: 'center', width: '78%', maxWidth: 290 },
  // Hugs a short line rather than stretching to the wrap's full width.
  bubble: { alignSelf: 'center', maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, zIndex: 1 },
  text: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16, color: world.ink, textAlign: 'center' },
  tail: {
    width: TAIL,
    height: TAIL,
    marginTop: -TAIL / 2,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
    shadowOpacity: 0,
    elevation: 0,
  },
  tailMask: {
    position: 'absolute',
    bottom: TAIL / 2,
    width: TAIL_MOUTH,
    height: RETRO_BORDER_WIDTH,
    backgroundColor: world.surface,
    zIndex: 2,
  },
  tailMaskNight: { backgroundColor: world.nightSurface },
});
