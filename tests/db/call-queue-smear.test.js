import { describe, test, expect } from '@jest/globals';

import { smearCallQueueScheduledFor } from '../../db/call-queue-smear.js';

describe('db/call-queue-smear', () => {
  test('returns same Date when timestamp is not on whole second', () => {
    const d = new Date('2024-06-01T12:00:00.500Z');
    const out = smearCallQueueScheduledFor(d, 'c1', '+1', 99);
    expect(out.getTime()).toBe(d.getTime());
  });

  test('returns input when invalid date', () => {
    const out = smearCallQueueScheduledFor('not-a-date', 'c1', '+1', null);
    expect(Number.isNaN(out.getTime())).toBe(true);
  });

  test('smears exact second boundary deterministically', () => {
    const base = new Date('2024-06-01T12:00:00.000Z');
    const out = smearCallQueueScheduledFor(base, 'acme', '+447700900000', 42);
    expect(out.getTime()).toBeGreaterThan(base.getTime());
    expect(out.getTime() - base.getTime()).toBeLessThanOrEqual(999);
    const out2 = smearCallQueueScheduledFor(base, 'acme', '+447700900000', 42);
    expect(out2.getTime()).toBe(out.getTime());
  });
});
