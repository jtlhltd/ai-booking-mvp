/**
 * Canary for Intent Contract: dial.lead-dial-context-contained
 *
 * Imported / stored lead dial context must never override sequence-owned
 * variableValues keys (leadName, tenantBusinessName, …).
 */
import { describe, expect, test } from '@jest/globals';

import {
  normalizeLeadDialContextEnvelope,
  parseLeadDialContextFromDb,
  validateLeadDialContextSize
} from '../../lib/lead-dial-context.js';

describe('canary: dial.lead-dial-context-contained', () => {
  test('parseLeadDialContextFromDb strips reserved keys so they cannot hijack assistant variables', () => {
    const parsed = parseLeadDialContextFromDb(
      JSON.stringify({
        lane: 'London-Birmingham',
        leadName: 'Evil Override',
        tenantBusinessName: 'Fake Co',
        client_key: 'stolen-tenant',
        decisionMakerName: 'DM'
      })
    );
    expect(parsed).toEqual({ lane: 'London-Birmingham' });
    expect(parsed.leadName).toBeUndefined();
    expect(parsed.tenantBusinessName).toBeUndefined();
    expect(parsed.client_key).toBeUndefined();
    expect(validateLeadDialContextSize(parsed).ok).toBe(true);
  });

  test('explicit message overrides stay top-level while reserved keys remain blocked from variableValues', () => {
    const parsed = normalizeLeadDialContextEnvelope({
      lane: 'London-Birmingham',
      variableValues: {
        tenantBusinessName: 'Fake Co',
        client_key: 'stolen-tenant',
        crmCampaign: 'spring-25'
      },
      firstMessage: '  Hello there  ',
      systemMessage: 'Use the courier script.'
    });

    expect(parsed).toEqual({
      variableValues: {
        lane: 'London-Birmingham',
        crmCampaign: 'spring-25'
      },
      firstMessage: 'Hello there',
      systemMessage: 'Use the courier script.'
    });
    expect(validateLeadDialContextSize(parsed).ok).toBe(true);
  });
});
