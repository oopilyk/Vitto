import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { PlusScreen } from '../screens/PlusScreen';

jest.mock('../services/billingService', () => {
  const actual = jest.requireActual('../services/billingService');
  return {
    ...actual,
    billingService: { status: jest.fn(), purchase: jest.fn(), cancel: jest.fn() },
  };
});
const { billingService } = jest.requireMock('../services/billingService') as {
  billingService: Record<'status' | 'purchase' | 'cancel', jest.Mock>;
};

const strings = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map((n) => [n.props.children].flat().filter((c) => typeof c === 'string').join(''));

const pressable = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root
    .findAll((n) => typeof n.props.onPress === 'function')
    .find((n) => n.findAllByType(Text).some((t) => [t.props.children].flat().join('').startsWith(label)));

const open = async (onTierChange = jest.fn()) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<PlusScreen petName="Blue" onTierChange={onTierChange} onClose={() => {}} />);
  });
  return tree;
};

describe('Vitto Plus (test mode)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sells Plus in test mode and unlocks it straight away', async () => {
    billingService.status.mockResolvedValue({ enabled: true, tier: 'free', expiresAt: null });
    billingService.purchase.mockResolvedValue({ enabled: true, tier: 'plus', expiresAt: '2027-09-30T00:00:00Z' });
    const onTierChange = jest.fn();
    const tree = await open(onTierChange);
    expect(strings(tree)).toContain('Personalities');
    expect(tree.root.findAllByProps({ testID: 'plus-test-mode' }).length).toBeGreaterThan(0);

    await act(async () => pressable(tree, 'Start Plus')!.props.onPress());
    expect(billingService.purchase).toHaveBeenCalledWith('yearly');
    expect(onTierChange).toHaveBeenCalledWith('plus');
    expect(tree.root.findAllByProps({ testID: 'plus-active' }).length).toBeGreaterThan(0);
    tree.unmount();
  });

  it('lets a subscriber cancel back to free', async () => {
    billingService.status.mockResolvedValue({ enabled: true, tier: 'plus', expiresAt: '2027-09-30T00:00:00Z' });
    billingService.cancel.mockResolvedValue({ enabled: true, tier: 'free', expiresAt: null });
    const onTierChange = jest.fn();
    const tree = await open(onTierChange);
    await act(async () => pressable(tree, 'Cancel Plus')!.props.onPress());
    expect(onTierChange).toHaveBeenCalledWith('free');
    tree.unmount();
  });

  it('sells nothing when test purchases are switched off', async () => {
    billingService.status.mockResolvedValue({ enabled: false, tier: 'free', expiresAt: null });
    const tree = await open();
    expect(strings(tree)).toContain("Plus isn't available to buy yet.");
    expect(pressable(tree, 'Start Plus')).toBeUndefined();
    tree.unmount();
  });
});
