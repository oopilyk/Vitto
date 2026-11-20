import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockSendReset = jest.fn();
const mockReset = jest.fn();
jest.mock('../services/passwordService', () => ({
  sendResetCode: (...args: unknown[]) => mockSendReset(...args),
  resetPasswordWithCode: (...args: unknown[]) => mockReset(...args),
}));

import { AuthScreen, HAS_SIGNED_IN_KEY } from '../screens/AuthScreen';

const button = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAll((node) => typeof node.props.onPress === 'function')
    .find((node) => node.findAllByType(Text).some((t) => t.props.children === label));
const input = (tree: renderer.ReactTestRenderer, key: string) =>
  tree.root.find(
    (node) => typeof node.props.onChangeText === 'function' && (node.props.placeholder === key || node.props.accessibilityLabel === key),
  );
const has = (tree: renderer.ReactTestRenderer, testID: string) => tree.root.findAll((node) => node.props.testID === testID).length > 0;
const texts = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

/** A phone that has signed in before opens on sign-in. */
const openSignIn = async () => {
  await AsyncStorage.setItem(HAS_SIGNED_IN_KEY, '1');
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<AuthScreen />);
  });
  return tree;
};

/** Sign-in, then Forgot password?, with the address typed. */
const toResetEmail = async (address = 'sam@example.com') => {
  const tree = await openSignIn();
  act(() => button(tree, 'Forgot password?')!.props.onPress());
  act(() => input(tree, 'you@example.com').props.onChangeText(address));
  return tree;
};

describe('forgot password', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockSendReset.mockResolvedValue(undefined);
    mockReset.mockResolvedValue(undefined);
  });

  it('is offered on sign-in and sends a code to the address', async () => {
    const tree = await toResetEmail();
    expect(has(tree, 'reset-email')).toBe(true);
    await act(async () => button(tree, 'Email me a code')!.props.onPress());
    expect(mockSendReset).toHaveBeenCalledWith('sam@example.com');
    expect(has(tree, 'reset-code')).toBe(true);
  });

  it('needs the whole code and an 8-character password before it will try', async () => {
    const tree = await toResetEmail();
    await act(async () => button(tree, 'Email me a code')!.props.onPress());
    act(() => input(tree, 'Reset code').props.onChangeText('123456'));
    act(() => input(tree, 'New password').props.onChangeText('short12'));
    expect(button(tree, 'Set new password')!.props.disabled).toBe(true);
    act(() => input(tree, 'New password').props.onChangeText('longer123'));
    expect(button(tree, 'Set new password')!.props.disabled).toBe(false);
    await act(async () => button(tree, 'Set new password')!.props.onPress());
    expect(mockReset).toHaveBeenCalledWith('sam@example.com', '123456', 'longer123');
  });

  it('says plainly when the code is wrong, and stays on the page', async () => {
    mockReset.mockRejectedValue(Object.assign(new Error('Token has expired or is invalid'), { code: 'otp_expired' }));
    const tree = await toResetEmail();
    await act(async () => button(tree, 'Email me a code')!.props.onPress());
    act(() => input(tree, 'Reset code').props.onChangeText('000000'));
    act(() => input(tree, 'New password').props.onChangeText('longer123'));
    await act(async () => button(tree, 'Set new password')!.props.onPress());
    expect(texts(tree)).toContain("That code didn't work. Check it, or send a new one.");
    expect(has(tree, 'reset-code')).toBe(true);
  });

  it('goes back to sign-in', async () => {
    const tree = await toResetEmail();
    act(() => button(tree, 'Back to sign in')!.props.onPress());
    expect(has(tree, 'reset-email')).toBe(false);
    expect(button(tree, 'Sign in')).toBeTruthy();
  });
});
