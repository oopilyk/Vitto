import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockChange = jest.fn();
const mockReset = jest.fn();
const mockSend = jest.fn();
jest.mock('../services/passwordService', () => ({
  changePassword: (...args: unknown[]) => mockChange(...args),
  resetPasswordWithCode: (...args: unknown[]) => mockReset(...args),
  sendResetCode: (...args: unknown[]) => mockSend(...args),
}));

import { ChangePasswordScreen } from '../screens/ChangePasswordScreen';

const button = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAll((node) => typeof node.props.onPress === 'function' && node.props.accessibilityRole === 'button')
    .find((node) => node.findAllByType(Text).some((t) => t.props.children === label));
const field = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.find((node) => typeof node.props.onChangeText === 'function' && node.props.accessibilityLabel === label);
const texts = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
const has = (tree: renderer.ReactTestRenderer, testID: string) => tree.root.findAll((node) => node.props.testID === testID).length > 0;

const render = () => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<ChangePasswordScreen email="sam@example.com" onClose={jest.fn()} />);
  });
  return tree;
};

describe('change password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChange.mockResolvedValue(undefined);
    mockReset.mockResolvedValue(undefined);
    mockSend.mockResolvedValue(undefined);
  });

  it('needs the current password and an 8-character new one', async () => {
    const tree = render();
    act(() => field(tree, 'Current password').props.onChangeText('oldpass'));
    act(() => field(tree, 'New password').props.onChangeText('short12'));
    expect(button(tree, 'Change password')!.props.disabled).toBe(true);
    act(() => field(tree, 'New password').props.onChangeText('newpass99'));
    await act(async () => button(tree, 'Change password')!.props.onPress());
    expect(mockChange).toHaveBeenCalledWith('sam@example.com', 'oldpass', 'newpass99');
    expect(has(tree, 'password-changed')).toBe(true);
  });

  it('says so when the current password is wrong', async () => {
    mockChange.mockRejectedValue(Object.assign(new Error('Invalid login credentials'), { code: 'invalid_credentials' }));
    const tree = render();
    act(() => field(tree, 'Current password').props.onChangeText('guess'));
    act(() => field(tree, 'New password').props.onChangeText('newpass99'));
    await act(async () => button(tree, 'Change password')!.props.onPress());
    expect(texts(tree)).toContain("That isn't your current password.");
    expect(has(tree, 'password-changed')).toBe(false);
  });

  it('can prove it with an emailed code instead, when the current one is forgotten', async () => {
    const tree = render();
    await act(async () => button(tree, 'Forgot your current password?')!.props.onPress());
    expect(mockSend).toHaveBeenCalledWith('sam@example.com');
    act(() => field(tree, 'Code from your email').props.onChangeText('123456'));
    act(() => field(tree, 'New password').props.onChangeText('newpass99'));
    await act(async () => button(tree, 'Change password')!.props.onPress());
    expect(mockReset).toHaveBeenCalledWith('sam@example.com', '123456', 'newpass99');
    expect(mockChange).not.toHaveBeenCalled();
  });
});
