import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('consumer webhook + logistics flag canaries', () => {
  const prevLogistics = process.env.LOGISTICS_SHEET_WRITES_IN_CORE;

  afterEach(() => {
    if (prevLogistics === undefined) delete process.env.LOGISTICS_SHEET_WRITES_IN_CORE;
    else process.env.LOGISTICS_SHEET_WRITES_IN_CORE = prevLogistics;
    jest.resetModules();
  });

  test('isLogisticsSheetWritesInCoreEnabled defaults false', async () => {
    delete process.env.LOGISTICS_SHEET_WRITES_IN_CORE;
    const { isLogisticsSheetWritesInCoreEnabled } = await import('../../lib/logistics-sheet-writes-in-core.js');
    expect(isLogisticsSheetWritesInCoreEnabled('any')).toBe(false);
  });

  test('isLogisticsSheetWritesInCoreEnabled true when env 1', async () => {
    process.env.LOGISTICS_SHEET_WRITES_IN_CORE = '1';
    const { isLogisticsSheetWritesInCoreEnabled } = await import('../../lib/logistics-sheet-writes-in-core.js');
    expect(isLogisticsSheetWritesInCoreEnabled('d2d-xpress-tom')).toBe(true);
  });

  test('isLogisticsSheetWritesInCoreEnabled false when env 0', async () => {
    process.env.LOGISTICS_SHEET_WRITES_IN_CORE = '0';
    const { isLogisticsSheetWritesInCoreEnabled } = await import('../../lib/logistics-sheet-writes-in-core.js');
    expect(isLogisticsSheetWritesInCoreEnabled('d2d-xpress-tom')).toBe(false);
  });

  test('buildCallCompletedEnvelope omits internal client_key', async () => {
    const { buildCallCompletedEnvelope } = await import('../../lib/consumer-webhook-emitter.js');
    const env = buildCallCompletedEnvelope({
      tenantDisplayName: 'D2D Xpress',
      call: { id: 'c1', leadPhone: '+441234' },
      qualification: { summary: 'test' },
    });
    expect(env.type).toBe('call.completed');
    expect(env.tenant.displayName).toBe('D2D Xpress');
    expect(JSON.stringify(env)).not.toMatch(/d2d-xpress-tom/);
    expect(env.tenant.client_key).toBeUndefined();
  });

  test('scheduleConsumerCallCompletedWebhook schedules async work', async () => {
    const { scheduleConsumerCallCompletedWebhook } = await import('../../lib/consumer-webhook-emitter.js');
    expect(typeof scheduleConsumerCallCompletedWebhook).toBe('function');
    expect(() => {
      scheduleConsumerCallCompletedWebhook({ clientKey: 'tenant-a', callId: 'call-1', leadPhone: '+441' });
    }).not.toThrow();
  });

  test('parseConsumerWebhookConfig requires url and secret', async () => {
    const { parseConsumerWebhookConfig } = await import('../../lib/consumer-webhook-emitter.js');
    expect(parseConsumerWebhookConfig(null)).toBeNull();
    expect(parseConsumerWebhookConfig({ consumerWebhook: { enabled: true } })).toBeNull();
    const cfg = parseConsumerWebhookConfig({
      consumerWebhook: { url: 'https://example.com/hook', secret: 's', enabled: true },
    });
    expect(cfg?.url).toBe('https://example.com/hook');
    expect(cfg?.events).toContain('call.completed');
  });
});
