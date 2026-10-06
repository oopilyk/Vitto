import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';

const mockSignUp = jest.fn();
const mockSignIn = jest.fn();
const mockVerify = jest.fn();
const mockResend = jest.fn();
jest.mock('@vitto/core', () => ({
  ...jest.requireActual('@vitto/core'),
  signUpWithEmail: (...args: unknown[]) => mockSignUp(...args),
  signInWithEmail: (...args: unknown[]) => mockSignIn(...args),
  verifySignupCode: (...args: unknown[]) => mockVerify(...args),
  resendSignupCode: (...args: unknown[]) => mockResend(...args),
  isUsernameAvailable: () => Promise.resolve(true),
}));

import { AuthScreen } from '../screens/AuthScreen';

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

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Picks a birthday the way a person does: open the sheet, tap a month, tap a year, Done. */
const pickBirthday = (tree: renderer.ReactTestRenderer, month: string, year: string) => {
  const tap = (label: string) =>
    act(() => tree.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0]!.props.onPress());
  act(() => tree.root.findAll((node) => node.props.testID === 'birthday-field' && typeof node.props.onPress === 'function')[0]!.props.onPress());
  tap(MONTH_NAMES[Number(month) - 1]!);
  tap(year);
  act(() => byText(tree, 'Done')!.props.onPress());
};

/** Continue to the review page every sign-up gets, then the real Create account. */
const createAccount = async (tree: renderer.ReactTestRenderer) => {
  await act(async () => byText(tree, 'Continue')!.props.onPress());
  await act(async () => byText(tree, 'Create account')!.props.onPress());
};

const fill = (tree: renderer.ReactTestRenderer, month: string, year: string) => {
  pickBirthday(tree, month, year);
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
    mockVerify.mockResolvedValue({ data: { session: { access_token: 'x' } }, error: null });
    mockResend.mockResolvedValue({ data: {}, error: null });
  });

  it('asks for a birthday first, neutrally, by tapping, with nothing chosen for you', async () => {
    const tree = await openSignUp();
    const labels = tree.root.findAllByType(Text).map((t) => String([t.props.children].flat().join('')).toLowerCase());
    const at = (label: string) => labels.findIndex((text) => text === label);
    expect(at('birthday')).toBeGreaterThanOrEqual(0);
    expect(at('birthday')).toBeLessThan(at('your name'));
    // No typing: a field that opens a picker, and it starts empty.
    expect(tree.root.findAll((node) => node.props.testID === 'birthday-field').length).toBeGreaterThan(0);
    expect(labels).toContain('month and year');
    // Nothing on screen hints at the age that matters.
    expect(labels.some((text) => text.includes('13'))).toBe(false);
    tree.unmount();
  });

  it('turns away someone under 13 without sending anything, and remembers it on this phone', async () => {
    const tree = await openSignUp();
    fill(tree, '3', String(new Date().getFullYear() - 10));
    await createAccount(tree);

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(tree.root.findAll((node) => node.props.testID === 'signup-blocked').length).toBeGreaterThan(0);
    expect(byText(tree, 'Create account')).toBeUndefined();
    expect(Number(await AsyncStorage.getItem('vitto.signupBlocked'))).toBeGreaterThan(Date.now() - 60_000);
    tree.unmount();

    // A fresh start on the same phone stays closed to sign-up.
    const again = await openSignUp();
    expect(again.root.findAll((node) => node.props.testID === 'signup-blocked').length).toBeGreaterThan(0);
    // Back goes to sign-in, not back to the birthday.
    act(() => byText(again, 'Back to sign in')!.props.onPress());
    expect(again.root.findAll((node) => node.props.testID === 'signup-blocked')).toHaveLength(0);
    expect(byText(again, 'Sign in')).toBeDefined();
    expect(again.root.findAll((node) => node.props.testID === 'birthday-field')).toHaveLength(0);
    again.unmount();
  });

  it('lets someone 13 or older sign up', async () => {
    const tree = await openSignUp();
    fill(tree, '6', '1998');
    await createAccount(tree);
    expect(mockSignUp.mock.calls[0]!.slice(0, 4)).toEqual(['sam@example.com', 'secret123', 'Sam', 'sam_lifts']);
    // No session until the email is confirmed: straight on to the code.
    expect(tree.root.findAll((node) => node.props.testID === 'confirm-code').length).toBeGreaterThan(0);
    const texts = tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
    expect(texts.some((line) => line.includes('6-digit code to sam@example.com'))).toBe(true);
    tree.unmount();
  });

describe('a mistyped birthday', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null });
  });

  it('shows every age the same review page first, so a slip can be fixed before anything happens', async () => {
    const tree = await openSignUp();
    fill(tree, '3', String(new Date().getFullYear() - 10));
    await act(async () => byText(tree, 'Continue')!.props.onPress());
    expect(tree.root.findAll((node) => node.props.testID === 'signup-review').length).toBeGreaterThan(0);
    const texts = tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
    expect(texts).toContain('Is everything right?');
    expect(texts).toContain(`March ${new Date().getFullYear() - 10}`);
    expect(texts).toContain('@sam_lifts');
    expect(texts).toContain('sam@example.com');
    // Nothing sent, not turned away yet: they can still go back and fix it.
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(tree.root.findAll((node) => node.props.testID === 'signup-blocked')).toHaveLength(0);
    act(() => byText(tree, 'Go back and edit')!.props.onPress());
    fill(tree, '3', '1998');
    await createAccount(tree);
    expect(mockSignUp).toHaveBeenCalled();
    tree.unmount();
  });

  it('lets the block lapse after a day', async () => {
    await AsyncStorage.setItem('vitto.signupBlocked', String(Date.now() - 25 * 60 * 60 * 1000));
    const tree = await openSignUp();
    expect(tree.root.findAll((node) => node.props.testID === 'signup-blocked')).toHaveLength(0);
    expect(await AsyncStorage.getItem('vitto.signupBlocked')).toBeNull();
    tree.unmount();
  });
});

describe('confirming a new account with a code', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null });
    mockVerify.mockResolvedValue({ data: { session: { access_token: 'x' } }, error: null });
    mockResend.mockResolvedValue({ data: {}, error: null });
  });

  const codeInput = (tree: renderer.ReactTestRenderer) =>
    tree.root.findAll((node) => node.props.accessibilityLabel === 'Confirmation code' && typeof node.props.onChangeText === 'function')[0]!;

  it('confirms with the code, once it is long enough, whatever length the project sends', async () => {
    const tree = await openSignUp();
    fill(tree, '6', '1998');
    await createAccount(tree);

    act(() => codeInput(tree).props.onChangeText('12a3'));
    expect(codeInput(tree).props.value).toBe('123');
    expect(tree.root.findAll((node) => node.props.disabled === true && node.findAllByType(Text).some((t) => t.props.children === 'Confirm')).length).toBeGreaterThan(0);

    // An 8-digit code, as newer Supabase projects send.
    act(() => codeInput(tree).props.onChangeText('33440646'));
    await act(async () => byText(tree, 'Confirm')!.props.onPress());
    expect(mockVerify).toHaveBeenCalledWith('sam@example.com', '33440646');
    tree.unmount();
  });

  it('says plainly when a code is wrong', async () => {
    mockVerify.mockResolvedValue({ data: {}, error: { message: 'Token has expired or is invalid' } });
    const tree = await openSignUp();
    fill(tree, '6', '1998');
    await createAccount(tree);
    act(() => codeInput(tree).props.onChangeText('000000'));
    await act(async () => byText(tree, 'Confirm')!.props.onPress());
    const texts = tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
    expect(texts).toContain("That code didn't work. Check it, or send a new one.");
    tree.unmount();
  });

  it('sends someone who signs in before confirming to the code, with a fresh one', async () => {
    mockSignIn.mockResolvedValue({ data: { session: null }, error: { code: 'email_not_confirmed', message: 'Email not confirmed' } });
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<AuthScreen />);
    });
    const inputs = tree.root.findAll((node) => typeof node.props.onChangeText === 'function' && node.props.placeholder);
    act(() => inputs.find((node) => node.props.placeholder === 'you@example.com')!.props.onChangeText('sam@example.com'));
    act(() => inputs.find((node) => node.props.placeholder === '••••••')!.props.onChangeText('secret123'));
    await act(async () => byText(tree, 'Sign in')!.props.onPress());

    expect(tree.root.findAll((node) => node.props.testID === 'confirm-code').length).toBeGreaterThan(0);
    expect(mockResend).toHaveBeenCalledWith('sam@example.com');
    tree.unmount();
  });
});
});
