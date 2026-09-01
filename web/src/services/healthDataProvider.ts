import type { HealthEvent, StepMetadata } from '@vitto/core';

export interface HealthDataProvider {
  getTodaySteps(userId: string): Promise<HealthEvent<StepMetadata>>;
}

export class MockHealthDataProvider implements HealthDataProvider {
  async getTodaySteps(userId: string): Promise<HealthEvent<StepMetadata>> {
    return {
      id: crypto.randomUUID(),
      userId,
      occurredAt: new Date().toISOString(),
      type: 'STEP_ACTIVITY',
      source: 'mock',
      metadata: { steps: 6840 },
    };
  }
}
