import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { DateTime } from 'luxon';

const isUkBankHolidayPublic = jest.fn(() => false);

jest.unstable_mockModule('../../../lib/uk-bank-holidays.js', () => ({
  isUkBankHolidayPublic
}));

describe('business-hours invariants', () => {
  beforeEach(() => {
    isUkBankHolidayPublic.mockClear();
    isUkBankHolidayPublic.mockImplementation(() => false);
    delete process.env.ALLOW_OUTBOUND_WEEKEND_CALLS;
  });

  test('getTenantTimezone prefers tenant.booking.timezone', async () => {
    const { getTenantTimezone } = await import('../../../lib/business-hours.js');
    expect(getTenantTimezone({ booking: { timezone: 'America/New_York' }, timezone: 'Europe/London' })).toBe(
      'America/New_York'
    );
  });

  test('isBusinessHoursForTenant uses tenant timezone and hours/days', async () => {
    const { isBusinessHoursForTenant } = await import('../../../lib/business-hours.js');
    const tenant = { booking: { timezone: 'Europe/London' }, businessHours: { start: 9, end: 17, days: [1] } }; // Monday only

    const monday10 = DateTime.fromISO('2026-04-20T10:00:00', { zone: 'Europe/London' }).toJSDate(); // Mon
    const monday18 = DateTime.fromISO('2026-04-20T18:00:00', { zone: 'Europe/London' }).toJSDate();

    expect(isBusinessHoursForTenant(tenant, monday10)).toBe(true);
    expect(isBusinessHoursForTenant(tenant, monday18)).toBe(false);
  });

  test('outbound dial disallows weekends unless ALLOW_OUTBOUND_WEEKEND_CALLS set', async () => {
    const { isBusinessHoursForTenant } = await import('../../../lib/business-hours.js');
    const tenant = { booking: { timezone: 'Europe/London' }, businessHours: { start: 9, end: 17, days: [0, 6] } };

    const sunday10 = DateTime.fromISO('2026-04-19T10:00:00', { zone: 'Europe/London' }).toJSDate(); // Sun
    expect(isBusinessHoursForTenant(tenant, sunday10, 'Europe/London', { forOutboundDial: true })).toBe(false);

    process.env.ALLOW_OUTBOUND_WEEKEND_CALLS = '1';
    expect(isBusinessHoursForTenant(tenant, sunday10, 'Europe/London', { forOutboundDial: true })).toBe(true);
  });

  test('UK bank holiday forces closed', async () => {
    const { isBusinessHoursForTenant } = await import('../../../lib/business-hours.js');
    const tenant = { booking: { timezone: 'Europe/London' } };
    isUkBankHolidayPublic.mockImplementation(() => true);

    const t = DateTime.fromISO('2026-12-25T10:00:00', { zone: 'Europe/London' }).toJSDate();
    expect(isBusinessHoursForTenant(tenant, t)).toBe(false);
  });

  test('clampOutboundDialToAllowedWindow returns next business open when closed', async () => {
    const { clampOutboundDialToAllowedWindow, isBusinessHoursForTenant } = await import(
      '../../../lib/business-hours.js'
    );
    const tenant = { booking: { timezone: 'Europe/London' }, businessHours: { start: 9, end: 17, days: [1, 2, 3, 4, 5] } };

    const sundayNoon = DateTime.fromISO('2026-04-19T12:00:00', { zone: 'Europe/London' }).toJSDate(); // Sun
    const clamped = clampOutboundDialToAllowedWindow(tenant, sundayNoon);

    expect(clamped).toBeInstanceOf(Date);
    expect(isBusinessHoursForTenant(tenant, clamped, 'Europe/London', { forOutboundDial: true })).toBe(true);
  });

  test('computeSameWeekWeekdayFollowUpSlots never returns same calendar day as failure', async () => {
    const { computeSameWeekWeekdayFollowUpSlots } = await import('../../../lib/business-hours.js');
    const tenant = { booking: { timezone: 'Europe/London' }, businessHours: { start: 9, end: 17, days: [1, 2, 3, 4, 5] } };

    const fail = DateTime.fromISO('2026-04-20T16:30:00', { zone: 'Europe/London' }); // Monday
    const slots = computeSameWeekWeekdayFollowUpSlots(tenant, fail.toJSDate());
    expect(slots.length).toBeGreaterThan(0);

    const first = DateTime.fromJSDate(slots[0], { zone: 'Europe/London' }).toFormat('yyyy-LL-dd');
    const failDay = fail.toFormat('yyyy-LL-dd');
    expect(first).not.toBe(failDay);
  });
});

