import { describe, test, expect } from '@jest/globals';

import { buildTextSearchQueryVariations } from '../../lib/google-places-query-variations.js';

describe('lib/google-places-query-variations', () => {
  test('United Kingdom expands to a large query list', () => {
    const q = buildTextSearchQueryVariations('plumber', 'United Kingdom');
    expect(q.length).toBeGreaterThan(200);
    expect(q.some((s) => s.includes('London'))).toBe(true);
    expect(q.some((s) => s.includes('UK'))).toBe(true);
  });

  test('non-UK uses single location suffix', () => {
    const q = buildTextSearchQueryVariations('cafe', 'Paris');
    expect(q.some((s) => s === 'cafe Paris')).toBe(true);
  });

  test('adds quoted mobile-friendly variants when query lacks mobile terms', () => {
    const q = buildTextSearchQueryVariations('widgets', 'Madrid');
    expect(q.some((s) => s.includes('"private"'))).toBe(true);
    expect(q.some((s) => s.includes('Madrid'))).toBe(true);
  });

  test('skips quoted variants when query already names a role', () => {
    const q = buildTextSearchQueryVariations('owner plumber', 'Madrid');
    expect(q.some((s) => s.includes('"private"'))).toBe(false);
  });

  test('skips quoted variants when query contains double-quote', () => {
    const q = buildTextSearchQueryVariations('foo "bar"', 'Madrid');
    expect(q.some((s) => s.includes('"private"'))).toBe(false);
  });

  test('UK mobile variants include sole trader', () => {
    const q = buildTextSearchQueryVariations('trade', 'United Kingdom');
    expect(q.some((s) => s.includes('"sole trader"'))).toBe(true);
  });
});
