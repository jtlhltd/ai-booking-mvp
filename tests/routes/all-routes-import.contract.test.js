import { describe, expect, test, jest } from '@jest/globals';
import { readdirSync } from 'node:fs';
import { withDisabledTimersOnImport } from '../helpers/contract-harness.js';

describe('All routes modules import (smoke contract)', () => {
  test('every routes/*.js module can be imported without throwing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    // Keep imports deterministic across environments.
    process.env.DB_TYPE = process.env.DB_TYPE || 'sqlite';
    await withDisabledTimersOnImport(async () => {
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
          const hasFactory = Object.keys(mod || {}).some(
            (k) => /^create.+Router$/.test(k) && typeof mod[k] === 'function'
          );
          if (!hasDefault && !hasFactory) {
            failures.push({ file: f, error: 'No default export or create*Router factory export found' });
          }
        } catch (e) {
          failures.push({ file: f, error: String(e?.message || e) });
        }
      }

      expect(failures).toEqual([]);
    });
    warn.mockRestore();
    err.mockRestore();
  }, 30000);
});

