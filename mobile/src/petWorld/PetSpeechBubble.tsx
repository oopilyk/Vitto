import { useCallback, useEffect, useRef, useState } from 'react';
import { Mark } from '../components/ui';
import { Animated, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import { fonts, world, themedStyles } from '../theme';
import { RETRO_BORDER_WIDTH, retro } from './retroStyle';
import { useSpeechClearance } from './RoomActionSlot';

/** How long the bubble stays up before it goes; the unread dot on CHAT outlives it. */
export const SPEECH_BUBBLE_MS = 30_000;

/**
 * Sized so that what the pet says unprompted fits whole: those are asked to stay
 * under 120 characters (see `renderProactiveInstruction`), and at this width a
 * line holds about 35, so six lines carries well past that. A message that
 * ignored the ask scrolls inside the bubble rather than being cut off.
 */
const MAX_LINES = 6;
/** Never fewer than this showing, even where the room's button leaves less. */
const MIN_LINES = 2;
const LINE_HEIGHT = 16;

/**
 * What the pet just said, unprompted, as a speech bubble over its head with a
 * tail pointing down at it — so it reads as the pet talking, not as chrome.
 *
 * A glance, not a notification to clear: it shows for half a minute per
 * message (keyed on the message id, so a re-render never replays it) and then
 * goes; the unread dot on CHAT keeps the record. A tap opens the conversation;
 * the × in its corner just puts it away.
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

  // Where the bubble's tail ends (the anchor below it, which no transform
  // moves) and how tall it is, both measured, so it can keep clear of the
  // room's button: see `speechBubbleFit` and RoomActionSlot.
  const { actionReach, reportSpeechTop } = useSpeechClearance();
  const anchor = useRef<View>(null);
  const [anchorY, setAnchorY] = useState(0);
  const [height, setHeight] = useState(0);
  const onAnchorLayout = useCallback(() => {
    anchor.current?.measureInWindow((_x, y) => setAnchorY(Math.round(y)));
  }, []);
  const onLayout = useCallback((event: LayoutChangeEvent) => setHeight(Math.round(event.nativeEvent.layout.height)), []);
  const { textMax, drop } = speechBubbleFit({ anchorY, actionReach });
  const shown = !!said && shownFor === said.id;
  // Cut short to fit: flash the scroll bar so it reads as "there's more".
  const scroll = useRef<ScrollView>(null);
  const capped = textMax < MAX_LINES * LINE_HEIGHT;
  useEffect(() => {
    if (shown && capped) scroll.current?.flashScrollIndicators();
  }, [shown, capped]);

  useEffect(() => {
    if (!shown || !anchorY || !height) return undefined;
    reportSpeechTop(anchorY + drop - height - CLOSE_OVERHANG);
    return () => reportSpeechTop(0);
  }, [shown, anchorY, height, drop, reportSpeechTop]);

  useEffect(() => {
    if (!saidId) return undefined;
    setShownFor(saidId);
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const timer = setTimeout(() => setShownFor(null), SPEECH_BUBBLE_MS);
    return () => clearTimeout(timer);
  }, [saidId, anim]);

  if (!said || !shown) return null;

  return (
    <>
    <Animated.View
      onLayout={onLayout}
      style={[
        styles.wrap,
        {
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8 + drop, drop] }) },
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
          ],
        },
      ]}
    >
      {/* Hugs the bubble, so the × sits on its corner however short the line. */}
      <View style={styles.bubbleBox}>
        <Pressable
          testID="companion-bubble"
          accessibilityRole="button"
          accessibilityLabel={`${petName} says: ${said.text}`}
          onPress={onPress}
          disabled={!onPress}
          style={[retro.panel, night && retro.panelNight, styles.bubble]}
        >
          <ScrollView ref={scroll} style={[styles.scroll, { maxHeight: textMax }]} showsVerticalScrollIndicator={capped}>
            <Text style={[styles.text, night && retro.labelNight]}>{said.text}</Text>
          </ScrollView>
        </Pressable>
        <Pressable
          testID="companion-bubble-close"
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => setShownFor(null)}
          hitSlop={12}
          style={({ pressed }) => [retro.panel, night && retro.panelNight, styles.close, pressed && styles.closePressed]}
        >
          <Mark kind="cross" size={9} weight={2} color={night ? world.nightText : world.ink} />
        </Pressable>
      </View>
      {/* The tail: a square turned on its corner, tucked under the panel's edge. */}
      <View pointerEvents="none" style={[retro.panel, night && retro.panelNight, styles.tail]} />
      <View pointerEvents="none" style={[styles.tailMask, night && styles.tailMaskNight]} />
    </Animated.View>
    <View ref={anchor} onLayout={onAnchorLayout} pointerEvents="none" />
    </>
  );
}

const TAIL = 16;
// The tail is a square turned 45°, centred on the bubble's bottom edge. The
// mask paints over the stretch of the bubble's bottom border that would
// otherwise cut across the tail's mouth; its width is the tail's inner opening
// at that line (half-diagonal, less the slanted border, less the mask's height).
const TAIL_MOUTH = Math.floor(2 * (TAIL * 0.707 - RETRO_BORDER_WIDTH * 1.414 - RETRO_BORDER_WIDTH));
/** How far the × pokes up above the bubble (see `close`). */
const CLOSE_OVERHANG = 9;
const PADDING_Y = 8;
/** Everything in the bubble's height but its text: padding, border, the tail below and the × above. */
const BUBBLE_CHROME = 2 * PADDING_Y + 2 * RETRO_BORDER_WIDTH + TAIL / 2 + CLOSE_OVERHANG;

/**
 * How many lines' height the bubble's text gets, and how far the bubble drops
 * below its usual spot, so that it never covers the room's button.
 *
 * The bubble hangs from a fixed point over the pet's head (`anchorY`) and grows
 * upward. A long line from the pet grew it right over "Log workout": five lines
 * on a 390x844 phone hid the button whole, and on a 375x667 phone the pet's
 * head sits so close under the button that a single line reached it.
 * So the button rises clear of the bubble, as far as the HUD lets it (see
 * `roomActionTop`), and the bubble stops at `actionReach`, the button's bottom
 * at that highest spot: past it, the text scrolls. Where even `MIN_LINES` will
 * not fit above the pet (a short phone), the bubble drops into the air over the
 * pet's head by the shortfall instead. Zero `anchorY` / `actionReach` mean not
 * measured yet, or a room with no button: the full six lines, where it always sat.
 */
export const speechBubbleFit = ({ anchorY, actionReach }: { anchorY: number; actionReach: number }) => {
  const most = MAX_LINES * LINE_HEIGHT;
  if (!anchorY || !actionReach) return { textMax: most, drop: 0 };
  const room = anchorY - actionReach - BUBBLE_CHROME;
  const least = MIN_LINES * LINE_HEIGHT;
  return { textMax: Math.min(most, Math.max(least, room)), drop: Math.max(0, least - room) };
};

const styles = themedStyles(() => ({
  // Wide, but never wider than a narrow phone leaves beside the side rails.
  wrap: { alignItems: 'center', width: '78%', maxWidth: 290 },
  // Hugs a short line rather than stretching to the wrap's full width.
  bubbleBox: { alignSelf: 'center', maxWidth: '100%', zIndex: 1 },
  bubble: { alignSelf: 'center', maxWidth: '100%', paddingHorizontal: 12, paddingVertical: PADDING_Y, borderRadius: 12, zIndex: 1 },
  scroll: { flexGrow: 0 },
  text: { fontFamily: fonts.systemMono, fontSize: 12, lineHeight: LINE_HEIGHT, color: world.ink, textAlign: 'center' },
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
  // Sits on the bubble's top-right corner, over its border.
  close: {
    position: 'absolute',
    top: -9,
    right: -9,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    shadowOffset: { width: 1, height: 1 },
  },
  closePressed: { opacity: 0.7 },
  closeMark: { fontFamily: fonts.systemMono, fontSize: 14, lineHeight: 16, fontWeight: '700', color: world.ink, marginTop: -1 },
}));
