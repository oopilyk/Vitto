import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { PlusPaywall } from '../components/PlusPaywall';
import { PlusScreen } from '../screens/PlusScreen';

jest.mock('../services/billingService', () => {
  const actual = jest.requireActual('../services/billingService');
  return { ...actual, billingService: { status: jest.fn(), purchase: jest.fn(), cancel: jest.fn(), restore: jest.fn() } };
});
jest.mock('../services/pushService', () => ({
  scheduleTrialReminder: jest.fn(() => Promise.resolve(true)),
  cancelTrialReminder: jest.fn(() => Promise.resolve()),
}));
const { billingService } = jest.requireMock('../services/billingService') as {
  billingService: Record<'status' | 'purchase' | 'cancel' | 'restore', jest.Mock>;
};
const push = jest.requireMock('../services/pushService') as Record<'scheduleTrialReminder' | 'cancelTrialReminder', jest.Mock>;

const strings = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map((n) => [n.props.children].flat().filter((c) => typeof c === 'string').join(''));

const pressable = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAll((n) => typeof n.props.onPress === 'function')
    .find((n) => n.props.accessibilityLabel?.startsWith?.(label) || n.findAllByType(Text).some((t) => [t.props.children].flat().join('').startsWith(label)));

const byTestId = (tree: renderer.ReactTestRenderer, id: string) => tree.root.findAll((n) => n.props.testID === id);

const open = async (props: { onTierChange?: jest.Mock; onPurchased?: jest.Mock } = {}) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <PlusPaywall onTierChange={props.onTierChange ?? jest.fn()} onPurchased={props.onPurchased} onClose={() => {}} />,
    );
  });
  return tree;
};

describe('Vitto Plus paywall (test mode)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('leads with Yearly and a 14-day trial, with the timeline and the price under the button', async () => {
    billingService.status.mockResolvedValue({ enabled: true, tier: 'free', expiresAt: null });
    const tree = await open();
    const all = strings(tree);
    expect(all).toContain('SAVE 48%');
    // Free next to Plus, including photo meal tracking.
    expect(all).toContain('Photo meal tracking');
    expect(all).toContain('✓ Included');
    expect(all).toContain('5 a day');
    expect(all).toContain('✓ Many more');
    expect(all).toContain('Only $4.16 a month');
    expect(byTestId(tree, 'trial-toggle')[0]!.props.value).toBe(true);
    expect(byTestId(tree, 'trial-timeline').length).toBeGreaterThan(0);
    expect(all).toContain('We remind you before it ends');
    expect(byTestId(tree, 'plus-terms')[0]!.props.children).toBe('Free for 14 days, then $49.99 / year. Cancel anytime.');
    expect(pressable(tree, 'Start Free Trial')).toBeDefined();
    expect(pressable(tree, 'Restore')).toBeDefined();
    tree.unmount();
  });

  it('starts the trial, unlocks Plus and schedules the day-12 reminder', async () => {
    billingService.status.mockResolvedValue({ enabled: true, tier: 'free', expiresAt: null });
    billingService.purchase.mockResolvedValue({ enabled: true, tier: 'plus', expiresAt: '2027-10-14T00:00:00Z' });
    const onTierChange = jest.fn();
    const onPurchased = jest.fn();
    const tree = await open({ onTierChange, onPurchased });
    await act(async () => pressable(tree, 'Start Free Trial')!.props.onPress());
    expect(billingService.purchase).toHaveBeenCalledWith('yearly', true);
    expect(push.scheduleTrialReminder).toHaveBeenCalledWith(12, 14);
    expect(onTierChange).toHaveBeenCalledWith('plus');
    expect(onPurchased).toHaveBeenCalled();
    tree.unmount();
  });

  it('turns the trial off for Monthly, and says what it costs', async () => {
    billingService.status.mockResolvedValue({ enabled: true, tier: 'free', expiresAt: null });
    billingService.purchase.mockResolvedValue({ enabled: true, tier: 'plus', expiresAt: '2026-10-30T00:00:00Z' });
    const tree = await open();
    expect(strings(tree)).not.toContain('Lifetime');
    act(() => pressable(tree, 'Monthly')!.props.onPress());
    expect(byTestId(tree, 'trial-toggle')[0]!.props.value).toBe(false);
    expect(byTestId(tree, 'trial-timeline')).toHaveLength(0);
    expect(byTestId(tree, 'plus-terms')[0]!.props.children).toBe('$7.99 / month. Cancel anytime.');
    await act(async () => pressable(tree, 'Continue')!.props.onPress());
    expect(billingService.purchase).toHaveBeenCalledWith('monthly', false);
    expect(push.scheduleTrialReminder).not.toHaveBeenCalled();
    tree.unmount();
  });

  it('lets a subscriber cancel back to free, dropping the reminder', async () => {
    billingService.status.mockResolvedValue({ enabled: true, tier: 'plus', expiresAt: '2027-09-30T00:00:00Z' });
    billingService.cancel.mockResolvedValue({ enabled: true, tier: 'free', expiresAt: null });
    const onTierChange = jest.fn();
    const tree = await open({ onTierChange });
    expect(byTestId(tree, 'plus-active').length).toBeGreaterThan(0);
    await act(async () => pressable(tree, 'Cancel Plus')!.props.onPress());
    expect(onTierChange).toHaveBeenCalledWith('free');
    expect(push.cancelTrialReminder).toHaveBeenCalled();
    tree.unmount();
  });

  it('sells nothing when test purchases are switched off', async () => {
    billingService.status.mockResolvedValue({ enabled: false, tier: 'free', expiresAt: null });
    const tree = await open();
    expect(strings(tree)).toContain("Plus isn't available to buy yet.");
    expect(pressable(tree, 'Start Free Trial')).toBeUndefined();
    tree.unmount();
  });
});

describe('Plus screen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('hands a successful purchase on, so the app can go and choose a personality', async () => {
    billingService.status.mockResolvedValue({ enabled: true, tier: 'free', expiresAt: null });
    billingService.purchase.mockResolvedValue({ enabled: true, tier: 'plus', expiresAt: '2027-10-14T00:00:00Z' });
    const onPurchased = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<PlusScreen onTierChange={jest.fn()} onPurchased={onPurchased} onClose={() => {}} />);
    });
    await act(async () => pressable(tree, 'Start Free Trial')!.props.onPress());
    expect(onPurchased).toHaveBeenCalledTimes(1);
    tree.unmount();
  });

  it('does not move on when the purchase did not go through', async () => {
    billingService.status.mockResolvedValue({ enabled: true, tier: 'free', expiresAt: null });
    billingService.purchase.mockResolvedValue({ enabled: true, tier: 'free', expiresAt: null });
    const onPurchased = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<PlusScreen onTierChange={jest.fn()} onPurchased={onPurchased} onClose={() => {}} />);
    });
    await act(async () => pressable(tree, 'Start Free Trial')!.props.onPress());
    expect(onPurchased).not.toHaveBeenCalled();
    tree.unmount();
  });
});

describe('Vitto Plus paywall (App Store)', () => {
  beforeEach(() => jest.clearAllMocks());

  const storePlans = (trialDays: number | null) => [
    { value: 'monthly', label: 'Monthly', price: '£6.99', per: '/ mo', terms: () => '£6.99 / month, renews automatically.' },
    {
      value: 'yearly',
      label: 'Yearly',
      price: '£34.99',
      per: '/ yr',
      note: 'Only £2.91 a month',
      badge: 'SAVE 58%',
      terms: (trial: boolean) => (trial && trialDays ? `Free for ${trialDays} days, then £34.99 / year.` : '£34.99 / year.'),
    },
  ];

  it('sells at the store\'s own prices, with the trial Apple will give and no switch for it', async () => {
    billingService.status.mockResolvedValue({ enabled: true, mode: 'store', tier: 'free', expiresAt: null, plans: storePlans(7), trialDays: 7 });
    const tree = await open();
    const all = strings(tree);
    expect(all).toContain('£34.99');
    expect(all).toContain('7-day free trial');
    // Apple applies the trial by itself: nothing to toggle, and no test-mode note.
    expect(byTestId(tree, 'trial-toggle')).toHaveLength(0);
    expect(byTestId(tree, 'plus-test-mode')).toHaveLength(0);
    expect(all).toContain('Day 5');
    expect(all).toContain('£34.99 / year, cancel anytime');
    expect(byTestId(tree, 'plus-terms')[0]!.props.children).toBe('Free for 7 days, then £34.99 / year.');
    expect(all).toContain('Terms of Use');
    tree.unmount();
  });

  it('offers no trial to someone who has already had one', async () => {
    billingService.status.mockResolvedValue({ enabled: true, mode: 'store', tier: 'free', expiresAt: null, plans: storePlans(null), trialDays: null });
    const tree = await open();
    expect(strings(tree).some((line) => line.includes('free trial'))).toBe(false);
    expect(byTestId(tree, 'trial-timeline')).toHaveLength(0);
    expect(pressable(tree, 'Start Free Trial')).toBeUndefined();
    expect(pressable(tree, 'Continue')).toBeDefined();
    tree.unmount();
  });

  it('sends a subscriber to manage their subscription rather than cancelling in-app', async () => {
    billingService.status.mockResolvedValue({ enabled: true, mode: 'store', tier: 'plus', expiresAt: '2027-09-30T00:00:00Z' });
    billingService.cancel.mockResolvedValue({ enabled: true, mode: 'store', tier: 'plus', expiresAt: '2027-09-30T00:00:00Z' });
    const tree = await open();
    expect(pressable(tree, 'Cancel Plus')).toBeUndefined();
    await act(async () => pressable(tree, 'Manage subscription')!.props.onPress());
    expect(billingService.cancel).toHaveBeenCalled();
    // Still paid up to the end of the period, so the reminder stays.
    expect(push.cancelTrialReminder).not.toHaveBeenCalled();
    tree.unmount();
  });
});
