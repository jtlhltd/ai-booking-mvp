// tests/unit/test-uk-bank-holidays.js
import {
  ukBankHolidaySubdivForTenant,
  isUkBankHolidayPublic
} from '../../lib/uk-bank-holidays.js';
import { computeSameWeekWeekdayFollowUpSlots } from '../../lib/business-hours.js';
import { DateTime } from 'luxon';
import { describe, test, assertTrue, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';

resetStats();

const ukTenant = { booking: { timezone: 'Europe/London' }, businessHours: { start: 9, end: 17, days: [1, 2, 3, 4, 5] } };
const usTenant = { booking: { timezone: 'America/New_York' }, businessHours: { start: 9, end: 17, days: [1, 2, 3, 4, 5] } };

describe('UK bank holidays', () => {
  test('London tenant uses ENG calendar', () => {
    assertEqual(ukBankHolidaySubdivForTenant(ukTenant), 'ENG');
  });

  test('US tenant skips UK calendar', () => {
    assertEqual(ukBankHolidaySubdivForTenant(usTenant), null);
  });

  test('Good Friday 2026 is a public holiday (London)', () => {
    const d = new Date('2026-04-03T12:00:00');
    assertTrue(isUkBankHolidayPublic(ukTenant, d), '2026-04-03 Good Friday');
  });

  test('Plain Tuesday 2026 is not a UK public holiday', () => {
    const d = new Date('2026-04-07T12:00:00');
    assertTrue(!isUkBankHolidayPublic(ukTenant, d), '2026-04-07');
  });

  test('US tenant never UK holiday', () => {
    const d = new Date('2026-04-03T12:00:00');
    assertTrue(!isUkBankHolidayPublic(usTenant, d));
  });

  test('Follow-up slots skip Good Friday same week', () => {
    // Wed 2026-04-01 → Thu 2026-04-02 ok, Fri 2026-04-03 is Good Friday (skip)
    const from = new Date('2026-04-01T16:00:00');
    const slots = computeSameWeekWeekdayFollowUpSlots(ukTenant, from, 'Europe/London');
    const ymds = slots.map((s) => DateTime.fromJSDate(s, { zone: 'Europe/London' }).toFormat('yyyy-LL-dd'));
    assertTrue(!ymds.includes('2026-04-03'), `should not dial on bank holiday: ${ymds.join(',')}`);
    assertTrue(ymds.includes('2026-04-02'), `expected Thu slot: ${ymds.join(',')}`);
  });
});

const exitCode = printSummary();
process.exit(exitCode);
