import { describe, expect, test } from '@jest/globals';
import {
  buildLogisticsQualRecord,
  summarizeLogisticsQual
} from '../../../lib/logistics-qual-from-vapi.js';

describe('logistics-qual-from-vapi', () => {
  test('buildLogisticsQualRecord maps structuredData + sheet columns', () => {
    const sd = {
      decisionMaker: 'Jane Buyer',
      mainCountries: ['NL', 'DE'],
      mainCouriers: ['DHL'],
      internationalShipmentsPerWeek: '12',
      ukCourier: 'DPD'
    };
    const sheetData = { frequency: 'weekly', callbackNeeded: 'TRUE' };
    const rec = buildLogisticsQualRecord({
      sd,
      sheetData,
      extracted: {},
      outcome: 'interested',
      callId: 'call-1'
    });
    expect(rec.authority_or_decision_process).toContain('Jane');
    expect(rec.lanes_or_routes).toMatch(/NL|DE/);
    expect(rec.volume_or_frequency).toBeTruthy();
    expect(rec._captureCallId).toBe('call-1');
  });

  test('summarizeLogisticsQual returns compact line', () => {
    const s = summarizeLogisticsQual({
      lanes_or_routes: 'UK → EU',
      volume_or_frequency: '20/wk',
      authority_or_decision_process: 'Ops mgr'
    });
    expect(s).toContain('UK');
    expect(s).toContain('Vol:');
  });
});
