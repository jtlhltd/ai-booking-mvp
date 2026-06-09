import { describe, test, expect } from '@jest/globals';
import {
  clearRemediationRulesCache,
  executeRemediation,
  matchRemediationRule,
} from '../../../lib/remediation.js';

describe('remediation', () => {
  test('matchRemediationRule returns vapi server_error actions', () => {
    const rule = matchRemediationRule('vapi_call_failure', 'server_error');
    expect(rule).toBeTruthy();
    expect(rule.actions).toContain('sms_fallback');
    expect(rule.actions).toContain('schedule_retry');
    expect(rule.retryDelayMinutes).toBe(15);
  });

  test('matchRemediationRule falls back to wildcard', () => {
    const rule = matchRemediationRule('stale_processing', 'anything');
    expect(rule?.actions).toContain('reset_stale_processing');
  });

  test('executeRemediation runs configured handlers', async () => {
    clearRemediationRulesCache();
    const calls = [];
    const result = await executeRemediation('vapi_call_failure', 'network', {
      handlers: {
        schedule_retry: async () => {
          calls.push('schedule_retry');
        },
      },
    });
    expect(result.ok).toBe(true);
    expect(calls).toEqual(['schedule_retry']);
  });

  test('executeRemediation reports missing handler', async () => {
    const result = await executeRemediation('vapi_call_failure', 'network', {
      handlers: {},
    });
    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('handler_missing');
  });
});
