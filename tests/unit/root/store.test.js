import { describe, expect, test } from '@jest/globals';

import store, { query, getFullClient } from '../../../store.js';

describe('store.js', () => {
  test('re-exports db helpers and has default export', () => {
    expect(typeof query).toBe('function');
    expect(typeof getFullClient).toBe('function');
    expect(store).toBeTruthy();
    expect(typeof store.query).toBe('function');
  });
});

