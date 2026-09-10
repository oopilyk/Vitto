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

  it('day, inactive: one white filled icon, slightly dimmed', () => {
    const tree = render({ isActive: false, night: false });
    const imgs = images(tree);
    expect(imgs).toHaveLength(1);
    const style = StyleSheet.flatten(imgs[0].props.style);
    expect(style.tintColor).toBe('#ffffff');
    expect(style.opacity).toBeLessThan(1);
    tree.unmount();
  });

  it('day, active: layers a dark filled icon under a white outline keyline', () => {
    const tree = render({ isActive: true, night: false });
    const imgs = images(tree);
    expect(imgs).toHaveLength(2);
    const [filled, outline] = imgs;
    expect(filled.props.source).toBe(filledSource);
    expect(tintOf(filled)).toBe('#1b1b1b');
    expect(outline.props.source).toBe(outlineSource);
    expect(tintOf(outline)).toBe('#ffffff');
    tree.unmount();
  });

  it('night, inactive: a dark filled icon under a white outline keyline so it still reads', () => {
    const tree = render({ isActive: false, night: true });
    const imgs = images(tree);
    expect(imgs).toHaveLength(2);
    const [filled, outline] = imgs;
    expect(filled.props.source).toBe(filledSource);
    expect(tintOf(filled)).toBe('#111111');
    expect(outline.props.source).toBe(outlineSource);
    expect(tintOf(outline)).toBe('#ffffff');
    tree.unmount();
  });

  it('night, active: a full-strength white filled icon, also keylined', () => {
    const tree = render({ isActive: true, night: true });
    const imgs = images(tree);
    expect(imgs).toHaveLength(2);
    const [filled, outline] = imgs;
    expect(tintOf(filled)).toBe('#ffffff');
    expect(StyleSheet.flatten(filled.props.style).opacity).toBe(1);
    expect(outline.props.source).toBe(outlineSource);
    expect(tintOf(outline)).toBe('#ffffff');
    tree.unmount();
  });

  it('marks itself selected for a screen reader only while active', () => {
    const inactive = render({ isActive: false });
    expect(
      inactive.root.findByProps({ accessibilityRole: 'button' }).props.accessibilityState,
    ).toEqual({ selected: false });
    inactive.unmount();

    const active = render({ isActive: true });
    expect(
      active.root.findByProps({ accessibilityRole: 'button' }).props.accessibilityState,
    ).toEqual({ selected: true });
    active.unmount();
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
