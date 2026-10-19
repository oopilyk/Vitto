import { Platform } from 'react-native';

const mockGet = jest.fn();
const mockRequest = jest.fn();
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGet(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequest(...args),
  getExpoPushTokenAsync: async () => ({ data: 'ExponentPushToken[test]' }),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('../services/companionService', () => ({ companionService: { registerDevice: jest.fn(async () => ({ enabled: true })) } }));

import { registerForPush, setPushEnabled } from '../services/pushService';

// iOS showed its notification prompt mid-onboarding, two screens before the
// step that explains it: registration ran as soon as the pet existed, and asked.
describe('notification permission is asked only when turning notifications on', () => {
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    mockGet.mockReset().mockResolvedValue({ granted: false });
    mockRequest.mockReset().mockResolvedValue({ granted: true });
  });

  it('registers silently on launch, and never puts up the prompt', async () => {
    expect((await registerForPush()).status).toBe('denied');
    expect(mockRequest).not.toHaveBeenCalled();
    mockGet.mockResolvedValue({ granted: true });
    expect((await registerForPush()).status).toBe('ready');
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('asks when the person turns them on, and reports a no', async () => {
    expect(await setPushEnabled(true)).toBe('ready');
    expect(mockRequest).toHaveBeenCalledTimes(1);
    mockRequest.mockResolvedValue({ granted: false });
    expect(await setPushEnabled(true)).toBe('denied');
    // Turning them off never asks.
    mockRequest.mockClear();
    await setPushEnabled(false);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});
