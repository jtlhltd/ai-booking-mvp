import { describe, expect, test } from '@jest/globals';

import { isOutboundAbReviewPending } from '../../../lib/outbound-ab-review-lock.js';

describe('outbound-ab-review-lock', () => {
  test('isOutboundAbReviewPending: ISO string is pending', () => {
    expect(isOutboundAbReviewPending({ outboundAbReviewPending: '2026-01-01T00:00:00.000Z' })).toBe(true);
  });

  test('isOutboundAbReviewPending: empty and falsey strings clear', () => {
    expect(isOutboundAbReviewPending({ outboundAbReviewPending: '' })).toBe(false);
    expect(isOutboundAbReviewPending({ outboundAbReviewPending: 'false' })).toBe(false);
    expect(isOutboundAbReviewPending({ outboundAbReviewPending: '0' })).toBe(false);
    expect(isOutboundAbReviewPending({})).toBe(false);
  });

  test('isOutboundAbReviewPending: non-object input is not pending', () => {
    expect(isOutboundAbReviewPending(null)).toBe(false);
    expect(isOutboundAbReviewPending(undefined)).toBe(false);
    expect(isOutboundAbReviewPending('x')).toBe(false);
  });
});

