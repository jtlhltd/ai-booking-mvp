/**
 * Canary for Intent Contract: scheduling.no-past-scheduled-for
 *
 * scheduleAtOptimalCallWindow is the single point where every enqueued dial
 * picks a scheduled_for instant. A past Date here defeats every other
 * distribution gate: a row with scheduled_for in the past is dialed
 * immediately, which means a regression here turns into a burst.
 *
 * Asserts that for any reasonable tenant + baseline, the returned Date is
 * never strictly earlier than the baseline.
 */
import { describe, expect, test } from '@jest/globals';

import { scheduleAtOptimalCallWindow } from '../../lib/optimal-call-window.js';

const tenants = [
  // Standard 9-17 weekday tenant
  {
    label: 'standard 9-17 weekday',
    tenant: {
      booking: { timezone: 'Europe/London' },
      hoursJson: { mon: { open: '09:00', close: '17:00' } }
    }
  },
  // No business hours config — falls back to defaults
  {
    label: 'no business-hours config',
    tenant: { booking: { timezone: 'Europe/London' } }
  },
  // Different timezone
  {
    label: 'New York timezone',
    tenant: { booking: { timezone: 'America/New_York' } }
  }
];

const baselines = [
  { label: 'now', when: () => new Date() },
  { label: 'next Monday 09:00 UTC', when: () => new Date('2030-06-03T09:00:00Z') },
  { label: 'Saturday afternoon', when: () => new Date('2030-06-01T14:00:00Z') },
  { label: 'past noon today', when: () => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  } }
];

describe('canary: scheduling.no-past-scheduled-for', () => {
  for (const t of tenants) {
    for (const b of baselines) {
      test(`scheduleAtOptimalCallWindow(${t.label}, ${b.label}) never returns a Date in the past`, async () => {
        const baseline = b.when();
        const chosen = await scheduleAtOptimalCallWindow(t.tenant, null, baseline, {
          fallbackTz: 'Europe/London',
          jitterKey: `canary:${t.label}:${b.label}`
        });

        expect(chosen).toBeInstanceOf(Date);
        expect(Number.isFinite(chosen.getTime())).toBe(true);

        // The whole point of this canary: never schedule earlier than the baseline.
        // Allow a tiny millisecond tolerance for floating clock comparisons (none expected).
        expect(chosen.getTime()).toBeGreaterThanOrEqual(baseline.getTime() - 1);
      });
    }
  }

  test('scheduleAtOptimalCallWindow never returns a Date in the past relative to NOW (baseline = now)', async () => {
    const before = Date.now();
    const chosen = await scheduleAtOptimalCallWindow(
      { booking: { timezone: 'Europe/London' } },
      null,
      new Date(before),
      { fallbackTz: 'Europe/London', jitterKey: 'canary:relative-now' }
    );
    expect(chosen).toBeInstanceOf(Date);
    expect(chosen.getTime()).toBeGreaterThanOrEqual(before - 1);
  });
});
