import { Image, StyleSheet, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { EnvironmentButton } from '../petWorld/EnvironmentButton';

const filledSource = { uri: 'gym_filled.png' };
const outlineSource = { uri: 'gym_outline.png' };

const render = (props: Partial<Parameters<typeof EnvironmentButton>[0]> = {}) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <EnvironmentButton
        accessibilityLabel="Go to the gym"
        filledSource={filledSource}
        outlineSource={outlineSource}
        isActive={false}
        night={false}
        onPress={() => {}}
        {...props}
      />,
    );
  });
  return tree;
};

const images = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Image);
const tintOf = (image: renderer.ReactTestInstance) => StyleSheet.flatten(image.props.style).tintColor;

describe('EnvironmentButton (hotbar icon)', () => {
  it('renders no text caption', () => {
    const tree = render();
    expect(tree.root.findAllByType(Text)).toHaveLength(0);
    tree.unmount();
  });

  const CREAM = '#f2e8d4';
  const fillOpacity = (tree: renderer.ReactTestRenderer) =>
    StyleSheet.flatten(images(tree)[0].props.style).opacity as number;

  it('day, inactive: one warm-cream glyph — not white — clearly dimmed', () => {
    const tree = render({ isActive: false, night: false });
    const imgs = images(tree);
    expect(imgs).toHaveLength(1);
    expect(tintOf(imgs[0])).toBe(CREAM);
    expect(fillOpacity(tree)).toBeLessThan(0.8);
    tree.unmount();
  });

  it('day, active: full-strength cream glyph + a cream keyline', () => {
    const tree = render({ isActive: true, night: false });
    const [filled, outline] = images(tree);
    expect(tintOf(filled)).toBe(CREAM);
    expect(StyleSheet.flatten(filled.props.style).opacity).toBe(1);
    expect(outline.props.source).toBe(outlineSource);
    expect(tintOf(outline)).toBe(CREAM);
    tree.unmount();
  });

  it('night: every icon keeps a cream keyline; the active one is full strength, the rest dimmer than day', () => {
    const nightInactive = render({ isActive: false, night: true });
    const nightActive = render({ isActive: true, night: true });
    const dayInactive = render({ isActive: false, night: false });

    expect(images(nightInactive)).toHaveLength(2); // glyph + keyline
    expect(images(nightInactive).map(tintOf)).toEqual([CREAM, CREAM]);
    expect(fillOpacity(nightInactive)).toBeLessThan(fillOpacity(dayInactive));
    expect(fillOpacity(nightActive)).toBe(1);

    nightInactive.unmount();
    nightActive.unmount();
    dayInactive.unmount();
  });

  it('marks itself selected for a screen reader only while active', () => {
    const inactive = render({ isActive: false });
    expect(
      inactive.root.findByProps({ accessibilityRole: 'button' }).props.accessibilityState,
    ).toEqual({ selected: false, disabled: false });
    inactive.unmount();

    // Also disabled: the room you are standing in is not a destination, so a
    // screen reader should not offer it as one.
    const active = render({ isActive: true });
    expect(
      active.root.findByProps({ accessibilityRole: 'button' }).props.accessibilityState,
    ).toEqual({ selected: true, disabled: true });
    active.unmount();
  });

  it('is inert while active — no press handler runs and no press feedback shows', () => {
    let presses = 0;
    const active = render({ isActive: true, onPress: () => { presses += 1; } });
    const button = active.root.findByProps({ accessibilityRole: 'button' });
    expect(button.props.disabled).toBe(true);
    // Press feedback is suppressed too: dimming under a tap that goes nowhere is
    // what makes a control feel broken.
    const style = button.props.style({ pressed: true });
    expect(JSON.stringify(style)).not.toContain('0.6');
    active.unmount();
    expect(presses).toBe(0);
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const tree = render({ onPress });
    act(() => {
      tree.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    tree.unmount();
  });
});
