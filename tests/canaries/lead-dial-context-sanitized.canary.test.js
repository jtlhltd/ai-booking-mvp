/**
 * Canary for Intent Contract: dial.lead-dial-context-contained
 *
 * Imported / stored lead dial context must never override sequence-owned
 * variableValues keys (leadName, tenantBusinessName, …).
 */
import { describe, expect, test } from '@jest/globals';

import { parseLeadDialContextFromDb, validateLeadDialContextSize } from '../../lib/lead-dial-context.js';

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
});
