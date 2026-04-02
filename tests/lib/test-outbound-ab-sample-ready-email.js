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

test('resolveSampleReadyNotifyEmail: YOUR_EMAIL', () => {
  const prev = process.env.YOUR_EMAIL;
  process.env.YOUR_EMAIL = 'me@render.app';
  try {
    assert.equal(resolveSampleReadyNotifyEmail({ outboundAbSampleReadyEmail: 'tenant@x.com' }), 'me@render.app');
  } finally {
    if (prev === undefined) delete process.env.YOUR_EMAIL;
    else process.env.YOUR_EMAIL = prev;
  }
});

test('resolveSampleReadyNotifyEmail: vapi fallback when YOUR_EMAIL unset', () => {
  const prev = process.env.YOUR_EMAIL;
  delete process.env.YOUR_EMAIL;
  try {
    assert.equal(resolveSampleReadyNotifyEmail({ outboundAbSampleReadyEmail: 'a@b.c' }), 'a@b.c');
  } finally {
    if (prev !== undefined) process.env.YOUR_EMAIL = prev;
  }
});

test('getSampleReadyNotifiedMap: nested object or JSON string', () => {
  assert.deepEqual(getSampleReadyNotifiedMap({}), {});
  assert.deepEqual(getSampleReadyNotifiedMap({ outboundAbSampleReadyNotified: { x: '1' } }), { x: '1' });
  assert.deepEqual(getSampleReadyNotifiedMap({ outboundAbSampleReadyNotified: '{"y":"2"}' }), { y: '2' });
});
