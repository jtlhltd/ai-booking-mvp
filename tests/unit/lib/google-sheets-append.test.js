import { describe, expect, test, jest, beforeEach } from '@jest/globals';

describe('lib/google-sheets-append', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('appendToSheet succeeds when googleapis append resolves', async () => {
    const append = jest.fn().mockResolvedValue({});
    jest.unstable_mockModule('googleapis', () => ({
      google: {
        auth: {
          GoogleAuth: class {
            // eslint-disable-next-line class-methods-use-this
            getClient() {
              return {};
            }
          }
        },
        sheets: () => ({
          spreadsheets: {
            values: { append }
          }
        })
      }
    }));
    const { appendToSheet } = await import('../../../lib/google-sheets-append.js');
    await appendToSheet({
      spreadsheetId: 'sid',
      sheetName: 'Log',
      values: ['a', 'b']
    });
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'sid',
        range: 'Log!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['a', 'b']] }
      })
    );
  });

  test('appendToSheet swallows errors from googleapis', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.unstable_mockModule('googleapis', () => ({
      google: {
        auth: {
          GoogleAuth: class {}
        },
        sheets: () => ({
          spreadsheets: {
            values: {
              append: jest.fn().mockRejectedValue(new Error('api down'))
            }
          }
        })
      }
    }));
    const { appendToSheet } = await import('../../../lib/google-sheets-append.js');
    await expect(
      appendToSheet({ spreadsheetId: 's', sheetName: 'X', values: [1] })
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
