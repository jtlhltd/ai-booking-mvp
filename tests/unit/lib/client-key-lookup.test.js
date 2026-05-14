import { describe, test, expect } from '@jest/globals';
import { getClientKeyLookupCandidates } from '../../../lib/client-key-lookup.js';

describe('lib/client-key-lookup', () => {
  test('Tom pair: caller spelling is tried first', () => {
    expect(getClientKeyLookupCandidates('u2d-xpress-tom')).toEqual(['u2d-xpress-tom', 'd2d-xpress-tom']);
    expect(getClientKeyLookupCandidates('d2d-xpress-tom')).toEqual(['d2d-xpress-tom', 'u2d-xpress-tom']);
  });

  test('unrelated keys pass through', () => {
    expect(getClientKeyLookupCandidates('acme-corp')).toEqual(['acme-corp']);
    expect(getClientKeyLookupCandidates('')).toEqual([]);
  });
});
