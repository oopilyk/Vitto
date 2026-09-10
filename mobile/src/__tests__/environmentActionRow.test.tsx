import { Image, StyleSheet } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { EnvironmentActionRow } from '../petWorld/EnvironmentActionRow';
import type { EnvironmentId } from '../petWorld/types';

const ALL_SCENES: EnvironmentId[] = ['main', 'kitchen', 'gym', 'outside', 'study'];

/** The five labels in the order the bar always renders them: gym leads, living
 *  room is centre. */
const ORDERED_LABELS = [
  'Go to the gym',
  'Go to the kitchen',
  'Back to the living room',
  'Go outdoors',
  'Go to the study',
];

const rowFor = (
  current: EnvironmentId,
  night = false,
  onNavigate: (id: EnvironmentId) => void = () => {},
) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <EnvironmentActionRow current={current} onNavigate={onNavigate} night={night} />,
    );
  });
  return tree;
};

/** Each hotbar button, first-seen order, deduped -- Pressable repeats the role
 *  across its composite and host nodes. */
const buttons = (tree: renderer.ReactTestRenderer) => {
  const seen = new Map<string, renderer.ReactTestInstance>();
  for (const node of tree.root.findAllByProps({ accessibilityRole: 'button' })) {
    const label = node.props.accessibilityLabel as string | undefined;
    if (label && !seen.has(label) && typeof node.props.onPress === 'function') {
      seen.set(label, node);
    }
  }
  return seen;
};

const tintOf = (image: renderer.ReactTestInstance) => StyleSheet.flatten(image.props.style).tintColor;

describe('EnvironmentActionRow (hotbar)', () => {
  it('always renders all five scenes, in the same fixed order, wherever the pet is', () => {
    for (const scene of ALL_SCENES) {
      expect([...buttons(rowFor(scene)).keys()]).toEqual(ORDERED_LABELS);
    }
  });

  it('marks only the current scene as selected', () => {
    const byLabel = buttons(rowFor('gym'));
    // The current scene is selected AND disabled — you cannot travel to where
    // you already are, and the icon must not respond to a tap.
    expect(byLabel.get('Go to the gym')!.props.accessibilityState).toEqual({
      selected: true,
      disabled: true,
    });
    for (const label of ORDERED_LABELS.filter((l) => l !== 'Go to the gym')) {
      expect(byLabel.get(label)!.props.accessibilityState).toEqual({
        selected: false,
        disabled: false,
      });
    }
  });

  it('sits on the world — no bar background — with every icon as the same three layers', () => {
    const tree = rowFor('kitchen', false);
    const active = buttons(tree).get('Go to the kitchen')!;
    const inactive = buttons(tree).get('Go to the gym')!;

    for (const btn of [active, inactive]) {
      const imgs = btn.findAllByType(Image);
      expect(imgs).toHaveLength(3); // shadow copy + shape + keyline
      expect(imgs.map(tintOf).sort()).toEqual(['#12101c', '#ffffff', '#ffffff']);
    }

    // No translucent strip behind the icons (the old bar bg was an rgba()).
    const { View } = require('react-native');
    const hasTranslucentStrip = tree.root.findAllByType(View).some((v: any) => {
      const bg = StyleSheet.flatten(v.props.style)?.backgroundColor;
      return typeof bg === 'string' && bg.startsWith('rgba');
    });
    expect(hasTranslucentStrip).toBe(false);
    tree.unmount();
  });

  it('the current scene is the only full-strength icon', () => {
    const tree = rowFor('kitchen', false);
    const fill = (btn: renderer.ReactTestInstance) =>
      StyleSheet.flatten(btn.findAllByType(Image)[1].props.style).opacity as number;
    expect(fill(buttons(tree).get('Go to the kitchen')!)).toBe(1);
    expect(fill(buttons(tree).get('Go to the gym')!)).toBeLessThan(1);
    tree.unmount();
  });

  it('navigates to the tapped scene', () => {
    const walked: EnvironmentId[] = [];
    const tree = rowFor('main', false, (id) => walked.push(id));
    act(() => buttons(tree).get('Go to the gym')!.props.onPress());
    expect(walked).toEqual(['gym']);
    tree.unmount();
  });
});
