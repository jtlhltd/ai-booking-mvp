import { describe, expect, test, jest, beforeEach } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../db.js', () => ({ query }));

describe('business-info', () => {
  beforeEach(() => {
    jest.resetModules();
    query.mockReset();
  });

  test('getBusinessInfo returns defaults when no row or on error', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const { getBusinessInfo } = await import('../../../lib/business-info.js');
    const d = await getBusinessInfo('c1');
    expect(d.hours.days).toEqual([1, 2, 3, 4, 5]);

    query.mockRejectedValueOnce(new Error('db'));
    const d2 = await getBusinessInfo('c1');
    expect(d2.services).toEqual([]);
  });

  test('getBusinessInfo maps row json fields', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          hours_json: { start: 10, end: 16, days: [1] },
          services_json: ['A'],
          policies_json: { pricing: '£50' },
          location_json: { address: '1 High St' }
        }
      ]
    });
    const { getBusinessInfo } = await import('../../../lib/business-info.js');
    const r = await getBusinessInfo('c1');
    expect(r.services).toEqual(['A']);
    expect(r.location.address).toBe('1 High St');
  });

  test('updateBusinessInfo merges and upserts', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [] });
    const { updateBusinessInfo } = await import('../../../lib/business-info.js');
    const r = await updateBusinessInfo({
      clientKey: 'c1',
      services: ['X'],
      policies: { pricing: 'p' }
    });
    expect(r.success).toBe(true);
    expect(r.info.services).toEqual(['X']);
  });

  test('getBusinessHoursString formats days array and per-day objects', async () => {
    const { getBusinessHoursString } = await import('../../../lib/business-info.js');
    query.mockResolvedValueOnce({
      rows: [{ hours_json: { days: [1, 2], start: 9, end: 17 }, services_json: [], policies_json: {}, location_json: {} }]
    });
    const a = await getBusinessHoursString('c1');
    expect(a).toContain('Monday');

    query.mockResolvedValueOnce({
      rows: [
        {
          hours_json: { monday: '9-5', tuesday: '9-5' },
          services_json: [],
          policies_json: {},
          location_json: {}
        }
      ]
    });
    const b = await getBusinessHoursString('c1');
    expect(b).toContain('Monday:');
  });

  test('getServicesList handles empty single and multiple', async () => {
    const { getServicesList } = await import('../../../lib/business-info.js');
    query.mockResolvedValueOnce({ rows: [] });
    expect(await getServicesList('c1')).toMatch(/variety of services/);

    query.mockResolvedValueOnce({
      rows: [{ hours_json: {}, services_json: ['Only'], policies_json: {}, location_json: {} }]
    });
    expect(await getServicesList('c1')).toContain('Only');

    query.mockResolvedValueOnce({
      rows: [{ hours_json: {}, services_json: ['A', 'B'], policies_json: {}, location_json: {} }]
    });
    expect(await getServicesList('c1')).toMatch(/and B/);
  });

  test('answerQuestion rejects short input and matches FAQ', async () => {
    const { answerQuestion } = await import('../../../lib/business-info.js');
    expect(await answerQuestion({ clientKey: 'c1', question: 'ab' })).toEqual(
      expect.objectContaining({ found: false })
    );

    query.mockResolvedValueOnce({
      rows: [
        {
          question: 'opening hours today',
          answer: 'We open at nine',
          category: 'hours',
          priority: 1
        }
      ]
    });
    const r = await answerQuestion({
      clientKey: 'c1',
      question: 'please tell me opening hours today'
    });
    expect(r.found).toBe(true);
    expect(r.answer).toContain('nine');
  });

  test('answerQuestion falls back to common hours and location', async () => {
    query.mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.toLowerCase().includes('business_faqs')) return { rows: [] };
      if (s.toLowerCase().includes('business_info')) {
        return {
          rows: [
            {
              hours_json: {},
              services_json: [],
              policies_json: {},
              location_json: { address: '10 Road', instructions: 'Ring bell' }
            }
          ]
        };
      }
      return { rows: [] };
    });
    const { answerQuestion } = await import('../../../lib/business-info.js');
    const hours = await answerQuestion({ clientKey: 'c1', question: 'when are you open today' });
    expect(hours.found).toBe(true);
    expect(hours.category).toBe('hours');

    const loc = await answerQuestion({ clientKey: 'c1', question: 'where is your address' });
    expect(loc.found).toBe(true);
    expect(String(loc.answer)).toContain('10 Road');
  });

  test('upsertFAQ runs insert and update queries', async () => {
    query.mockResolvedValue({ rows: [] });
    const { upsertFAQ } = await import('../../../lib/business-info.js');
    await expect(upsertFAQ({ clientKey: 'c1', question: 'Q?', answer: 'A!' })).resolves.toEqual({ success: true });
    expect(query.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
