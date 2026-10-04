import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockSignUp = jest.fn();
jest.mock('@vitto/core', () => ({
  ...jest.requireActual('@vitto/core'),
  signUpWithEmail: (...args: unknown[]) => mockSignUp(...args),
  isUsernameAvailable: () => Promise.resolve(true),
}));

import { AuthScreen } from '../screens/AuthScreen';

const byLabel = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onChangeText === 'function')[0]!;

const byText = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAll((node) => typeof node.props.onPress === 'function')
    .find((node) => node.findAllByType(Text).some((t) => t.props.children === label));

const openSignUp = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<AuthScreen />);
  });
  act(() => byText(tree, 'Need an account?')!.props.onPress());
  return tree;
};

const fill = (tree: renderer.ReactTestRenderer, month: string, year: string) => {
  act(() => byLabel(tree, 'Birth month').props.onChangeText(month));
  act(() => byLabel(tree, 'Birth year').props.onChangeText(year));
  const inputs = tree.root.findAll((node) => typeof node.props.onChangeText === 'function' && node.props.placeholder);
  const set = (placeholder: string, value: string) =>
    act(() => inputs.find((node) => node.props.placeholder === placeholder)!.props.onChangeText(value));
  set('Your name', 'Sam');
  set('kyle_li', 'sam_lifts');
  set('you@example.com', 'sam@example.com');
  set('••••••', 'secret123');
};

describe('sign-up age check', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null });
  });

  it('asks for a birthday first, neutrally, before anything else', async () => {
    const tree = await openSignUp();
    const labels = tree.root.findAllByType(Text).map((t) => String([t.props.children].flat().join('')).toLowerCase());
    const at = (label: string) => labels.findIndex((text) => text === label);
    expect(at('birthday')).toBeGreaterThanOrEqual(0);
    expect(at('birthday')).toBeLessThan(at('your name'));
    // Nothing on screen hints at the age that matters.
    expect(labels.some((text) => text.includes('13'))).toBe(false);
    tree.unmount();
  });

  it('turns away someone under 13 without sending anything, and remembers it on this phone', async () => {
    const tree = await openSignUp();
    fill(tree, '3', String(new Date().getFullYear() - 10));
    await act(async () => byText(tree, 'Create account')!.props.onPress());

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(tree.root.findAll((node) => node.props.testID === 'signup-blocked').length).toBeGreaterThan(0);
    expect(byText(tree, 'Create account')).toBeUndefined();
    expect(await AsyncStorage.getItem('vitto.signupBlocked')).toBe('1');
    tree.unmount();

    // A fresh start on the same phone stays closed to sign-up.
    const again = await openSignUp();
    expect(again.root.findAll((node) => node.props.testID === 'signup-blocked').length).toBeGreaterThan(0);
    again.unmount();
  });

  it('lets someone 13 or older sign up', async () => {
    const tree = await openSignUp();
    fill(tree, '6', '1998');
    await act(async () => byText(tree, 'Create account')!.props.onPress());
    expect(mockSignUp).toHaveBeenCalledWith('sam@example.com', 'secret123', 'Sam', 'sam_lifts');
    tree.unmount();
  });
});
