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

  const fillOpacity = (tree: renderer.ReactTestRenderer) =>
    StyleSheet.flatten(images(tree)[1].props.style).opacity as number;

  it('renders three layers on any state: a hard shadow copy, the shape, an always-on white keyline', () => {
    const tree = render({ isActive: false, night: false });
    const [shadow, fill, keyline] = images(tree);
    expect(shadow.props.source).toBe(filledSource);
    expect(tintOf(shadow)).toBe('#12101c');
    expect(fill.props.source).toBe(filledSource);
    expect(tintOf(fill)).toBe('#ffffff');
    expect(keyline.props.source).toBe(outlineSource);
    expect(tintOf(keyline)).toBe('#ffffff');
    tree.unmount();
  });

  it('the current room is full strength; the others are dimmed, dimmer still at night', () => {
    const dayActive = render({ isActive: true, night: false });
    const dayInactive = render({ isActive: false, night: false });
    const nightInactive = render({ isActive: false, night: true });
    expect(fillOpacity(dayActive)).toBe(1);
    expect(fillOpacity(dayInactive)).toBeLessThan(1);
    expect(fillOpacity(nightInactive)).toBeLessThan(fillOpacity(dayInactive));
    dayActive.unmount();
    dayInactive.unmount();
    nightInactive.unmount();
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
