import { describe, expect, test } from '@jest/globals';

import {
  extractLeadDialContextFromImportLead,
  filterLeadDialContextToScalars,
  isLeadExplicitlyOptedIntoOutboundSequence,
  mergeOutboundSequenceEnrollmentIntoDialContext,
  LEAD_DIAL_CONTEXT_MAX_BYTES,
  normalizeLeadDialContextEnvelope,
  normalizeLeadDialContext,
  parseLeadDialContextFromDb,
  sanitizeLeadDialContextMessage,
  serializeLeadDialContextEnvelope,
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

  test('normalizeLeadDialContextEnvelope keeps bounded message overrides while preserving variableValues compatibility', () => {
    expect(
      normalizeLeadDialContextEnvelope({
        lane: 'M25',
        variableValues: {
          crmCampaign: 'spring-25',
          tenantBusinessName: 'blocked',
        },
        firstMessage: '  Hello there  ',
        systemMessage: 'Use the courier script.',
      })
    ).toEqual({
      variableValues: {
        lane: 'M25',
        crmCampaign: 'spring-25',
      },
      firstMessage: 'Hello there',
      systemMessage: 'Use the courier script.',
    });
  });

  test('sanitizeLeadDialContextMessage trims and bounds message text', () => {
    expect(sanitizeLeadDialContextMessage('  hello  ', 5)).toBe('hello');
    expect(sanitizeLeadDialContextMessage('abcdef', 3)).toBe('abc');
    expect(sanitizeLeadDialContextMessage('', 10)).toBeNull();
  });

  test('serializeLeadDialContextEnvelope keeps legacy flat shape unless envelope is needed', () => {
    expect(
      serializeLeadDialContextEnvelope({
        variableValues: { crmCampaign: 'spring-25' }
      })
    ).toEqual({
      crmCampaign: 'spring-25'
    });

    expect(
      serializeLeadDialContextEnvelope(
        {
          variableValues: { crmCampaign: 'spring-25' },
          firstMessage: 'Hello'
        },
        { preferEnvelope: true }
      )
    ).toEqual({
      variableValues: { crmCampaign: 'spring-25' },
      firstMessage: 'Hello'
    });
  });

  test('extractLeadDialContextFromImportLead prefers explicit objects and otherwise uses extra top-level keys', () => {
    expect(
      extractLeadDialContextFromImportLead({
        phone: '+447700900000',
        name: 'Alice',
        leadDialContext: {
          crmCampaign: 'spring-25',
          leadName: 'blocked',
        },
      })
    ).toEqual({
      crmCampaign: 'spring-25',
    });

    expect(
      extractLeadDialContextFromImportLead({
        phone: '+447700900000',
        name: 'Alice',
        crmCampaign: 'spring-25',
        laneHint: 'Manchester-Rotterdam',
        leadName: 'blocked',
      })
    ).toEqual({
      crmCampaign: 'spring-25',
      laneHint: 'Manchester-Rotterdam',
    });
  });

  test('extractLeadDialContextFromImportLead preserves explicit message overrides inside envelope objects', () => {
    expect(
      extractLeadDialContextFromImportLead({
        phone: '+447700900000',
        customFields: {
          laneHint: 'Manchester-Rotterdam',
          firstMessage: '  Hello  ',
          systemMessage: 'Use the logistics script.',
          tenant_key: 'blocked'
        }
      })
    ).toEqual({
      variableValues: {
        laneHint: 'Manchester-Rotterdam'
      },
      firstMessage: 'Hello',
      systemMessage: 'Use the logistics script.'
    });
  });

  test('mergeOutboundSequenceEnrollmentIntoDialContext sets canonical opt-in flag', () => {
    const enrolled = mergeOutboundSequenceEnrollmentIntoDialContext(
      { outboundSequenceOptIn: false, sequenceOptIn: true },
      { enrolled: true }
    );
    expect(enrolled).toEqual({ variableValues: { outboundSequenceOptIn: true } });
    const unenrolled = mergeOutboundSequenceEnrollmentIntoDialContext(
      { outboundSequenceOptIn: true, outboundDialMode: 'sequence' },
      { enrolled: false }
    );
    expect(unenrolled).toEqual({ variableValues: { outboundSequenceOptIn: false } });
    expect(isLeadExplicitlyOptedIntoOutboundSequence(unenrolled)).toBe(false);
  });

  test('isLeadExplicitlyOptedIntoOutboundSequence requires an explicit opt-in flag', () => {
    expect(isLeadExplicitlyOptedIntoOutboundSequence(null)).toBe(false);
    expect(isLeadExplicitlyOptedIntoOutboundSequence({ crmCampaign: 'spring-25' })).toBe(false);
    expect(isLeadExplicitlyOptedIntoOutboundSequence({ outboundSequenceOptIn: true })).toBe(true);
    expect(isLeadExplicitlyOptedIntoOutboundSequence({ variableValues: { sequenceOptIn: 'yes' } })).toBe(true);
    expect(isLeadExplicitlyOptedIntoOutboundSequence({ multiCallOptIn: 1 })).toBe(true);
    expect(isLeadExplicitlyOptedIntoOutboundSequence({ outboundDialMode: 'sequence' })).toBe(true);
    expect(isLeadExplicitlyOptedIntoOutboundSequence({ outboundSequenceOptIn: false })).toBe(false);
  });
});
