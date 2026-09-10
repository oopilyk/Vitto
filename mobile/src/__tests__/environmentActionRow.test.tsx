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

  it('gives the day-active button the layered outline+filled treatment; the others one image', () => {
    const tree = rowFor('kitchen', false);
    const active = buttons(tree).get('Go to the kitchen')!;
    const inactive = buttons(tree).get('Go to the gym')!;

    // Two layered images (dark filled shape + white outline keyline) vs one.
    const activeImages = active.findAllByType(Image);
    expect(activeImages).toHaveLength(2);
    expect(activeImages.map((img) => img.props.source)).toEqual([
      expect.anything(),
      expect.anything(),
    ]);
    // The two layers are different crops, and carry the dark/white tint pair.
    expect(activeImages[0].props.source).not.toBe(activeImages[1].props.source);
    expect(activeImages.map(tintOf).sort()).toEqual(['#1b1b1b', '#ffffff']);

    expect(inactive.findAllByType(Image)).toHaveLength(1);
    expect(tintOf(inactive.findAllByType(Image)[0])).toBe('#ffffff');
  });

  it('gives every night button a white keyline; the active one is solid white, the rest dark-with-outline', () => {
    const tree = rowFor('kitchen', true);
    const active = buttons(tree).get('Go to the kitchen')!;
    const inactive = buttons(tree).get('Go to the gym')!;

    // Both render the filled + outline layer pair at night.
    const activeTints = active.findAllByType(Image).map(tintOf).sort();
    const inactiveTints = inactive.findAllByType(Image).map(tintOf).sort();
    expect(activeTints).toEqual(['#ffffff', '#ffffff']); // solid white shape + white keyline
    expect(inactiveTints).toEqual(['#111111', '#ffffff']); // dark shape + white keyline
  });

  it('navigates to the tapped scene', () => {
    const walked: EnvironmentId[] = [];
    const tree = rowFor('main', false, (id) => walked.push(id));
    act(() => buttons(tree).get('Go to the gym')!.props.onPress());
    expect(walked).toEqual(['gym']);
    tree.unmount();
  });
});
