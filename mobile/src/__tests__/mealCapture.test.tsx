import renderer, { act } from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import type { FoodSearchResult, MealAnalysis } from '@vitto/core';
import { MealCaptureScreen } from '../screens/MealCaptureScreen';
import { pictureSize } from '../components/MealCamera';

const asset = {
  uri: 'file:///tmp/plate.jpg',
  base64: 'aGVsbG8=',
  mimeType: 'image/jpeg',
};

// jest-expo already substitutes its own stand-in for every expo module, so a
// jest.mock factory gets overridden. Redefining the members wins either way.
const mockLaunchLibrary = jest.fn();
const stub = (name: string, value: unknown) =>
  Object.defineProperty(ImagePicker, name, { value, writable: true, configurable: true });

stub('launchImageLibraryAsync', mockLaunchLibrary);
stub('requestMediaLibraryPermissionsAsync', jest.fn(async () => ({ granted: true })));

// The viewfinder: what it was last given (its barcode listener among it), and
// a shutter that takes the photo through its ref.
const mockPermission = { current: { granted: true, canAskAgain: true } };
const mockCamera: { props: Record<string, any> | null } = { props: null };
const mockTakePicture = jest.fn();
jest.mock('expo-camera', () => {
  const React = require('react');
  return {
    __esModule: true,
    CameraView: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      mockCamera.props = props;
      React.useImperativeHandle(ref, () => ({ takePictureAsync: (...args: unknown[]) => mockTakePicture(...args) }));
      return null;
    }),
    useCameraPermissions: () => [mockPermission.current, jest.fn()],
  };
});

const mockLookup = jest.fn();
jest.mock('@vitto/core', () => ({ ...jest.requireActual('@vitto/core'), lookupBarcode: (...args: unknown[]) => mockLookup(...args) }));
const mockAnalyze = jest.fn();
jest.mock('../services/mealAnalysis', () => ({
  analyzeMealImage: (...args: unknown[]) => mockAnalyze(...args),
  correctMealAnalysis: jest.fn(),
  shrinkForUpload: async (shot: { uri: string; base64: string }) => shot,
}));

const bar: FoodSearchResult = {
  id: 'fatsecret-9',
  name: 'Peanut Butter Bar',
  brand: 'Barebells',
  servingDescription: '1 bar (55 g)',
  macros: { calories: 200, proteinGrams: 20, carbsGrams: 18, fatGrams: 8, fiberGrams: 3 },
};
const plate = {
  foodDescription: '1 bowl of oats',
  grade: 'B',
  summary: '',
  confidence: 0.8,
  detectedFoods: ['oats'],
  macros: { calories: 300, proteinGrams: 10, carbsGrams: 50, fatGrams: 5 },
  nutrients: { protein: true, vegetables: false, fruit: false, wholeGrains: true, fiber: true, treats: false },
} as MealAnalysis;

const press = (tree: renderer.ReactTestRenderer, label: string) => {
  const button = tree.root
    .findAll((node) => typeof node.props.onPress === 'function')
    .find((node) => node.findAllByType(Text).some((text: any) => text.props.children === label));
  if (!button) throw new Error(`No pressable labelled "${label}"`);
  return button;
};
const byId = (tree: renderer.ReactTestRenderer, testID: string) =>
  tree.root.findAll((node) => node.props.testID === testID && (typeof node.props.onPress === 'function' || typeof node.type === 'string'));
const shows = (tree: renderer.ReactTestRenderer, text: string) => JSON.stringify(tree.toJSON()).includes(text);

const mount = (props: Partial<React.ComponentProps<typeof MealCaptureScreen>> = {}) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <MealCaptureScreen onComplete={async () => {}} onFeedStart={() => {}} onAnalyzingChange={() => {}} onClose={() => {}} {...props} />,
    );
  });
  return tree;
};

describe('meal capture', () => {
  beforeEach(() => {
    mockPermission.current = { granted: true, canAskAgain: true };
    mockCamera.props = null;
    mockLaunchLibrary.mockReset().mockResolvedValue({ canceled: false, assets: [asset] });
    mockTakePicture.mockReset().mockResolvedValue({ uri: 'file:///shot.jpg', base64: 'aGk=', width: 1200, height: 900 });
    mockLookup.mockReset().mockResolvedValue(bar);
    mockAnalyze.mockReset().mockResolvedValue(plate);
  });

  it('asks the picker for the image bytes, not just a file path', async () => {
    const tree = mount({ initialMode: 'photo' });

    await act(async () => {
      await press(tree, 'Library').props.onPress();
      // The camera's page slides away first: iOS shows one page over the app at a time.
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    expect(byId(tree, 'meal-camera')).toHaveLength(0);

    // base64 is what lets the upload skip reading the file back off disk, which
    // needs native APIs that are missing from some Expo Go builds.
    expect(mockLaunchLibrary).toHaveBeenCalledTimes(1);
    expect(mockLaunchLibrary.mock.calls[0][0]).toMatchObject({ base64: true });
    act(() => tree.unmount());
  });

  it('looks each mode like itself: Barcode is a frame with no button, Photo a shutter', () => {
    const tree = mount({ initialMode: 'scan' });
    expect(byId(tree, 'barcode-frame').length).toBeGreaterThan(0);
    expect(byId(tree, 'shutter')).toHaveLength(0);
    expect(shows(tree, 'Line up the barcode')).toBe(true);
    // The library is a photo's way in, not a barcode's.
    expect(() => press(tree, 'Library')).toThrow();

    act(() => byId(tree, 'camera-mode-photo')[0]!.props.onPress());
    expect(byId(tree, 'barcode-frame')).toHaveLength(0);
    expect(byId(tree, 'shutter').length).toBeGreaterThan(0);
    expect(shows(tree, 'Fit your whole plate in')).toBe(true);
    expect(byId(tree, 'camera-mode-photo')[0]!.props.accessibilityState).toEqual({ selected: true });
    act(() => tree.unmount());
  });

  it('reads a barcode on its own in Barcode mode, says it found it, and logs it as scanned', async () => {
    const saved: unknown[] = [];
    const tree = mount({ initialMode: 'scan', onComplete: async (meal) => { saved.push(meal); } });
    await act(async () => {
      await mockCamera.props!.onBarcodeScanned({ data: '7340001803228' });
    });
    expect(mockLookup).toHaveBeenCalledWith('7340001803228');
    expect(shows(tree, 'Found it')).toBe(true);
    expect(shows(tree, 'Peanut Butter Bar')).toBe(true);
    // Found: it stops reading, so the same bar is not looked up over and over.
    expect(mockCamera.props!.onBarcodeScanned).toBeUndefined();

    await act(async () => {
      await press(tree, 'Log meal').props.onPress();
    });
    expect(saved).toHaveLength(1);
    expect((saved[0] as { loggedVia: string }).loggedVia).toBe('barcode');
    act(() => tree.unmount());
  });

  it('shows the whole photo it will take, not a zoomed-in crop of it', () => {
    // An iPhone 15 Pro: the picture is 3:4 like the photo, as wide as the screen.
    expect(pictureSize(393, 852)).toEqual({ width: 393, height: 524 });
    // A short window: as tall as fits, still 3:4.
    expect(pictureSize(560, 600)).toEqual({ width: 450, height: 600 });
    const tree = mount({ initialMode: 'scan' });
    const shown = StyleSheet.flatten(byId(tree, 'camera-picture')[0]!.props.style) as { width: number; height: number };
    expect(shown.height / shown.width).toBeCloseTo(4 / 3);
    act(() => tree.unmount());
  });

  it('reads a barcode whichever way up it is printed', async () => {
    const tree = mount({ initialMode: 'scan' });
    // Nothing narrows where in the picture, or which way round, a barcode may be.
    expect(Object.keys(mockCamera.props!.barcodeScannerSettings as object)).toEqual(['barcodeTypes']);
    // The frame's middle is the picture's middle, where an iPhone reads from (across and up-and-down).
    const [above, , below] = byId(tree, 'barcode-frame')[0]!.props.children as { props: { style: unknown } }[];
    const flexOf = (view: { props: { style: unknown } }) => (StyleSheet.flatten(view.props.style as never) as { flex?: number }).flex;
    expect([flexOf(above!), flexOf(below!)]).toEqual([1, 1]);

    // A barcode on its side: a tall, narrow box, off to one side of the picture.
    await act(async () => {
      await mockCamera.props!.onBarcodeScanned({ data: '7340001803228', type: 'ean13', bounds: { origin: { x: 40, y: 120 }, size: { width: 90, height: 420 } }, cornerPoints: [] });
    });
    expect(mockLookup).toHaveBeenCalledWith('7340001803228');
    expect(shows(tree, 'Found it')).toBe(true);
    act(() => tree.unmount());
  });

  it('gives the camera the whole screen, and gets out of the way once it has found something', async () => {
    jest.useFakeTimers();
    const tree = mount({ initialMode: 'scan' });
    // Asked for by name: it is up at once, with nothing of the page's own in its place.
    expect(byId(tree, 'meal-camera').length).toBeGreaterThan(0);
    expect(byId(tree, 'camera-launcher')).toHaveLength(0);

    await act(async () => {
      await mockCamera.props!.onBarcodeScanned({ data: '7340001803228' });
    });
    // A beat on the green frame, then the page with the food on it.
    expect(shows(tree, 'Found it')).toBe(true);
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(byId(tree, 'meal-camera')).toHaveLength(0);
    expect(shows(tree, 'Peanut Butter Bar')).toBe(true);

    // Scan another brings it back, reading again.
    act(() => press(tree, 'Scan another').props.onPress());
    expect(byId(tree, 'meal-camera').length).toBeGreaterThan(0);
    expect(typeof mockCamera.props!.onBarcodeScanned).toBe('function');
    act(() => tree.unmount());
    jest.useRealTimers();
  });

  it('says what went wrong over the picture, and does not look the same barcode up again at once', async () => {
    mockLookup.mockResolvedValue(null);
    const tree = mount({ initialMode: 'scan' });
    await act(async () => {
      await mockCamera.props!.onBarcodeScanned({ data: '0000000000000' });
    });
    expect(shows(tree, 'No food found for barcode 0000000000000.')).toBe(true);
    expect(byId(tree, 'meal-camera').length).toBeGreaterThan(0);
    // Still in the frame, many times a second.
    await act(async () => {
      await mockCamera.props!.onBarcodeScanned({ data: '0000000000000' });
      await mockCamera.props!.onBarcodeScanned({ data: '0000000000000' });
    });
    expect(mockLookup).toHaveBeenCalledTimes(1);
    // A different one is looked up straight away.
    mockLookup.mockResolvedValue(bar);
    await act(async () => {
      await mockCamera.props!.onBarcodeScanned({ data: '7340001803228' });
    });
    expect(mockLookup).toHaveBeenCalledTimes(2);
    act(() => tree.unmount());
  });

  it('closes on its ×: back to Search in the Kitchen, to a way back in elsewhere', () => {
    const onClose = jest.fn();
    const inKitchen = mount({ initialMode: 'camera', inRoom: true, onClose });
    act(() => byId(inKitchen, 'camera-close')[0]!.props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => inKitchen.unmount());

    const sheetClose = jest.fn();
    // A sheet that merely opens on the camera's tab does not throw the camera up unasked.
    const sheet = mount({ onClose: sheetClose });
    expect(byId(sheet, 'meal-camera')).toHaveLength(0);
    expect(byId(sheet, 'camera-launcher').length).toBeGreaterThan(0);
    act(() => press(sheet, 'Open camera').props.onPress());
    expect(byId(sheet, 'meal-camera').length).toBeGreaterThan(0);
    act(() => byId(sheet, 'camera-close')[0]!.props.onPress());
    expect(byId(sheet, 'meal-camera')).toHaveLength(0);
    expect(byId(sheet, 'camera-launcher').length).toBeGreaterThan(0);
    expect(sheetClose).not.toHaveBeenCalled();
    act(() => sheet.unmount());
  });

  it('offers a barcode noticed in Photo mode, and never switches on its own', async () => {
    const tree = mount({ initialMode: 'photo' });
    expect(byId(tree, 'barcode-spotted')).toHaveLength(0);
    act(() => mockCamera.props!.onBarcodeScanned({ data: '7340001803228' }));
    // Still Photo, with nothing looked up: only an offer.
    expect(mockLookup).not.toHaveBeenCalled();
    expect(byId(tree, 'shutter').length).toBeGreaterThan(0);
    expect(shows(tree, 'Barcode found · Look up')).toBe(true);

    await act(async () => {
      await byId(tree, 'barcode-spotted')[0]!.props.onPress();
    });
    expect(mockLookup).toHaveBeenCalledWith('7340001803228');
    expect(byId(tree, 'barcode-frame').length).toBeGreaterThan(0);
    expect(shows(tree, 'Peanut Butter Bar')).toBe(true);
    act(() => tree.unmount());
  });

  it('opens the camera on the mode it was last used in', async () => {
    const first = mount({ initialMode: 'photo' });
    act(() => byId(first, 'camera-mode-barcode')[0]!.props.onPress());
    expect(await AsyncStorage.getItem('vitto.mealCamera.mode')).toBe('barcode');
    act(() => first.unmount());

    // The Kitchen's Camera button asks for no mode in particular.
    const again = mount({ initialMode: 'camera' });
    expect(byId(again, 'barcode-frame').length).toBeGreaterThan(0);
    act(() => byId(again, 'camera-mode-photo')[0]!.props.onPress());
    act(() => again.unmount());
    const third = mount({ initialMode: 'camera' });
    expect(byId(third, 'shutter').length).toBeGreaterThan(0);
    act(() => third.unmount());
  });

  it('keeps photo tracking for Plus: free opens on Search, barcodes still scan, and the shutter sells Plus', async () => {
    const opened: string[] = [];
    const tree = mount({ canScanPhotos: false, onOpenPlus: () => opened.push('plus') });
    // Not the camera: free starts where it can actually log something.
    expect(byId(tree, 'meal-camera')).toHaveLength(0);

    act(() => press(tree, 'Camera').props.onPress());
    act(() => byId(tree, 'camera-mode-barcode')[0]!.props.onPress());
    // Barcodes are free.
    await act(async () => {
      await mockCamera.props!.onBarcodeScanned({ data: '7340001803228' });
    });
    expect(shows(tree, 'Peanut Butter Bar')).toBe(true);

    // Photo shows what Plus adds, and its shutter and library go to Plus, not the camera.
    act(() => byId(tree, 'camera-mode-photo')[0]!.props.onPress());
    expect(shows(tree, 'Photo logging is part of Vitto Plus')).toBe(true);
    await act(async () => {
      await byId(tree, 'shutter')[0]!.props.onPress();
    });
    // Each goes to Plus on the page under the camera, so the camera is put away: ask for it again.
    expect(byId(tree, 'meal-camera')).toHaveLength(0);
    act(() => press(tree, 'Open camera').props.onPress());
    await act(async () => {
      await press(tree, 'Library').props.onPress();
    });
    expect(opened).toEqual(['plus', 'plus']);
    expect(mockTakePicture).not.toHaveBeenCalled();
    expect(mockLaunchLibrary).not.toHaveBeenCalled();
    expect(mockAnalyze).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});
