import { describe, expect, test } from '@jest/globals';

import store, { query, getFullClient, tenants, leads, twilio, optouts, contactAttempts } from '../../../store.js';

describe('store.js', () => {
  test('re-exports db helpers and has default export', () => {
    expect(typeof query).toBe('function');
    expect(typeof getFullClient).toBe('function');
    expect(store).toBeTruthy();
    expect(typeof store.query).toBe('function');
  });

  test('re-exports store/* domain modules', () => {
    expect(tenants).toBeTruthy();
    expect(leads).toBeTruthy();
    expect(twilio).toBeTruthy();
    expect(optouts).toBeTruthy();
    expect(contactAttempts).toBeTruthy();
    expect(store.tenants).toBe(tenants);
    expect(store.leads).toBe(leads);
  });
});

