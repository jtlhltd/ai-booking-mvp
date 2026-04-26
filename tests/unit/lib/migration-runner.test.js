import { describe, test, expect, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('lib/migration-runner', () => {
  test('runMigrations returns early when migrations dir missing', async () => {
    jest.unstable_mockModule('fs/promises', () => ({
      default: {
        access: jest.fn(async () => {
          throw new Error('no dir');
        }),
      },
      access: jest.fn(async () => {
        throw new Error('no dir');
      }),
    }));

    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => ({ rows: [] })),
    }));

    const { runMigrations } = await import('../../../lib/migration-runner.js');
    const out = await runMigrations();
    expect(out).toEqual({ applied: 0, skipped: 0, total: 0 });
  });

  test('getMigrationStatus returns error when migrations read fails', async () => {
    jest.unstable_mockModule('fs/promises', () => ({
      default: {
        readdir: jest.fn(async () => {
          throw new Error('boom');
        }),
      },
      readdir: jest.fn(async () => {
        throw new Error('boom');
      }),
    }));

    jest.unstable_mockModule('../../../db.js', () => ({
      query: jest.fn(async () => ({ rows: [] })),
    }));

    const { getMigrationStatus } = await import('../../../lib/migration-runner.js');
    const out = await getMigrationStatus();
    expect(out).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });
});

