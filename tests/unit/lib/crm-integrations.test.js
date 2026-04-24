import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

afterEach(() => {
  jest.useRealTimers();
});

function mockFetchSequence(steps) {
  const fn = jest.fn();
  for (const step of steps) {
    fn.mockImplementationOnce(async () => {
      if (step.throw) throw step.throw;
      return {
        ok: step.ok ?? true,
        status: step.status ?? 200,
        json: async () => step.json ?? {},
        text: async () => step.text ?? ''
      };
    });
  }
  return fn;
}

describe('lib/crm-integrations', () => {
  test('HubSpotIntegration.createContact retries on 429 then succeeds', async () => {
    jest.useFakeTimers();

    const query = jest.fn(async () => ({ rows: [] }));
    jest.unstable_mockModule('../../../db.js', () => ({ query }));
    jest.unstable_mockModule('../../../lib/error-monitoring.js', () => ({
      logError: jest.fn(async () => {}),
      sendCriticalAlert: jest.fn(async () => {})
    }));

    const fetchImpl = mockFetchSequence([
      { ok: false, status: 429, text: 'rate limit' },
      { ok: true, status: 200, json: { id: 'c1' } }
    ]);
    global.fetch = fetchImpl;

    const { HubSpotIntegration } = await import('../../../lib/crm-integrations.js');
    const hs = new HubSpotIntegration('k');
    const p = hs.createContact({ phone: '+1' }, 'tenant1');

    // allow retry delay to elapse
    await jest.advanceTimersByTimeAsync(1100);
    const out = await p;

    expect(out).toEqual({ id: 'c1', created: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalled(); // trackSyncFailure attempt (table may not exist in prod; still called here)
  });

  test('HubSpotIntegration.createContact does not retry on 401', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    jest.unstable_mockModule('../../../db.js', () => ({ query }));
    jest.unstable_mockModule('../../../lib/error-monitoring.js', () => ({
      logError: jest.fn(async () => {}),
      sendCriticalAlert: jest.fn(async () => {})
    }));

    global.fetch = mockFetchSequence([{ ok: false, status: 401, text: 'unauthorized' }]);

    const { HubSpotIntegration } = await import('../../../lib/crm-integrations.js');
    const hs = new HubSpotIntegration('k');
    await expect(hs.createContact({ phone: '+1' }, 'tenant1')).rejects.toThrow(/HubSpot API error/i);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('HubSpotIntegration.syncContact chooses update when contact exists', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({ query: jest.fn(async () => ({ rows: [] })) }));
    jest.unstable_mockModule('../../../lib/error-monitoring.js', () => ({
      logError: jest.fn(async () => {}),
      sendCriticalAlert: jest.fn(async () => {})
    }));

    // find by email (GET) returns {id}, then update (PATCH) ok
    global.fetch = mockFetchSequence([
      { ok: true, status: 200, json: { id: 'contact1' } },
      { ok: true, status: 200, json: {} }
    ]);

    const { HubSpotIntegration } = await import('../../../lib/crm-integrations.js');
    const hs = new HubSpotIntegration('k');
    const out = await hs.syncContact({ clientKey: 'c1', email: 'a@b.com', phone: '+1', status: 'new' });
    expect(out).toEqual({ id: 'contact1', updated: true });
  });

  test('getCrmSettings returns defaults when db throws', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => {
        throw new Error('no table');
      })
    }));
    const { getCrmSettings } = await import('../../../lib/crm-integrations.js');
    const out = await getCrmSettings('c1');
    expect(out).toEqual({
      hubspot: { enabled: false, connected: false, lastSync: null },
      salesforce: { enabled: false, connected: false, lastSync: null }
    });
  });

  test('saveCrmSettings updates existing row', async () => {
    const query = jest.fn(async (sql) => {
      if (String(sql).includes('SELECT id FROM crm_integrations')) return { rows: [{ id: 1 }] };
      return { rows: [] };
    });
    jest.unstable_mockModule('../../../db.js', () => ({ query }));
    const { saveCrmSettings } = await import('../../../lib/crm-integrations.js');
    await saveCrmSettings('c1', 'hubspot', { apiKey: 'k' });
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/UPDATE crm_integrations/i), expect.any(Array));
  });

  test('updateLastSync silently tolerates db error', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => {
        throw new Error('no table');
      })
    }));
    const { updateLastSync } = await import('../../../lib/crm-integrations.js');
    await expect(updateLastSync('c1', 'hubspot')).resolves.toBeUndefined();
  });
});

