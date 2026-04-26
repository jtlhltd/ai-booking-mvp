import { describe, expect, test, jest, beforeEach } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../db.js', () => ({ query }));

describe('lead-deduplication', () => {
  beforeEach(() => {
    jest.resetModules();
    query.mockReset();
    delete process.env.DB_TYPE;
  });

  test('validateUKPhone covers mobile landline intl and invalid', async () => {
    const { validateUKPhone } = await import('../../../lib/lead-deduplication.js');
    expect(validateUKPhone('')).toEqual(expect.objectContaining({ valid: false, reason: 'empty' }));
    expect(validateUKPhone('07700900123').valid).toBe(true);
    expect(validateUKPhone('+447700900123').normalized).toBe('+447700900123');
    expect(validateUKPhone('02079460123').type).toBe('landline');
    expect(validateUKPhone('+12025550199').type).toBe('international');
    expect(validateUKPhone('abc').valid).toBe(false);
  });

  test('checkDuplicate returns not duplicate on empty rows', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const { checkDuplicate } = await import('../../../lib/lead-deduplication.js');
    const r = await checkDuplicate('c1', '+447700900001');
    expect(r.isDuplicate).toBe(false);
  });

  test('checkDuplicate flags recent contact as shouldSkip', async () => {
    const recent = new Date();
    query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'A', phone: '+44', created_at: recent, status: 'new' }]
    });
    const { checkDuplicate } = await import('../../../lib/lead-deduplication.js');
    const r = await checkDuplicate('c1', '+447700900001');
    expect(r.isDuplicate).toBe(true);
    expect(r.shouldSkip).toBe(true);
  });

  test('checkDuplicate uses all-time SQL when checkAllTime', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const { checkDuplicate } = await import('../../../lib/lead-deduplication.js');
    await checkDuplicate('c1', '+447700900001', { checkAllTime: true });
    expect(String(query.mock.calls[0][0])).not.toMatch(/INTERVAL/);
  });

  test('checkDuplicate returns error field on failure', async () => {
    query.mockRejectedValueOnce(new Error('db'));
    const { checkDuplicate } = await import('../../../lib/lead-deduplication.js');
    const r = await checkDuplicate('c1', '+44');
    expect(r.error).toBe('db');
  });

  test('isOptedOut loads cache and matches phone', async () => {
    process.env.DB_TYPE = 'postgres';
    query.mockResolvedValueOnce({ rows: [{ phone: '+44999' }] });
    const { isOptedOut } = await import('../../../lib/lead-deduplication.js');
    expect(await isOptedOut('tenant', '+44999')).toBe(true);
    expect(await isOptedOut('tenant', '+44111')).toBe(false);
  });

  test('addToOptOut and removeFromOptOut call query', async () => {
    process.env.DB_TYPE = 'postgres';
    query.mockResolvedValue({ rows: [] });
    const { addToOptOut, removeFromOptOut } = await import('../../../lib/lead-deduplication.js');
    const add = await addToOptOut('c1', '+441', 'r');
    expect(add.success).toBe(true);
    const rem = await removeFromOptOut('c1', '+441');
    expect(rem.success).toBe(true);
  });

  test('processLeadForImport rejects invalid phone', async () => {
    const { processLeadForImport } = await import('../../../lib/lead-deduplication.js');
    const r = await processLeadForImport({ phone: 'bad' }, 'c1');
    expect(r.valid).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  test('processLeadForImport rejects opted-out', async () => {
    process.env.DB_TYPE = 'postgres';
    query.mockResolvedValueOnce({ rows: [{ phone: '+447700900777' }] });
    const { processLeadForImport } = await import('../../../lib/lead-deduplication.js');
    const r = await processLeadForImport({ phone: '+447700900777' }, 'c1');
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.includes('opt-out'))).toBe(true);
  });

  test('bulkProcessLeads aggregates valid and invalid', async () => {
    query.mockResolvedValue({ rows: [] });
    const { bulkProcessLeads } = await import('../../../lib/lead-deduplication.js');
    const r = await bulkProcessLeads(
      [{ phone: '+447700900888' }, { phone: 'nope' }],
      'c1'
    );
    expect(r.total).toBe(2);
    expect(r.valid).toBe(1);
    expect(r.invalid).toBe(1);
  });
});
