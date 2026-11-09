import renderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import type { WorkoutSet, WorkoutTemplate } from '@vitto/core';
import { WorkoutScreen, previousLabel } from '../screens/WorkoutScreen';
import { formatRest } from '../components/RestTimer';

const mockStartRest = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockStopRest = jest.fn(() => Promise.resolve());
jest.mock('../services/restTimer', () => ({
  startRest: (...args: unknown[]) => mockStartRest(...args),
  stopRest: () => mockStopRest(),
}));

const find = (tree: renderer.ReactTestRenderer, match: (node: any) => boolean) =>
  tree.root.findAll((node) => typeof node.props.onPress === 'function' && match(node))[0]!;
const label = (value: string) => (node: any) => node.props.accessibilityLabel === value;

const routine: WorkoutTemplate = {
  id: 't',
  name: 'Push',
  updatedAt: '2026-11-01T00:00:00.000Z',
  exercises: [{ id: 'e', name: 'Bench Press', muscleGroup: 'chest', sets: [{ id: 's', reps: 8, weight: 60, unit: 'kg', completed: true }] }],
};

const render = (props: Partial<Parameters<typeof WorkoutScreen>[0]> = {}) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <WorkoutScreen onFinish={async () => {}} onClose={() => {}} onSaveTemplate={() => {}} templates={[routine]} {...props} />,
    );
  });
  return tree;
};

beforeEach(() => {
  mockStartRest.mockClear();
  mockStopRest.mockClear();
});

describe('Previous column', () => {
  it('reads weight × reps, reps alone for bodyweight, and a dash for nothing', () => {
    expect(previousLabel({ reps: 8, weight: 60 })).toBe('60 × 8');
    expect(previousLabel({ reps: 12 }, true)).toBe('12');
    expect(previousLabel(undefined)).toBe('—');
  });

  it('fills a set back in from last time with one tap', () => {
    const tree = render();
    act(() => find(tree, label('Load routine Push')).props.onPress());
    const weight = () => tree.root.findAll((node) => node.type === TextInput && node.props.accessibilityLabel === 'Set 1 weight')[0]!;
    act(() => weight().props.onChangeText('75'));
    expect(weight().props.value).toBe('75');
    act(() => find(tree, label('Use last time for set 1: 60 × 8')).props.onPress());
    expect(weight().props.value).toBe('60');
    act(() => tree.unmount());
  });

  it('starts a picked exercise on what was done last time', () => {
    const last: WorkoutSet[] = [{ id: 'x', reps: 5, weight: 100, unit: 'kg', completed: true }];
    const tree = render({ templates: [], lastSets: new Map([['Squat', last]]) });
    act(() => find(tree, label('Pick exercises')).props.onPress());
    act(() => find(tree, label('Add Squat')).props.onPress());
    act(() => find(tree, (node) => node.findAllByType(Text).some((t: any) => t.props.children === 'Done · 1 in this workout')).props.onPress());
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'Use last time for set 1: 100 × 5').length).toBeGreaterThan(0);
    act(() => tree.unmount());
  });
});

describe('ticking a set', () => {
  it('starts the rest, which −15/+15 move and Skip ends', () => {
    const tree = render();
    act(() => find(tree, label('Load routine Push')).props.onPress());
    expect(tree.root.findAll((node) => node.props.testID === 'rest-timer')).toHaveLength(0);

    act(() => find(tree, label('Set 1 of Bench Press done')).props.onPress());
    expect(tree.root.findAll((node) => node.props.testID === 'rest-timer').length).toBeGreaterThan(0);
    const [endsAt, startedAt, what] = mockStartRest.mock.calls[0] as [number, number, string];
    expect(endsAt - startedAt).toBe(90_000);
    expect(what).toBe('Bench Press');

    act(() => find(tree, label('15 seconds more rest')).props.onPress());
    expect((mockStartRest.mock.calls[1] as [number])[0]).toBe(endsAt + 15_000);

    act(() => find(tree, label('Skip rest')).props.onPress());
    expect(tree.root.findAll((node) => node.props.testID === 'rest-timer')).toHaveLength(0);
    expect(mockStopRest).toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('counts down in minutes and seconds', () => {
    expect(formatRest(90_000)).toBe('1:30');
    expect(formatRest(4_200)).toBe('0:05');
    expect(formatRest(-10)).toBe('0:00');
  });
});
