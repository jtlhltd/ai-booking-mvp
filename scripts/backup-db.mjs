#!/usr/bin/env node
/**
 * Manual Postgres backup (pre-deploy / pre-split safety).
 *
 * Usage:
 *   node scripts/backup-db.mjs
 *   node scripts/backup-db.mjs --out-dir D:\backups\ai-booking-mvp
 *
 * Tries pg_dump when available; otherwise writes a data-only SQL file via pg.
 * Output is never committed — store outside the repo.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import pg from 'pg';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const outIdx = argv.indexOf('--out-dir');
  return {
    outDir:
      outIdx >= 0 && argv[outIdx + 1]
        ? path.resolve(argv[outIdx + 1])
        : path.resolve(repoRoot, '..', 'backups', 'ai-booking-mvp'),
  };
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function gitShortSha() {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return r.status === 0 ? r.stdout.trim() : 'unknown';
}

function findPgDump() {
  const names = process.platform === 'win32' ? ['pg_dump.exe', 'pg_dump'] : ['pg_dump'];
  for (const name of names) {
    const r = spawnSync('where', [name], { encoding: 'utf8', shell: true });
    if (r.status === 0 && r.stdout.trim()) {
      return r.stdout.trim().split(/\r?\n/)[0].trim();
    }
  }
  const pgRoot = process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL' : '/usr/lib/postgresql';
  if (fs.existsSync(pgRoot)) {
    for (const ver of fs.readdirSync(pgRoot)) {
      const candidate =
        process.platform === 'win32'
          ? path.join(pgRoot, ver, 'bin', 'pg_dump.exe')
          : path.join(pgRoot, ver, 'bin', 'pg_dump');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function poolSsl(databaseUrl) {
  if (!databaseUrl.includes('render.com') && !databaseUrl.includes('sslmode=require')) {
    return undefined;
  }
  return { rejectUnauthorized: false };
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  if (Buffer.isBuffer(value)) return `'\\x${value.toString('hex')}'`;
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function listPublicTables(client) {
  const { rows } = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return rows.map((r) => r.table_name);
}

async function tableRowCount(client, tableName) {
  const { rows } = await client.query(`SELECT COUNT(*)::bigint AS n FROM ${quoteIdent(tableName)}`);
  return Number(rows[0]?.n || 0);
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

async function dumpDataOnlySql(client, tables, sqlPath) {
  const lines = [
    '-- ai-booking-mvp data-only backup (Node fallback — schema must already exist)',
    `-- generated: ${new Date().toISOString()}`,
    'BEGIN;',
    'SET session_replication_role = replica;',
  ];

  for (const table of tables) {
    const count = await tableRowCount(client, table);
    lines.push(`-- table ${table}: ${count} rows`);
    if (!count) continue;

    const colRes = await client.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
      `,
      [table]
    );
    const columns = colRes.rows.map((r) => r.column_name);
    const colList = columns.map(quoteIdent).join(', ');

    const batchSize = 200;
    let offset = 0;
    while (offset < count) {
      const { rows } = await client.query(
        `SELECT ${colList} FROM ${quoteIdent(table)} ORDER BY 1 LIMIT $1 OFFSET $2`,
        [batchSize, offset]
      );
      for (const row of rows) {
        const values = columns.map((c) => sqlLiteral(row[c])).join(', ');
        lines.push(`INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${values});`);
      }
      offset += batchSize;
    }
  }

  lines.push('SET session_replication_role = DEFAULT;');
  lines.push('COMMIT;');
  fs.writeFileSync(sqlPath, `${lines.join('\n')}\n`, 'utf8');
}

async function writeManifest(dir, extra) {
  const manifest = {
    createdAt: new Date().toISOString(),
    gitSha: gitShortSha(),
    databaseUrlHost: (() => {
      try {
        return new URL(process.env.DATABASE_URL).host;
      } catch {
        return 'unknown';
      }
    })(),
    ...extra,
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(dir, 'git-sha.txt'), `${manifest.gitSha}\n`, 'utf8');
}

async function main() {
  const { outDir } = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required (set in .env)');
    process.exit(1);
  }

  const runDir = path.join(outDir, timestamp());
  fs.mkdirSync(runDir, { recursive: true });

  const pgDump = findPgDump();
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: poolSsl(databaseUrl),
  });

  try {
    const tables = await listPublicTables(pool);
    const counts = {};
    for (const table of tables) {
      counts[table] = await tableRowCount(pool, table);
    }
    fs.writeFileSync(path.join(runDir, 'table-counts.json'), `${JSON.stringify(counts, null, 2)}\n`, 'utf8');

    if (pgDump) {
      const sqlPath = path.join(runDir, 'database.sql');
      console.log(`[backup] using pg_dump: ${pgDump}`);
      const args = ['--dbname', databaseUrl, '--format=plain', '--no-owner', '--no-acl', '--file', sqlPath];
      const r = spawnSync(pgDump, args, { encoding: 'utf8', stdio: 'pipe' });
      if (r.status !== 0) {
        console.error('[backup] pg_dump failed:', r.stderr || r.stdout);
        process.exit(1);
      }
      await writeManifest(runDir, {
        method: 'pg_dump',
        sqlFile: 'database.sql',
        tableCounts: counts,
      });
      console.log(`[backup] ok → ${runDir}`);
      console.log(`[backup] restore: psql $DATABASE_URL < "${sqlPath}"`);
      return;
    }

    console.warn('[backup] pg_dump not found — using Node data-only SQL fallback');
    const sqlPath = path.join(runDir, 'database-data-only.sql');
    await dumpDataOnlySql(pool, tables, sqlPath);
    await writeManifest(runDir, {
      method: 'node-data-only',
      sqlFile: 'database-data-only.sql',
      tableCounts: counts,
      note: 'Schema must already exist. Prefer installing PostgreSQL client tools for full pg_dump backups.',
    });
    console.log(`[backup] ok → ${runDir}`);
    console.log(`[backup] restore (existing schema): psql $DATABASE_URL < "${sqlPath}"`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[backup] failed:', err?.message || err);
  process.exit(1);
});
