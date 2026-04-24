import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetModules();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('lib/monitoring', () => {
  test('MetricsCollector.trackRequest increments counters and endpoint metrics', async () => {
    const { MetricsCollector } = await import('../../../lib/monitoring.js');
    const mc = new MetricsCollector();

    mc.trackRequest('/x', 'GET', 200, 123);
    mc.trackRequest('/x', 'GET', 500, 50);

    const m = mc.getMetrics();
    expect(m.requests.total).toBe(2);
    expect(m.requests.successful).toBe(1);
    expect(m.requests.failed).toBe(1);
    expect(m.requests.byEndpoint.get('GET /x').total).toBe(2);
    expect(m.requests.byStatusCode.get(200)).toBe(1);
    expect(m.requests.byStatusCode.get(500)).toBe(1);
  });

  test('AlertManager.triggerAlert stores alert and can acknowledge it', async () => {
    const { AlertManager } = await import('../../../lib/monitoring.js');
    const am = new AlertManager();
    const a = am.triggerAlert('t', 'm', 'warning');
    expect(am.getActiveAlerts().length).toBe(1);
    am.acknowledgeAlert(a.id);
    expect(am.getActiveAlerts().length).toBe(0);
  });

  test('HealthCheckManager.runCheck sets healthy/unhealthy', async () => {
    const { HealthCheckManager } = await import('../../../lib/monitoring.js');
    const hm = new HealthCheckManager();
    hm.register('ok', async () => {}, { timeout: 50 });
    hm.register(
      'bad',
      async () => {
        throw new Error('nope');
      },
      { timeout: 50, critical: true }
    );

    await hm.runCheck('ok');
    await hm.runCheck('bad');
    const overall = hm.getOverallHealth();
    expect(overall.totalCount).toBe(2);
    expect(overall.criticalIssues).toBe(1);
  });

  test('singleton getters return same instances', async () => {
    const { getMetricsCollector, getAlertManager } = await import('../../../lib/monitoring.js');
    expect(getMetricsCollector()).toBe(getMetricsCollector());
    expect(getAlertManager()).toBe(getAlertManager());
  });
});

