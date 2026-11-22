import renderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import type { DescribedMeal, FoodSearchResult, MealMetadata } from '@vitto/core';
import { MealCaptureScreen } from '../screens/MealCaptureScreen';
import { PetMicButton } from '../petWorld/PetMicButton';
import { resetFoodSuggestions } from '../services/foodSuggestions';

const mockDescribe = jest.fn();
jest.mock('@vitto/core', () => ({ ...jest.requireActual('@vitto/core'), describeMeal: (...args: unknown[]) => mockDescribe(...args) }));
jest.mock('../services/mealAnalysis', () => ({ analyzeMealImage: jest.fn(), correctMealAnalysis: jest.fn(), shrinkForUpload: jest.fn() }));
jest.mock('expo-camera', () => ({ __esModule: true, CameraView: () => null, useCameraPermissions: () => [{ granted: false }, jest.fn()] }));

const speech = jest.requireMock('expo-speech-recognition') as {
  ExpoSpeechRecognitionModule: Record<'start' | 'stop' | 'abort' | 'requestPermissionsAsync' | 'getPermissionsAsync', jest.Mock>;
  __emit: (name: string, event?: unknown) => void;
};

const food = (id: string, name: string, calories: number, extra: Partial<FoodSearchResult> = {}): FoodSearchResult => ({
  id,
  name,
  servingDescription: '1 large (50 g)',
  macros: { calories, proteinGrams: 6, carbsGrams: 1, fatGrams: 5, fiberGrams: 0 },
  ...extra,
});
const meal = (items: DescribedMeal['items'], missed: string[] = []): DescribedMeal => ({ items, via: 'ai', missed });

const mount = (props: Partial<React.ComponentProps<typeof MealCaptureScreen>> = {}) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <MealCaptureScreen initialMode="describe" onComplete={async () => {}} onFeedStart={() => {}} onAnalyzingChange={() => {}} onClose={() => {}} {...props} />,
    );
  });
  return tree;
};
const box = (tree: renderer.ReactTestRenderer) =>
  tree.root.find((node: any) => node.type === TextInput && node.props.accessibilityLabel === 'Describe your meal');
const byText = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAll((node) => typeof node.props.onPress === 'function')
    .find((node) => node.findAllByType(Text).some((text: any) => text.props.children === label));
const mic = (tree: renderer.ReactTestRenderer) =>
  tree.root.find((node) => node.props.testID === 'describe-mic' && typeof node.props.onPress === 'function');
const plateItems = (tree: renderer.ReactTestRenderer) => tree.root.findAll((node) => node.props.testID === 'plate-item' && typeof node.type === 'string');
const shows = (tree: renderer.ReactTestRenderer, text: string) => JSON.stringify(tree.toJSON()).includes(text);

describe('describing a meal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetFoodSuggestions();
    speech.ExpoSpeechRecognitionModule.getPermissionsAsync.mockResolvedValue({ granted: true });
  });

  it('puts what was described on the plate to be checked, and logs it from there', async () => {
    mockDescribe.mockResolvedValueOnce(
      meal([
        { food: food('e', 'Egg', 74), servings: 2, unit: 'serving', said: '2 eggs' },
        { food: food('s', 'Stew', 420, { servingDescription: 'about 300 g', source: 'estimate' }), servings: 1, unit: 'serving', said: "mum's stew" },
      ]),
    );
    const saved: MealMetadata[] = [];
    const tree = mount({ onComplete: async (logged) => { saved.push(logged); } });
    // Nothing typed: nothing to find, and nothing to log.
    expect(byText(tree, 'Find foods')!.props.disabled ?? byText(tree, 'Find foods')!.props.accessibilityState?.disabled).toBeTruthy();
    expect(tree.root.findAll((node) => node.props.testID === 'meal-footer')).toHaveLength(0);

    act(() => box(tree).props.onChangeText("2 eggs and mum's stew"));
    await act(async () => {
      await byText(tree, 'Find foods')!.props.onPress();
    });
    expect(mockDescribe).toHaveBeenCalledWith("2 eggs and mum's stew", expect.objectContaining({ search: expect.any(Function) }));
    expect(plateItems(tree)).toHaveLength(2);
    // The box is cleared for anything else; a guess is marked as one.
    expect(box(tree).props.value).toBe('');
    expect(shows(tree, 'Estimate: not in the food database')).toBe(true);
    expect(shows(tree, '568 kcal')).toBe(true);

    // Checked and changed like any plate: the stew comes off.
    act(() => tree.root.findAll((node) => node.props.accessibilityLabel === 'Remove Stew' && typeof node.props.onPress === 'function')[0]!.props.onPress());
    await act(async () => {
      await byText(tree, 'Log meal')!.props.onPress();
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]!.analysis?.detectedFoods).toEqual(['Egg']);
    expect(saved[0]!.analysis?.macros.calories).toBe(148);
    expect(saved[0]!.loggedVia).toBe('manual');
    act(() => tree.unmount());
  });

  it('finds the foods on Return, and keeps the plate\'s button off the keys while typing', async () => {
    mockDescribe.mockResolvedValue(meal([{ food: food('e', 'Egg', 74), servings: 2, unit: 'serving', said: '2 eggs' }]));
    const tree = mount();
    const footer = () => tree.root.findAll((node) => node.props.testID === 'meal-footer');
    act(() => box(tree).props.onChangeText('2 eggs'));
    expect(box(tree).props.returnKeyType).toBe('search');
    await act(async () => {
      await box(tree).props.onSubmitEditing();
    });
    expect(mockDescribe).toHaveBeenCalledWith('2 eggs', expect.anything());
    expect(plateItems(tree)).toHaveLength(1);
    expect(footer().length).toBeGreaterThan(0);

    // Typing more: Add stands aside, so it cannot cover Find foods above the keyboard.
    act(() => box(tree).props.onFocus());
    expect(footer()).toHaveLength(0);
    act(() => box(tree).props.onBlur());
    expect(footer().length).toBeGreaterThan(0);
    act(() => tree.unmount());
  });

  it('adds a second sentence to the same plate, and the same food to its amount', async () => {
    const tree = mount();
    mockDescribe.mockResolvedValueOnce(meal([{ food: food('e', 'Egg', 74), servings: 2, unit: 'serving', said: '2 eggs' }]));
    act(() => box(tree).props.onChangeText('2 eggs'));
    await act(async () => {
      await byText(tree, 'Find foods')!.props.onPress();
    });
    mockDescribe.mockResolvedValueOnce(
      meal([
        { food: food('e', 'Egg', 74), servings: 1, unit: 'serving', said: 'another egg' },
        { food: food('l', 'Latte', 190), servings: 1, unit: 'serving', said: 'a latte' },
      ], ['the mystery sauce']),
    );
    act(() => box(tree).props.onChangeText('another egg, a latte and the mystery sauce'));
    await act(async () => {
      await byText(tree, 'Find foods')!.props.onPress();
    });
    expect(plateItems(tree)).toHaveLength(2);
    // 3 eggs and a latte.
    expect(shows(tree, '412 kcal')).toBe(true);
    expect(shows(tree, 'Could not work out the mystery sauce')).toBe(true);
    expect(byText(tree, 'Add 2 foods')).toBeTruthy();
    act(() => tree.unmount());
  });

  it('shows why it could not read a meal, and keeps what was typed', async () => {
    mockDescribe.mockRejectedValueOnce(new Error("That's today's 5 described meals."));
    const tree = mount();
    act(() => box(tree).props.onChangeText('a big bowl of curry'));
    await act(async () => {
      await byText(tree, 'Find foods')!.props.onPress();
    });
    expect(shows(tree, "That's today's 5 described meals.")).toBe(true);
    expect(box(tree).props.value).toBe('a big bowl of curry');
    expect(plateItems(tree)).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('writes what is said after what was typed, and stops on a second tap', async () => {
    const tree = mount();
    act(() => box(tree).props.onChangeText('2 eggs'));
    await act(async () => {
      await mic(tree).props.onPress();
    });
    expect(speech.ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(expect.objectContaining({ continuous: true, interimResults: true }));
    expect(shows(tree, 'One sec...')).toBe(true);
    act(() => speech.__emit('audiostart', {}));
    expect(shows(tree, 'Listening...')).toBe(true);

    // Each result is the whole of what has been heard so far, not the new words.
    act(() => speech.__emit('result', { results: [{ transcript: 'and a' }] }));
    act(() => speech.__emit('result', { results: [{ transcript: 'and a large latte' }] }));
    expect(box(tree).props.value).toBe('2 eggs and a large latte');

    act(() => mic(tree).props.onPress());
    expect(speech.ExpoSpeechRecognitionModule.stop).toHaveBeenCalled();
    act(() => speech.__emit('end', {}));
    expect(shows(tree, 'Listening...')).toBe(false);
    // Nothing was sent anywhere: the sentence waits in the box to be checked.
    expect(mockDescribe).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('only asks for the microphone on the first tap', async () => {
    speech.ExpoSpeechRecognitionModule.getPermissionsAsync.mockResolvedValue({ granted: false });
    speech.ExpoSpeechRecognitionModule.requestPermissionsAsync.mockResolvedValueOnce({ granted: true });
    const tree = mount();
    await act(async () => {
      await mic(tree).props.onPress();
    });
    expect(speech.ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
    expect(shows(tree, 'Tap the mic again and talk.')).toBe(true);
    act(() => tree.unmount());
  });
});

describe("the pet's mic and the meal's mic", () => {
  it('does not send the pet a sentence it was not held for', () => {
    const said: string[] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<PetMicButton petName="Nugget" onSay={(text) => said.push(text)} size={44} />);
    });
    // Someone dictating a meal elsewhere in the app: the same recogniser, the same events.
    act(() => speech.__emit('start', {}));
    act(() => speech.__emit('audiostart', {}));
    act(() => speech.__emit('result', { results: [{ transcript: 'two eggs and a banana' }] }));
    act(() => speech.__emit('end', {}));
    expect(said).toEqual([]);
    expect(speech.ExpoSpeechRecognitionModule.stop).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});
