import { describe, expect, test, jest, beforeEach } from '@jest/globals';

describe('lib/server-queue-workers-shared', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('isBusinessHours delegates to isBusinessHoursForTenant', async () => {
    const mockBh = jest.fn().mockReturnValue(true);
    jest.unstable_mockModule('../../../lib/business-hours.js', () => ({
      isBusinessHoursForTenant: mockBh,
      getNextBusinessOpenForTenant: jest.fn(() => new Date())
    }));
    jest.unstable_mockModule('../../../lib/timezone-resolver.js', () => ({
      resolveTenantTimezone: jest.fn(() => 'Europe/London')
    }));
    const mod = await import('../../../lib/server-queue-workers-shared.js');
    const tenant = { booking: { timezone: 'UTC' } };
    expect(mod.isBusinessHours(tenant)).toBe(true);
    expect(mockBh).toHaveBeenCalledWith(tenant, expect.any(Date), 'UTC', { forOutboundDial: true });
  });

  test('pickTimezone uses resolveTenantTimezone', async () => {
    const resolveTenantTimezone = jest.fn(() => 'America/New_York');
    jest.unstable_mockModule('../../../lib/business-hours.js', () => ({
      isBusinessHoursForTenant: jest.fn(),
      getNextBusinessOpenForTenant: jest.fn(() => new Date())
    }));
    jest.unstable_mockModule('../../../lib/timezone-resolver.js', () => ({
      resolveTenantTimezone
    }));
    const mod = await import('../../../lib/server-queue-workers-shared.js');
    mod.pickTimezone({ clientKey: 'x' });
    expect(resolveTenantTimezone).toHaveBeenCalledWith({ clientKey: 'x' }, mod.TIMEZONE);
  });
});
