/**
 * Canary: missing Vapi config must defer (not fail) queue work.
 *
 * This protects retry/queue logic from being poisoned when env is incomplete.
 */
import { describe, expect, test } from '@jest/globals';

describe('canary: billing.vapi-not-configured-defers', () => {
  test('classifier treats vapi_not_configured as transient', async () => {
    const { isTransientVapiQueueResult } = await import('../../lib/vapi-queue-result.js');
    expect(isTransientVapiQueueResult({ ok: false, error: 'vapi_not_configured' })).toBe(true);
  });
});

