import { describe, expect, test } from '@jest/globals';
import { readdirSync } from 'node:fs';

describe('All routes modules import (smoke contract)', () => {
  test('every routes/*.js module can be imported without throwing', async () => {
    // Keep imports deterministic across environments.
    process.env.DB_TYPE = process.env.DB_TYPE || 'sqlite';

    // Many modules schedule background timers on import (setInterval, etc).
    // For a pure "can we import every router module?" contract, stub timers to avoid open handles.
    const realSetInterval = global.setInterval;
    const realSetTimeout = global.setTimeout;
    // eslint-disable-next-line no-global-assign
    global.setInterval = () => 0;
    // eslint-disable-next-line no-global-assign
    global.setTimeout = () => 0;

    const dir = new URL('../../routes/', import.meta.url);
    const files = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.js'))
      .map((d) => d.name)
      .sort();

    const failures = [];
    for (const f of files) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const mod = await import(`../../routes/${f}`);
        // Each route module should export either a default Router or a create*Router factory.
        const hasDefault = !!mod?.default;
        const hasFactory = Object.keys(mod || {}).some((k) => /^create.+Router$/.test(k) && typeof mod[k] === 'function');
        if (!hasDefault && !hasFactory) {
          failures.push({ file: f, error: 'No default export or create*Router factory export found' });
        }
      } catch (e) {
        failures.push({ file: f, error: String(e?.message || e) });
      }
    }

    // restore timers
    global.setInterval = realSetInterval;
    global.setTimeout = realSetTimeout;

    expect(failures).toEqual([]);
  }, 30000);
});

