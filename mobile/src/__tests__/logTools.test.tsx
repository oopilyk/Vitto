import renderer, { act } from 'react-test-renderer';
import { ActionSheetIOS, Text, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROFILE_SURVEY_DEFAULTS, createPet, type BodyProfile, type HealthEvent, type MealMetadata } from '@vitto/core';
import { ActivityHistoryScreen } from '../screens/ActivityHistoryScreen';
import { EditMealScreen } from '../screens/EditMealScreen';
import { MealCaptureScreen } from '../screens/MealCaptureScreen';
import { WeeklyRecapScreen } from '../screens/WeeklyRecapScreen';
import { WeightScreen } from '../screens/WeightScreen';
import { WorkoutScreen } from '../screens/WorkoutScreen';
import { UndoToast } from '../components/UndoToast';

jest.mock('../services/restTimer', () => ({ startRest: () => Promise.resolve(), stopRest: () => Promise.resolve() }));
jest.mock('../services/mealAnalysis', () => ({ analyzeMealImage: jest.fn(), correctMealAnalysis: jest.fn(), shrinkForUpload: jest.fn() }));
jest.mock('expo-camera', () => ({ __esModule: true, CameraView: () => null, useCameraPermissions: () => [{ granted: false }, jest.fn()] }));

const press = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((node: any) => typeof node.props.onPress === 'function' && node.props.accessibilityLabel === label)[0]!;
const pressText = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((node: any) => typeof node.props.onPress === 'function' && node.findAllByType(Text).some((t: any) => t.props.children === label))[0]!;
const field = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((node: any) => node.type === TextInput && node.props.accessibilityLabel === label)[0]!;
const texts = (tree: renderer.ReactTestRenderer) => {
  const out: string[] = [];
  const walk = (child: unknown): void => {
    if (typeof child === 'string' || typeof child === 'number') out.push(String(child));
    else if (Array.isArray(child)) child.forEach(walk);
  };
  tree.root.findAllByType(Text).forEach((t) => walk(t.props.children));
  return out.join(' | ');
};
const mount = async (element: React.ReactElement) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(element);
  });
  return tree;
};

const nutrients = { protein: false, vegetables: false, fruit: false, wholeGrains: false, fiber: false, treats: false };
const meal = (id: string, occurredAt: string): HealthEvent<MealMetadata> => ({
  id, userId: 'u', type: 'MEAL', source: 'manual', occurredAt,
  metadata: {
    ...nutrients,
    analysis: { grade: 'B', foodDescription: 'Oats', summary: 'Oats', confidence: 1, detectedFoods: ['Oats'], macros: { calories: 300, proteinGrams: 10, carbsGrams: 50, fatGrams: 5 }, nutrients },
  },
});
const profile: BodyProfile = {
  age: 30, sex: 'male', heightCm: 180, heightUnit: 'cm', weightKg: 80, weightUnit: 'lb', activity: 'moderate', goal: 'maintain', ...PROFILE_SURVEY_DEFAULTS,
};
const bench = (id: string, occurredAt: string, weight: number): HealthEvent => ({
  id, userId: 'u', type: 'WORKOUT', source: 'manual', occurredAt,
  metadata: { workoutType: 'strength', durationMinutes: 40, exercises: [{ id, name: 'Bench Press', muscleGroup: 'chest', sets: [{ id: `${id}-s`, weight, reps: 5, unit: 'lb', completed: true }] }] } as never,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('changing a log', () => {
  it('offers Edit and Delete on a meal', async () => {
    const sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => undefined);
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const event = meal('a', new Date().toISOString());
    const tree = await mount(<ActivityHistoryScreen events={[event]} onClose={() => {}} onEdit={onEdit} onDelete={onDelete} />);
    act(() => tree.root.findAll((node: any) => node.props.accessibilityHint === 'Edit or delete' && typeof node.props.onPress === 'function')[0]!.props.onPress());
    const [options, choose] = sheet.mock.calls[0]!;
    expect(options.options).toEqual(['Edit', 'Delete', 'Cancel']);
    choose(1);
    expect(onDelete).toHaveBeenCalledWith(event);
    choose(0);
    expect(onEdit).toHaveBeenCalledWith(event);
    act(() => tree.unmount());
  });

  it('saves a fixed meal with its name, slot and numbers', async () => {
    const onSave = jest.fn(async () => {});
    const onClose = jest.fn();
    const tree = await mount(<EditMealScreen meal={meal('a', new Date(2026, 10, 9, 8).toISOString())} onSave={onSave} onClose={onClose} />);
    act(() => field(tree, 'Calories').props.onChangeText('450'));
    await act(async () => pressText(tree, 'Save changes').props.onPress());
    const saved = (onSave.mock.calls[0] as unknown[])[0] as MealMetadata;
    expect(saved.analysis?.macros.calories).toBe(450);
    expect(saved.slot).toBe('breakfast');
    expect(onClose).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('undoes from the toast, once', async () => {
    const undo = jest.fn();
    const onDone = jest.fn();
    const tree = await mount(<UndoToast offer={{ message: 'Meal deleted', undo, key: '1' }} onDone={onDone} />);
    expect(texts(tree)).toContain('Meal deleted');
    act(() => press(tree, 'Undo').props.onPress());
    expect(undo).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalled();
    act(() => tree.unmount());
  });
});

describe('weight', () => {
  it('logs in the person’s unit, as kilograms, and refuses what cannot be a weight', async () => {
    const onLog = jest.fn(async () => {});
    const tree = await mount(<WeightScreen events={[]} unit="lb" onLog={onLog} onEdit={async () => {}} onDelete={() => {}} onClose={() => {}} />);
    act(() => field(tree, 'Today’s weight in lb'.replace('’', "'")).props.onChangeText('5'));
    await act(async () => pressText(tree, 'Log weigh-in').props.onPress());
    expect(onLog).not.toHaveBeenCalled();
    act(() => field(tree, "Today's weight in lb").props.onChangeText('176.4'));
    await act(async () => pressText(tree, 'Log weigh-in').props.onPress());
    expect((onLog.mock.calls[0] as unknown[])[0]).toBeCloseTo(80, 0);
    act(() => tree.unmount());
  });
});

describe('the meal sheet', () => {
  const open = (props: object = {}) =>
    mount(<MealCaptureScreen canScanPhotos={false} onComplete={async () => {}} onFeedStart={() => {}} onAnalyzingChange={() => {}} onClose={() => {}} {...props} />);

  it('logs Quick add as numbers alone, in the chosen slot', async () => {
    const saved: MealMetadata[] = [];
    const tree = await open({ onComplete: async (next: MealMetadata) => { saved.push(next); } });
    act(() => press(tree, 'Snack').props.onPress());
    act(() => pressText(tree, 'Quick add calories').props.onPress());
    act(() => field(tree, 'Quick add kcal').props.onChangeText('650'));
    await act(async () => pressText(tree, 'Add to care log').props.onPress());
    expect(saved[0]?.analysis?.macros.calories).toBe(650);
    expect(saved[0]?.analysis?.grade).toBe('C');
    expect(saved[0]?.slot).toBe('snack');
    act(() => tree.unmount());
  });

  it("copies yesterday's slot in one tap", async () => {
    const onCopy = jest.fn(async () => {});
    const onClose = jest.fn();
    const yesterday = [meal('y', new Date(Date.now() - 86_400_000).toISOString())];
    const tree = await open({ copyableFor: () => yesterday, onCopy, onClose });
    await act(async () => tree.root.findAll((node: any) => node.props.testID === 'copy-slot' && typeof node.props.onPress === 'function')[0]!.props.onPress());
    expect((onCopy.mock.calls[0] as unknown[])[0]).toEqual(yesterday);
    expect(onClose).toHaveBeenCalled();
    act(() => tree.unmount());
  });
});

describe('records and history in a workout', () => {
  const history = [bench('w1', '2026-11-01T10:00:00Z', 185)];
  const open = async () => {
    const tree = await mount(<WorkoutScreen onFinish={async () => {}} onClose={() => {}} weightUnit="lb" history={history} />);
    act(() => press(tree, 'Pick exercises').props.onPress());
    act(() => press(tree, 'Add Bench Press').props.onPress());
    act(() => press(tree, 'Close the exercise list').props.onPress());
    return tree;
  };

  it('calls out a set that beats the log, the moment it is ticked', async () => {
    const tree = await open();
    act(() => field(tree, 'Set 1 weight').props.onChangeText('200'));
    act(() => press(tree, 'Set 1 of Bench Press done').props.onPress());
    expect(texts(tree)).toContain('New heaviest Bench Press: 200 lb');
    act(() => tree.unmount());
  });

  it('says nothing for a set that does not', async () => {
    const tree = await open();
    act(() => field(tree, 'Set 1 weight').props.onChangeText('95'));
    act(() => press(tree, 'Set 1 of Bench Press done').props.onPress());
    expect(tree.root.findAll((node: any) => node.props.testID === 'record-banner')).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('opens past sessions from the exercise name', async () => {
    const tree = await open();
    act(() => tree.root.findAll((node: any) => node.props.accessibilityHint === 'Shows past sessions' && typeof node.props.onPress === 'function')[0]!.props.onPress());
    expect(texts(tree)).toContain('185 lb × 5');
    act(() => tree.unmount());
  });
});

describe('the weekly recap', () => {
  it('sums the week on one page', async () => {
    const tree = await mount(
      <WeeklyRecapScreen pet={createPet('u', 'Miso')} events={[bench('w', new Date().toISOString(), 185)]} profile={profile} stepGoal={10000} onClose={() => {}} />,
    );
    expect(texts(tree)).toContain('workout');
    act(() => tree.unmount());
  });
});

describe('saving preferences', () => {
  const { PreferencesScreen } = require('../screens/PreferencesScreen');
  const edit = (tree: renderer.ReactTestRenderer) =>
    act(() => tree.root.findAll((node: any) => node.type === TextInput && node.props.placeholder === 'Your name')[0]!.props.onChangeText('Kyle'));

  it('says Saved once the save has gone through', async () => {
    // As App does: the saved profile becomes the page's starting point.
    function Harness() {
      const [saved, setSaved] = require('react').useState(profile) as [BodyProfile, (next: BodyProfile) => void];
      return <PreferencesScreen profile={saved} onSave={async (next: BodyProfile) => setSaved(next)} onClose={() => {}} />;
    }
    const tree = await mount(<Harness />);
    edit(tree);
    await act(async () => pressText(tree, 'Save changes').props.onPress());
    expect(texts(tree)).toContain('Preferences saved');
    act(() => tree.unmount());
  });

  it('keeps the bar and the reason when it fails, and does not say Saved', async () => {
    const onSave = async () => {
      throw new Error('No connection');
    };
    const tree = await mount(<PreferencesScreen profile={profile} onSave={onSave} onClose={() => {}} />);
    edit(tree);
    await act(async () => pressText(tree, 'Save changes').props.onPress());
    expect(texts(tree)).toContain('No connection');
    expect(texts(tree)).not.toContain('Preferences saved');
    act(() => tree.unmount());
  });
});
