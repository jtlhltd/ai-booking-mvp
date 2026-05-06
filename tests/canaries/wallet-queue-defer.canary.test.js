/**
 * Canary for Intent Contract: billing.wallet-check-keeps-queue-pending
 *
 * When the wallet gate is active, vapi_wallet_depleted MUST be treated as transient
 * by the queue worker classifier so rows stay pending (no synthetic failed_q calls).
 */
import { describe, expect, test } from '@jest/globals';

describe('canary: billing.wallet-check-keeps-queue-pending', () => {
  test('isTransientVapiQueueResult treats vapi_wallet_depleted as transient', async () => {
    const { isTransientVapiQueueResult } = await import('../../lib/vapi-queue-result.js');
    expect(isTransientVapiQueueResult({ ok: false, error: 'vapi_wallet_depleted' })).toBe(true);
  });
});

