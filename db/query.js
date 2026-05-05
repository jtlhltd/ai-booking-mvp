import { getCache } from '../lib/cache.js';
import { JsonFileDatabase } from './json-file-database.js';
import { ErrorFactory } from '../lib/errors.js';
import { getRetryManager } from '../lib/retry-logic.js';

/**
 * Core query execution (Postgres / SQLite / JSON file) with cache + mutation invalidation.
 * State is read via getState() on each call so pool/sqlite can be swapped after init.
 *
 * @param {() => { dbType: string; pool: import('pg').Pool | null; sqlite: import('better-sqlite3').Database | null; pgQueryLimiter: { run: (fn: () => Promise<any>) => Promise<any> } | null }} getState
 */
export function createQueryRunner(getState) {
  /** Opt-in: set DB_QUERY_CACHE_SELECTS=1 to restore legacy 5m SELECT result caching (off by default to avoid stale reads). */
  function selectQueryCacheEnabled() {
    return /^(1|true|yes)$/i.test(String(process.env.DB_QUERY_CACHE_SELECTS || '').trim());
  }

  async function query(text, params = []) {
    const { dbType, pool, sqlite, pgQueryLimiter } = getState();
    const cache = getCache();
    const sqlText = text == null ? '' : String(text);
    if (!sqlText.trim()) {
      throw new Error('[db.query] SQL text is required (got empty or non-string)');
    }
    const cacheKey = `query:${sqlText}:${JSON.stringify(params)}`;
    const upper = sqlText.trim().toUpperCase();
    const cacheSelects = selectQueryCacheEnabled();

    if (cacheSelects && upper.startsWith('SELECT')) {
      const cached = await cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const startTime = Date.now();
    let result;

    try {
      if (dbType === 'postgres' && pool) {
        const exec = () => pool.query(sqlText, params);
        result = pgQueryLimiter ? await pgQueryLimiter.run(exec) : await exec();
      } else if (sqlite) {
        let sqliteText = sqlText;
        if (sqlText.includes('$1')) {
          sqliteText = sqlText.replace(/\$\d+/g, '?');
        }
        const sqliteParams = params.map((p) => (p instanceof Date ? p.toISOString() : p));
        const stmt = sqlite.prepare(sqliteText);
        const hasReturning = /\bRETURNING\b/i.test(sqlText);
        const isSelectShape = upper.startsWith('SELECT') || upper.startsWith('WITH');
        if (isSelectShape) {
          result = { rows: stmt.all(...sqliteParams) };
        } else if (
          hasReturning &&
          (upper.startsWith('INSERT') || upper.startsWith('UPDATE') || upper.startsWith('DELETE'))
        ) {
          result = { rows: stmt.all(...sqliteParams) };
        } else {
          result = stmt.run(...sqliteParams);
        }
      } else {
        const jsonDb = new JsonFileDatabase('./data');
        const stmt = jsonDb.prepare(sqlText);
        if (upper.startsWith('SELECT')) {
          result = { rows: stmt.all(...params) };
        } else {
          result = stmt.run(...params);
        }
      }

      const duration = Date.now() - startTime;

      if (dbType === 'postgres' && duration >= 100 && !process.env.JEST_WORKER_ID) {
        setImmediate(() => {
          import('../lib/query-performance-tracker.js')
            .then((module) => {
              module.trackQueryPerformance(sqlText, duration, params).catch(() => {});
            })
            .catch(() => {});
        });
      }

      if (cacheSelects && upper.startsWith('SELECT') && result.rows) {
        await cache.set(cacheKey, result, 300000);
      }

      if (
        cacheSelects &&
        (upper.startsWith('INSERT') ||
          upper.startsWith('UPDATE') ||
          upper.startsWith('DELETE') ||
          upper.startsWith('UPSERT'))
      ) {
        try {
          await cache.clear();
        } catch {
          /* best-effort */
        }
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      if (dbType === 'postgres' && duration >= 100 && !process.env.JEST_WORKER_ID) {
        import('../lib/query-performance-tracker.js').then((module) => {
          module.trackQueryPerformance(sqlText, duration, params).catch(() => {});
        });
      }
      throw error;
    }
  }

  async function poolQuerySelect(text, params = []) {
    const { dbType, pool } = getState();
    if (dbType === 'postgres' && pool) {
      return pool.query(text, params);
    }
    return query(text, params);
  }

  async function safeQuery(text, params = []) {
    const retryManager = getRetryManager({
      maxRetries: 3,
      baseDelay: 1000,
      retryCondition: (error) => {
        const msg = String(error?.message || '');
        return (
          error.code === 'ECONNREFUSED' ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ENOTFOUND' ||
          msg.includes('Timeout exceeded when trying to connect') ||
          (error.status >= 500 && error.status < 600)
        );
      },
    });

    try {
      return await retryManager.execute(() => query(text, params), {
        operation: 'database_query',
        query: text.substring(0, 100),
      });
    } catch (error) {
      throw ErrorFactory.fromDatabaseError(error, 'query');
    }
  }

  return { query, poolQuerySelect, safeQuery };
}
