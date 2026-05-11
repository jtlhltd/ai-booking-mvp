import { describe, expect, test } from '@jest/globals';

import {
  LEAD_DIAL_CONTEXT_MAX_BYTES,
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

  test('stripReservedLeadDialContextKeys is shallow only', () => {
    const nested = { leadName: 'inner' };
    const out = stripReservedLeadDialContextKeys({ outer: 1, nested });
    expect(out.outer).toBe(1);
    expect(out.nested).toBe(nested);
    expect(out.nested.leadName).toBe('inner');
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
});
