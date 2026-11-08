import renderer, { act } from 'react-test-renderer';
import { Alert, Linking, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MealAnalysis, RepeatableMeal } from '@vitto/core';
import { WorkoutScreen } from '../screens/WorkoutScreen';
import { MealCaptureScreen } from '../screens/MealCaptureScreen';

jest.mock('../services/restTimer', () => ({ startRest: () => Promise.resolve(), stopRest: () => Promise.resolve() }));
jest.mock('../services/mealAnalysis', () => ({ analyzeMealImage: jest.fn(), correctMealAnalysis: jest.fn(), shrinkForUpload: jest.fn() }));
const mockPermission = { current: { granted: false, canAskAgain: true } };
const mockRequest = jest.fn();
jest.mock('expo-camera', () => ({ __esModule: true, CameraView: () => null, useCameraPermissions: () => [mockPermission.current, mockRequest] }));

const press = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((node: any) => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === label)[0]!;
const texts = (tree: renderer.ReactTestRenderer) => JSON.stringify(tree.root.findAllByType(Text).map((t) => t.props.children));
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('workout draft', () => {
  const open = async (onClose = jest.fn()) => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<WorkoutScreen onFinish={async () => {}} onClose={onClose} />);
    });
    return tree;
  };

  it('survives the screen going away, and picks up where it was', async () => {
    const first = await open();
    act(() => press(first, 'Add exercise').props.onPress());
    act(() => press(first, 'Add Bench Press').props.onPress());
    act(() => press(first, 'Set 1 of Bench Press done').props.onPress());
    await flush();
    act(() => first.unmount());

    const again = await open();
    expect(texts(again)).toContain('Bench Press');
    expect(texts(again)).toContain('Picked up where you left off.');
    expect(press(again, 'Set 1 of Bench Press done').props.accessibilityState).toEqual({ checked: true });
    act(() => again.unmount());
  });

  it('asks before closing a session, and Discard throws the draft away', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onClose = jest.fn();
    const tree = await open(onClose);
    act(() => press(tree, 'Close').props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1); // nothing entered: just closes
    expect(alert).not.toHaveBeenCalled();

    act(() => press(tree, 'Add exercise').props.onPress());
    act(() => press(tree, 'Add Bench Press').props.onPress());
    await flush();
    act(() => press(tree, 'Close the exercise list').props.onPress());
    act(() => press(tree, 'Close').props.onPress());
    expect(alert).toHaveBeenCalledTimes(1);
    const buttons = alert.mock.calls[0]![2]!;
    await act(async () => buttons.find((button) => button.text === 'Discard workout')!.onPress!());
    expect(onClose).toHaveBeenCalledTimes(2);
    await flush();
    expect(await AsyncStorage.getItem('vitto.workoutDraft')).toBeNull();
    act(() => tree.unmount());
  });
});

describe('meal sheet', () => {
  const analysis: MealAnalysis = {
    foodDescription: 'Oats', grade: 'A', summary: 'Oats', confidence: 1, detectedFoods: ['oats'],
    macros: { calories: 300, proteinGrams: 10, carbsGrams: 50, fatGrams: 5 },
    nutrients: { protein: false, vegetables: false, fruit: false, wholeGrains: true, fiber: true, treats: false },
  };
  const recent: RepeatableMeal[] = [{ key: 'oats', name: 'Oats', analysis, lastAt: '2026-11-06T08:00:00Z', sameTimeYesterday: false }];
  const render = (onClose = jest.fn()) => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <MealCaptureScreen canScanPhotos={false} repeatable={recent} onComplete={async () => {}} onFeedStart={() => {}} onAnalyzingChange={() => {}} onClose={onClose} />,
      );
    });
    return tree;
  };

  it('asks before throwing away a meal that is ready to log', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onClose = jest.fn();
    const tree = render(onClose);
    act(() => press(tree, 'Log Oats again').props.onPress());
    act(() => press(tree, 'Close').props.onPress());
    expect(onClose).not.toHaveBeenCalled();
    expect(alert.mock.calls[0]![0]).toBe('Discard this meal?');
    act(() => alert.mock.calls[0]![2]!.find((button) => button.text === 'Discard')!.onPress!());
    expect(onClose).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("asks for the camera, and sends someone who said no to Settings", () => {
    mockPermission.current = { granted: false, canAskAgain: true };
    let tree = render();
    act(() => tree.root.findAll((node: any) => typeof node.props.onPress === 'function' && node.findAllByType(Text).some((t: any) => t.props.children === 'Scan barcode'))[0]!.props.onPress());
    act(() => tree.root.findAll((node: any) => typeof node.props.onPress === 'function' && node.findAllByType(Text).some((t: any) => t.props.children === 'Allow camera'))[0]!.props.onPress());
    expect(mockRequest).toHaveBeenCalled();
    act(() => tree.unmount());

    mockPermission.current = { granted: false, canAskAgain: false };
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    tree = render();
    act(() => tree.root.findAll((node: any) => typeof node.props.onPress === 'function' && node.findAllByType(Text).some((t: any) => t.props.children === 'Scan barcode'))[0]!.props.onPress());
    expect(texts(tree)).toContain('Turn it on in Settings');
    act(() => tree.root.findAll((node: any) => typeof node.props.onPress === 'function' && node.findAllByType(Text).some((t: any) => t.props.children === 'Open Settings'))[0]!.props.onPress());
    expect(openSettings).toHaveBeenCalled();
    act(() => tree.unmount());
  });
});
