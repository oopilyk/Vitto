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
