import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  delete process.env.DB_TYPE;
  delete process.env.DATABASE_URL;
  delete process.env.DB_PATH;
  delete process.env.DATA_DIR;
});

describe('db.js client helpers (cache + branches)', () => {
  test('listFullClients caches results within TTL', async () => {
    process.env.DB_TYPE = 'sqlite';
    process.env.DATA_DIR = 'data-test';
    process.env.DB_PATH = 'data-test/app.db';
    process.env.JEST_WORKER_ID = '1';

    const cache = { get: async () => null, set: async () => {}, clear: async () => {}, delPrefix: async () => {} };
    jest.unstable_mockModule('../../lib/cache.js', () => ({ getCache: () => cache }));
    jest.unstable_mockModule('fs', () => ({
      default: { existsSync: () => true, mkdirSync: () => {}, readFileSync: () => '{}', writeFileSync: () => {} },
      existsSync: () => true,
      mkdirSync: () => {},
      readFileSync: () => '{}',
      writeFileSync: () => {}
    }));

    let tenantsCall = 0;
    jest.unstable_mockModule('better-sqlite3', () => ({
      default: class Database {
        exec() {}
        prepare(sql) {
          return {
            get: () => ({}),
            all: () => {
              const s = String(sql);
              if (s.includes('FROM tenants') && s.includes('ORDER BY created_at DESC')) {
                tenantsCall += 1;
                return [
                  {
                    client_key: 'c1',
                    display_name: tenantsCall === 1 ? 'First' : 'Second',
                    timezone: 'Europe/London',
                    locale: 'en-GB',
                    numbers_json: '{}',
                    twilio_json: '{}',
                    vapi_json: '{}',
                    calendar_json: '{}',
                    sms_templates_json: '{}',
                    white_label_config: '{}',
                    is_enabled: 1,
                    created_at: '2026-01-01T00:00:00.000Z'
                  }
                ];
              }
              return [];
            },
            run: () => ({ changes: 1 })
          };
        }
        close() {}
      }
    }));

    const db = await import('../../db.js');
    await db.init();

    const a = await db.listFullClients();
    const b = await db.listFullClients();
    expect(a[0].displayName).toBe('First');
    expect(b[0].displayName).toBe('First'); // cached
  });

  test('getFullClient bypassCache forces DB read', async () => {
    process.env.DB_TYPE = 'sqlite';
    process.env.DATA_DIR = 'data-test';
    process.env.DB_PATH = 'data-test/app.db';
    process.env.JEST_WORKER_ID = '1';

    const cache = { get: async () => null, set: async () => {}, clear: async () => {}, delPrefix: async () => {} };
    jest.unstable_mockModule('../../lib/cache.js', () => ({ getCache: () => cache }));
    jest.unstable_mockModule('fs', () => ({
      default: { existsSync: () => true, mkdirSync: () => {}, readFileSync: () => '{}', writeFileSync: () => {} },
      existsSync: () => true,
      mkdirSync: () => {},
      readFileSync: () => '{}',
      writeFileSync: () => {}
    }));

    let reads = 0;
    jest.unstable_mockModule('better-sqlite3', () => ({
      default: class Database {
        exec() {}
        prepare(sql) {
          const s = String(sql);
          return {
            get: () => ({}),
            all: () => {
              if (s.includes('FROM tenants WHERE client_key')) {
                reads += 1;
                return [
                  {
                    client_key: 'c1',
                    display_name: `Name${reads}`,
                    timezone: 'Europe/London',
                    locale: 'en-GB',
                    numbers_json: '{}',
                    twilio_json: '{}',
                    vapi_json: '{}',
                    calendar_json: '{}',
                    sms_templates_json: '{}',
                    white_label_config: '{}',
                    is_enabled: 1,
                    created_at: '2026-01-01T00:00:00.000Z'
                  }
                ];
              }
              return [];
            },
            run: () => ({ changes: 1 })
          };
        }
        close() {}
      }
    }));

    const db = await import('../../db.js');
    await db.init();

    const a = await db.getFullClient('c1');
    const b = await db.getFullClient('c1'); // cached
    const c = await db.getFullClient('c1', { bypassCache: true }); // bypass
    expect(a.displayName).toBe('Name1');
    expect(b.displayName).toBe('Name1');
    expect(c.displayName).toBe('Name2');
  });

  test('upsertFullClient merges vapi object when provided', async () => {
    process.env.DB_TYPE = 'sqlite';
    process.env.DATA_DIR = 'data-test';
    process.env.DB_PATH = 'data-test/app.db';
    process.env.JEST_WORKER_ID = '1';

    const cache = { get: async () => null, set: async () => {}, clear: async () => {}, delPrefix: async () => {} };
    jest.unstable_mockModule('../../lib/cache.js', () => ({ getCache: () => cache }));
    jest.unstable_mockModule('fs', () => ({
      default: { existsSync: () => true, mkdirSync: () => {}, readFileSync: () => '{}', writeFileSync: () => {} },
      existsSync: () => true,
      mkdirSync: () => {},
      readFileSync: () => '{}',
      writeFileSync: () => {}
    }));

    let updatedArgs = null;
    jest.unstable_mockModule('better-sqlite3', () => ({
      default: class Database {
        exec() {}
        prepare(sql) {
          const s = String(sql);
          if (s.startsWith('SELECT client_key FROM tenants')) {
            return { get: () => ({ client_key: 'c1' }) };
          }
          if (s.includes('FROM tenants WHERE client_key')) {
            return {
              all: () => [
                {
                  client_key: 'c1',
                  display_name: 'Acme',
                  timezone: 'Europe/London',
                  locale: 'en-GB',
                  numbers_json: '{}',
                  twilio_json: '{}',
                  vapi_json: JSON.stringify({ email: 'old@x.com' }),
                  calendar_json: '{}',
                  sms_templates_json: '{}',
                  white_label_config: '{}',
                  is_enabled: 1,
                  created_at: '2026-01-01T00:00:00.000Z'
                }
              ]
            };
          }
          if (s.startsWith('UPDATE tenants SET')) {
            return {
              run: (...args) => {
                updatedArgs = args;
                return { changes: 1 };
              }
            };
          }
          return { get: () => ({}), all: () => [], run: () => ({ changes: 1 }) };
        }
        close() {}
      }
    }));

    const db = await import('../../db.js');
    await db.init();

    await db.upsertFullClient({ clientKey: 'c1', vapi: { assistantId: 'a1' } });
    expect(updatedArgs).toBeTruthy();
    const vapiJson = updatedArgs[5]; // UPDATE order: ..., vapi_json, ...
    expect(vapiJson).toMatch(/assistantId/);
    expect(vapiJson).toMatch(/old@x\.com/);
  });
});

