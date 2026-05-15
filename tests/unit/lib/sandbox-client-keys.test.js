import { describe, expect, test } from '@jest/globals';

import {
  SANDBOX_CLIENT_KEY,
  isDemoClient,
  isSandboxClientKey,
  isSandboxTenant,
  resolveSandboxClientKey
} from '../../../lib/sandbox-client-keys.js';

describe('lib/sandbox-client-keys', () => {
  test('canonical sandbox key and legacy aliases', () => {
    expect(SANDBOX_CLIENT_KEY).toBe('sandbox_client');
    expect(isSandboxClientKey('demo_client')).toBe(true);
    expect(isSandboxClientKey('d2d-xpress-tom')).toBe(false);
    expect(resolveSandboxClientKey('demo')).toBe('sandbox_client');
    expect(resolveSandboxClientKey('acme')).toBe('acme');
  });

  test('isSandboxTenant and deprecated isDemoClient', () => {
    expect(isSandboxTenant({ clientKey: 'demo-client' })).toBe(true);
    expect(isSandboxTenant({ clientKey: 'acme', isDemo: true })).toBe(true);
    expect(isDemoClient({ clientKey: 'sandbox_client' })).toBe(true);
  });
});
