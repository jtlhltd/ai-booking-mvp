import { describe, test, expect, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('lib/lead-import', () => {
  test('parseCSV maps headers and skips rows without phone', async () => {
    const { parseCSV } = await import('../../../lib/lead-import.js');
    const csv = [
      'Name,Phone,Email',
      'Alice,+447700900000,alice@test',
      'Bob,,bob@test',
    ].join('\n');

    const leads = parseCSV(csv);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toEqual(expect.objectContaining({ name: 'Alice', phone: '+447700900000', email: 'alice@test' }));
  });

  test('importLeads counts invalids and calls batch insert path', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      // used only at top-level import but not called in this path (batchInsert uses dynamic import query)
      findOrCreateLead: jest.fn(),
      query: jest.fn(async (sql) => {
        const s = String(sql);
        if (s.includes('INSERT INTO leads') && s.includes('RETURNING id')) {
          return { rows: [{ id: 1 }] };
        }
        return { rows: [] };
      }),
    }));

    jest.unstable_mockModule('../../../lib/phone-validation.js', () => ({
      validatePhoneNumber: jest.fn(async () => ({ valid: true, lineType: 'mobile' })),
    }));

    jest.unstable_mockModule('../../../lib/lead-phone-key.js', () => ({
      phoneMatchKey: jest.fn((p) => (String(p || '').includes('0000') ? 'mk' : null)),
    }));

    const { importLeads } = await import('../../../lib/lead-import.js');

    const out = await importLeads(
      'c1',
      [
        { rowNumber: 1, phone: '123', name: 'bad' }, // invalid
        { rowNumber: 2, phone: '+447700900000', name: 'ok' }, // mk
        { rowNumber: 3, phone: '+447700900111', name: 'no_mk' }, // filtered as duplicate-ish
      ],
      { validatePhones: false, skipDuplicates: true, batchSize: 50 },
    );

    expect(out.total).toBe(3);
    expect(out.invalid).toBe(1);
    expect(out.imported).toBe(1);
  });
});

