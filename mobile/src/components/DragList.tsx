import { useRef, useState, type ReactNode } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';
import { colors, themedStyles } from '../theme';
import { haptic } from './ui';

/**
 * Where a row dragged `dy` points from `from` should land, given each row's
 * height (gap included). It passes a neighbour once it is over that row's
 * middle, the way iOS's own reorder handles feel.
 */
export const dragTarget = (heights: readonly number[], from: number, dy: number): number => {
  let to = from;
  let left = dy;
  if (dy > 0) {
    while (to < heights.length - 1 && left > heights[to + 1]! / 2) {
      left -= heights[to + 1]!;
      to += 1;
    }
  } else {
    while (to > 0 && -left > heights[to - 1]! / 2) {
      left += heights[to - 1]!;
      to -= 1;
    }
  }
  return to;
};

interface Drag {
  key: string;
  from: number;
  to: number;
  dy: number;
}

interface Props<T> {
  items: readonly T[];
  keyOf: (item: T) => string;
  /**
   * The row; `handle` is the grip to drag it by, null when reordering is off.
   * `lifted` while it is being dragged: the row draws its own lift (shadow,
   * fill) on its card, so the lift keeps the card's rounded shape.
   */
  renderItem: (item: T, index: number, handle: ReactNode, lifted: boolean) => ReactNode;
  onMove: (from: number, to: number) => void;
  enabled: boolean;
  /** Told when a drag starts and ends, so the scroll view around can hold still. */
  onDragging?: (dragging: boolean) => void;
  gap?: number;
  /** How the grip is named to VoiceOver: "Reorder Push". */
  labelOf: (item: T) => string;
}

/**
 * A list reordered by dragging each row's grip. Built on PanResponder, so no
 * gesture library: the dragged row follows the finger and the rows it passes
 * slide out of its way; letting go moves it. VoiceOver gets Move up and Move
 * down on the grip instead, since it cannot drag.
 */
export function DragList<T>({ items, keyOf, renderItem, onMove, enabled, onDragging, gap = 8, labelOf }: Props<T>) {
  const heights = useRef<Record<string, number>>({});
  const [drag, setDrag] = useState<Drag | null>(null);
  // The responders are made once per row and read the latest props through this.
  const latest = useRef({ items, keyOf, onMove, onDragging, gap, drag });
  latest.current = { items, keyOf, onMove, onDragging, gap, drag };

  const rowHeights = () => latest.current.items.map((item) => (heights.current[latest.current.keyOf(item)] ?? 0) + latest.current.gap);

  const responders = useRef<Record<string, ReturnType<typeof PanResponder.create>>>({});
  const responderFor = (key: string) =>
    (responders.current[key] ??= PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Once a row is picked up, the scroll view does not get the finger back.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const from = latest.current.items.findIndex((item) => latest.current.keyOf(item) === key);
        if (from < 0) return;
        haptic('press');
        latest.current.onDragging?.(true);
        setDrag({ key, from, to: from, dy: 0 });
      },
      onPanResponderMove: (_event, gesture) => {
        setDrag((current) => {
          if (!current) return current;
          const to = dragTarget(rowHeights(), current.from, gesture.dy);
          if (to !== current.to) haptic('select');
          return { ...current, to, dy: gesture.dy };
        });
      },
      onPanResponderRelease: () => finish(),
      onPanResponderTerminate: () => finish(),
    }));

  const finish = () => {
    const current = latest.current.drag;
    setDrag(null);
    latest.current.onDragging?.(false);
    if (current && current.to !== current.from) latest.current.onMove(current.from, current.to);
  };

  const draggedHeight = drag ? (heights.current[drag.key] ?? 0) + gap : 0;
  /** Where each row sits while another is dragged past it. */
  const shiftFor = (index: number): number => {
    if (!drag) return 0;
    if (index === drag.from) return drag.dy;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -draggedHeight;
    if (drag.to < drag.from && index >= drag.to && index < drag.from) return draggedHeight;
    return 0;
  };

  return (
    <View style={{ gap }}>
      {items.map((item, index) => {
        const key = keyOf(item);
        const dragging = drag?.key === key;
        const handle = enabled ? (
          <View
            {...responderFor(key).panHandlers}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`Reorder ${labelOf(item)}`}
            accessibilityHint="Drag up or down to move it"
            accessibilityActions={[
              { name: 'increment', label: 'Move down' },
              { name: 'decrement', label: 'Move up' },
            ]}
            onAccessibilityAction={(event) => {
              const to = event.nativeEvent.actionName === 'increment' ? index + 1 : index - 1;
              if (to >= 0 && to < items.length) onMove(index, to);
            }}
            hitSlop={8}
            style={styles.handle}
            testID={`drag-${key}`}
          >
            <View style={styles.bar} />
            <View style={styles.bar} />
            <View style={styles.bar} />
          </View>
        ) : null;
        return (
          <View
            key={key}
            onLayout={(event: LayoutChangeEvent) => {
              heights.current[key] = event.nativeEvent.layout.height;
            }}
            style={[dragging && styles.over, { transform: [{ translateY: shiftFor(index) }, { scale: dragging ? 1.02 : 1 }] }]}
          >
            {renderItem(item, index, handle, dragging)}
          </View>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
  handle: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center', gap: 4 },
  bar: { width: 16, height: 2, borderRadius: 1, backgroundColor: colors.faint },
  // Picked up: drawn over the rows it passes.
  over: { zIndex: 10 },
}));
