import { Image, StyleSheet, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { EnvironmentButton } from '../petWorld/EnvironmentButton';

const source = { uri: 'kitchen.png' };

describe('EnvironmentButton', () => {
  it('renders the bare PNG at an explicit size (no circle, no glyph)', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <EnvironmentButton label="Kitchen" source={source} onPress={() => {}} />,
      );
    });

    const image = tree.root.findByType(Image);
    const style = StyleSheet.flatten(image.props.style);
    // Explicit dimensions — react-native-web would otherwise size the <img> to
    // the asset's intrinsic pixels and blow out the layout.
    expect(style.width).toBe(60);
    expect(style.height).toBe(60);
    // Only the caption renders as text — no icon glyph.
    expect(tree.root.findAllByType(Text).map((t) => t.props.children)).toEqual(['Kitchen']);

    tree.unmount();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <EnvironmentButton label="Gym" source={source} onPress={onPress} />,
      );
    });

    act(() => {
      tree.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);

    tree.unmount();
  });

  it('falls back to the label for the accessible name, or uses the override', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <EnvironmentButton label="Gym" source={source} onPress={() => {}} />,
      );
    });
    expect(tree.root.findByProps({ accessibilityRole: 'button' }).props.accessibilityLabel).toBe('Gym');
    tree.unmount();

    act(() => {
      tree = renderer.create(
        <EnvironmentButton
          label="Gym"
          accessibilityLabel="Log workout"
          source={source}
          onPress={() => {}}
        />,
      );
    });
    expect(tree.root.findByProps({ accessibilityRole: 'button' }).props.accessibilityLabel).toBe('Log workout');
    tree.unmount();
  });
});
