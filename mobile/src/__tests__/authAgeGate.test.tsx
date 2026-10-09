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
}));

import { AuthScreen, HAS_SIGNED_IN_KEY } from '../screens/AuthScreen';

const byText = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAll((node) => typeof node.props.onPress === 'function')
    .find((node) => node.findAllByType(Text).some((t) => t.props.children === label));

const render = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<AuthScreen />);
  });
  return tree;
};

/** A first launch: the welcome screen, then Get started. */
const openSignUp = async () => {
  const tree = await render();
  act(() => byText(tree, 'Get started')!.props.onPress());
  return tree;
};

const has = (tree: renderer.ReactTestRenderer, testID: string) =>
  tree.root.findAll((node) => node.props.testID === testID).length > 0;

const input = (tree: renderer.ReactTestRenderer, key: string) =>
  tree.root.find(
    (node) =>
      typeof node.props.onChangeText === 'function' && (node.props.placeholder === key || node.props.accessibilityLabel === key),
  );

const tapLabel = (tree: renderer.ReactTestRenderer, label: string) =>
  act(() =>
    tree.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0]!.props.onPress(),
  );

const createAccount = async (tree: renderer.ReactTestRenderer) => {
  await act(async () => byText(tree, 'Create account')!.props.onPress());
};

/** The year, the month only if asked for, then email and password. */
const fill = (tree: renderer.ReactTestRenderer, year: string, month?: string) => {
  act(() => input(tree, 'Year you were born').props.onChangeText(year));
  if (month) tapLabel(tree, month);
  act(() => input(tree, 'you@example.com').props.onChangeText('sam@example.com'));
  act(() => input(tree, '••••••').props.onChangeText('secret123'));
};

const thisYear = new Date().getFullYear();

describe('sign-up age check', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null });
    mockVerify.mockResolvedValue({ data: { session: { access_token: 'x' } }, error: null });
    mockResend.mockResolvedValue({ data: {}, error: null });
  });

  it('opens a first launch on the welcome screen, with a way to sign in instead', async () => {
    const tree = await render();
    expect(has(tree, 'welcome')).toBe(true);
    act(() => byText(tree, 'I already have an account')!.props.onPress());
    expect(has(tree, 'welcome')).toBe(false);
    expect(byText(tree, 'Sign in')).toBeDefined();
    tree.unmount();
  });

  it('asks the birth year first, neutrally, with no month unless it is needed', async () => {
    const tree = await openSignUp();
    const labels = tree.root.findAllByType(Text).map((t) => String([t.props.children].flat().join('')).toLowerCase());
    const at = (label: string) => labels.findIndex((text) => text.startsWith(label));
    expect(at('year you were born')).toBeGreaterThanOrEqual(0);
    expect(at('year you were born')).toBeLessThan(at('email'));
    // The name and username are asked in onboarding, not here.
    expect(at('your name')).toBe(-1);
    expect(at('username')).toBe(-1);
    expect(input(tree, 'Year you were born').props.value).toBe('');
    expect(at('and the month')).toBe(-1);
    // Nothing on screen hints at the age that matters.
    expect(labels.some((text) => text.includes('13'))).toBe(false);
    tree.unmount();
  });

  it('asks the month only for the one year that cannot settle it', async () => {
    const tree = await openSignUp();
    act(() => input(tree, 'Year you were born').props.onChangeText('1998'));
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'March')).toHaveLength(0);
    act(() => input(tree, 'Year you were born').props.onChangeText(String(thisYear - 13)));
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'March').length).toBeGreaterThan(0);

    // Without the month nothing is sent.
    fill(tree, String(thisYear - 13));
    await createAccount(tree);
    expect(mockSignUp).not.toHaveBeenCalled();
    const texts = tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
    expect(texts).toContain('Choose the month you were born.');

    // January of that year has had its birthday by any date but New Year's Day.
    tapLabel(tree, 'January');
    await createAccount(tree);
    expect(mockSignUp).toHaveBeenCalled();
    tree.unmount();
  });

  it('checks an under-13 year back once, then turns the phone away without sending anything', async () => {
    const tree = await openSignUp();
    fill(tree, String(thisYear - 10));
    await createAccount(tree);

    expect(has(tree, 'signup-confirm-age')).toBe(true);
    expect(tree.root.findAllByType(Text).map((t) => t.props.children)).toContain(`Born in ${thisYear - 10}?`);
    expect(has(tree, 'signup-blocked')).toBe(false);
    await act(async () => byText(tree, "Yes, that's right")!.props.onPress());

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(has(tree, 'signup-blocked')).toBe(true);
    expect(byText(tree, 'Create account')).toBeUndefined();
    expect(Number(await AsyncStorage.getItem('vitto.signupBlocked'))).toBeGreaterThan(Date.now() - 60_000);
    tree.unmount();

    // A fresh start on the same phone stays closed to sign-up.
    const again = await openSignUp();
    expect(has(again, 'signup-blocked')).toBe(true);
    // Back goes to sign-in, not back to the year.
    act(() => byText(again, 'Back to sign in')!.props.onPress());
    expect(has(again, 'signup-blocked')).toBe(false);
    expect(byText(again, 'Sign in')).toBeDefined();
    expect(again.root.findAll((node) => node.props.accessibilityLabel === 'Year you were born')).toHaveLength(0);
    again.unmount();
  });

  it('lets a slip be fixed from the check, before anything happens', async () => {
    const tree = await openSignUp();
    fill(tree, String(thisYear - 10));
    await createAccount(tree);
    act(() => byText(tree, 'No, let me fix it')!.props.onPress());
    expect(has(tree, 'signup-confirm-age')).toBe(false);
    expect(has(tree, 'signup-blocked')).toBe(false);
    expect(await AsyncStorage.getItem('vitto.signupBlocked')).toBeNull();

    act(() => input(tree, 'Year you were born').props.onChangeText('1998'));
    await createAccount(tree);
    expect(mockSignUp).toHaveBeenCalled();
    tree.unmount();
  });

  it('signs someone 13 or older straight up, with their age, and on to the code', async () => {
    const tree = await openSignUp();
    fill(tree, '1998');
    await createAccount(tree);
    expect(has(tree, 'signup-confirm-age')).toBe(false);
    // No name: onboarding asks for it on a page of its own. The age goes along
    // so onboarding need not ask it again.
    const args = mockSignUp.mock.calls[0]!;
    expect(args.slice(0, 4)).toEqual(['sam@example.com', 'secret123', '', undefined]);
    expect([thisYear - 1998 - 1, thisYear - 1998]).toContain(args[5]);
    expect(has(tree, 'confirm-code')).toBe(true);
    const texts = tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
    expect(texts.some((line) => line.includes('6-digit code to sam@example.com'))).toBe(true);
    tree.unmount();
  });

  it('lets the block lapse after a day', async () => {
    await AsyncStorage.setItem('vitto.signupBlocked', String(Date.now() - 25 * 60 * 60 * 1000));
    const tree = await openSignUp();
    expect(has(tree, 'signup-blocked')).toBe(false);
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
    fill(tree, '1998');
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

  it('sends an address that already has an account to sign-in, not to a code that never comes', async () => {
    // Supabase's answer for a confirmed address: a user with no identities, no code sent.
    mockSignUp.mockResolvedValue({ data: { session: null, user: { id: 'fake', identities: [] } }, error: null });
    const tree = await openSignUp();
    fill(tree, '1998');
    await createAccount(tree);

    expect(tree.root.findAll((node) => node.props.testID === 'confirm-code')).toHaveLength(0);
    const texts = tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
    expect(texts).toContain('An account with this email already exists. Sign in instead.');
    expect(byText(tree, 'Sign in')).toBeTruthy();
    const emailInput = tree.root.find((node) => node.props.placeholder === 'you@example.com' && typeof node.props.onChangeText === 'function');
    expect(emailInput.props.value).toBe('sam@example.com');
    tree.unmount();
  });

  it('says plainly when a code is wrong', async () => {
    mockVerify.mockResolvedValue({ data: {}, error: { message: 'Token has expired or is invalid' } });
    const tree = await openSignUp();
    fill(tree, '1998');
    await createAccount(tree);
    act(() => codeInput(tree).props.onChangeText('000000'));
    await act(async () => byText(tree, 'Confirm')!.props.onPress());
    const texts = tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
    expect(texts).toContain("That code didn't work. Check it, or send a new one.");
    tree.unmount();
  });

  it('sends someone who signs in before confirming to the code, with a fresh one', async () => {
    mockSignIn.mockResolvedValue({ data: { session: null }, error: { code: 'email_not_confirmed', message: 'Email not confirmed' } });
    // A phone that has signed in before opens on sign-in.
    await AsyncStorage.setItem(HAS_SIGNED_IN_KEY, '1');
    const tree = await render();
    expect(has(tree, 'welcome')).toBe(false);
    const inputs = tree.root.findAll((node) => typeof node.props.onChangeText === 'function' && node.props.placeholder);
    act(() => inputs.find((node) => node.props.placeholder === 'you@example.com')!.props.onChangeText('sam@example.com'));
    act(() => inputs.find((node) => node.props.placeholder === '••••••')!.props.onChangeText('secret123'));
    await act(async () => byText(tree, 'Sign in')!.props.onPress());

    expect(tree.root.findAll((node) => node.props.testID === 'confirm-code').length).toBeGreaterThan(0);
    expect(mockResend).toHaveBeenCalledWith('sam@example.com');
    tree.unmount();
  });
});
