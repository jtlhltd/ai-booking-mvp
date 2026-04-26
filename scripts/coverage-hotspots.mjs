#!/usr/bin/env node
/**
 * Rank files by uncovered lines from Jest json-summary.
 * Run `npm run test:coverage` first (jest.config includes json-summary reporter).
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const summaryPath = path.join(root, 'coverage', 'coverage-summary.json');

function norm(f) {
  return String(f).split(path.sep).join('/');
}

function main() {
  if (!existsSync(summaryPath)) {
    console.error('[coverage-hotspots] Missing', summaryPath);
    console.error('Run: npm run test:coverage');
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const rows = [];
  for (const [key, v] of Object.entries(raw)) {
    if (key === 'total' || !v?.lines) continue;
    const { total, covered } = v.lines;
    const uncovered = total - covered;
    const pct = total > 0 ? (100 * covered) / total : 100;
    rows.push({
      file: norm(key),
      uncovered,
      total,
      covered,
      pct: Number(pct.toFixed(2)),
    });
  }

  rows.sort((a, b) => b.uncovered - a.uncovered);

  const topIn = (pred, n = 25) => rows.filter((r) => pred(r.file)).slice(0, n);

  console.log('\n=== Top 30 by uncovered lines (all collected files) ===\n');
  for (const r of rows.slice(0, 30)) {
    console.log(
      `${String(r.uncovered).padStart(5)} uncovered / ${String(r.total).padStart(5)} lines (${String(r.pct).padStart(6)}% cov)  ${r.file}`,
    );
  }

  console.log('\n=== Top routes/ (by uncovered lines) ===\n');
  for (const r of topIn((f) => norm(f).includes('/routes/'))) {
    console.log(`${String(r.uncovered).padStart(5)}  ${r.pct}%  ${r.file}`);
  }

  console.log('\n=== Top lib/ (by uncovered lines) ===\n');
  for (const r of topIn((f) => norm(f).includes('/lib/'))) {
    console.log(`${String(r.uncovered).padStart(5)}  ${r.pct}%  ${r.file}`);
  }

  console.log('\n=== db.js + db/ (by uncovered lines) ===\n');
  for (const r of rows.filter(
    (x) =>
      norm(x.file).endsWith('/db.js') ||
      norm(x.file).includes('/db/'),
  )) {
    console.log(`${String(r.uncovered).padStart(5)}  ${r.pct}%  ${r.file}`);
  }

  const t = raw.total?.lines;
  if (t) {
    const pct = ((100 * t.covered) / t.total).toFixed(2);
    console.log(`\nGlobal lines: ${t.covered}/${t.total} (${pct}%)\n`);
  }
}

main();
