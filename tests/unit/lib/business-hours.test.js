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

  test('boundary: exactly at opening is allowed; exactly at closing is not', async () => {
    const { isBusinessHoursForTenant } = await import('../../../lib/business-hours.js');
    const tenant = { booking: { timezone: 'Europe/London' }, businessHours: { start: 9, end: 17, days: [1] } }; // Monday only

    const monday09 = DateTime.fromISO('2026-04-20T09:00:00', { zone: 'Europe/London' }).toJSDate();
    const monday1659 = DateTime.fromISO('2026-04-20T16:59:59', { zone: 'Europe/London' }).toJSDate();
    const monday17 = DateTime.fromISO('2026-04-20T17:00:00', { zone: 'Europe/London' }).toJSDate();

    expect(isBusinessHoursForTenant(tenant, monday09)).toBe(true);
    expect(isBusinessHoursForTenant(tenant, monday1659)).toBe(true);
    expect(isBusinessHoursForTenant(tenant, monday17)).toBe(false);
  });

  test('DST start (Europe/London): business-hours check remains stable across the spring-forward gap', async () => {
    const { isBusinessHoursForTenant } = await import('../../../lib/business-hours.js');
    const tenant = { booking: { timezone: 'Europe/London' }, businessHours: { start: 9, end: 17, days: [0] } }; // Sunday only

    // UK DST starts 2026-03-29: 01:00 -> 02:00 local time.
    const beforeGap = DateTime.fromISO('2026-03-29T00:30:00', { zone: 'Europe/London' }).toJSDate();
    const afterGap = DateTime.fromISO('2026-03-29T02:30:00', { zone: 'Europe/London' }).toJSDate();
    const inHours = DateTime.fromISO('2026-03-29T10:00:00', { zone: 'Europe/London' }).toJSDate();

    expect(isBusinessHoursForTenant(tenant, beforeGap, 'Europe/London', { forOutboundDial: false })).toBe(false);
    expect(isBusinessHoursForTenant(tenant, afterGap, 'Europe/London', { forOutboundDial: false })).toBe(false);
    expect(isBusinessHoursForTenant(tenant, inHours, 'Europe/London', { forOutboundDial: false })).toBe(true);
  });

  test('timezone: does not depend on machine local timezone (America/New_York example)', async () => {
    const { isBusinessHoursForTenant } = await import('../../../lib/business-hours.js');
    const tenant = { booking: { timezone: 'America/New_York' }, businessHours: { start: 9, end: 17, days: [1] } }; // Monday only

    // 2026-04-20 is Monday. 9am NY should be business hours.
    const nyMonday09 = DateTime.fromISO('2026-04-20T09:00:00', { zone: 'America/New_York' }).toJSDate();
    const nyMonday18 = DateTime.fromISO('2026-04-20T18:00:00', { zone: 'America/New_York' }).toJSDate();

    expect(isBusinessHoursForTenant(tenant, nyMonday09)).toBe(true);
    expect(isBusinessHoursForTenant(tenant, nyMonday18)).toBe(false);
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

  test('closedDatesSetForTenant parses closedDatesJson and computeSameWeekWeekdayFollowUpSlots skips closed dates', async () => {
    const { closedDatesSetForTenant, computeSameWeekWeekdayFollowUpSlots } = await import(
      '../../../lib/business-hours.js'
    );
    const tenant = {
      booking: { timezone: 'Europe/London' },
      businessHours: { start: 9, end: 17, days: [1, 2, 3, 4, 5] },
      closedDatesJson: JSON.stringify(['2026-04-21'])
    };

    const set = closedDatesSetForTenant(tenant);
    expect(set.has('2026-04-21')).toBe(true);

    const fail = DateTime.fromISO('2026-04-20T10:00:00', { zone: 'Europe/London' }); // Monday
    const slots = computeSameWeekWeekdayFollowUpSlots(tenant, fail.toJSDate(), 'Europe/London', { maxSteps: 5 });
    const ym = slots.map((d) => DateTime.fromJSDate(d, { zone: 'Europe/London' }).toFormat('yyyy-LL-dd'));
    expect(ym).not.toContain('2026-04-21');
  });

  test('computeSameWeekWeekdayFollowUpSlots skips UK bank holidays', async () => {
    const { computeSameWeekWeekdayFollowUpSlots } = await import('../../../lib/business-hours.js');
    const tenant = {
      booking: { timezone: 'Europe/London' },
      businessHours: { start: 9, end: 17, days: [1, 2, 3, 4, 5] }
    };

    // Treat Tuesday 2026-04-21 as a bank holiday for this test.
    isUkBankHolidayPublic.mockImplementation((_tenant, when) => {
      const d = DateTime.fromJSDate(when, { zone: 'Europe/London' }).toFormat('yyyy-LL-dd');
      return d === '2026-04-21';
    });

    const fail = DateTime.fromISO('2026-04-20T10:00:00', { zone: 'Europe/London' }); // Monday
    const slots = computeSameWeekWeekdayFollowUpSlots(tenant, fail.toJSDate(), 'Europe/London', { maxSteps: 5 });
    const ym = slots.map((d) => DateTime.fromJSDate(d, { zone: 'Europe/London' }).toFormat('yyyy-LL-dd'));
    expect(ym).not.toContain('2026-04-21');
  });
});

