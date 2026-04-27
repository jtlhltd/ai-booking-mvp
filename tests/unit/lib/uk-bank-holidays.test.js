import { describe, expect, test } from '@jest/globals';
import { DateTime } from 'luxon';

const ukTenant = {
  booking: { timezone: 'Europe/London' },
  businessHours: { start: 9, end: 17, days: [1, 2, 3, 4, 5] }
};
const usTenant = {
  booking: { timezone: 'America/New_York' },
  businessHours: { start: 9, end: 17, days: [1, 2, 3, 4, 5] }
};

describe('lib/uk-bank-holidays', () => {
  test('London tenant uses ENG calendar', async () => {
    const { ukBankHolidaySubdivForTenant } = await import('../../../lib/uk-bank-holidays.js');
    expect(ukBankHolidaySubdivForTenant(ukTenant)).toBe('ENG');
  });

  test('US tenant skips UK calendar', async () => {
    const { ukBankHolidaySubdivForTenant } = await import('../../../lib/uk-bank-holidays.js');
    expect(ukBankHolidaySubdivForTenant(usTenant)).toBeNull();
  });

  test('Good Friday 2026 is a public holiday (London)', async () => {
    const { isUkBankHolidayPublic } = await import('../../../lib/uk-bank-holidays.js');
    const d = new Date('2026-04-03T12:00:00');
    expect(isUkBankHolidayPublic(ukTenant, d)).toBe(true);
  });

  test('Plain Tuesday 2026 is not a UK public holiday', async () => {
    const { isUkBankHolidayPublic } = await import('../../../lib/uk-bank-holidays.js');
    const d = new Date('2026-04-07T12:00:00');
    expect(isUkBankHolidayPublic(ukTenant, d)).toBeFalsy();
  });

  test('US tenant never sees UK holidays', async () => {
    const { isUkBankHolidayPublic } = await import('../../../lib/uk-bank-holidays.js');
    const d = new Date('2026-04-03T12:00:00');
    expect(isUkBankHolidayPublic(usTenant, d)).toBeFalsy();
  });
});

describe('lib/business-hours follow-up slots respect bank holidays', () => {
  test('skips Good Friday in same-week slots', async () => {
    const { computeSameWeekWeekdayFollowUpSlots } = await import('../../../lib/business-hours.js');
    // Wed 2026-04-01 → Thu 2026-04-02 ok, Fri 2026-04-03 is Good Friday (skip)
    const from = new Date('2026-04-01T16:00:00');
    const slots = computeSameWeekWeekdayFollowUpSlots(ukTenant, from, 'Europe/London');
    const ymds = slots.map((s) => DateTime.fromJSDate(s, { zone: 'Europe/London' }).toFormat('yyyy-LL-dd'));
    expect(ymds).not.toContain('2026-04-03');
    expect(ymds).toContain('2026-04-02');
  });
});
