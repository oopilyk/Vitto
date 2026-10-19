import { Platform } from 'react-native';

const mockStatus = jest.fn();
const mockRequest = jest.fn();
const mockStats = jest.fn();
jest.mock('@kingstinct/react-native-healthkit', () => ({
  getRequestStatusForAuthorization: (...args: unknown[]) => mockStatus(...args),
  requestAuthorization: (...args: unknown[]) => mockRequest(...args),
  queryStatisticsForQuantity: (...args: unknown[]) => mockStats(...args),
  isHealthDataAvailableAsync: async () => true,
  queryWorkoutSamples: jest.fn(),
  queryQuantitySamples: jest.fn(),
  queryCategorySamples: jest.fn(),
}));

import { HealthKitProvider } from '../services/healthKitProvider';

describe('HealthKitProvider: steps keep syncing', () => {
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    mockStatus.mockReset();
    mockRequest.mockReset().mockResolvedValue(true);
    mockStats.mockReset().mockResolvedValue({ sumQuantity: { quantity: 6400 } });
  });

  it('reconnects on launch when steps were answered, even after an update added new types', async () => {
    mockStatus.mockResolvedValue(2);
    expect(await new HealthKitProvider().restoreAuthorization()).toBe(true);
    // Asked about steps alone: asking about every type said "not asked yet"
    // as soon as an update added one, and syncing silently stopped.
    expect(mockStatus).toHaveBeenCalledWith({ toRead: ['HKQuantityTypeIdentifierStepCount'] });
  });

  it('leaves someone who never connected alone', async () => {
    mockStatus.mockResolvedValue(1);
    expect(await new HealthKitProvider().restoreAuthorization()).toBe(false);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("connects first when asked for today's steps, the way the old Sync steps button did", async () => {
    const event = await new HealthKitProvider().getTodaySteps('user-1');
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(event.metadata.steps).toBe(6400);
  });
});
