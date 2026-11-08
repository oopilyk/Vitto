import { act, create } from 'react-test-renderer';
import { InputAccessoryView, Keyboard, Platform, TextInput } from 'react-native';
import { DoneTextInput, NumberField } from '../components/ui';
import { TextField } from '../components/settingsKit';

const render = (element: React.ReactElement) => {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(element);
  });
  return tree;
};

describe('keyboard Done bar', () => {
  it('gives each field a bar of its own, matched by id, that closes the keyboard', () => {
    // One shared bar reached no field on a phone: the New Architecture pins an
    // accessory to the first matching field on screen when the bar appears.
    expect(Platform.OS).toBe('ios');
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    const tree = render(
      <>
        <DoneTextInput keyboardType="number-pad" />
        <DoneTextInput keyboardType="number-pad" />
      </>,
    );
    const inputs = tree.root.findAllByType(TextInput);
    const bars = tree.root.findAllByType(InputAccessoryView);
    expect(bars).toHaveLength(2);
    expect(inputs.map((input) => input.props.inputAccessoryViewID)).toEqual(bars.map((bar) => bar.props.nativeID));
    expect(new Set(bars.map((bar) => bar.props.nativeID)).size).toBe(2);
    act(() => tree.root.findAllByProps({ testID: 'keyboard-done' })[0]!.props.onPress());
    expect(dismiss).toHaveBeenCalled();
    dismiss.mockRestore();
    act(() => tree.unmount());
  });

  it('comes with number fields, including the settings and form wrappers, and not with text keyboards', () => {
    const tree = render(
      <>
        <NumberField label="Weight" value={45} onChange={() => undefined} />
        <TextField keyboardType="decimal-pad" value="1" />
        <TextField value="Kyle" />
      </>,
    );
    const ids = tree.root.findAllByType(TextInput).map((input) => input.props.inputAccessoryViewID);
    expect(ids[0]).toEqual(expect.any(String));
    expect(ids[1]).toEqual(expect.any(String));
    expect(ids[2]).toBeUndefined();
    expect(tree.root.findAllByType(InputAccessoryView)).toHaveLength(2);
    act(() => tree.unmount());
  });
});
