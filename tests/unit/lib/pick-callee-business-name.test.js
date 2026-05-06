import { describe, expect, test } from '@jest/globals';
import { pickCalleeBusinessNameForSheet } from '../../../lib/vapi-webhooks/pick-callee-business-name.js';

describe('lib/vapi-webhooks/pick-callee-business-name', () => {
  test('returns first non-empty candidate not equal to tenant slug', () => {
    expect(
      pickCalleeBusinessNameForSheet({
        tenantKey: 'acme-corp',
        metadata: { leadName: 'acme-corp', businessName: 'Real Co Ltd' },
        structuredFields: {},
        customerName: 'Ignored'
      })
    ).toBe('Real Co Ltd');
  });

  test('skips slug-like tenant key matches case-insensitively', () => {
    expect(
      pickCalleeBusinessNameForSheet({
        tenantKey: 'TomCo',
        metadata: { businessName: 'tomco' },
        customerName: '',
        structuredFields: {}
      })
    ).toBe('');
  });

  test('uses structuredFields and customerName fallbacks', () => {
    expect(
      pickCalleeBusinessNameForSheet({
        tenantKey: 't',
        metadata: {},
        structuredFields: { companyName: 'ShipCo' },
        customerName: ''
      })
    ).toBe('ShipCo');
    expect(
      pickCalleeBusinessNameForSheet({
        tenantKey: 't',
        metadata: {},
        structuredFields: {},
        customerName: '  Person Name  '
      })
    ).toBe('Person Name');
  });
});
