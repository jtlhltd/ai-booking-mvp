import test from 'node:test';
import assert from 'node:assert/strict';
import { isOutboundAbReviewPending } from '../../lib/outbound-ab-review-lock.js';

test('isOutboundAbReviewPending: ISO string', () => {
  assert.equal(isOutboundAbReviewPending({ outboundAbReviewPending: '2026-01-01T00:00:00.000Z' }), true);
});

test('isOutboundAbReviewPending: empty clears', () => {
  assert.equal(isOutboundAbReviewPending({ outboundAbReviewPending: '' }), false);
  assert.equal(isOutboundAbReviewPending({ outboundAbReviewPending: 'false' }), false);
  assert.equal(isOutboundAbReviewPending({}), false);
});
