import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  delete process.env.GOOGLE_SA_JSON_BASE64;
});

function setSaJsonEnv(obj) {
  process.env.GOOGLE_SA_JSON_BASE64 = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
}

describe('sheets.js', () => {
  test('ensureHeader throws when GOOGLE_SA_JSON_BASE64 missing', async () => {
    const { ensureHeader } = await import('../../../sheets.js');
    await expect(ensureHeader('sheet123')).rejects.toThrow(/credentials/i);
  });

  test('ensureHeader calls google sheets values.update with header range', async () => {
    const values = { update: jest.fn(async () => ({})) };
    jest.unstable_mockModule('googleapis', () => ({
      google: {
        auth: { GoogleAuth: jest.fn(() => ({})) },
        sheets: jest.fn(() => ({ spreadsheets: { values } }))
      }
    }));

    setSaJsonEnv({ client_email: 'x@y', private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n' });
    const { ensureHeader, HEADERS } = await import('../../../sheets.js');
    await ensureHeader('sheet123');

    expect(values.update).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'sheet123',
        range: 'Sheet1!A1:L1',
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] }
      })
    );
  });

  test('appendLogistics skips when no meaningful logistics fields present', async () => {
    const values = {
      update: jest.fn(async () => ({})),
      append: jest.fn(async () => ({}))
    };
    jest.unstable_mockModule('googleapis', () => ({
      google: {
        auth: { GoogleAuth: jest.fn(() => ({})) },
        sheets: jest.fn(() => ({ spreadsheets: { values } }))
      }
    }));

    setSaJsonEnv({ client_email: 'x@y', private_key: 'k' });
    const { appendLogistics } = await import('../../../sheets.js');
    const out = await appendLogistics('sheet123', { callId: 'c1', phone: '+1', transcriptSnippet: 't' });
    expect(out).toEqual({ skipped: true });
    expect(values.append).not.toHaveBeenCalled();
  });

  test('appendLogistics writes a row when meaningful data exists', async () => {
    const values = {
      update: jest.fn(async () => ({})),
      append: jest.fn(async () => ({}))
    };
    jest.unstable_mockModule('googleapis', () => ({
      google: {
        auth: { GoogleAuth: jest.fn(() => ({})) },
        sheets: jest.fn(() => ({ spreadsheets: { values } }))
      }
    }));

    setSaJsonEnv({ client_email: 'x@y', private_key: 'k' });
    const { appendLogistics } = await import('../../../sheets.js');
    await appendLogistics('sheet123', { decisionMaker: 'A', international: 'Y', phone: 'p' });
    expect(values.append).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'sheet123',
        range: 'Sheet1!A:V',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: expect.objectContaining({ values: [expect.any(Array)] })
      })
    );
  });
});

