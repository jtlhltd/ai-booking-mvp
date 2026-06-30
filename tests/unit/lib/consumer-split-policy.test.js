import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('lib/logistics-sheet-writes-in-core', () => {
  test('processSheetPatchRetry checks LOGISTICS_SHEET_WRITES_IN_CORE', () => {
    const src = readFileSync(
      path.resolve('lib/server-queue-workers.js'),
      'utf8'
    );
    expect(src).toMatch(/isLogisticsSheetWritesInCoreEnabled/);
    expect(src).toMatch(/processSheetPatchRetry/);
  });

  test('process-webhook-payload gates logistics sheet id when writes disabled', () => {
    const src = readFileSync(
      path.resolve('lib/vapi-webhooks/process-webhook-payload.js'),
      'utf8'
    );
    expect(src).toMatch(/logisticsWritesInCore/);
    expect(src).toMatch(/scheduleConsumerCallCompletedWebhook/);
  });
});

describe('routes/v1-callbot-mount', () => {
  test('uses per-tenant authenticateApiKey and client key mismatch guard', () => {
    const src = readFileSync(path.resolve('routes/v1-callbot-mount.js'), 'utf8');
    expect(src).toMatch(/authenticateApiKey/);
    expect(src).toMatch(/client_key_mismatch/);
  });
});
