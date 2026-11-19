import { resetFoodSuggestions } from '../services/foodSuggestions';
import renderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import type { FoodSearchResult, MealMetadata } from '@vitto/core';
import { MealCaptureScreen } from '../screens/MealCaptureScreen';

const mockSearch = jest.fn();
jest.mock('@vitto/core', () => ({ ...jest.requireActual('@vitto/core'), searchFoodsByName: (...args: unknown[]) => mockSearch(...args) }));
jest.mock('../services/mealAnalysis', () => ({ analyzeMealImage: jest.fn(), correctMealAnalysis: jest.fn(), shrinkForUpload: jest.fn() }));
jest.mock('expo-camera', () => ({ __esModule: true, CameraView: () => null, useCameraPermissions: () => [{ granted: false }, jest.fn()] }));

const food = (id: string, name: string, calories: number, proteinGrams: number): FoodSearchResult => ({
  id, name, servingDescription: '1 serving', macros: { calories, proteinGrams, carbsGrams: 0, fatGrams: 0, fiberGrams: 0 },
});
const press = (tree: renderer.ReactTestRenderer, match: (node: any) => boolean) =>
  tree.root.findAll((node) => typeof node.props.onPress === 'function' && match(node))[0]!;
const withText = (label: string) => (node: any) => node.findAllByType(Text).some((t: any) => t.props.children === label);

describe('food search builds one plate', () => {
  // The session's answers and remembered foods are shared across visits; each test starts clean.
  beforeEach(() => resetFoodSuggestions());

  it('ticks several foods across searches, sets servings, and logs them as one meal from the pinned button', async () => {
    const saved: MealMetadata[] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <MealCaptureScreen canScanPhotos={false} onComplete={async (meal) => { saved.push(meal); }} onFeedStart={() => {}} onAnalyzingChange={() => {}} onClose={() => {}} />,
      );
    });
    const search = async (query: string, found: FoodSearchResult[]) => {
      mockSearch.mockResolvedValueOnce(found);
      act(() => tree.root.find((node: any) => node.type === TextInput && node.props.accessibilityLabel === 'Search foods').props.onChangeText(query));
      await act(async () => { await press(tree, withText('Find')).props.onPress(); });
    };
    const tick = (name: string) => act(() => press(tree, (node) => node.props.accessibilityRole === 'checkbox' && node.props.accessibilityLabel === name).props.onPress());

    // Nothing to log yet, so no button pinned at the bottom.
    expect(tree.root.findAll((node) => node.props.testID === 'meal-footer')).toHaveLength(0);

    await search('chicken', [food('c', 'Chicken Breast', 120, 26), food('t', 'Chicken Thigh', 135, 18)]);
    tick('Chicken Breast');
    // On the plate, and the field cleared for the next food.
    expect(tree.root.findAll((node) => node.props.testID === 'plate-item' && typeof node.type === 'string')).toHaveLength(1);
    expect(tree.root.find((node: any) => node.type === TextInput && node.props.accessibilityLabel === 'Search foods').props.value).toBe('');

    // A second search keeps what is already on the plate.
    await search('rice', [food('r', 'White Rice', 200, 4)]);
    tick('White Rice');
    act(() => press(tree, (node) => node.props.accessibilityLabel === 'More Chicken Breast').props.onPress());

    const footer = tree.root.find((node) => node.props.testID === 'meal-footer');
    expect(JSON.stringify(footer.findAllByType(Text).map((t: any) => t.props.children))).toContain('380 kcal');
    await act(async () => { await press(tree, withText('Add 2 foods')).props.onPress(); });

    expect(saved).toHaveLength(1);
    expect(saved[0]!.analysis?.detectedFoods).toEqual(['Chicken Breast', 'White Rice']);
    expect(saved[0]!.analysis?.macros.calories).toBe(380);
    expect(saved[0]!.loggedVia).toBe('manual');
    act(() => tree.unmount());
  });

  it('puts a weighable food on in grams, and keeps the plate in Meals when ticked', async () => {
    const saved: MealMetadata[] = [];
    const kept: { name: string; calories: number }[] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <MealCaptureScreen
          canScanPhotos={false}
          onComplete={async (meal) => { saved.push(meal); }}
          onFeedStart={() => {}}
          onAnalyzingChange={() => {}}
          onClose={() => {}}
          onSaveMeal={async (name, analysis) => { kept.push({ name, calories: analysis.macros.calories }); return null; }}
        />,
      );
    });
    const rice: FoodSearchResult = { ...food('r', 'White Rice, cooked', 130, 3), servingDescription: 'per 100 g', isPer100g: true };
    mockSearch.mockResolvedValueOnce([rice]);
    act(() => tree.root.find((node: any) => node.type === TextInput && node.props.accessibilityLabel === 'Search foods').props.onChangeText('rice'));
    await act(async () => { await press(tree, withText('Find')).props.onPress(); });
    act(() => press(tree, (node) => node.props.accessibilityRole === 'checkbox' && node.props.accessibilityLabel === 'White Rice, cooked').props.onPress());
    // Grams, not servings: the amount field reads 100.
    expect(JSON.stringify(tree.root.findAll((node) => node.props.testID === 'plate-item')[0]!.findAllByType(Text).map((t: any) => t.props.children))).toContain('"g"');

    act(() => press(tree, (node) => node.props.accessibilityLabel === 'Keep this plate in Meals').props.onPress());
    await act(async () => { await press(tree, withText('Log meal')).props.onPress(); });
    expect(kept).toEqual([{ name: 'White Rice', calories: 130 }]);
    expect(saved).toHaveLength(1);
    act(() => tree.unmount());
  });
});
