import { describe, test, expect } from '@jest/globals';
import { readFileSync, existsSync } from 'node:fs';
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

describe('Tom vertical removed from core mounts', () => {
  test('mount-api does not mount Tom logistics CRM routers', () => {
    const src = readFileSync(path.resolve('app/mount-api.js'), 'utf8');
    expect(src).not.toMatch(/createFollowUpQueueRouter/);
    expect(src).not.toMatch(/createDailySummaryRouter/);
  });

  test('mount-admin-tools does not mount Tom Vapi tools or logistics admin', () => {
    const src = readFileSync(path.resolve('app/mount-admin-tools.js'), 'utf8');
    expect(src).not.toMatch(/createToolsRouter/);
    expect(src).not.toMatch(/createAdminVapiLogisticsRouter/);
  });
});

describe('Tom vertical route modules removed from core', () => {
  const removed = [
    'routes/follow-up-queue.js',
    'routes/daily-summary.js',
    'routes/tools-mount.js',
    'routes/admin-vapi-logistics-mount.js',
  ];

  for (const rel of removed) {
    test(`${rel} is not present on Call Bot`, () => {
      expect(existsSync(path.resolve(rel))).toBe(false);
    });
  }
});
