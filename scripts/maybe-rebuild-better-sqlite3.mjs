import { spawn } from 'node:child_process';

if (process.platform === 'win32') {
  console.log('[test:ci] Skipping better-sqlite3 rebuild on win32.');
  process.exit(0);
}

const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(cmd, ['rebuild', 'better-sqlite3'], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));

