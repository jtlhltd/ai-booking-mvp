import { spawn } from 'node:child_process';

const LEAK_WARNING_REGEX = /A worker process has failed to exit gracefully/i;

function run(cmd, args, opts = {}) {
  // Inherit stdio so output remains visible/streamed, while ALSO forking a passthrough
  // pipe on stderr so we can detect the Jest "worker failed to exit gracefully" warning
  // without losing the realtime stream.
  const { failOnLeakWarning = false, ...spawnOpts } = opts;

  return new Promise((resolve, reject) => {
    if (!failOnLeakWarning) {
      const child = spawn(cmd, args, {
        stdio: 'inherit',
        shell: process.platform === 'win32',
        ...spawnOpts
      });
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`));
      });
      return;
    }

    let leakDetected = false;
    const child = spawn(cmd, args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      ...spawnOpts
    });

    child.stdout.on('data', (chunk) => {
      const s = chunk.toString();
      process.stdout.write(s);
      if (LEAK_WARNING_REGEX.test(s)) leakDetected = true;
    });
    child.stderr.on('data', (chunk) => {
      const s = chunk.toString();
      process.stderr.write(s);
      if (LEAK_WARNING_REGEX.test(s)) leakDetected = true;
    });

    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`));
        return;
      }
      if (leakDetected) {
        reject(
          new Error(
            `${cmd} ${args.join(' ')} produced a worker-leak warning. ` +
              'Fix open handles (timers, pools, sockets) or guard them with .unref().'
          )
        );
        return;
      }
      resolve();
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
  // Treat any "worker failed to exit gracefully" warning as a hard failure — those
  // warnings indicate leaked handles/timers and make CI flaky over time.
  await run(npmCmd, ['run', 'test:unit'], { env: baseEnv, failOnLeakWarning: true });
  await run(npmCmd, ['run', 'test:integration-lite'], { env: baseEnv, failOnLeakWarning: true });
  await run(npmCmd, ['run', 'test:coverage'], { env: baseEnv, failOnLeakWarning: true });

  // Dedicated diagnostic lane: --detectOpenHandles + --runInBand surfaces stack traces
  // for any leaked handles. Skip if SKIP_DETECT_HANDLES_LANE=1 (e.g. local fast loops).
  if (baseEnv.SKIP_DETECT_HANDLES_LANE !== '1') {
    await run(npmCmd, ['run', 'test:detect-leaks'], { env: baseEnv, failOnLeakWarning: true });
  }

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
