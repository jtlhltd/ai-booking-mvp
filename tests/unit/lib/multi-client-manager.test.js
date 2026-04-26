import { describe, test, expect, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('lib/multi-client-manager', () => {
  test('getAllClientsOverview returns sorted list and aggregates totals', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      listFullClients: jest.fn(async () => [
        { client_key: 'c1', display_name: 'A', created_at: '2026-01-02T00:00:00.000Z', is_enabled: true },
        { client_key: 'c2', display_name: 'B', created_at: '2026-01-01T00:00:00.000Z', is_enabled: false },
      ]),
      query: jest.fn(async () => ({ rows: [{ total_leads: 1, calls_7d: 0, bookings_7d: 0, messages_7d: 0 }] })),
    }));

    jest.unstable_mockModule('../../../lib/call-outcome-analyzer.js', () => ({
      analyzeCallOutcomes: jest.fn(async () => ({ conversionRate: 0, insights: [] })),
    }));

    const { getAllClientsOverview } = await import('../../../lib/multi-client-manager.js');
    const out = await getAllClientsOverview();
    expect(out).toEqual(expect.objectContaining({ totalClients: 2, activeClients: 1, clients: expect.any(Array) }));
    expect(out.clients[0].clientKey).toBe('c1');
  });

  test('getClientsNeedingAttention filters by health and stats', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      listFullClients: jest.fn(async () => [{ client_key: 'c1', display_name: 'A', created_at: '2026-01-01T00:00:00.000Z', is_enabled: true }]),
      query: jest.fn(async () => ({ rows: [{ total_leads: 1, calls_7d: 0, bookings_7d: 0, messages_7d: 0 }] })),
    }));
    jest.unstable_mockModule('../../../lib/call-outcome-analyzer.js', () => ({
      analyzeCallOutcomes: jest.fn(async () => ({ conversionRate: 0, insights: [{ type: 'warning', impact: 'high' }] })),
    }));
    const { getClientsNeedingAttention } = await import('../../../lib/multi-client-manager.js');
    const out = await getClientsNeedingAttention();
    expect(out.total).toBe(1);
  });
});

