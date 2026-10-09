import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { View, type DimensionValue, type LayoutChangeEvent } from 'react-native';

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
}

const HudEdgeContext = createContext<HudEdge>({ bottom: 0, report: () => {} });

export function HudEdgeProvider({ children }: { children: ReactNode }) {
  const [bottom, setBottom] = useState(0);
  // Rounded so sub-pixel layout passes don't re-render the stage for nothing.
  const report = useCallback((next: number) => setBottom((current) => (Math.round(next) === current ? current : Math.round(next))), []);
  return <HudEdgeContext.Provider value={{ bottom, report }}>{children}</HudEdgeContext.Provider>;
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
 * Every room's call to action sits in one of these: in the middle of the
 * screen, or just under the HUD when the HUD reaches further down than that.
 */
export function RoomActionSlot({ children }: { children: ReactNode }) {
  const { bottom } = useContext(HudEdgeContext);
  const ref = useRef<View>(null);
  const [frame, setFrame] = useState<{ y: number; height: number } | null>(null);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    ref.current?.measureInWindow((_x, y) => setFrame({ y, height }));
  }, []);

  const usual = frame ? (frame.height - ROOM_ACTION_HEIGHT) / 2 : null;
  const belowHud = frame && bottom > 0 ? bottom - frame.y + GAP : 0;
  const top: DimensionValue = usual === null ? '50%' : Math.max(usual, belowHud);

  return (
    <View ref={ref} onLayout={onLayout} pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <View pointerEvents="box-none" style={{ position: 'absolute', top, left: 0, right: 0, alignItems: 'center' }} testID="room-action-slot">
        {children}
      </View>
    </View>
  );
}
