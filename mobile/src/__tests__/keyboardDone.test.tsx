import { act, create } from 'react-test-renderer';
import { InputAccessoryView, Keyboard, TextInput } from 'react-native';
import { KEYBOARD_DONE_ID, KeyboardDoneBar, NumberField } from '../components/ui';

describe('keyboard Done bar', () => {
  it('sits over the keyboard by its id, and closes the keyboard when tapped', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<KeyboardDoneBar />);
    });
    expect(tree.root.findByType(InputAccessoryView).props.nativeID).toBe(KEYBOARD_DONE_ID);
    act(() => tree.root.findByProps({ testID: 'keyboard-done' }).props.onPress());
    expect(dismiss).toHaveBeenCalled();
    dismiss.mockRestore();
    act(() => tree.unmount());
  });

  it('is what a number field shows above its keypad', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<NumberField label="Weight" value={45} onChange={() => undefined} />);
    });
    expect(tree.root.findByType(TextInput).props.inputAccessoryViewID).toBe(KEYBOARD_DONE_ID);
    act(() => tree.unmount());
  });
});
