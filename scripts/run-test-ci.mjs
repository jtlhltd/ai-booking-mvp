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

  const baseEnv = { ...process.env, TZ: 'UTC' };

  // Avoid accidentally running native integration tests in environments that can't
  // support them (e.g. Windows without toolchain, Cursor-bundled Node, etc).
  // Opt-in explicitly via RUN_NATIVE_INTEGRATION=1.
  const runNativeIntegration = baseEnv.RUN_NATIVE_INTEGRATION === '1';
  if (!runNativeIntegration) {
    delete baseEnv.RUN_DB_INTEGRATION_TESTS;
    delete baseEnv.RUN_SQLITE_INTEGRATION_TESTS;
    delete baseEnv.RUN_POSTGRES_SMOKE_TESTS;
    delete baseEnv.TEST_DATABASE_URL;
  }

  // Tier 1 + Tier 2 should be runnable everywhere (including Windows).
  await run(npmCmd, ['run', 'test:unit'], { env: baseEnv });
  await run(npmCmd, ['run', 'test:integration-lite'], { env: baseEnv });
  await run(npmCmd, ['run', 'test:coverage'], { env: baseEnv });

  // Tier 3: only when explicitly enabled (and typically only on Linux CI).
  if (runNativeIntegration) {
    if (process.platform !== 'win32') {
      await run(npmCmd, ['rebuild', 'better-sqlite3']);
    }
    await run(npmCmd, ['test', '--', 'tests/integration'], { env: baseEnv });
  }
} catch (e) {
  console.error('[test:ci] failed:', e?.message || String(e));
  process.exit(1);
}

