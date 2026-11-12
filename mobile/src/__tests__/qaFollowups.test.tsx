import renderer, { act } from 'react-test-renderer';
import { Alert, Text, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROFILE_SURVEY_DEFAULTS, createPet, type BodyProfile, type FoodSearchResult } from '@vitto/core';
import { NumberInput } from '../components/ui';
import { WorkoutScreen } from '../screens/WorkoutScreen';
import { MealCaptureScreen } from '../screens/MealCaptureScreen';
import { TodayScreen } from '../screens/TodayScreen';

const mockSearch = jest.fn();
jest.mock('@vitto/core', () => ({ ...jest.requireActual('@vitto/core'), searchFoodsByName: (...args: unknown[]) => mockSearch(...args) }));
jest.mock('../services/restTimer', () => ({ startRest: () => Promise.resolve(), stopRest: () => Promise.resolve() }));
jest.mock('../services/mealAnalysis', () => ({ analyzeMealImage: jest.fn(), correctMealAnalysis: jest.fn(), shrinkForUpload: jest.fn() }));
jest.mock('expo-camera', () => ({ __esModule: true, CameraView: () => null, useCameraPermissions: () => [{ granted: false }, jest.fn()] }));

const press = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((node: any) => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === label)[0]!;
const pressText = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((node: any) => typeof node.props.onPress === 'function' && node.findAllByType(Text).some((t: any) => t.props.children === label))[0]!;
const field = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((node: any) => node.type === TextInput && node.props.accessibilityLabel === label)[0]!;
/** Every string drawn, nested Text included. */
const texts = (tree: renderer.ReactTestRenderer) => {
  const out: string[] = [];
  const walk = (child: unknown): void => {
    if (typeof child === 'string' || typeof child === 'number') out.push(String(child));
    else if (Array.isArray(child)) child.forEach(walk);
  };
  tree.root.findAllByType(Text).forEach((t) => walk(t.props.children));
  return out.join(' | ');
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('number fields', () => {
  it('keep a trailing decimal point while it is typed, so 22.5 can be entered', () => {
    const values: (number | undefined)[] = [];
    function Harness() {
      const [value, setValue] = require('react').useState(22) as [number | undefined, (next: number | undefined) => void];
      return <NumberInput decimal value={value} onValue={(next) => { values.push(next); setValue(next); }} accessibilityLabel="w" />;
    }
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<Harness />); });
    act(() => field(tree, 'w').props.onChangeText('22.'));
    expect(field(tree, 'w').props.value).toBe('22.');
    act(() => field(tree, 'w').props.onChangeText('22.5'));
    expect(values.at(-1)).toBe(22.5);
    // Cleared, it stays clear rather than snapping back.
    act(() => field(tree, 'w').props.onChangeText(''));
    expect(field(tree, 'w').props.value).toBe('');
    expect(field(tree, 'w').props.keyboardType).toBe('decimal-pad');
    act(() => tree.unmount());
  });
});

describe('workout limits at Finish', () => {
  const open = async (onFinish = jest.fn(async () => {})) => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<WorkoutScreen onFinish={onFinish} onClose={() => {}} weightUnit="lb" />); });
    act(() => press(tree, 'Pick exercises').props.onPress());
    act(() => press(tree, 'Add Bench Press').props.onPress());
    act(() => press(tree, 'Close the exercise list').props.onPress());
    return tree;
  };

  it('refuses a weight no one can lift, and saves nothing', async () => {
    const onFinish = jest.fn(async () => {});
    const tree = await open(onFinish);
    act(() => field(tree, 'Set 1 weight').props.onChangeText('99999'));
    await act(async () => pressText(tree, 'Finish workout').props.onPress());
    expect(onFinish).not.toHaveBeenCalled();
    expect(texts(tree)).toContain('past any world record');
    act(() => tree.unmount());
  });

  it('asks about a remarkable lift, and logs it on "Log it"', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onFinish = jest.fn(async () => {});
    const tree = await open(onFinish);
    act(() => field(tree, 'Set 1 weight').props.onChangeText('800'));
    act(() => field(tree, 'Set 1 reps').props.onChangeText('1'));
    await act(async () => pressText(tree, 'Finish workout').props.onPress());
    expect(onFinish).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
    await act(async () => alert.mock.calls[0]![2]!.find((button) => button.text === 'Log it')!.onPress!());
    expect(onFinish).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });
});

describe('plate stepper', () => {
  it('steps a food by its unit, stops at one step, takes it off only with its own button, and says how much', async () => {
    const banana: FoodSearchResult = {
      id: 'b', name: 'Bananas, raw', servingDescription: 'per 100 g', isPer100g: true,
      macros: { calories: 89, proteinGrams: 1.1, carbsGrams: 22.8, fatGrams: 0.3, fiberGrams: 2.6 },
    };
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <MealCaptureScreen canScanPhotos={false} onComplete={async () => {}} onFeedStart={() => {}} onAnalyzingChange={() => {}} onClose={() => {}} />,
      );
    });
    mockSearch.mockResolvedValueOnce([banana]);
    act(() => tree.root.findByType(TextInput).props.onChangeText('banana'));
    await act(async () => { await pressText(tree, 'Find').props.onPress(); });
    act(() => tree.root.findAll((node: any) => node.props.accessibilityRole === 'checkbox' && node.props.accessibilityLabel === 'Bananas, raw')[0]!.props.onPress());

    // A per-100 g food is counted in grams, 10 g a step, and shown as grams.
    const amount = () => tree.root.find((node: any) => node.props.accessibilityLabel === 'Amount of Bananas, raw in g' && node.props.value !== undefined).props.value;
    expect(amount()).toBe(100);
    act(() => press(tree, 'Less Bananas, raw').props.onPress());
    expect(amount()).toBe(90);
    expect(texts(tree)).toContain('80');
    for (let i = 0; i < 8; i += 1) act(() => press(tree, 'Less Bananas, raw').props.onPress());
    expect(amount()).toBe(10);
    expect(press(tree, 'Less Bananas, raw').props.disabled).toBe(true);
    expect(tree.root.findAll((node: any) => node.props.testID === 'plate').length).toBeGreaterThan(0);
    act(() => press(tree, 'Remove Bananas, raw').props.onPress());
    expect(tree.root.findAll((node: any) => node.props.testID === 'plate')).toHaveLength(0);
    act(() => tree.unmount());
  });
});

describe('Today step goal', () => {
  const profile: BodyProfile = {
    age: 30, sex: 'other', heightCm: 175, heightUnit: 'cm', weightKg: 74, weightUnit: 'kg',
    activity: 'moderate', goal: 'maintain', ...PROFILE_SURVEY_DEFAULTS,
  };

  it('is kept when typing ends, within 1,000 to 100,000, not on every keystroke', () => {
    const goals: number[] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <TodayScreen pet={createPet('u', 'Miso')} events={[]} profile={profile} stepGoal={10000} onStepGoalChange={(goal) => goals.push(goal)} onTrainMind={() => {}} onOpenProfile={() => {}} onClose={() => {}} />,
      );
    });
    act(() => field(tree, 'Daily step goal').props.onChangeText(''));
    expect(field(tree, 'Daily step goal').props.value).toBe('');
    act(() => field(tree, 'Daily step goal').props.onChangeText('100000'));
    expect(goals).toEqual([]);
    act(() => field(tree, 'Daily step goal').props.onBlur());
    expect(goals).toEqual([100000]);
    act(() => field(tree, 'Daily step goal').props.onChangeText('1'));
    act(() => field(tree, 'Daily step goal').props.onBlur());
    expect(goals).toEqual([100000, 1000]);
    act(() => tree.unmount());
  });
});

describe('food search as you type', () => {
  it('searches what is typed after a short pause, with no list of names to pick first', async () => {
    jest.useFakeTimers();
    mockSearch.mockReset();
    mockSearch.mockResolvedValue([]);
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <MealCaptureScreen canScanPhotos={false} onComplete={async () => {}} onFeedStart={() => {}} onAnalyzingChange={() => {}} onClose={() => {}} />,
      );
    });
    act(() => tree.root.findByType(TextInput).props.onChangeText('Sour'));
    expect(tree.root.findAll((node: any) => String(node.props.accessibilityLabel).startsWith('Search '))).toHaveLength(0);
    expect(mockSearch).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(400); });
    expect(mockSearch).toHaveBeenCalledWith('Sour');
    act(() => tree.unmount());
    jest.useRealTimers();
  });
});
