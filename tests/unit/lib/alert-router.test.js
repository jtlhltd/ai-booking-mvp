import { describe, test, beforeEach, jest, expect } from '@jest/globals';

const sendEmail = jest.fn(async () => ({}));

jest.unstable_mockModule('../../../lib/messaging-service.js', () => ({
  default: {
    emailTransporter: {},
    sendEmail,
  },
}));

describe('alert-router', () => {
  beforeEach(async () => {
    jest.resetModules();
    sendEmail.mockClear();
    delete process.env.ALERTS_SUPPRESSED;
    delete process.env.MAINTENANCE_MODE;
    process.env.ALERT_CRITICAL_EMAIL = 'critical@example.com';
    process.env.ALERT_WARNING_EMAIL = 'warn@example.com';
    const { _clearMemoryIncidentsForTests } = await import('../../../lib/incidents.js');
    _clearMemoryIncidentsForTests();
  });

  test('resolveAlertEmails routes by severity', async () => {
    const { resolveAlertEmails } = await import('../../../lib/alert-router.js');
    expect(resolveAlertEmails('critical')).toEqual(['critical@example.com']);
    expect(resolveAlertEmails('warning')).toEqual(['warn@example.com']);
    expect(resolveAlertEmails('info')).toEqual([]);
  });

  test('routeAlert sends critical email on first incident', async () => {
    const { routeAlert } = await import('../../../lib/alert-router.js');
    const r = await routeAlert({
      severity: 'critical',
      title: 'Pool exhausted',
      message: 'connections maxed',
      dedupeKey: 'pool:exhausted',
      source: 'test',
    });
    expect(r.sent).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toContain('critical@example.com');
  });

  test('routeAlert throttles duplicate warnings', async () => {
    const { routeAlert } = await import('../../../lib/alert-router.js');
    await routeAlert({
      severity: 'warning',
      title: 'Import lag',
      message: 'slow',
      dedupeKey: 'import:lag',
      source: 'test',
      throttleMinutes: 60,
    });
    sendEmail.mockClear();
    const second = await routeAlert({
      severity: 'warning',
      title: 'Import lag',
      message: 'still slow',
      dedupeKey: 'import:lag',
      source: 'test',
      throttleMinutes: 60,
    });
    expect(second.sent).toBe(false);
    expect(second.reason).toBe('incident_throttled');
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
