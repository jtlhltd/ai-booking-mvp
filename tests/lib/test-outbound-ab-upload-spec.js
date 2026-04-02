// tests/lib/test-outbound-ab-upload-spec.js

import { describe, test, assertEqual, assertTrue, printSummary, resetStats } from '../utils/test-helpers.js';
import { parseOutboundAbUploadSpec } from '../../lib/outbound-ab-upload-spec.js';

resetStats();

describe('outbound-ab-upload-spec', () => {
  test('parses array opening variants', () => {
    const j = JSON.stringify([
      { name: 'control', firstMessage: 'Hi A' },
      { name: 'b', value: 'Hi B' }
    ]);
    const r = parseOutboundAbUploadSpec(j, 'opening');
    assertEqual(r.variants.length, 2);
    assertEqual(r.variants[0].firstMessage, 'Hi A');
    assertEqual(r.variants[1].firstMessage, 'Hi B');
  });

  test('parses wrapped object with experimentName', () => {
    const j = JSON.stringify({
      experimentName: 'my_exp',
      variants: [
        { name: 'a', voice: 'v1' },
        { name: 'b', voiceId: 'v2' }
      ]
    });
    const r = parseOutboundAbUploadSpec(j, 'voice');
    assertEqual(r.experimentName, 'my_exp');
    assertEqual(r.variants[0].voice, 'v1');
    assertEqual(r.variants[1].voice, 'v2');
  });

  test('rejects one variant', () => {
    let err;
    try {
      parseOutboundAbUploadSpec(JSON.stringify([{ name: 'only', script: 'x' }]), 'script');
    } catch (e) {
      err = e;
    }
    assertTrue(err && String(err.message).includes('At least two'));
  });
});

const exitCode = printSummary();
process.exit(exitCode);
