import renderer, { act } from 'react-test-renderer';
import { EnvironmentActionRow } from '../petWorld/EnvironmentActionRow';
import type { EnvironmentId } from '../petWorld/types';

const rowFor = (current: EnvironmentId, onNavigate: (id: EnvironmentId) => void = () => {}) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <EnvironmentActionRow current={current} onNavigate={onNavigate} night={false} />,
    );
  });
  return tree;
};

/** The row's button labels, left to right. `findAllByProps` returns the composite
 *  Pressable, its host View and the wrapper each carrying the role, so the same
 *  label repeats — dedupe while keeping first-seen order. */
const buttonLabels = (tree: renderer.ReactTestRenderer) => {
  const seen: string[] = [];
  for (const node of tree.root.findAllByProps({ accessibilityRole: 'button' })) {
    const label = node.props.accessibilityLabel as string | undefined;
    if (label && !seen.includes(label)) seen.push(label);
  }
  return seen;
};

describe('EnvironmentActionRow', () => {
  it('offers the four scenes the pet is not currently in, never a button back into this one', () => {
    // Living room: no "Living room" button, the other four rooms are all there.
    expect(buttonLabels(rowFor('main'))).toEqual([
      'Go to the kitchen',
      'Go to the gym',
      'Go outdoors',
      'Go to the study',
    ]);
  });

  it('turns the Gym slot into the Kitchen slot once the pet is in the Gym', () => {
    const labels = buttonLabels(rowFor('gym'));
    expect(labels).not.toContain('Go to the gym');
    expect(labels).toContain('Go to the kitchen');
    expect(labels).toEqual([
      'Back to the living room',
      'Go to the kitchen',
      'Go outdoors',
      'Go to the study',
    ]);
  });

  it('drops the Kitchen button in the Kitchen and shows the way back to the living room', () => {
    const labels = buttonLabels(rowFor('kitchen'));
    expect(labels).not.toContain('Go to the kitchen');
    expect(labels).toContain('Back to the living room');
  });

  it('always renders exactly four buttons', () => {
    for (const scene of ['main', 'kitchen', 'gym', 'outside', 'study'] as EnvironmentId[]) {
      expect(buttonLabels(rowFor(scene))).toHaveLength(4);
    }
  });

  it('walks the pet into the tapped scene', () => {
    const walked: EnvironmentId[] = [];
    const tree = rowFor('main', (id) => walked.push(id));
    const gym = tree.root
      .findAllByProps({ accessibilityLabel: 'Go to the gym' })
      .find((node) => typeof node.props.onPress === 'function');
    act(() => gym!.props.onPress());
    expect(walked).toEqual(['gym']);
    tree.unmount();
  });
});
