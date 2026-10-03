/**
 * The App Store path of billingService, with RevenueCat and the `billing`
 * function stood in for. The module reads its store key once, at load, so each
 * test loads a fresh copy with the key set.
 */

const mockInvoke = jest.fn();
jest.mock('../services/supabaseClient', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'user-1' } } } }) },
  },
}));

const product = (identifier: string, price: number, priceString: string, extra: object = {}) => ({
  identifier,
  price,
  priceString,
  pricePerMonthString: null,
  introPrice: null,
  ...extra,
});

const mockPurchases = {
  configure: jest.fn(),
  logIn: jest.fn(() => Promise.resolve()),
  logOut: jest.fn(() => Promise.resolve()),
  getOfferings: jest.fn(),
  purchasePackage: jest.fn(() => Promise.resolve()),
  restorePurchases: jest.fn(() => Promise.resolve()),
  showManageSubscriptions: jest.fn(() => Promise.resolve()),
  checkTrialOrIntroductoryPriceEligibility: jest.fn(),
  INTRO_ELIGIBILITY_STATUS: { INTRO_ELIGIBILITY_STATUS_ELIGIBLE: 2, INTRO_ELIGIBILITY_STATUS_INELIGIBLE: 1 },
  PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: '1' },
};
jest.mock('react-native-purchases', () => ({ __esModule: true, default: mockPurchases }), { virtual: true });

const server = (body: object) => ({ data: { enabled: false, store: true, tier: 'free', expiresAt: null, ...body }, error: null });

const offerings = (withTrial: boolean) => ({
  current: {
    monthly: { product: product('plus_monthly', 7.99, '$7.99') },
    annual: {
      product: product('plus_yearly', 39.99, '$39.99', {
        pricePerMonthString: '$3.33',
        introPrice: withTrial ? { price: 0, periodUnit: 'DAY', periodNumberOfUnits: 7, cycles: 1 } : null,
      }),
    },
  },
});

const load = () => {
  let loaded!: typeof import('../services/billingService');
  jest.isolateModules(() => {
    loaded = require('../services/billingService');
  });
  return loaded.billingService;
};

describe('billingService on the App Store', () => {
  const original = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = 'appl_test';
  });
  afterAll(() => {
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = original;
  });

  it('sells at the store prices, signed in as the Supabase user, with the trial they can get', async () => {
    mockInvoke.mockResolvedValue(server({}));
    mockPurchases.getOfferings.mockResolvedValue(offerings(true));
    mockPurchases.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({ plus_yearly: { status: 2 } });

    const status = await load().status();

    expect(mockPurchases.configure).toHaveBeenCalledWith({ apiKey: 'appl_test', appUserID: 'user-1' });
    expect(status).toMatchObject({ enabled: true, mode: 'store', trialDays: 7 });
    const yearly = status.plans!.find((plan) => plan.value === 'yearly')!;
    expect(yearly.price).toBe('$39.99');
    expect(yearly.note).toBe('Only $3.33 a month');
    expect(yearly.badge).toBe('SAVE 58%');
    expect(yearly.terms(true)).toContain('Free for 7 days, then $39.99 / year');
  });

  it('offers no trial to someone Apple says has had one', async () => {
    mockInvoke.mockResolvedValue(server({}));
    mockPurchases.getOfferings.mockResolvedValue(offerings(true));
    mockPurchases.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({ plus_yearly: { status: 1 } });
    expect((await load().status()).trialDays).toBeNull();
  });

  it('says Plus is not for sale while the store has no products', async () => {
    mockInvoke.mockResolvedValue(server({}));
    mockPurchases.getOfferings.mockResolvedValue({ current: null });
    expect((await load().status()).enabled).toBe(false);
  });

  it('buys through the store, then has the server verify it', async () => {
    mockInvoke.mockImplementation((_name: string, { body }: { body: { action: string } }) =>
      Promise.resolve(server(body.action === 'sync' ? { tier: 'plus', expiresAt: '2027-10-02T00:00:00Z' } : {})),
    );
    mockPurchases.getOfferings.mockResolvedValue(offerings(false));

    const status = await load().purchase('yearly');

    expect(mockPurchases.purchasePackage).toHaveBeenCalledWith(offerings(false).current.annual);
    expect(mockInvoke).toHaveBeenCalledWith('billing', { body: { action: 'sync' } });
    expect(status.tier).toBe('plus');
  });

  it('treats backing out of Apple\'s sheet as nothing happening, not an error', async () => {
    mockInvoke.mockResolvedValue(server({}));
    mockPurchases.getOfferings.mockResolvedValue(offerings(false));
    mockPurchases.purchasePackage.mockRejectedValueOnce({ code: '1', userCancelled: true });

    const status = await load().purchase('monthly');

    expect(status.tier).toBe('free');
    expect(mockInvoke).not.toHaveBeenCalledWith('billing', { body: { action: 'sync' } });
  });

  it('restores through the store and re-verifies', async () => {
    mockInvoke.mockResolvedValue(server({}));
    mockPurchases.getOfferings.mockResolvedValue(offerings(false));
    await load().restore();
    expect(mockPurchases.restorePurchases).toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalledWith('billing', { body: { action: 'sync' } });
  });

  it('falls back to test purchases when the server cannot verify store ones', async () => {
    mockInvoke.mockResolvedValue(server({ enabled: true, store: false }));
    const service = load();
    expect(await service.status()).toMatchObject({ enabled: true, mode: 'test' });
    await service.purchase('yearly', true);
    expect(mockInvoke).toHaveBeenCalledWith('billing', { body: { action: 'purchase', plan: 'yearly', trial: true } });
    expect(mockPurchases.purchasePackage).not.toHaveBeenCalled();
  });
});
