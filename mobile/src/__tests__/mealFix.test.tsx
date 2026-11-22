import renderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { MealAnalysis } from '@vitto/core';
import { MealCaptureScreen } from '../screens/MealCaptureScreen';

const mockAnalyze = jest.fn();
const mockCorrect = jest.fn();
jest.mock('../services/mealAnalysis', () => ({
  analyzeMealImage: (...args: unknown[]) => mockAnalyze(...args),
  correctMealAnalysis: (...args: unknown[]) => mockCorrect(...args),
  shrinkForUpload: async (asset: { uri: string; base64: string; mimeType?: string }) => asset,
}));
// The in-app viewfinder: its shutter takes the photo through the camera's ref.
const mockTakePicture = jest.fn();
jest.mock('expo-camera', () => {
  const React = require('react');
  return {
    __esModule: true,
    CameraView: React.forwardRef((_props: unknown, ref: unknown) => {
      React.useImperativeHandle(ref, () => ({ takePictureAsync: (...args: unknown[]) => mockTakePicture(...args) }));
      return null;
    }),
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  };
});

const stub = (name: string, value: unknown) =>
  Object.defineProperty(ImagePicker, name, { value, writable: true, configurable: true });
stub('launchImageLibraryAsync', jest.fn());
stub('requestMediaLibraryPermissionsAsync', jest.fn(async () => ({ granted: true })));

const analysis = (description: string, calories: number): MealAnalysis => ({
  foodDescription: description,
  grade: 'C',
  summary: '',
  confidence: 0.7,
  detectedFoods: [description],
  macros: { calories, proteinGrams: 8, carbsGrams: 26, fatGrams: 6 },
  nutrients: { protein: true, vegetables: false, fruit: false, wholeGrains: false, fiber: false, treats: false },
} as MealAnalysis);

const byText = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAll((node) => typeof node.props.onPress === 'function')
    .find((node) => node.findAllByType(Text).some((text: any) => text.props.children === label));
const shows = (tree: renderer.ReactTestRenderer, text: string) => JSON.stringify(tree.toJSON()).includes(text);

const shutter = (tree: renderer.ReactTestRenderer) =>
  tree.root.find((node) => node.props.testID === 'shutter' && typeof node.props.onPress === 'function');

const mount = () => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <MealCaptureScreen initialMode="photo" onComplete={async () => {}} onFeedStart={() => {}} onAnalyzingChange={() => {}} onClose={() => {}} />,
    );
  });
  return tree;
};

describe('meal photo', () => {
  beforeEach(() => {
    mockTakePicture.mockReset().mockResolvedValue({ uri: 'file:///plate.jpg', base64: 'aGk=', width: 1200, height: 900 });
    mockAnalyze.mockReset().mockResolvedValue(analysis('1 iced matcha latte (~470ml)', 190));
    mockCorrect.mockReset().mockResolvedValue(analysis('1 iced strawberry matcha with almond milk (~470ml)', 160));
  });

  it('takes the photo with the shutter and reads it straight away', async () => {
    const tree = mount();
    await act(async () => {
      await shutter(tree).props.onPress();
    });
    // The bytes are asked for with the photo, so nothing reads the file back.
    expect(mockTakePicture).toHaveBeenCalledWith(expect.objectContaining({ base64: true }));
    expect(mockAnalyze).toHaveBeenCalledTimes(1);
    expect(mockAnalyze.mock.calls[0][0]).toMatchObject({ uri: 'file:///plate.jpg', base64: 'aGk=' });
    expect(shows(tree, 'iced matcha latte')).toBe(true);

    // Retake goes back to the viewfinder, with nothing left over from the last photo.
    act(() => byText(tree, 'Retake')!.props.onPress());
    expect(shows(tree, 'iced matcha latte')).toBe(false);
    expect(shutter(tree)).toBeTruthy();
    act(() => tree.unmount());
  });

  it('says so when the camera could not take the photo', async () => {
    mockTakePicture.mockRejectedValueOnce(new Error('camera busy'));
    const tree = mount();
    await act(async () => {
      await shutter(tree).props.onPress();
    });
    expect(mockAnalyze).not.toHaveBeenCalled();
    expect(shows(tree, 'That photo could not be taken')).toBe(true);
    act(() => tree.unmount());
  });

  it('scrolls the fix box into view once the keyboard is up, and stops when the fix is put away', async () => {
    const { Keyboard, ScrollView } = require('react-native');
    const listeners: Record<string, () => void> = {};
    const listen = jest.spyOn(Keyboard, 'addListener').mockImplementation((name: unknown, fn: unknown) => {
      listeners[name as string] = fn as () => void;
      return { remove: () => delete listeners[name as string] } as never;
    });
    const toEnd = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockImplementation(() => {});
    const tree = mount();
    await act(async () => {
      await shutter(tree).props.onPress();
    });
    expect(listeners.keyboardDidShow).toBeUndefined();

    act(() => byText(tree, 'Not quite right? Fix it')!.props.onPress());
    toEnd.mockClear();
    act(() => listeners.keyboardDidShow!());
    expect(toEnd).toHaveBeenCalled();

    act(() => byText(tree, 'Never mind')!.props.onPress());
    expect(listeners.keyboardDidShow).toBeUndefined();
    act(() => tree.unmount());
    listen.mockRestore();
    toEnd.mockRestore();
  });

  it('re-analyzes from what the person says it was, without the photo', async () => {
    const tree = mount();
    // Choosing the photo is enough: it is read straight away, no Analyze button.
    await act(async () => {
      await shutter(tree).props.onPress();
    });
    expect(byText(tree, 'Analyze meal')).toBeFalsy();
    expect(shows(tree, 'iced matcha latte')).toBe(true);

    act(() => byText(tree, 'Not quite right? Fix it')!.props.onPress());
    const input = tree.root.findByType(TextInput);
    expect(input.props.value).toBe('1 iced matcha latte (~470ml)');
    act(() => input.props.onChangeText('strawberry matcha with almond milk'));
    await act(async () => {
      await byText(tree, 'Re-analyze')!.props.onPress();
    });

    expect(mockCorrect).toHaveBeenCalledTimes(1);
    const [previous, text] = mockCorrect.mock.calls[0];
    expect(previous.foodDescription).toBe('1 iced matcha latte (~470ml)');
    expect(text).toBe('strawberry matcha with almond milk');
    expect(shows(tree, 'strawberry matcha with almond milk')).toBe(true);
    expect(byText(tree, 'Log meal')).toBeTruthy();
    act(() => tree.unmount());
  });
});
