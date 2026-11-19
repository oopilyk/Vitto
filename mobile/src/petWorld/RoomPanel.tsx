import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Keyboard, Platform, Pressable, ScrollView, StatusBar, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { haptic, Mark, NumberInput } from '../components/ui';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { colors, fonts, getColorScheme, layout, text, themedStyles } from '../theme';

/**
 * A room as a page: the Gym, the Kitchen, Outside and the Study.
 *
 * An ordinary page in the app's own style, like Stats or Today. At its top is
 * a window: a framed picture of the room with the pet standing in it (the stage
 * draws it, see EnvironmentStage). Under the window the page scrolls: the
 * room's logging, laid out so the usual thing is one tap.
 *
 * A room's ways in to logging can be pinned along the page's foot, over the
 * room bar (PanelPage's `footer`, a PanelActionBar): the list scrolls under
 * them and they are one tap from anywhere on the page.
 *
 * A logger opened with `keepBars` (the Kitchen's) keeps both bars: it fills
 * the space between the window and the pinned bar, and the pinned bar's
 * buttons switch between its ways in, like tabs. The Kitchen is only ever one
 * of those: it opens on Search.
 *
 * Tapping Search, Start or a game does not open another page. The part under
 * the window becomes that logger (useRoomTask), over the room bar, with the
 * pet still in its window above. Closing or finishing puts the room's page
 * back. While the keyboard is up the page takes the window's space too, so
 * the field being typed in and what is under it stay above the keys.
 */

/**
 * Where the room's window sits on the page: under the status bar, inset from
 * the sides like the page's cards, a little over a quarter of the screen tall.
 */
export const roomWindowFrame = (
  stageWidth: number,
  stageHeight: number,
  topInset: number,
): { top: number; side: number; height: number } => ({
  top: topInset + 4,
  side: 16,
  height: Math.round(Math.min(265, Math.max(200, stageHeight * 0.29))),
});

/** Between the window and the page under it. */
export const ROOM_WINDOW_GAP = 6;

/** A logger reaches the screen's bottom edge; this keeps its last row off the home indicator. */
const HOME_INDICATOR = Platform.OS === 'ios' ? 20 : 0;

type TaskRender = (close: () => void) => ReactNode;
interface TaskOptions {
  /** Keep the room bar and the page's pinned bar showing (see PanelPage). */
  keepBars?: boolean;
}
interface Task extends TaskOptions {
  render: TaskRender;
  /** A new one per open, so switching between ways in starts the logger afresh. */
  id: number;
}

interface RoomTaskApi {
  open: (render: TaskRender, options?: TaskOptions) => void;
  close: () => void;
  /** The logger open over the page, if any. */
  task: Task | null;
}

const RoomTaskContext = createContext<RoomTaskApi>({ open: () => {}, close: () => {}, task: null });

/**
 * Opens a logger in the room's page: `open(close => <MealCaptureScreen onClose={close} />)`.
 * The logger closes itself with `close` when it is done or dismissed.
 */
export const useRoomTask = () => useContext(RoomTaskContext);

export function RoomPanel({
  pageTop,
  bottom,
  topInset,
  children,
  testID,
}: {
  /** Where the page starts: just under the room's window. */
  pageTop: number;
  /** The nav bar's height: the page ends on top of it. */
  bottom: number;
  /** The status bar's height: as far up as a logger goes while the keyboard is up. */
  topInset: number;
  children: ReactNode;
  testID?: string;
}) {
  const reduceMotion = useReducedMotion();
  const top = useRef(new Animated.Value(pageTop)).current;
  const offset = useRef(new Animated.Value(bottom)).current;
  const [task, setTask] = useState<Task | null>(null);
  const taskIds = useRef(0);

  const animate = useCallback(
    (toTop: number, toBottom: number) => {
      if (reduceMotion) {
        top.setValue(toTop);
        offset.setValue(toBottom);
        return;
      }
      Animated.parallel([
        Animated.timing(top, { toValue: toTop, duration: 220, useNativeDriver: false }),
        Animated.timing(offset, { toValue: toBottom, duration: 220, useNativeDriver: false }),
      ]).start();
    },
    [top, offset, reduceMotion],
  );

  // A new screen size: back to the room's page. Not on mount: a page may open
  // a logger as it arrives (the Kitchen opens on Search), and this runs after it.
  const laidOut = useRef({ pageTop, bottom });
  useEffect(() => {
    if (laidOut.current.pageTop === pageTop && laidOut.current.bottom === bottom) return;
    laidOut.current = { pageTop, bottom };
    top.setValue(pageTop);
    offset.setValue(bottom);
    setTask(null);
  }, [top, offset, pageTop, bottom]);

  // Typing in a logger: it takes the window's space too while the keyboard is
  // up, or the keys would cover the field being typed in.
  // Typing anywhere in the page (a logger's search, a distance on the room's
  // own page): it takes the window's space too while the keyboard is up, or
  // the keys would cover the field being typed in.
  // A logger that covers the room bar goes back to covering it afterwards.
  const restBottom = task && !task.keepBars ? 0 : bottom;
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => animate(topInset, 0));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => animate(pageTop, restBottom));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [animate, topInset, pageTop, restBottom]);

  const closeTask = useCallback(() => {
    Keyboard.dismiss();
    setTask(null);
    animate(pageTop, bottom);
  }, [animate, pageTop, bottom]);

  const openTask = useCallback(
    (render: TaskRender, options?: TaskOptions) => {
      taskIds.current += 1;
      setTask({ render, keepBars: options?.keepBars, id: taskIds.current });
      // Over the room bar unless kept: a logger has its own way out, and needs the room.
      animate(pageTop, options?.keepBars ? bottom : 0);
    },
    [animate, pageTop, bottom],
  );
  const taskApi = useMemo(() => ({ open: openTask, close: closeTask, task }), [openTask, closeTask, task]);

  return (
    <RoomTaskContext.Provider value={taskApi}>
      {/* The clock sits on the page's own background here, not on a dark room. */}
      <StatusBar barStyle={getColorScheme() === 'dark' ? 'light-content' : 'dark-content'} />
      <Animated.View testID={testID} style={[styles.page, { top, bottom: offset }]}>
        {task && !task.keepBars ? (
          <View key={task.id} style={[styles.task, { paddingBottom: HOME_INDICATOR }]}>
            {task.render(closeTask)}
          </View>
        ) : (
          children
        )}
      </Animated.View>
    </RoomTaskContext.Provider>
  );
}

/** The pinned bar's height, and how far it floats off the room bar. */
const ACTION_BAR_HEIGHT = 64;
const ACTION_BAR_LIFT = 10;

/**
 * What a room's page holds: its sections, scrolling, and optionally a `footer`
 * that stays put at the page's foot while they do (see PanelActionBar). A
 * logger opened with `keepBars` takes the sections' place, above the footer.
 */
export function PanelPage({ footer, children }: { footer?: ReactNode; children: ReactNode }) {
  const { task, close } = useRoomTask();
  // While the keyboard is up the page reaches the screen's bottom edge (see
  // RoomPanel) and the pinned bar would be under the keys, or on Android
  // riding on top of them. So it steps aside, and its space goes with it: a
  // logger's keyboard avoidance takes its own bottom to be the screen's, and
  // with the bar's space still held its Log button floated that far above the keys.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setTyping(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setTyping(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const showFooter = Boolean(footer) && !typing;
  const footerSpace = showFooter ? ACTION_BAR_HEIGHT + ACTION_BAR_LIFT : 0;
  return (
    <View style={styles.task}>
      {task?.keepBars ? (
        <View key={task.id} style={[styles.task, { paddingBottom: footerSpace }]}>
          {task.render(close)}
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, showFooter ? { paddingBottom: footerSpace + 18 } : null]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // A field on the room's own page (Outside's distance): iOS keeps it
          // above the keys and scrolls to it; a drag puts the keyboard away.
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode="on-drag"
        >
          {children}
        </ScrollView>
      )}
      {showFooter ? (
        <View pointerEvents="box-none" style={styles.footer}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const ACTION_ICON = {
  search: { circle: { cx: 10.5, cy: 10.5, r: 6 }, path: 'M15 15 L20 20' },
  photo: {
    circle: { cx: 12, cy: 13, r: 3.4 },
    path: 'M4 9 a2 2 0 0 1 2 -2 h1.6 l1.5 -2 h5.8 l1.5 2 H18 a2 2 0 0 1 2 2 v8 a2 2 0 0 1 -2 2 H6 a2 2 0 0 1 -2 -2 Z',
  },
  scan: { circle: null, path: 'M4.5 6 V18 M8 6 V18 M10.5 6 V18 M14 6 V18 M17 6 V18 M19.5 6 V18' },
  // A bowl, steaming: a meal kept for next time.
  meals: { circle: null, path: 'M4 12.5 H20 A8 7 0 0 1 4 12.5 Z M9.5 9 C9 7.8 10.5 7 10 5.5 M14 9 C13.5 7.8 15 7 14.5 5.5' },
} as const;
export type PanelActionIcon = keyof typeof ACTION_ICON;

/**
 * A room's ways in to logging, pinned over the room bar: a small drawn icon
 * and a word each, sharing the width. Goes in PanelPage's `footer`.
 */
export function PanelActionBar({
  actions,
  active,
}: {
  actions: readonly { icon: PanelActionIcon; label: string; hint?: string; onPress: () => void }[];
  /** The one whose logger is open, filled in like a selected tab. */
  active?: PanelActionIcon | null;
}) {
  return (
    <View style={styles.actionBar}>
      {actions.map((action) => {
        const icon = ACTION_ICON[action.icon];
        const on = action.icon === active;
        const tint = on ? colors.onCoral : colors.coral;
        return (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.hint ?? action.label}
            accessibilityState={{ selected: on }}
            onPress={() => {
              haptic('press');
              action.onPress();
            }}
            style={({ pressed }) => [styles.action, on && styles.actionOn, pressed && styles.pressed]}
          >
            <Svg width={24} height={24} viewBox="0 0 24 24" accessible={false}>
              <Path d={icon.path} stroke={tint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              {icon.circle ? <Circle {...icon.circle} stroke={tint} strokeWidth={2} fill="none" /> : null}
            </Svg>
            <Text style={[styles.actionLabel, on && styles.actionLabelOn]} numberOfLines={1}>
              {action.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The page's top line: the room's name, and where today stands. */
export function PanelHeader({ title, status }: { title: string; status?: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {status ? (
        <Text style={styles.status} numberOfLines={1}>
          {status}
        </Text>
      ) : null}
    </View>
  );
}

/** A thin bar for a day's goal (steps, calories): how far along, never past full. */
export function PanelProgress({ fraction }: { fraction: number }) {
  const share = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` as const;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: share }]} />
    </View>
  );
}

/** A card with a small heading: one group of things on the page. */
export function PanelSection({
  title,
  action,
  children,
}: {
  title: string;
  /** A word at the heading's end: Edit, Done. */
  action?: { label: string; onPress: () => void };
  children: ReactNode;
}) {
  return (
    <View style={[layout.card, styles.section]}>
      {action ? (
        <View style={styles.sectionHead}>
          <Text style={text.kicker}>{title}</Text>
          <PanelLink label={action.label} onPress={action.onPress} />
        </View>
      ) : (
        <Text style={text.kicker}>{title}</Text>
      )}
      {children}
    </View>
  );
}

/** A quiet action as a coral word: Edit, Save as routine, Cancel. */
export function PanelLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => {
        haptic('select');
        onPress();
      }}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

/** The page's buttons: `primary` is the room's main thing, the rest sit beside it. */
export function PanelButton({
  label,
  onPress,
  primary,
  style,
}: {
  label: string;
  /** A promise holds the button (and dims it) until the log has landed. */
  onPress: () => void | Promise<void>;
  primary?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [busy, setBusy] = useState(false);
  const press = async () => {
    if (busy) return;
    haptic('press');
    const result = onPress();
    if (!result) return;
    setBusy(true);
    try {
      await result;
    } catch {
      // The app's error banner says what went wrong.
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy }}
      onPress={() => void press()}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonQuiet,
        pressed && styles.pressed,
        busy && { opacity: 0.6 },
        style,
      ]}
    >
      <Text style={[styles.buttonLabel, primary && styles.buttonLabelPrimary]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** One choice out of a few, as a row of chips: an activity, a number of minutes. */
export function PanelChips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View style={styles.chips} accessibilityRole="radiogroup">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => {
              haptic('select');
              onChange(option.value);
            }}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.chipLabel, on && styles.chipLabelOn]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A labelled number on one line: "Distance  optional  [    ] km". Empty is no value. */
export function PanelNumberField({
  label,
  hint,
  unit,
  value,
  onValue,
}: {
  label: string;
  hint?: string;
  unit: string;
  value: number | undefined;
  onValue: (value: number | undefined) => void;
}) {
  return (
    <View style={styles.numberRow}>
      <Text style={styles.numberLabel}>{label}</Text>
      {hint ? <Text style={styles.numberHint}>{hint}</Text> : null}
      <View style={{ flex: 1 }} />
      <NumberInput
        decimal
        value={value}
        onValue={onValue}
        placeholder="0"
        placeholderTextColor={colors.faint}
        accessibilityLabel={`${label} in ${unit}`}
        maxLength={6}
        style={styles.numberInput}
      />
      <Text style={styles.numberUnit}>{unit}</Text>
    </View>
  );
}

/** A row of buttons sharing the width. */
export function PanelButtonRow({ children }: { children: ReactNode }) {
  return <View style={styles.buttonRow}>{children}</View>;
}

/**
 * One line in a list: a meal, a routine, a game. Tapping the row opens it;
 * `action` is a separate button at the end (log it again, start it).
 */
export function PanelRow({
  title,
  detail,
  onPress,
  action,
  done,
}: {
  title: string;
  detail?: string;
  onPress?: () => void;
  /**
   * A second thing to do with the row. With `text` it is a small labelled
   * button (Use, Delete); without, a +. Either turns to a tick once what it
   * does has landed.
   */
  action?: { label: string; text?: string; onPress: () => Promise<void> | void };
  /** Already done today: a tick in place of the action. */
  done?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [justDone, setJustDone] = useState(false);
  const runAction = async () => {
    if (!action || busy) return;
    haptic('press');
    setBusy(true);
    try {
      await action.onPress();
      setJustDone(true);
      setTimeout(() => setJustDone(false), 1600);
    } catch {
      // The app's error banner says what went wrong.
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, pressed && onPress && styles.pressed]}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text style={styles.rowDetail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {done || justDone ? (
        <View style={[styles.rowAction, styles.rowDone]}>
          <Mark kind="check" size={12} weight={2.4} color={colors.onCoral} />
        </View>
      ) : action?.text ? (
        <Pressable
          onPress={() => void runAction()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          disabled={busy}
          style={({ pressed }) => [styles.rowTextAction, pressed && styles.pressed, busy && { opacity: 0.5 }]}
        >
          <Text style={styles.rowTextActionLabel}>{action.text}</Text>
        </Pressable>
      ) : action ? (
        <Pressable
          onPress={() => void runAction()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          disabled={busy}
          style={({ pressed }) => [styles.rowAction, pressed && styles.pressed, busy && { opacity: 0.5 }]}
        >
          <Mark kind="plus" size={12} weight={2.4} color={colors.onCoral} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/** What shows in a list with nothing in it yet. */
export function PanelEmpty({ children }: { children: string }) {
  return <Text style={styles.empty}>{children}</Text>;
}

const styles = themedStyles(() => ({
  page: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.paper,
    overflow: 'hidden',
  },
  task: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28, gap: 14 },
  footer: { position: 'absolute', left: 12, right: 12, bottom: ACTION_BAR_LIFT },
  actionBar: {
    height: ACTION_BAR_HEIGHT,
    borderRadius: 20,
    borderCurve: 'continuous',
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#2a1f16',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  action: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 3, margin: 5, borderRadius: 15 },
  actionOn: { backgroundColor: colors.coral },
  actionLabel: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '600', color: colors.ink },
  actionLabelOn: { color: colors.onCoral },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingHorizontal: 4 },
  title: { ...text.title, flexShrink: 0 },
  status: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.muted, flexShrink: 1, minWidth: 0 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.track, overflow: 'hidden', marginTop: -6, marginHorizontal: 4 },
  fill: { height: '100%', borderRadius: 4, backgroundColor: colors.coral },
  section: { gap: 8, padding: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.coralDeep },
  buttonRow: { flexDirection: 'row', gap: 8 },
  button: {
    flex: 1,
    minWidth: 0,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  buttonPrimary: { backgroundColor: colors.coral },
  buttonQuiet: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  buttonLabel: { fontFamily: fonts.ui, fontSize: 16, fontWeight: '600', color: colors.ink },
  buttonLabelPrimary: { color: colors.onCoral },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 2 },
  numberLabel: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.inkSoft },
  numberHint: { fontFamily: fonts.ui, fontSize: 14, color: colors.faint },
  numberInput: {
    width: 84,
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.cardSoft,
    fontFamily: fonts.ui,
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'right',
  },
  numberUnit: { fontFamily: fonts.ui, fontSize: 15, color: colors.muted, minWidth: 22 },
  chips: { flexDirection: 'row', gap: 6 },
  chip: {
    flex: 1,
    minWidth: 0,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    backgroundColor: colors.cardSoft,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipOn: { backgroundColor: colors.selectedFill, borderColor: colors.coral },
  chipLabel: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: colors.inkSoft },
  chipLabelOn: { color: colors.coralDeep },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.cardSoft,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.ui, fontSize: 16, fontWeight: '600', color: colors.ink },
  rowDetail: { fontFamily: fonts.ui, fontSize: 14, color: colors.muted, marginTop: 1 },
  rowAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowDone: { backgroundColor: colors.mintDeep },
  rowTextAction: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },
  rowTextActionLabel: { fontFamily: fonts.ui, fontSize: 14, fontWeight: '600', color: colors.coralDeep },
  empty: { fontFamily: fonts.ui, fontSize: 15, color: colors.muted, lineHeight: 21 },
}));
