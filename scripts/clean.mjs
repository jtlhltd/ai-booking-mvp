#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const targets = [
  'public/build',
  'coverage',
  'coverage-tmp',
];

function rmrf(rel) {
  const abs = path.join(root, rel);
  try {
    fs.rmSync(abs, { recursive: true, force: true });
    process.stdout.write(`[clean] removed ${rel}\n`);
  } catch (e) {
    process.stderr.write(`[clean] failed to remove ${rel}: ${e?.message || e}\n`);
    process.exitCode = 1;
  }
}

for (const t of targets) rmrf(t);

