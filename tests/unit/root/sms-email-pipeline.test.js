import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetModules();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('sms-email-pipeline', () => {
  test('constructor starts retry scheduler but can be stopped', async () => {
    const { default: SMSEmailPipeline } = await import('../../../sms-email-pipeline.js');
    const pipeline = new SMSEmailPipeline(null);
    expect(typeof pipeline.stopRetryScheduler).toBe('function');
    pipeline.stopRetryScheduler();
  });

  test('getStats returns zeros with no leads', async () => {
    const { default: SMSEmailPipeline } = await import('../../../sms-email-pipeline.js');
    const pipeline = new SMSEmailPipeline(null);
    pipeline.stopRetryScheduler();
    expect(pipeline.getStats()).toEqual(
      expect.objectContaining({
        totalLeads: 0,
        waitingForEmail: 0,
        emailReceived: 0,
        booked: 0,
        conversionRate: 0
      })
    );
  });
});

