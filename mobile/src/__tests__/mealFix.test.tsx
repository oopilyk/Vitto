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
jest.mock('expo-camera', () => ({
  __esModule: true,
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}));

const mockLaunchCamera = jest.fn();
const stub = (name: string, value: unknown) =>
  Object.defineProperty(ImagePicker, name, { value, writable: true, configurable: true });
stub('launchCameraAsync', mockLaunchCamera);
stub('launchImageLibraryAsync', jest.fn());
stub('requestCameraPermissionsAsync', jest.fn(async () => ({ granted: true })));
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

const mount = () => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <MealCaptureScreen onComplete={async () => {}} onFeedStart={() => {}} onAnalyzingChange={() => {}} onClose={() => {}} />,
    );
  });
  return tree;
};

describe('meal photo', () => {
  beforeEach(() => {
    mockLaunchCamera.mockReset().mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///plate.jpg', base64: 'aGk=', mimeType: 'image/jpeg' }] });
    mockAnalyze.mockReset().mockResolvedValue(analysis('1 iced matcha latte (~470ml)', 190));
    mockCorrect.mockReset().mockResolvedValue(analysis('1 iced strawberry matcha with almond milk (~470ml)', 160));
  });

  it('opens the camera when the big photo box is tapped', async () => {
    const tree = mount();
    const box = tree.root.find((node) => node.props.testID === 'photo-box' && typeof node.props.onPress === 'function');
    await act(async () => {
      await box.props.onPress();
    });
    expect(mockLaunchCamera).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('re-analyzes from what the person says it was, without the photo', async () => {
    const tree = mount();
    await act(async () => {
      await byText(tree, 'Take photo')!.props.onPress();
    });
    await act(async () => {
      await byText(tree, 'Analyze meal')!.props.onPress();
    });
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
    expect(byText(tree, 'Add to care log')).toBeTruthy();
    act(() => tree.unmount());
  });
});
