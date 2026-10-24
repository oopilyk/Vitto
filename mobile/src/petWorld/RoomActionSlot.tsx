import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
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
}

const HudEdgeContext = createContext<HudEdge>({ bottom: 0, report: () => {}, petReach: 0 });

/**
 * `petReach` is the top of the pet's box, measured up from the bottom of the
 * stage (its size plus its feet's padding, from `stageMetrics`). The pet is
 * sized from the room's width, so on a screen that is short for its width (an
 * iPhone SE, an iPad) the middle of the screen is already the pet's head, and
 * the button parked there sat on it.
 */
export function HudEdgeProvider({ children, petReach = 0 }: { children: ReactNode; petReach?: number }) {
  const [bottom, setBottom] = useState(0);
  // Rounded so sub-pixel layout passes don't re-render the stage for nothing.
  const report = useCallback((next: number) => setBottom((current) => (Math.round(next) === current ? current : Math.round(next))), []);
  return <HudEdgeContext.Provider value={{ bottom, report, petReach }}>{children}</HudEdgeContext.Provider>;
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

/** Breathing room between the HUD and the button. */
const GAP = 14;
/** The button's height (RoomActionButton), so the slot can centre it. */
export const ROOM_ACTION_HEIGHT = 38;

/**
 * Where the button's top goes, in the slot's own coordinates, for a slot of
 * `slotHeight` whose top sits at `slotY` in the window. In the middle of the
 * screen; raised clear of the pet's head when the middle is already the pet;
 * and never above the HUD's bottom edge, which wins when the two collide (the
 * HUD's controls must stay reachable). `buttonHeight` is the button as drawn,
 * zoom included. Zero `hudBottom` / `petReach` mean not measured yet.
 */
export const roomActionTop = ({
  slotY,
  slotHeight,
  hudBottom,
  petReach,
  buttonHeight = ROOM_ACTION_HEIGHT,
}: {
  slotY: number;
  slotHeight: number;
  hudBottom: number;
  petReach: number;
  buttonHeight?: number;
}): number => {
  const usual = (slotHeight - buttonHeight) / 2;
  const abovePet = petReach > 0 ? slotHeight - petReach - GAP - buttonHeight : usual;
  const belowHud = hudBottom > 0 ? hudBottom - slotY + GAP : 0;
  return Math.max(Math.min(usual, abovePet), belowHud);
};

/**
 * Every room's call to action sits in one of these: in the middle of the
 * screen, or just under the HUD when the HUD reaches further down than that.
 */
export function RoomActionSlot({ children }: { children: ReactNode }) {
  const { bottom, petReach } = useContext(HudEdgeContext);
  // The button zooms about its own centre on a tablet (see RoomActionButton);
  // place the box it is drawn in, then put the unzoomed box at its middle.
  const scale = useChromeScale();
  const drawnHeight = ROOM_ACTION_HEIGHT * scale;
  const ref = useRef<View>(null);
  const [frame, setFrame] = useState<{ y: number; height: number } | null>(null);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    ref.current?.measureInWindow((_x, y) => setFrame({ y, height }));
  }, []);

  const top: DimensionValue = frame
    ? roomActionTop({ slotY: frame.y, slotHeight: frame.height, hudBottom: bottom, petReach, buttonHeight: drawnHeight }) +
      (drawnHeight - ROOM_ACTION_HEIGHT) / 2
    : '50%';

  return (
    <View ref={ref} onLayout={onLayout} pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <View pointerEvents="box-none" style={{ position: 'absolute', top, left: 0, right: 0, alignItems: 'center' }} testID="room-action-slot">
        {children}
      </View>
    </View>
  );
}
