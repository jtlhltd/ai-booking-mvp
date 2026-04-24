import { describe, expect, test, jest, beforeEach } from '@jest/globals';

const sqliteState = { lastPreparedSql: null, allRows: [{ x: 1 }] };

beforeEach(() => {
  sqliteState.lastPreparedSql = null;
  sqliteState.allRows = [{ x: 1 }];
  jest.resetModules();
  delete process.env.DB_TYPE;
  delete process.env.DATABASE_URL;
  delete process.env.DB_PATH;
  delete process.env.DATA_DIR;
});

describe('db.js init/query contracts (branch coverage)', () => {
  test('init throws when DB_TYPE=postgres but DATABASE_URL missing', async () => {
    process.env.DB_TYPE = 'postgres';

    jest.unstable_mockModule('pg', () => ({
      Pool: class Pool {
        // Should never be constructed for this branch.
        constructor() {
          throw new Error('Pool should not be constructed');
        }
      }
    }));

    const db = await import('../../db.js');
    await expect(db.init()).rejects.toThrow(/DATABASE_URL is required/i);
  });

  test('sqlite query converts $1 placeholders and returns stmt.all rows', async () => {
    process.env.DB_TYPE = 'sqlite';
    process.env.DATA_DIR = 'data-test';
    process.env.DB_PATH = 'data-test/app.db';

    jest.unstable_mockModule('fs', () => ({
      default: {
        existsSync: () => true,
        mkdirSync: () => {},
        readFileSync: () => '{}',
        writeFileSync: () => {}
      },
      existsSync: () => true,
      mkdirSync: () => {},
      readFileSync: () => '{}',
      writeFileSync: () => {}
    }));

    jest.unstable_mockModule('better-sqlite3', () => ({
      default: class Database {
        exec() {}
        prepare(sql) {
          sqliteState.lastPreparedSql = sql;
          return {
            get: () => ({}),
            all: () => sqliteState.allRows,
            run: () => ({ changes: 1 })
          };
        }
        close() {}
      }
    }));

    jest.unstable_mockModule('../../lib/cache.js', () => ({
      getCache: () => ({
        get: async () => null,
        set: async () => {},
        clear: async () => {},
        delPrefix: async () => {}
      })
    }));

    // Avoid async perf-tracker import scheduling.
    process.env.JEST_WORKER_ID = '1';
    const db = await import('../../db.js');
    await db.init();

    const out = await db.query('SELECT * FROM t WHERE a = $1 AND b = $2', [1, 2]);
    expect(out).toEqual({ rows: [{ x: 1 }] });
    expect(sqliteState.lastPreparedSql).toBe('SELECT * FROM t WHERE a = ? AND b = ?');
  });

  test('query uses JSON fallback when neither postgres nor sqlite initialized', async () => {
    process.env.DB_TYPE = '';

    jest.unstable_mockModule('../../lib/cache.js', () => ({
      getCache: () => ({
        get: async () => null,
        set: async () => {},
        clear: async () => {},
        delPrefix: async () => {}
      })
    }));

    jest.unstable_mockModule('fs', () => ({
      default: {
        existsSync: () => false,
        readFileSync: () => '{}',
        writeFileSync: () => {}
      },
      existsSync: () => false,
      readFileSync: () => '{}',
      writeFileSync: () => {}
    }));

    jest.unstable_mockModule('better-sqlite3', () => ({ default: class Database {} }));
    jest.unstable_mockModule('pg', () => ({ Pool: class Pool {} }));

    process.env.JEST_WORKER_ID = '1';
    const db = await import('../../db.js');

    const out = await db.query('SELECT * FROM leads', []);
    expect(out).toEqual({ rows: [] });
  });

  test('query serves cached SELECT results on second call', async () => {
    process.env.DB_TYPE = 'sqlite';
    process.env.DATA_DIR = 'data-test';
    process.env.DB_PATH = 'data-test/app.db';

    const cache = {
      v: null,
      get: async () => cache.v,
      set: async (_k, v) => {
        cache.v = v;
      },
      clear: async () => {},
      delPrefix: async () => {}
    };

    jest.unstable_mockModule('fs', () => ({
      default: {
        existsSync: () => true,
        mkdirSync: () => {},
        readFileSync: () => '{}',
        writeFileSync: () => {}
      },
      existsSync: () => true,
      mkdirSync: () => {},
      readFileSync: () => '{}',
      writeFileSync: () => {}
    }));
    jest.unstable_mockModule('better-sqlite3', () => ({
      default: class Database {
        exec() {}
        prepare(sql) {
          return {
            get: () => ({}),
            all: () => {
              return [{ x: 42 }];
            },
            run: () => ({ changes: 1 })
          };
        }
        close() {}
      }
    }));
    jest.unstable_mockModule('../../lib/cache.js', () => ({ getCache: () => cache }));
    process.env.JEST_WORKER_ID = '1';

    const db = await import('../../db.js');
    await db.init();

    const a = await db.query('SELECT 1', []);
    const b = await db.query('SELECT 1', []);
    expect(a).toEqual({ rows: [{ x: 42 }] });
    expect(b).toEqual({ rows: [{ x: 42 }] });
  });

  test('query clears cache after mutation (best-effort)', async () => {
    process.env.DB_TYPE = 'sqlite';
    process.env.DATA_DIR = 'data-test';
    process.env.DB_PATH = 'data-test/app.db';

    const cache = {
      get: async () => null,
      set: async () => {},
      clear: jest.fn(async () => {}),
      delPrefix: async () => {}
    };

    jest.unstable_mockModule('fs', () => ({
      default: {
        existsSync: () => true,
        mkdirSync: () => {},
        readFileSync: () => '{}',
        writeFileSync: () => {}
      },
      existsSync: () => true,
      mkdirSync: () => {},
      readFileSync: () => '{}',
      writeFileSync: () => {}
    }));

    jest.unstable_mockModule('better-sqlite3', () => ({
      default: class Database {
        exec() {}
        prepare(_sql) {
          return {
            get: () => ({}),
            all: () => [],
            run: () => ({ changes: 1 })
          };
        }
        close() {}
      }
    }));

    jest.unstable_mockModule('../../lib/cache.js', () => ({ getCache: () => cache }));
    process.env.JEST_WORKER_ID = '1';

    const db = await import('../../db.js');
    await db.init();

    await db.query('UPDATE t SET a = $1 WHERE id = $2', [1, 2]);
    expect(cache.clear).toHaveBeenCalled();
  });
});

