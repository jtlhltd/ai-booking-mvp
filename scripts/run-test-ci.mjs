import { spawn } from 'node:child_process';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`));
    });
  });
}

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

try {
  // Inventory gates: prevent silent regressions in routing surface.
  await run(npmCmd, ['run', 'test:route-inventory']);
  await run(npmCmd, ['run', 'test:server-inline-inventory']);

  if (process.platform === 'win32') {
    console.log('[test:ci] win32 detected: skipping sqlite/postgres integration toggles.');
    await run(npmCmd, ['test'], { env: { ...process.env, TZ: 'UTC' } });
    await run(npmCmd, ['run', 'test:coverage'], { env: { ...process.env, TZ: 'UTC' } });
  } else {
    await run(npmCmd, ['rebuild', 'better-sqlite3']);
    await run(
      npmCmd,
      ['test'],
      {
        env: {
          ...process.env,
          TZ: 'UTC',
          RUN_DB_INTEGRATION_TESTS: '1',
          RUN_SQLITE_INTEGRATION_TESTS: '1',
          RUN_POSTGRES_SMOKE_TESTS: '1',
        },
      },
    );
    await run(npmCmd, ['run', 'test:coverage'], { env: { ...process.env, TZ: 'UTC' } });
  }
} catch (e) {
  console.error('[test:ci] failed:', e?.message || String(e));
  process.exit(1);
}

