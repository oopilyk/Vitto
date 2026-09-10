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

  const CREAM = '#f2e8d4';

  it('warm-cream glyphs — not white — with a keyline on the active one only in the day', () => {
    const tree = rowFor('kitchen', false);
    const active = buttons(tree).get('Go to the kitchen')!;
    const inactive = buttons(tree).get('Go to the gym')!;

    // Active: cream glyph + cream keyline. Inactive: just the dimmed cream glyph.
    const activeImages = active.findAllByType(Image);
    expect(activeImages).toHaveLength(2);
    expect(activeImages.map(tintOf)).toEqual([CREAM, CREAM]);
    expect(StyleSheet.flatten(activeImages[0].props.style).opacity).toBe(1);

    expect(inactive.findAllByType(Image)).toHaveLength(1);
    expect(tintOf(inactive.findAllByType(Image)[0])).toBe(CREAM);
    expect(StyleSheet.flatten(inactive.findAllByType(Image)[0].props.style).opacity).toBeLessThan(1);
  });

  it('every night glyph keeps a cream keyline so it never vanishes on a dark bar', () => {
    const tree = rowFor('kitchen', true);
    for (const label of ORDERED_LABELS) {
      const tints = buttons(tree).get(label)!.findAllByType(Image).map(tintOf);
      expect(tints).toEqual([CREAM, CREAM]);
    }
  });

  it('navigates to the tapped scene', () => {
    const walked: EnvironmentId[] = [];
    const tree = rowFor('main', false, (id) => walked.push(id));
    act(() => buttons(tree).get('Go to the gym')!.props.onPress());
    expect(walked).toEqual(['gym']);
    tree.unmount();
  });
});
