import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fonts, themedStyles } from '../theme';

/**
 * A short first-run tour of the main screen: where to log meals, workouts and
 * runs, where today's numbers are, how to talk to the pet, and (on Plus) how to
 * change its personality.
 *
 * The things it points at register themselves with `useTourTarget`, so the
 * tour rings whatever is actually on screen wherever it is laid out, rather
 * than guessing coordinates that would drift between phones.
 */

export type TourTargetId = 'kitchen' | 'gym' | 'outside' | 'today' | 'chat' | 'account';

export interface TourStep {
  target: TourTargetId;
  title: string;
  body: string;
}

interface TourRegistry {
  register: (id: TourTargetId, ref: RefObject<View | null>) => void;
  unregister: (id: TourTargetId, ref: RefObject<View | null>) => void;
  find: (id: TourTargetId) => RefObject<View | null> | undefined;
}

const TourContext = createContext<TourRegistry | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const targets = useRef(new Map<TourTargetId, RefObject<View | null>>());
  const registry = useMemo<TourRegistry>(
    () => ({
      register: (id, ref) => targets.current.set(id, ref),
      unregister: (id, ref) => {
        if (targets.current.get(id) === ref) targets.current.delete(id);
      },
      find: (id) => targets.current.get(id),
    }),
    [],
  );
  return <TourContext.Provider value={registry}>{children}</TourContext.Provider>;
}

/** A ref for something the tour can point at. Outside a TourProvider it is just a ref. */
export function useTourTarget(id: TourTargetId) {
  const registry = useContext(TourContext);
  const ref = useRef<View>(null);
  useEffect(() => {
    registry?.register(id, ref);
    return () => registry?.unregister(id, ref);
  }, [registry, id]);
  return ref;
}

/** The tour's steps, in order. The personality step only for Plus, which is where choosing one lives. */
export const tourSteps = (petName: string, plus: boolean): TourStep[] => [
  {
    target: 'kitchen',
    title: 'Meals go in the kitchen',
    body: `Tap the kitchen, then Log meal. Search, scan a barcode, or snap a photo with Plus. ${petName} eats what you eat.`,
  },
  {
    target: 'gym',
    title: 'Workouts go in the gym',
    body: `Tap the gym, then Log workout. Training makes ${petName} stronger.`,
  },
  {
    target: 'outside',
    title: 'Runs and walks go outside',
    body: 'Log a run out here. With Apple Health connected, your steps come in on their own.',
  },
  {
    target: 'today',
    title: "Today's stats",
    body: 'Tap TODAY for your calories, macros, steps and goals for the day.',
  },
  {
    target: 'chat',
    title: `Talk to ${petName}`,
    body: `Ask how they're doing. ${petName} knows how your day is going.`,
  },
  ...(plus
    ? [
        {
          target: 'account' as const,
          title: `Change ${petName}'s personality`,
          body: `Open your account, then Settings → Personality, to change who ${petName} is whenever you like.`,
        },
      ]
    : []),
];

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Room around the ringed target, and between it and the card. */
const RING_PAD = 6;
const CARD_GAP = 14;

export function FirstRunTour({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const registry = useContext(TourContext);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState<number | null>(null);
  const step = steps[index];

  // Where the current target is, kept current while its step shows: the
  // screen is still settling when the tour opens (the bottom bar lays out
  // last), so a single early reading can land in the wrong place. A target
  // that never appears leaves the card centred with nothing ringed.
  useEffect(() => {
    if (!step) return undefined;
    let cancelled = false;
    setRect(null);
    const look = () => {
      const node = registry?.find(step.target)?.current;
      node?.measureInWindow((x, y, width, height) => {
        if (cancelled || !(width > 0 && height > 0)) return;
        setRect((current) =>
          current && current.x === x && current.y === y && current.width === width && current.height === height
            ? current
            : { x, y, width, height },
        );
      });
    };
    look();
    const timer = setInterval(look, 250);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [registry, step]);

  const finish = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onDone();
  }, [onDone]);

  if (!step) return null;
  const last = index === steps.length - 1;
  const next = () => {
    if (last) return finish();
    void Haptics.selectionAsync().catch(() => undefined);
    setIndex(index + 1);
  };

  // The card sits on the far side of the target from the nearest screen edge.
  // Always placed by its top (measured height, for a card above its target):
  // a bottom offset is measured from a different edge inside a web overlay.
  const below = rect ? rect.y + rect.height / 2 < screenHeight / 2 : false;
  const height = cardHeight ?? 0;
  const top = rect
    ? below
      ? rect.y + rect.height + RING_PAD + CARD_GAP
      : rect.y - RING_PAD - CARD_GAP - height
    : screenHeight * 0.35;
  // Never off the screen, whatever the measurement says.
  const cardPosition = { top: Math.max(24, Math.min(top, screenHeight - height - 24)) };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={finish} statusBarTranslucent>
      <View style={styles.backdrop} testID="first-run-tour">
        {rect ? (
          <View
            pointerEvents="none"
            testID="tour-ring"
            style={[
              styles.ring,
              {
                left: rect.x - RING_PAD,
                top: rect.y - RING_PAD,
                width: rect.width + RING_PAD * 2,
                height: rect.height + RING_PAD * 2,
              },
            ]}
          />
        ) : null}
        <View
          onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}
          style={[
            styles.card,
            { width: Math.min(screenWidth - 32, 420), left: (screenWidth - Math.min(screenWidth - 32, 420)) / 2 },
            cardPosition,
            // Hidden for the one frame before its height is known.
            cardHeight === null && { opacity: 0 },
          ]}
        >
          <Text style={styles.count}>{`${index + 1} of ${steps.length}`}</Text>
          <Text style={styles.title} accessibilityRole="header">
            {step.title}
          </Text>
          <Text style={styles.body}>{step.body}</Text>
          <View style={styles.actions}>
            {last ? <View /> : (
              <Pressable accessibilityRole="button" onPress={finish} hitSlop={10}>
                <Text style={styles.skip}>Skip tour</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={next}
              style={({ pressed }) => [styles.next, pressed && styles.pressed]}
            >
              <Text style={styles.nextLabel}>{last ? "Let's go" : 'Next'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(12, 16, 14, 0.62)' },
  ring: {
    position: 'absolute',
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#fff',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  card: {
    position: 'absolute',
    padding: 18,
    borderRadius: 18,
    backgroundColor: colors.card,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  count: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: colors.faint },
  title: { fontSize: 19, fontWeight: '700', color: colors.ink },
  body: { fontSize: 15, lineHeight: 21, color: colors.inkSoft },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  skip: { fontSize: 15, color: colors.muted },
  next: { paddingVertical: 10, paddingHorizontal: 22, borderRadius: 999, backgroundColor: colors.coral },
  nextLabel: { fontSize: 15, fontWeight: '700', color: '#fff' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
}));
