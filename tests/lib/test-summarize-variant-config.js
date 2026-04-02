// tests/lib/test-summarize-variant-config.js
// Pure helper from db.js — run with DB_TYPE unset or json to avoid Postgres if needed

import { describe, test, assertEqual, printSummary, resetStats } from '../utils/test-helpers.js';
import { summarizeOutboundVariantConfig } from '../../db.js';

resetStats();

describe('summarizeOutboundVariantConfig', () => {
  test('parses voice string and script', () => {
    const s = summarizeOutboundVariantConfig({
      voice: 'vid-1',
      firstMessage: 'Hello there',
      script: 'Be brief.'
    });
    assertEqual(s.voiceId, 'vid-1');
    assertEqual(s.openingLine, 'Hello there');
    assertEqual(s.scriptCharCount, 9);
    assertEqual(s.scriptPreview, 'Be brief.');
  });

  test('prefers systemMessage over script', () => {
    const s = summarizeOutboundVariantConfig({ systemMessage: 'A', script: 'B' });
    assertEqual(s.scriptPreview, 'A');
  });

  test('voice object with voiceId', () => {
    const s = summarizeOutboundVariantConfig({ voice: { voiceId: 'x', provider: '11labs' } });
    assertEqual(s.voiceId, 'x');
  });
});

const exitCode = printSummary();
process.exit(exitCode);
