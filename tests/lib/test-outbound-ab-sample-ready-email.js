import test from 'node:test';
import assert from 'node:assert/strict';
import {
  experimentMeetsSampleThreshold,
  parseMinSamplesPerVariant,
  resolveSampleReadyNotifyEmail,
  getSampleReadyNotifiedMap
} from '../../lib/outbound-ab-sample-ready-rules.js';

test('experimentMeetsSampleThreshold: two arms both >= N', () => {
  assert.equal(
    experimentMeetsSampleThreshold(
      {
        hasDbVariants: true,
        variants: [
          { variantName: 'a', totalLeads: 30, convertedLeads: 3 },
          { variantName: 'b', totalLeads: 31, convertedLeads: 5 }
        ]
      },
      30
    ),
    true
  );
});

test('experimentMeetsSampleThreshold: one arm short', () => {
  assert.equal(
    experimentMeetsSampleThreshold(
      {
        hasDbVariants: true,
        variants: [
          { variantName: 'a', totalLeads: 30, convertedLeads: 0 },
          { variantName: 'b', totalLeads: 10, convertedLeads: 0 }
        ]
      },
      30
    ),
    false
  );
});

test('parseMinSamplesPerVariant: vapi and default', () => {
  assert.equal(parseMinSamplesPerVariant({ outboundAbMinSamplesPerVariant: '50' }), 50);
  assert.equal(parseMinSamplesPerVariant({ outboundAbMinSamplesPerVariant: '1' }), 30);
  assert.equal(parseMinSamplesPerVariant({}), 30);
});

test('resolveSampleReadyNotifyEmail: vapi wins', () => {
  assert.equal(resolveSampleReadyNotifyEmail({ outboundAbSampleReadyEmail: 'a@b.c' }), 'a@b.c');
});

test('getSampleReadyNotifiedMap: nested object or JSON string', () => {
  assert.deepEqual(getSampleReadyNotifiedMap({}), {});
  assert.deepEqual(getSampleReadyNotifiedMap({ outboundAbSampleReadyNotified: { x: '1' } }), { x: '1' });
  assert.deepEqual(getSampleReadyNotifiedMap({ outboundAbSampleReadyNotified: '{"y":"2"}' }), { y: '2' });
});
