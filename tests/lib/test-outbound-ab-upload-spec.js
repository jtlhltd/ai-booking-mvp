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
    assertTrue(r.controlFromLive === false);
  });

  test('parses wrapped object with experimentName', () => {
    const id0 = '21m00Tcm4TlvDq8ikWAM';
    const id1 = 'pNInz6obpgDQGcFmaJgB';
    const j = JSON.stringify({
      experimentName: 'my_exp',
      variants: [
        { name: 'a', voice: id0 },
        { name: 'b', voiceId: id1 }
      ]
    });
    const r = parseOutboundAbUploadSpec(j, 'voice');
    assertEqual(r.experimentName, 'my_exp');
    assertEqual(r.variants[0].voice, id0);
    assertEqual(r.variants[1].voice, id1);
    assertTrue(r.controlFromLive === false);
  });

  test('single variant defers control to server (live baseline)', () => {
    const r = parseOutboundAbUploadSpec(JSON.stringify([{ name: 'only', script: 'x' }]), 'script');
    assertEqual(r.variants.length, 1);
    assertEqual(r.variants[0].name, 'only');
    assertEqual(r.variants[0].script, 'x');
    assertTrue(r.controlFromLive === true);
  });

  test('parses flat single-value object for script (one row + flag)', () => {
    const r = parseOutboundAbUploadSpec(JSON.stringify({ script: 'one script body' }), 'script');
    assertEqual(r.variants.length, 1);
    assertEqual(r.variants[0].script, 'one script body');
    assertTrue(r.controlFromLive === true);
  });

  test('parses flat object for voice (challenger only; control from live)', () => {
    const id = '21m00Tcm4TlvDq8ikWAM';
    const r = parseOutboundAbUploadSpec(JSON.stringify({ voiceId: id }), 'voice');
    assertEqual(r.variants.length, 1);
    assertEqual(r.variants[0].voice, id);
    assertTrue(r.controlFromLive === true);
  });
});

const exitCode = printSummary();
process.exit(exitCode);
