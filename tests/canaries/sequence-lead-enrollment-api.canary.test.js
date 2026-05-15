/**
 * Canary for Intent Contract: sequence.lead-enrollment-operator-api
 */
import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('canary: sequence.lead-enrollment-operator-api', () => {
  test('client-ops mount and dashboard expose enrollment mutation', () => {
    const opsMount = readFileSync(path.join(repoRoot, 'routes/client-ops-mount.js'), 'utf8');
    const dashboard = readFileSync(path.join(repoRoot, 'public/client-dashboard.html'), 'utf8');
    expect(opsMount).toMatch(/outbound-sequence\/enrollment/);
    expect(opsMount).toMatch(/setLeadOutboundSequenceEnrollment/);
    expect(dashboard).toMatch(/outbound-sequence\/enrollment/);
    expect(dashboard).toMatch(/data-seq-enroll/);
    expect(dashboard).toMatch(/data-seq-unenroll/);
  });
});
