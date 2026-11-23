import { useEffect, useRef, useState } from 'react';
import { Animated, Linking, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Mark, PressableScale, haptic } from './ui';
import { topInsetFor } from '../petWorld/chromeScale';
import { colors, fonts, themedStyles } from '../theme';

export type CameraMode = 'barcode' | 'photo';

/** A photo as the shutter hands it over: the bytes are in hand, as the picker's are. */
export interface CameraShot {
  uri: string;
  base64: string;
  width?: number;
  height?: number;
}

interface Props {
  /** The camera is up, over the whole screen. */
  open: boolean;
  /** The × (or Android's back): put the camera away with nothing taken. */
  onClose: () => void;
  /** Asks for the camera again from the page, once it has been put away. */
  onOpen: () => void;
  /** Whether the page shows the way back in: not while it is showing what the camera found. */
  launcher: boolean;
  /** Something that went wrong (no food for that barcode), said over the picture. */
  problem?: string | null;
  mode: CameraMode;
  onMode: (mode: CameraMode) => void;
  /** Photo logging is Plus. False badges the shutter, and pressing it goes to `onLockedPhoto` instead of shooting. */
  canPhoto: boolean;
  onLockedPhoto: () => void;
  /** A barcode read in Barcode mode, or one spotted in Photo mode and asked for. */
  onBarcode: (data: string) => void;
  /** A barcode's food is found and showing: the frame says so and scanning rests. */
  found: boolean;
  /** A barcode is being looked up: scanning rests until it is back. */
  busy: boolean;
  onPhoto: (shot: CameraShot) => void;
  onLibrary: () => void;
  onProblem: (message: string) => void;
}

/**
 * The camera to scan with, from the phone's own list (iOS names them in
 * English, e.g. "Back Triple Camera"). Pro iPhones' main camera cannot focus
 * nearer than about 20 cm, so a barcode held where it is natural to hold one
 * stays blurred. The combined cameras switch to the ultra-wide lens up close,
 * which focuses at a few centimetres. A phone without one keeps the default.
 */
export const closeUpLens = (lenses: readonly string[]): string | undefined =>
  lenses.find((name) => /triple/i.test(name)) ?? lenses.find((name) => /dual wide/i.test(name));

const MODES: readonly { value: CameraMode; label: string }[] = [
  { value: 'barcode', label: 'Barcode' },
  { value: 'photo', label: 'Photo' },
];

/** How long a barcode seen in Photo mode keeps its "Look up" pill once it leaves the frame. */
const SPOTTED_MS = 3500;
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] as const;

/** Below the picture: the home indicator's strip on an iPhone. */
const HOME_INDICATOR_INSET = Platform.OS === 'ios' ? 24 : 12;

/**
 * The Kitchen's camera: one viewfinder for barcodes and for meal photos, over
 * the whole screen, with the phone camera's own way of choosing between them,
 * a row of mode names under the picture.
 *
 * The two modes look different on purpose, so which one is on is read off the
 * screen, not the label: Barcode dims the picture around a frame and has no
 * button, because it reads on its own; Photo is the whole picture with a
 * shutter. A barcode noticed while in Photo mode is offered, never acted on:
 * the mode does not change under anyone.
 *
 * It is a page of its own, over everything, because a plate needs the room: in
 * a card on the logging page the picture was a third of the screen. What it
 * finds is shown back on that page, which is where `launcher` offers the way
 * back in.
 */
export function MealCamera({ open, onClose, onOpen, launcher, problem, mode, onMode, canPhoto, onLockedPhoto, onBarcode, found, busy, onPhoto, onLibrary, onProblem }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  /** The close-focus camera for barcodes, once the phone has said which it has. */
  const [lens, setLens] = useState<string | undefined>(undefined);
  const [shooting, setShooting] = useState(false);
  /** A barcode in the frame while in Photo mode. */
  const [spotted, setSpotted] = useState<string | null>(null);
  const flash = useRef(new Animated.Value(0)).current;
  const window = useWindowDimensions();
  const topInset = Platform.OS === 'web' ? 16 : topInsetFor(window.width, window.height);
  const picture = pictureSize(Math.min(window.width, FINDER_MAX_WIDTH), window.height);

  useEffect(() => {
    if (!spotted) return undefined;
    const timer = setTimeout(() => setSpotted(null), SPOTTED_MS);
    return () => clearTimeout(timer);
  }, [spotted]);
  useEffect(() => setSpotted(null), [mode, open]);

  const choose = (next: CameraMode) => {
    if (next === mode) return;
    haptic('select');
    onMode(next);
  };

  // A sideways swipe on the picture changes mode, as it does in the phone's
  // camera. Only a clearly sideways one, so a tap on the shutter stays a tap.
  const swipe = useRef({ mode, choose });
  swipe.current = { mode, choose };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
      onPanResponderRelease: (_event, gesture) => {
        if (Math.abs(gesture.dx) < 40) return;
        // The modes sit left to right: pulling the picture left goes to the one on the right.
        swipe.current.choose(gesture.dx < 0 ? 'photo' : 'barcode');
      },
    }),
  ).current;

  const shoot = async () => {
    if (!canPhoto) {
      onLockedPhoto();
      return;
    }
    if (shooting || !camera.current) return;
    setShooting(true);
    haptic('press');
    flash.setValue(0.85);
    Animated.timing(flash, { toValue: 0, duration: 260, useNativeDriver: true }).start();
    try {
      // base64 keeps the bytes in hand, so nothing has to read the file back later.
      const shot = await camera.current.takePictureAsync({ quality: 0.6, base64: true });
      if (!shot?.base64) throw new Error('no bytes');
      onPhoto({ uri: shot.uri, base64: shot.base64.replace(/^data:image\/\w+;base64,/, ''), width: shot.width, height: shot.height });
    } catch {
      onProblem('That photo could not be taken. Try again, or choose one from your library.');
    } finally {
      setShooting(false);
    }
  };

  const scanning = mode === 'barcode' && !found && !busy;
  const granted = permission?.granted === true;
  const blocked = permission ? !permission.canAskAgain : false;

  return (
    <>
      {launcher && !open ? (
        <View style={styles.launcher} testID="camera-launcher">
          <Text style={styles.launcherTitle}>{mode === 'barcode' ? 'Scan a barcode' : 'Snap your plate'}</Text>
          <Text style={styles.launcherHint}>
            {mode === 'barcode' ? 'Point the camera at a product barcode and Vitto looks it up.' : 'Vitto reads the food, counts the macros and grades it.'}
          </Text>
          <PressableScale accessibilityRole="button" style={styles.launcherButton} onPress={onOpen}>
            <Text style={styles.launcherLabel}>Open camera</Text>
          </PressableScale>
        </View>
      ) : null}

      <Modal visible={open} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={onClose}>
        <View style={styles.page} testID="meal-camera">
          {/* On a wide browser window the picture keeps a phone's width. */}
          <View style={styles.finder} {...pan.panHandlers}>
            {granted ? (
              // The picture the photo will be, 3:4 as the phone's camera shows
              // it. Stretched over the whole tall screen it lost about 40% of
              // its width, and looked zoomed in next to the photo it took.
              <View style={[styles.picture, { width: picture.width, height: picture.height }]} testID="camera-picture">
              <CameraView
                ref={camera}
                style={StyleSheet.absoluteFill}
                facing="back"
                // A camera that can focus close, for barcodes: see closeUpLens.
                selectedLens={mode === 'barcode' ? lens : undefined}
                onAvailableLensesChanged={({ lenses }) => setLens(closeUpLens(lenses))}
                barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
                onBarcodeScanned={
                  scanning
                    ? ({ data }) => onBarcode(data)
                    : mode === 'photo' && !shooting
                      ? ({ data }) => setSpotted(data)
                      : undefined
                }
              />
              </View>
            ) : (
              <View style={styles.permission} testID="camera-permission">
                <Text style={styles.permissionTitle}>Camera access needed</Text>
                <Text style={styles.permissionHint}>
                  {blocked
                    ? `Camera access is off for Vitto. Turn it on in Settings to ${mode === 'barcode' ? 'scan barcodes' : 'photograph a meal'}.`
                    : mode === 'barcode'
                      ? 'To scan a barcode, allow the camera.'
                      : 'To photograph a meal, allow the camera.'}
                </Text>
                {/* Once someone has said no, iOS will not ask again: the only
                    way back is the app's page in Settings. */}
                <PressableScale accessibilityRole="button" style={styles.permissionButton} onPress={() => void (blocked ? Linking.openSettings() : requestPermission())}>
                  <Text style={styles.permissionLabel}>{blocked ? 'Open Settings' : 'Allow camera'}</Text>
                </PressableScale>
              </View>
            )}

            {granted && mode === 'barcode' ? (
              <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="barcode-frame">
                <View style={styles.dim} />
                <View style={styles.frameRow}>
                  <View style={styles.dim} />
                  <View style={[styles.frame, found && styles.frameFound]} />
                  <View style={styles.dim} />
                </View>
                <View style={[styles.dim, styles.dimFoot]}>
                  <Text style={styles.finderHint}>{found ? 'Found it' : busy ? 'Looking it up...' : 'Line up the barcode'}</Text>
                </View>
              </View>
            ) : null}

            <View style={[styles.top, { paddingTop: topInset }]} pointerEvents="box-none">
              <Pressable accessibilityRole="button" accessibilityLabel="Close the camera" hitSlop={10} onPress={onClose} style={styles.close} testID="camera-close">
                <Mark kind="cross" size={13} color="#ffffff" />
              </Pressable>
              {problem ? (
                <View style={styles.problem}>
                  <Text style={styles.problemLabel}>{problem}</Text>
                </View>
              ) : spotted && mode === 'photo' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Barcode found. Look it up"
                  onPress={() => {
                    const data = spotted;
                    setSpotted(null);
                    onMode('barcode');
                    onBarcode(data);
                  }}
                  style={styles.spotted}
                  testID="barcode-spotted"
                >
                  <Text style={styles.spottedLabel}>Barcode found · Look up</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={[styles.foot, { paddingBottom: HOME_INDICATOR_INSET + 10 }]} pointerEvents="box-none">
              {mode === 'photo' ? (
                <>
                  {granted ? <Text style={styles.finderHint}>{canPhoto ? 'Fit your whole plate in' : 'Photo logging is part of Vitto Plus'}</Text> : null}
                  <View style={styles.shutterRow} pointerEvents="box-none">
                    <View style={styles.side}>
                      <PressableScale style={styles.library} onPress={onLibrary}>
                        <Text style={styles.libraryLabel} numberOfLines={1}>Library</Text>
                      </PressableScale>
                    </View>
                    {granted ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={canPhoto ? 'Take photo' : 'Take photo, a Vitto Plus feature'}
                        disabled={shooting}
                        onPress={() => void shoot()}
                        style={({ pressed }) => [styles.shutter, pressed && styles.shutterPressed]}
                        testID="shutter"
                      >
                        <View style={styles.shutterDisc} />
                        {canPhoto ? null : (
                          <View style={styles.plusBadge}>
                            <Text style={styles.plusBadgeLabel}>Plus</Text>
                          </View>
                        )}
                      </Pressable>
                    ) : null}
                    <View style={styles.side} />
                  </View>
                </>
              ) : null}
              <View style={styles.modes} accessibilityRole="tablist">
                {MODES.map((option) => {
                  const on = option.value === mode;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={option.value === 'photo' && !canPhoto ? 'Photo, a Vitto Plus feature' : option.label}
                      onPress={() => choose(option.value)}
                      hitSlop={8}
                      style={[styles.mode, on && styles.modeOn]}
                      testID={`camera-mode-${option.value}`}
                    >
                      <Text style={[styles.modeLabel, on && styles.modeLabelOn]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <Animated.View style={[StyleSheet.absoluteFill, styles.flash, { opacity: flash }]} pointerEvents="none" />
          </View>
        </View>
      </Modal>
    </>
  );
}

const FINDER_MAX_WIDTH = 560;

/** The camera's picture, 3:4 upright like a photo, as wide as fits: what is shown is what is taken. */
export const pictureSize = (width: number, height: number): { width: number; height: number } => {
  const tall = Math.min((width * 4) / 3, height);
  return { width: (tall * 3) / 4, height: tall };
};

const DIM = 'rgba(0,0,0,0.55)';
const FRAME_HEIGHT = 220;
const GLASS = 'rgba(0,0,0,0.5)';

const styles = themedStyles(() => ({
  page: { flex: 1, alignItems: 'center', backgroundColor: '#000' },
  finder: { flex: 1, width: '100%', maxWidth: FINDER_MAX_WIDTH, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  // In the middle of the screen, so the barcode frame (drawn over the whole
  // screen, centred) is centred on the picture too.
  picture: { overflow: 'hidden', backgroundColor: '#000' },
  dim: { flex: 1, backgroundColor: DIM },
  // As much dark below the frame as above it (the plain `dim`), so the frame's
  // middle is the picture's middle: an iPhone reads a barcode along lines
  // through the centre of the picture, across and up-and-down, and a barcode
  // lined up anywhere else is read late or not at all. The hint sits just
  // under the frame, not in the middle of the dark below it.
  dimFoot: { alignItems: 'center', paddingTop: 18 },
  // Tall enough for a barcode printed on its side (down a can, along a carton's
  // edge) to be held in the frame as it is, without turning the phone: the
  // whole picture is read whichever way the bars run.
  frameRow: { flexDirection: 'row', height: FRAME_HEIGHT },
  // The clear part of the picture.
  frame: { width: '80%', borderWidth: 2.5, borderColor: '#ffffff', borderRadius: 16 },
  frameFound: { borderColor: '#57d98a' },
  finderHint: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: '#ffffff', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, gap: 12 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: GLASS },
  problem: { alignSelf: 'center', maxWidth: 420, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.78)' },
  problemLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 14, lineHeight: 19, color: '#ffffff', textAlign: 'center' },
  spotted: { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.78)' },
  spottedLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 14, color: '#ffffff' },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 14 },
  shutterRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', paddingHorizontal: 20, minHeight: 78 },
  // Either side of the shutter, the same width, so it stays in the middle.
  side: { flex: 1, alignItems: 'flex-start' },
  // Drawn like the phone camera's shutter: a ring with a gap, a solid disc inside.
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  shutterPressed: { opacity: 0.8, transform: [{ scale: 0.95 }] },
  shutterDisc: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#ffffff' },
  plusBadge: { position: 'absolute', top: -8, right: -22, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.coral },
  plusBadgeLabel: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 11, color: colors.onCoral },
  flash: { backgroundColor: '#ffffff' },
  modes: { flexDirection: 'row', justifyContent: 'center', gap: 6, padding: 4, borderRadius: 999, backgroundColor: GLASS },
  mode: { minHeight: 36, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  modeOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  modeLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' },
  modeLabelOn: { color: '#ffffff', fontWeight: '700' },
  library: { minHeight: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: GLASS },
  libraryLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 14, color: '#ffffff' },
  permission: { flex: 1, alignSelf: 'stretch', paddingHorizontal: 32, gap: 10, alignItems: 'center', justifyContent: 'center' },
  permissionTitle: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 19, color: '#ffffff' },
  permissionHint: { fontFamily: fonts.ui, fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  permissionButton: { marginTop: 8, minHeight: 46, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: colors.coral },
  permissionLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.onCoral },
  // On the logging page, once the camera has been put away: the way back in.
  launcher: {
    paddingVertical: 26,
    paddingHorizontal: 20,
    gap: 8,
    alignItems: 'center',
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
  },
  launcherTitle: { fontFamily: fonts.ui, fontWeight: '700', fontSize: 18, color: colors.ink },
  launcherHint: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 18, color: colors.muted, textAlign: 'center' },
  launcherButton: { marginTop: 8, minHeight: 46, paddingHorizontal: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: colors.coral },
  launcherLabel: { fontFamily: fonts.ui, fontWeight: '600', fontSize: 15, color: colors.onCoral },
}));
