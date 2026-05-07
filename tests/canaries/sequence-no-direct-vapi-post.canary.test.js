/**
 * Canary for Intent Contract: sequence.no-new-vapi-call-sites
 */
import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('canary: sequence.no-new-vapi-call-sites', () => {
  test('lib/outbound-sequence.js does not POST https://api.vapi.ai/call', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(dir, '../../lib/outbound-sequence.js'), 'utf8');
    expect(/fetch\s*\(\s*['"`]https?:\/\/api\.vapi\.ai\/call['"`]/i.test(src)).toBe(false);
  });
});
