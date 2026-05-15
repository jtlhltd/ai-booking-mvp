/**
 * Canary for sequence window overall pass intents.
 */
import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('canary: sequence window overall pass', () => {
  // intent: sequence.enroll-queue-now-operator
  // intent: sequence.bulk-stop-operator-api
  // intent: sequence.enrollable-leads-visibility
  test('API and dashboard expose queue-now enroll, bulk stop, and enrollable list', () => {
    const opsMount = readFileSync(path.join(repoRoot, 'routes/client-ops-mount.js'), 'utf8');
    const visibility = readFileSync(path.join(repoRoot, 'routes/outbound-sequence-visibility-mount.js'), 'utf8');
    const dashboard = readFileSync(path.join(repoRoot, 'public/client-dashboard.html'), 'utf8');
    const queueFirst = readFileSync(path.join(repoRoot, 'lib/outbound-sequence-queue-first.js'), 'utf8');

    expect(opsMount).toMatch(/queueNow:\s*req\.body\?\.queueNow\s*===\s*true/);
    expect(opsMount).toMatch(/outbound-sequence\/stop\/bulk/);
    expect(visibility).toMatch(/enrollable-leads/);
    expect(visibility).toMatch(/computeLeadEnrollmentStats/);
    expect(visibility).toMatch(/sequenceRowStuckHint/);
    expect(queueFirst).toMatch(/operator_sequence_enroll/);
    expect(dashboard).toMatch(/outboundSequenceListModeFilters/);
    expect(dashboard).toMatch(/enrollable-leads/);
    expect(dashboard).toMatch(/data-seq-bulk-stop/);
    expect(dashboard).toMatch(/outboundSequenceQueueOnEnroll/);
    expect(dashboard).toMatch(/queueNow:\s*enrolled\s*&&\s*outboundSequenceQueueOnEnrollEnabled/);
  });
});
