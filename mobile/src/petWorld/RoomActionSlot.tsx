import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { View, type DimensionValue, type LayoutChangeEvent } from 'react-native';
import { useChromeScale } from './chromeScale';

/**
 * Where the HUD ends, so a room's call to action ("Log meal", "Log workout")
 * never sits on top of it.
 *
 * The HUD grows with what it has to say: a long line from the pet, a streak,
 * food tags wrapping onto a second row. A button parked at a fixed height
 * collided with it whenever it did. So the HUD reports its bottom edge (in
 * window coordinates, as both live in the same stage) and the slot drops below
 * it whenever its usual spot would overlap.
 */
interface HudEdge {
  /** The HUD's bottom edge, in window coordinates. 0 until it has laid out. */
  bottom: number;
  report: (bottom: number) => void;
  /** How far up from the stage's bottom the pet's box reaches; 0 when unknown. */
  petReach: number;
  /**
   * The top of the pet's speech bubble (its × included), in window coordinates;
   * 0 when none is up. The button rises clear of it.
   */
  speechTop: number;
  reportSpeechTop: (top: number) => void;
  /**
   * The highest the bubble may reach, in window coordinates: the button's
   * bottom at the highest spot it can rise to (just under the HUD), plus a gap.
   * 0 when the room has no button.
   */
  actionReach: number;
  reportActionReach: (reach: number) => void;
  /**
   * The last room's slot, as measured. Every room's slot covers the same stage,
   * so a new room's button starts where it will end up instead of in the
   * middle, measuring itself, and jumping: the dip when changing rooms.
   */
  lastSlot: { current: { y: number; height: number } | null };
}

const HudEdgeContext = createContext<HudEdge>({
  bottom: 0,
  report: () => {},
  petReach: 0,
  speechTop: 0,
  reportSpeechTop: () => {},
  actionReach: 0,
  reportActionReach: () => {},
  lastSlot: { current: null },
});

// Rounded so sub-pixel layout passes don't re-render the stage for nothing.
const useRoundedEdge = () => {
  const [edge, setEdge] = useState(0);
  const report = useCallback((next: number) => setEdge((current) => (Math.round(next) === current ? current : Math.round(next))), []);
  return [edge, report] as const;
};

/**
 * `petReach` is the top of the pet's box, measured up from the bottom of the
 * stage (its size plus its feet's padding, from `stageMetrics`). The pet is
 * sized from the room's width, so on a screen that is short for its width (an
 * iPhone SE, an iPad) the middle of the screen is already the pet's head, and
 * the button parked there sat on it.
 */
export function HudEdgeProvider({ children, petReach = 0 }: { children: ReactNode; petReach?: number }) {
  const [bottom, report] = useRoundedEdge();
  const [speechTop, reportSpeechTop] = useRoundedEdge();
  const [actionReach, reportActionReach] = useRoundedEdge();
  const lastSlot = useRef<{ y: number; height: number } | null>(null);
  return (
    <HudEdgeContext.Provider value={{ bottom, report, petReach, speechTop, reportSpeechTop, actionReach, reportActionReach, lastSlot }}>
      {children}
    </HudEdgeContext.Provider>
  );
}

/**
 * For the pet's speech bubble: how high it may reach without covering the
 * room's button, and where to report its top so the button can rise clear.
 */
export function useSpeechClearance() {
  const { actionReach, reportSpeechTop } = useContext(HudEdgeContext);
  return { actionReach, reportSpeechTop };
}

/** For the HUD's last row: an onLayout that reports where the HUD ends. */
export function useReportHudEdge() {
  const { report } = useContext(HudEdgeContext);
  const ref = useRef<View>(null);
  const onLayout = useCallback(() => {
    ref.current?.measureInWindow((_x, y, _width, height) => report(y + height));
  }, [report]);
  return { ref, onLayout };
}

/** Breathing room between the HUD and the button, and the button and the speech bubble. */
const GAP = 14;
/** The button's height (RoomActionButton), so the slot can centre it. */
export const ROOM_ACTION_HEIGHT = 38;

/**
 * Where the button's top goes, in the slot's own coordinates, for a slot of
 * `slotHeight` whose top sits at `slotY` in the window. In the middle of the
 * screen; raised clear of the pet's head when the middle is already the pet,
 * and clear of the pet's speech bubble while one is up; and never above the
 * HUD's bottom edge, which wins when they collide (the HUD's controls must stay
 * reachable; the bubble keeps below the highest spot, see PetSpeechBubble).
 * `buttonHeight` is the button as drawn, zoom included. Zero `hudBottom` /
 * `petReach` mean not measured yet; zero `speechTop`, no bubble.
 */
export const roomActionTop = ({
  slotY,
  slotHeight,
  hudBottom,
  petReach,
  speechTop = 0,
  buttonHeight = ROOM_ACTION_HEIGHT,
}: {
  slotY: number;
  slotHeight: number;
  hudBottom: number;
  petReach: number;
  speechTop?: number;
  buttonHeight?: number;
}): number => {
  const usual = (slotHeight - buttonHeight) / 2;
  const abovePet = petReach > 0 ? slotHeight - petReach - GAP - buttonHeight : usual;
  const aboveSpeech = speechTop > 0 ? speechTop - slotY - GAP - buttonHeight : usual;
  return Math.max(Math.min(usual, abovePet, aboveSpeech), highestActionTop(slotY, hudBottom));
};

/** The highest the button goes, in the slot's coordinates: just under the HUD. */
const highestActionTop = (slotY: number, hudBottom: number) => (hudBottom > 0 ? hudBottom - slotY + GAP : 0);

/**
 * Every room's call to action sits in one of these: in the middle of the
 * screen, or just under the HUD when the HUD reaches further down than that.
 */
export function RoomActionSlot({ children }: { children: ReactNode }) {
  const { bottom, petReach, speechTop, reportActionReach, lastSlot } = useContext(HudEdgeContext);
  // The button zooms about its own centre on a tablet (see RoomActionButton);
  // place the box it is drawn in, then put the unzoomed box at its middle.
  const scale = useChromeScale();
  const drawnHeight = ROOM_ACTION_HEIGHT * scale;
  const ref = useRef<View>(null);
  const [frame, setFrame] = useState<{ y: number; height: number } | null>(() => lastSlot.current);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    ref.current?.measureInWindow((_x, y) => {
      lastSlot.current = { y, height };
      setFrame((current) => (current && current.y === y && current.height === height ? current : { y, height }));
    });
  }, [lastSlot]);

  const top: DimensionValue = frame
    ? roomActionTop({ slotY: frame.y, slotHeight: frame.height, hudBottom: bottom, petReach, speechTop, buttonHeight: drawnHeight }) +
      (drawnHeight - ROOM_ACTION_HEIGHT) / 2
    : '50%';

  // Tells the speech bubble how high it may grow: to just under this button at
  // its highest. Cleared when the room (and its button) goes.
  const reach = frame ? frame.y + highestActionTop(frame.y, bottom) + drawnHeight + GAP : 0;
  // Cleared only when the button goes, not on every move: clearing in between
  // let the bubble grow for a frame and shove the button about.
  useEffect(() => {
    reportActionReach(reach);
  }, [reach, reportActionReach]);
  useEffect(() => () => reportActionReach(0), [reportActionReach]);

  return (
    <View ref={ref} onLayout={onLayout} pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {/* Hidden until placed, the first time only: after that the last room's
          measurement places it straight away. */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top, left: 0, right: 0, alignItems: 'center', opacity: frame ? 1 : 0 }}
        testID="room-action-slot"
      >
        {children}
      </View>
    </View>
  );
}
