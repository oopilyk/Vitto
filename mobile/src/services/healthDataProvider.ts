import type { HealthEvent, StepMetadata } from '../domain/health';
import { newId } from '../domain/ids';

export interface HealthDataProvider {
  getTodaySteps(userId: string): Promise<HealthEvent<StepMetadata>>;
}

/**
 * Still a mock, exactly as on the web. Real steps need HealthKit / Health Connect,
 * which require a custom dev client rather than Expo Go — see README.
 */
export class MockHealthDataProvider implements HealthDataProvider {
  async getTodaySteps(userId: string): Promise<HealthEvent<StepMetadata>> {
    return {
      id: newId(),
      userId,
      occurredAt: new Date().toISOString(),
      type: 'STEP_ACTIVITY',
      source: 'mock',
      metadata: { steps: 6840 },
    };
  }
}
