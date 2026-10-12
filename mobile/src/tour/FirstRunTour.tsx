import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { RETRO_BORDER_WIDTH, RETRO_RADIUS, retroPressed, retroShadow } from '../petWorld/retroStyle';
import { fonts, themedStyles, world } from '../theme';

/**
 * A short first-run tour of the main screen: where to log meals, workouts and
 * runs, where today's numbers are, how to talk to the pet, and (on Plus) how to
 * change its personality.
 *
 * The things it points at register themselves with `useTourTarget`, so the
 * tour rings whatever is actually on screen wherever it is laid out, rather
 * than guessing coordinates that would drift between phones.
 */

export type TourTargetId = 'kitchen' | 'gym' | 'outside' | 'study' | 'today' | 'chat' | 'level' | 'account';

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

/**
 * The tour's steps, in order, in the pet's own voice: it is showing you round
 * its world. The personality step only for Plus, which is where choosing one lives.
 */
export const tourSteps = (petName: string, plus: boolean): TourStep[] => [
  {
    target: 'kitchen',
    title: 'The kitchen',
    body: 'Tap here, then Log meal, whenever you eat. Search it, scan the barcode, or snap a photo with Plus. I eat what you eat!',
  },
  {
    target: 'gym',
    title: 'The gym',
    body: 'Tap here, then Log workout after you train. Every session makes me stronger.',
  },
  {
    target: 'outside',
    title: 'Outside',
    body: 'Log your runs and walks out here. Connect Apple Health and your steps come in on their own.',
  },
  {
    target: 'study',
    title: 'The study',
    body: 'Play a quick mind game in here each day: word puzzles, trivia and more. They keep my mind sharp!',
  },
  {
    target: 'today',
    title: 'Today',
    body: 'Tap TODAY to see how the day is going: calories, macros, steps and your goals.',
  },
  {
    target: 'chat',
    title: 'Chat',
    body: 'Come talk to me here! Ask how I am doing. I know how your day is going.',
  },
  {
    target: 'level',
    title: 'My level',
    body: 'Every log earns me XP and fills this ring. Tap it to see all my stats and how close I am to evolving!',
  },
  {
    target: 'account',
    title: 'Your account',
    body: plus
      ? `Tap here for your profile, friends and settings. Want me to be a little different? Settings → Personality changes who ${petName} is.`
      : 'Tap here for your profile, your friends, and all your settings.',
  },
];

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}


export function FirstRunTour({ steps, onDone, speaker }: { steps: TourStep[]; onDone: () => void; speaker?: string }) {
  const registry = useContext(TourContext);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  // -1 is the welcome card, before the first step: the tour is offered, not sprung.
  const [index, setIndex] = useState(-1);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState<number | null>(null);
  const intro = index < 0;
  const step: { target?: TourTargetId; title: string; body: string } | undefined = intro
    ? {
        title: 'Welcome home!',
        body: speaker
          ? `This is where ${speaker} lives. Want a quick look around?`
          : 'This is your new home. Want a quick look around?',
      }
    : steps[index];

  // Where the current target is, kept current while its step shows: the
  // screen is still settling when the tour opens (the bottom bar lays out
  // last), so a single early reading can land in the wrong place. A target
  // that never appears leaves the box centred with nothing marked.
  useEffect(() => {
    if (!step) return undefined;
    let cancelled = false;
    setRect(null);
    const look = () => {
      const node = step.target ? registry?.find(step.target)?.current : undefined;
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

  // The line types itself out, a character at a time, the way a game's text
  // box does. Instant with Reduce Motion; Next finishes a line still typing.
  const [shown, setShown] = useState(0);
  const full = step?.body ?? '';
  useEffect(() => {
    if (reduceMotion) {
      setShown(full.length);
      return undefined;
    }
    setShown(0);
    const timer = setInterval(() => {
      setShown((current) => {
        if (current >= full.length) {
          clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, TYPE_MS);
    return () => clearInterval(timer);
  }, [full, reduceMotion]);
  const typing = shown < full.length;

  // The corner brackets blink in steps, not a smooth pulse: on, off, on.
  const [blink, setBlink] = useState(true);
  useEffect(() => {
    if (reduceMotion) return undefined;
    const timer = setInterval(() => setBlink((on) => !on), 450);
    return () => clearInterval(timer);
  }, [reduceMotion]);

  const finish = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onDone();
  }, [onDone]);

  if (!step) return null;
  const last = index === steps.length - 1;
  const next = () => {
    void Haptics.selectionAsync().catch(() => undefined);
    if (typing) return setShown(full.length);
    if (last) return finish();
    setIndex(index + 1);
  };

  // The box sits on the far side of the target from the nearest screen edge.
  // Always placed by its top (measured height, for a box above its target):
  // a bottom offset is measured from a different edge inside a web overlay.
  const below = rect ? rect.y + rect.height / 2 < screenHeight / 2 : false;
  const height = cardHeight ?? 0;
  const width = Math.min(screenWidth - 32, 420);
  const left = (screenWidth - width) / 2;
  const top = rect
    ? below
      ? rect.y + rect.height + MARK_PAD + BOX_GAP
      : rect.y - MARK_PAD - BOX_GAP - height
    : screenHeight * 0.35;
  const boxTop = Math.max(24, Math.min(top, screenHeight - height - 24));
  // The pointer between box and target, kept inside the box's edges.
  const pointerX = rect ? Math.max(left + 18, Math.min(rect.x + rect.width / 2 - POINTER / 2, left + width - 18 - POINTER * 2)) : null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={finish} statusBarTranslucent>
      <View style={styles.overlay} testID="first-run-tour">
        {/* The dim, in four panels round the target rather than one sheet over
            everything, so the thing being shown stays in its own full colour. */}
        {rect ? (
          <>
            <View pointerEvents="none" style={[styles.dim, { left: 0, right: 0, top: 0, height: Math.max(0, rect.y - MARK_PAD) }]} />
            <View pointerEvents="none" style={[styles.dim, { left: 0, right: 0, top: rect.y + rect.height + MARK_PAD, bottom: 0 }]} />
            <View
              pointerEvents="none"
              style={[styles.dim, { left: 0, width: Math.max(0, rect.x - MARK_PAD), top: rect.y - MARK_PAD, height: rect.height + MARK_PAD * 2 }]}
            />
            <View
              pointerEvents="none"
              style={[styles.dim, { left: rect.x + rect.width + MARK_PAD, right: 0, top: rect.y - MARK_PAD, height: rect.height + MARK_PAD * 2 }]}
            />
          </>
        ) : (
          <View pointerEvents="none" style={[styles.dim, { left: 0, right: 0, top: 0, bottom: 0 }]} />
        )}
        {rect ? (
          <View
            pointerEvents="none"
            testID="tour-ring"
            style={{
              position: 'absolute',
              left: rect.x - MARK_PAD,
              top: rect.y - MARK_PAD,
              width: rect.width + MARK_PAD * 2,
              height: rect.height + MARK_PAD * 2,
              opacity: blink ? 1 : 0.35,
            }}
          >
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        ) : null}

        {rect && pointerX !== null && cardHeight !== null ? (
          <View
            pointerEvents="none"
            style={[
              below ? styles.pointerUp : styles.pointerDown,
              { left: pointerX, top: below ? boxTop - POINTER + 1 : boxTop + height - 1 },
            ]}
          />
        ) : null}

        <View
          onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}
          style={[styles.box, { width, left, top: boxTop }, cardHeight === null && { opacity: 0 }]}
        >
          {speaker ? (
            <View style={styles.nameTag}>
              <Text style={styles.nameTagText}>{speaker.toUpperCase()}</Text>
            </View>
          ) : null}
          <Text style={styles.title} accessibilityRole="header">
            {step.title.toUpperCase()}
          </Text>
          {/* The whole line is laid out from the start (the rest invisible), so
              the box does not grow as the text types itself in. */}
          <Text style={styles.body} accessibilityLabel={full}>
            {full.slice(0, shown)}
            <Text style={styles.unshown}>{full.slice(shown)}</Text>
          </Text>
          <View style={styles.footer}>
            {intro ? (
              <View />
            ) : (
              <View style={styles.progress} accessibilityLabel={`${index + 1} of ${steps.length}`}>
                {steps.map((_, n) => (
                  <View key={n} style={[styles.pip, n <= index && styles.pipOn]} />
                ))}
              </View>
            )}
            <View style={styles.actions}>
              {last ? null : (
                <Pressable accessibilityRole="button" accessibilityLabel={intro ? 'Maybe later' : 'Skip'} onPress={finish} hitSlop={10}>
                  <Text style={styles.skip}>{intro ? 'MAYBE LATER' : 'SKIP'}</Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={intro ? 'Show me around' : last ? "Let's go" : 'Next'}
                onPress={next}
                style={({ pressed }) => [styles.next, pressed && retroPressed]}
              >
                <Text style={styles.nextLabel}>{intro ? 'SHOW ME' : last ? "LET'S GO" : 'NEXT'}</Text>
                {/* A drawn arrowhead, not a ▶ character: iOS draws that as an emoji. */}
                {last ? null : <View style={styles.nextArrow} />}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Space between the target and its corner brackets, and the box. */
const MARK_PAD = 7;
const BOX_GAP = 16;
/** One letter of the typed-out line. */
const TYPE_MS = 18;
/** The pointer triangle's half-width. */
const POINTER = 9;
const CORNER = 14;
const CORNER_WEIGHT = 4;

const styles = themedStyles(() => ({
  overlay: { flex: 1 },
  dim: { position: 'absolute', backgroundColor: 'rgba(20, 15, 11, 0.66)' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: world.surface },
  cornerTL: { left: 0, top: 0, borderLeftWidth: CORNER_WEIGHT, borderTopWidth: CORNER_WEIGHT },
  cornerTR: { right: 0, top: 0, borderRightWidth: CORNER_WEIGHT, borderTopWidth: CORNER_WEIGHT },
  cornerBL: { left: 0, bottom: 0, borderLeftWidth: CORNER_WEIGHT, borderBottomWidth: CORNER_WEIGHT },
  cornerBR: { right: 0, bottom: 0, borderRightWidth: CORNER_WEIGHT, borderBottomWidth: CORNER_WEIGHT },
  pointerUp: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: POINTER,
    borderRightWidth: POINTER,
    borderBottomWidth: POINTER,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: world.ink,
  },
  pointerDown: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: POINTER,
    borderRightWidth: POINTER,
    borderTopWidth: POINTER,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: world.ink,
  },
  box: {
    position: 'absolute',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: world.surface,
    borderWidth: RETRO_BORDER_WIDTH,
    borderColor: world.ink,
    borderRadius: RETRO_RADIUS,
    ...retroShadow,
    shadowOffset: { width: 4, height: 4 },
  },
  nameTag: {
    position: 'absolute',
    top: -16,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: world.accent,
    borderWidth: RETRO_BORDER_WIDTH,
    borderColor: world.ink,
    borderRadius: RETRO_RADIUS,
  },
  nameTagText: { fontFamily: fonts.pixelBold, fontSize: 17, letterSpacing: 1, color: world.surface },
  title: { fontFamily: fonts.pixelBold, fontSize: 23, letterSpacing: 1, color: world.ink, marginBottom: 6 },
  body: { fontFamily: fonts.pixel, fontSize: 21, lineHeight: 29, color: world.ink },
  unshown: { color: 'transparent' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  progress: { flexDirection: 'row', gap: 5 },
  pip: { width: 9, height: 9, borderWidth: 2, borderColor: world.ink, backgroundColor: 'transparent' },
  pipOn: { backgroundColor: world.ink },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  skip: { fontFamily: fonts.pixel, fontSize: 20, letterSpacing: 1, color: world.inkSoft },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: world.accent,
    borderWidth: RETRO_BORDER_WIDTH,
    borderColor: world.ink,
    borderRadius: RETRO_RADIUS,
    ...retroShadow,
  },
  nextArrow: {
    width: 0,
    height: 0,
    marginLeft: 8,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 9,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: world.surface,
  },
  nextLabel: { fontFamily: fonts.pixelBold, fontSize: 20, letterSpacing: 1, color: world.surface },
}));
