import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  delete process.env.GOOGLE_SA_JSON_BASE64;
});

function makeMockSheetsClient({ getValues = [], appendUpdatedRange = 'Sheet1!A2:L2' } = {}) {
  return {
    spreadsheets: {
      values: {
        update: jest.fn(async () => ({ data: {} })),
        append: jest.fn(async () => ({ data: { updates: { updatedRange: appendUpdatedRange } } })),
        get: jest.fn(async () => ({ data: { values: getValues } })),
      }
    }
  };
}

describe('sheets.js', () => {
  test('getClient throws when GOOGLE_SA_JSON_BASE64 missing', async () => {
    const { readSheet } = await import('../../sheets.js');
    await expect(readSheet('sid')).rejects.toThrow(/credentials not configured/i);
  });

  test('invalid GOOGLE_SA_JSON_BASE64 throws', async () => {
    process.env.GOOGLE_SA_JSON_BASE64 = Buffer.from('not json', 'utf8').toString('base64');
    const { readSheet } = await import('../../sheets.js');
    await expect(readSheet('sid')).rejects.toThrow(/Invalid GOOGLE_SA_JSON_BASE64/i);
  });

  test('ensureHeader + appendLead updates header and parses updatedRange rowNumber', async () => {
    process.env.GOOGLE_SA_JSON_BASE64 = Buffer.from(JSON.stringify({ client_email: 'x', private_key: 'k' }), 'utf8').toString('base64');
    const mockClient = makeMockSheetsClient({ appendUpdatedRange: 'Sheet1!A7:L7' });

    jest.unstable_mockModule('googleapis', () => ({
      google: {
        auth: { GoogleAuth: class GoogleAuth { constructor() {} } },
        sheets: () => mockClient
      }
    }));

    const { appendLead } = await import('../../sheets.js');
    const out = await appendLead('sid', { id: '1', name: 'N', phone: '+1', service: 'S', booked: false });
    expect(out).toEqual({ rowNumber: 7 });
    expect(mockClient.spreadsheets.values.update).toHaveBeenCalled(); // header
    expect(mockClient.spreadsheets.values.append).toHaveBeenCalled();
  });

  test('appendLogistics skips when no meaningful logistics fields present', async () => {
    process.env.GOOGLE_SA_JSON_BASE64 = Buffer.from(JSON.stringify({ client_email: 'x', private_key: 'k' }), 'utf8').toString('base64');
    const mockClient = makeMockSheetsClient();
    jest.unstable_mockModule('googleapis', () => ({
      google: {
        auth: { GoogleAuth: class GoogleAuth { constructor() {} } },
        sheets: () => mockClient
      }
    }));

    const { appendLogistics } = await import('../../sheets.js');
    const out = await appendLogistics('sid', { callId: 'c1', phone: '+1' });
    expect(out).toEqual({ skipped: true });
    expect(mockClient.spreadsheets.values.append).not.toHaveBeenCalled();
  });

  test('appendLogistics writes when at least one meaningful field present', async () => {
    process.env.GOOGLE_SA_JSON_BASE64 = Buffer.from(JSON.stringify({ client_email: 'x', private_key: 'k' }), 'utf8').toString('base64');
    const mockClient = makeMockSheetsClient();
    jest.unstable_mockModule('googleapis', () => ({
      google: {
        auth: { GoogleAuth: class GoogleAuth { constructor() {} } },
        sheets: () => mockClient
      }
    }));

    const { appendLogistics } = await import('../../sheets.js');
    await appendLogistics('sid', { decisionMaker: 'Alice', phone: '+1', callId: 'c1', transcriptSnippet: 't' });
    expect(mockClient.spreadsheets.values.append).toHaveBeenCalled();
  });

  test('updateLogisticsRowByPhone matches by callId and updates row', async () => {
    process.env.GOOGLE_SA_JSON_BASE64 = Buffer.from(JSON.stringify({ client_email: 'x', private_key: 'k' }), 'utf8').toString('base64');
    const rows = [
      ['Timestamp', 'Business Name', 'Decision Maker', 'Phone', 'Email', 'International (Y/N)', 'Main Couriers', 'International Shipments per Week', 'Main Countries', 'Example Shipment (weight x dims)', 'Example Shipment Cost', 'UK Shipments per Week', 'UK Courier', 'Std Rate up to KG', 'Excl Fuel & VAT?', 'Single vs Multi-parcel', 'Receptionist Name', 'Callback Needed', 'Call ID', 'Recording URI', 'Transcript Snippet', 'Called Number'],
      ['t', 'Biz', '', '+1', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'call_1', '', '', ''],
    ];
    const mockClient = makeMockSheetsClient({ getValues: rows });
    jest.unstable_mockModule('googleapis', () => ({
      google: {
        auth: { GoogleAuth: class GoogleAuth { constructor() {} } },
        sheets: () => mockClient
      }
    }));

    const { updateLogisticsRowByPhone } = await import('../../sheets.js');
    const ok = await updateLogisticsRowByPhone('sid', '+1', { callId: 'call_1', recordingUrl: 'r', transcriptSnippet: 'x', calledNumber: '+2' });
    expect(ok).toBe(true);
    expect(mockClient.spreadsheets.values.update).toHaveBeenCalledWith(
      expect.objectContaining({ range: expect.stringMatching(/^Sheet1!A2:V2$/) })
    );
  });

  test('updateLogisticsCalledFlag updates Callback Needed cell by callId', async () => {
    process.env.GOOGLE_SA_JSON_BASE64 = Buffer.from(JSON.stringify({ client_email: 'x', private_key: 'k' }), 'utf8').toString('base64');
    const rows = [
      ['Phone', 'Callback Needed', 'Call ID'],
      ['+1', '', 'call_9'],
    ];
    const mockClient = makeMockSheetsClient({ getValues: rows });
    jest.unstable_mockModule('googleapis', () => ({
      google: {
        auth: { GoogleAuth: class GoogleAuth { constructor() {} } },
        sheets: () => mockClient
      }
    }));

    const { updateLogisticsCalledFlag } = await import('../../sheets.js');
    const ok = await updateLogisticsCalledFlag('sid', { callId: 'call_9', called: true });
    expect(ok).toBe(true);
    expect(mockClient.spreadsheets.values.update).toHaveBeenCalledWith(
      expect.objectContaining({ range: 'Sheet1!B2:B2', requestBody: { values: [['TRUE']] } })
    );
  });

  test('logisticsSheetRowsToRecords maps headers to objects', async () => {
    const { logisticsSheetRowsToRecords } = await import('../../sheets.js');
    const out = logisticsSheetRowsToRecords([
      ['A', 'B'],
      ['1', ''],
      [null, '2'],
    ]);
    expect(out).toEqual([{ A: '1', B: '' }, { A: '', B: '2' }]);
  });
});

