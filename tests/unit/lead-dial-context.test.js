import { describe, expect, test } from '@jest/globals';

import {
  filterLeadDialContextToScalars,
  LEAD_DIAL_CONTEXT_MAX_BYTES,
  normalizeLeadDialContext,
  parseLeadDialContextFromDb,
  stripReservedLeadDialContextKeys,
  validateLeadDialContextSize
} from '../../lib/lead-dial-context.js';

describe('lead-dial-context', () => {
  test('parseLeadDialContextFromDb returns {} for null and invalid JSON string', () => {
    expect(parseLeadDialContextFromDb(null)).toEqual({});
    expect(parseLeadDialContextFromDb(undefined)).toEqual({});
    expect(parseLeadDialContextFromDb('')).toEqual({});
    expect(parseLeadDialContextFromDb('not json')).toEqual({});
    expect(parseLeadDialContextFromDb('[1,2]')).toEqual({});
    expect(parseLeadDialContextFromDb('"x"')).toEqual({});
  });

  test('parseLeadDialContextFromDb parses object and string JSON, stripping reserved keys', () => {
    const raw = {
      lane: 'M25',
      leadName: 'hijack',
      tenantBusinessName: 'bad',
      phone: '+1'
    };
    expect(parseLeadDialContextFromDb(raw)).toEqual({ lane: 'M25' });
    expect(parseLeadDialContextFromDb(JSON.stringify(raw))).toEqual({ lane: 'M25' });
  });

  test('stripReservedLeadDialContextKeys removes only the top-level reserved keys', () => {
    const nested = { leadName: 'inner' };
    const out = stripReservedLeadDialContextKeys({ outer: 1, nested });
    expect(out.outer).toBe(1);
    expect(out.nested).toBe(nested);
    expect(out.nested.leadName).toBe('inner');
  });

  test('filterLeadDialContextToScalars drops nested objects, arrays, and non-finite numbers', () => {
    expect(
      filterLeadDialContextToScalars({
        lane: 'M25',
        volume: 12,
        active: true,
        nothing: null,
        nested: { x: 1 },
        list: [1, 2],
        bad: Number.NaN
      })
    ).toEqual({
      lane: 'M25',
      volume: 12,
      active: true,
      nothing: null
    });
  });

  test('validateLeadDialContextSize rejects oversized payload', () => {
    const big = { x: 'a'.repeat(LEAD_DIAL_CONTEXT_MAX_BYTES) };
    const r = validateLeadDialContextSize(big);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.bytes).toBeGreaterThan(LEAD_DIAL_CONTEXT_MAX_BYTES);
  });

  test('validateLeadDialContextSize accepts small payload', () => {
    const r = validateLeadDialContextSize({ a: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bytes).toBeGreaterThan(0);
  });

  test('normalizeLeadDialContext combines parse, reserved stripping, scalar filtering, and size guard', () => {
    expect(
      normalizeLeadDialContext(
        JSON.stringify({
          lane: 'M25',
          score: 7,
          leadName: 'override',
          nested: { bad: true }
        }),
        { maxBytes: 64 }
      )
    ).toEqual({
      lane: 'M25',
      score: 7
    });

    expect(
      normalizeLeadDialContext({ big: 'a'.repeat(200) }, { maxBytes: 32 })
    ).toEqual({});
  });
});
