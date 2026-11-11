import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { MealAnalysis, MealMetadata, RepeatableMeal } from '@vitto/core';
import { MealCaptureScreen } from '../screens/MealCaptureScreen';

jest.mock('../services/mealAnalysis', () => ({ analyzeMealImage: jest.fn(), correctMealAnalysis: jest.fn(), shrinkForUpload: jest.fn() }));
jest.mock('expo-camera', () => ({ __esModule: true, CameraView: () => null, useCameraPermissions: () => [{ granted: false }, jest.fn()] }));

const oats: MealAnalysis = {
  foodDescription: 'Overnight oats',
  grade: 'A',
  summary: 'Oats',
  confidence: 0.9,
  detectedFoods: ['oats'],
  macros: { calories: 400, proteinGrams: 20, carbsGrams: 60, fatGrams: 8 },
  nutrients: { protein: true, vegetables: false, fruit: true, wholeGrains: true, fiber: true, treats: false },
};
const meals: RepeatableMeal[] = [{ key: 'overnight oats', name: 'Overnight oats', analysis: oats, lastAt: '2026-11-05T08:00:00.000Z', sameTimeYesterday: true, slot: 'breakfast' }];
const find = (tree: renderer.ReactTestRenderer, match: (node: any) => boolean) =>
  tree.root.findAll((node) => typeof node.props.onPress === 'function' && match(node))[0]!;

describe('logging a recent meal again', () => {
  it('takes a tap on the meal and a tap on Add, at the size picked', async () => {
    const saved: MealMetadata[] = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <MealCaptureScreen canScanPhotos={false} repeatable={meals} onComplete={async (meal) => { saved.push(meal); }} onFeedStart={() => {}} onAnalyzingChange={() => {}} onClose={() => {}} />,
      );
    });
    expect(JSON.stringify(tree.root.findAllByType(Text).map((t) => t.props.children))).toContain('Yesterday around now');
    act(() => find(tree, (node) => node.props.accessibilityLabel === 'Log Overnight oats again').props.onPress());
    act(() => find(tree, (node) => node.props.accessibilityLabel === 'More Overnight oats').props.onPress());
    await act(async () => {
      await find(tree, (node) => node.findAllByType(Text).some((t: any) => t.props.children === 'Add to care log')).props.onPress();
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]!.analysis?.macros.calories).toBe(600);
    expect(saved[0]!.analysis?.grade).toBe('A');
    expect(saved[0]!.fruit).toBe(true);
    act(() => tree.unmount());
  });

  it('shows nothing extra when there is no history', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<MealCaptureScreen canScanPhotos={false} onComplete={async () => {}} onFeedStart={() => {}} onAnalyzingChange={() => {}} onClose={() => {}} />);
    });
    expect(tree.root.findAll((node) => node.props.testID === 'recent-meals')).toHaveLength(0);
    act(() => tree.unmount());
  });
});
