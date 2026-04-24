import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  process.env.DB_TYPE = 'sqlite';
  process.env.DATA_DIR = 'data-test';
  process.env.DB_PATH = 'data-test/app.db';
  process.env.JEST_WORKER_ID = '1';
});

function mockSqlite({ rowsBySql = {} } = {}) {
  const cache = { get: async () => null, set: async () => {}, clear: async () => {}, delPrefix: async () => {} };
  jest.unstable_mockModule('../../lib/cache.js', () => ({ getCache: () => cache }));
  jest.unstable_mockModule('fs', () => ({
    default: { existsSync: () => true, mkdirSync: () => {}, readFileSync: () => '{}', writeFileSync: () => {} },
    existsSync: () => true,
    mkdirSync: () => {},
    readFileSync: () => '{}',
    writeFileSync: () => {}
  }));
  jest.unstable_mockModule('better-sqlite3', () => ({
    default: class Database {
      exec() {}
      prepare(sql) {
        const s = String(sql);
        return {
          get: () => ({ id: 1 }),
          all: () => rowsBySql[s] || [],
          run: () => ({ changes: 1 })
        };
      }
      close() {}
    }
  }));
}

describe('db.js calls + costs helpers', () => {
  test('upsertCall calls INSERT INTO calls', async () => {
    mockSqlite();
    const db = await import('../../db.js');
    await db.init();

    // We assert by ensuring sqlite prepare saw the INSERT template for calls.
    const prepared = [];
    // re-mock with capture
    jest.resetModules();
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
    jest.unstable_mockModule('better-sqlite3', () => ({
      default: class Database {
        exec() {}
        prepare(sql) {
          prepared.push(String(sql));
          return { get: () => ({ id: 1 }), all: () => [], run: () => ({ changes: 1 }) };
        }
        close() {}
      }
    }));
    const db2 = await import('../../db.js');
    await db2.init();

    await db2.upsertCall({
      callId: 'call_1',
      clientKey: 'c1',
      leadPhone: '+441',
      status: 'ended',
      outcome: 'booked',
      duration: 10,
      cost: 1.23,
      metadata: { a: 1 }
    });

    expect(prepared.join('\n')).toMatch(/INSERT INTO calls/i);
  });

  test('trackCost returns first returned row', async () => {
    // mock sqlite query path returns rows via stmt.all for RETURNING
    // db.js detects RETURNING and uses .all(); our sqlite mock returns [] by default,
    // so we use rowsBySql mapping for this specific INSERT ... RETURNING.
    const returningRow = { id: 9, amount: 3.14 };
    const rowsBySql = {};
    // We don't know the exact whitespace; capture any prepare and if it contains INSERT INTO cost_tracking, return row.
    const cache = { get: async () => null, set: async () => {}, clear: async () => {}, delPrefix: async () => {} };
    jest.unstable_mockModule('../../lib/cache.js', () => ({ getCache: () => cache }));
    jest.unstable_mockModule('fs', () => ({
      default: { existsSync: () => true, mkdirSync: () => {}, readFileSync: () => '{}', writeFileSync: () => {} },
      existsSync: () => true,
      mkdirSync: () => {},
      readFileSync: () => '{}',
      writeFileSync: () => {}
    }));
    jest.unstable_mockModule('better-sqlite3', () => ({
      default: class Database {
        exec() {}
        prepare(sql) {
          const s = String(sql);
          return {
            get: () => ({ id: 1 }),
            all: () => (s.includes('INSERT INTO cost_tracking') ? [returningRow] : []),
            run: () => ({ changes: 1 })
          };
        }
        close() {}
      }
    }));

    const db = await import('../../db.js');
    await db.init();
    const out = await db.trackCost({ clientKey: 'c1', callId: 'call_1', costType: 'vapi', amount: 3.14 });
    expect(out).toEqual(returningRow);
  });
});

