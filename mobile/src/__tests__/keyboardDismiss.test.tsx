import renderer, { act } from 'react-test-renderer';
import { Keyboard } from 'react-native';
import { PrimaryButton, TextButton } from '../components/ui';
import { OnbButton } from '../components/onboardingKit';

// The screens let a tap reach a button while the keyboard is up, so every
// shared button has to put the keyboard away itself, or it stays over the page.
describe('buttons close the keyboard', () => {
  it.each([
    ['PrimaryButton', (onPress: () => void) => <PrimaryButton label="Save" onPress={onPress} />],
    ['TextButton', (onPress: () => void) => <TextButton label="Cancel" onPress={onPress} />],
    ['OnbButton', (onPress: () => void) => <OnbButton label="Continue" onPress={onPress} />],
  ])('%s dismisses the keyboard and still does its job', (_name, make) => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const onPress = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(make(onPress)); });
    act(() => tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.onPress !== onPress)[0]!.props.onPress());
    expect(dismiss).toHaveBeenCalled();
    expect(onPress).toHaveBeenCalledTimes(1);
    dismiss.mockRestore();
    tree.unmount();
  });
});

describe('onboarding text boxes line their hint up with the box and the caret', () => {
  it('puts the box spacing on the wrapper, and gives the hint the field letter spacing', () => {
    const { OnbInput: Input } = require('../components/onboardingKit');
    const { TextInput, StyleSheet } = require('react-native');
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Input value="" placeholder="000000" style={{ marginTop: 26, height: 64, fontSize: 30, letterSpacing: 8 }} />);
    });
    const field = tree.root.findByType(TextInput);
    // The hint is laid over the wrapper, so a margin on the field itself pushed
    // the box below the hint ("000000" floated 13pt high on the code screen).
    expect(StyleSheet.flatten(field.props.style).marginTop).toBeUndefined();
    expect(StyleSheet.flatten(field.parent!.props.style).marginTop).toBe(26);
    const hint = tree.root.findAll((n: any) => n.props.children === '000000' && n.props.style)
      .map((n: any) => StyleSheet.flatten(n.props.style)).find((style: any) => style.letterSpacing !== undefined);
    expect(hint?.letterSpacing).toBe(8);
    tree.unmount();
  });
});
