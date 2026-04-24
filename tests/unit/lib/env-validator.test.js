import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('lib/env-validator', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  test('throws when critical vars missing (DATABASE_URL, API_KEY)', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.API_KEY;

    const { validateEnvironment } = await import('../../../lib/env-validator.js');
    expect(() => validateEnvironment()).toThrow(/Missing required environment variables/);
  });

  test('passes when critical vars present, even if optionals missing', async () => {
    process.env.DATABASE_URL = 'sqlite://:memory:';
    process.env.API_KEY = 'k';

    const { validateEnvironment } = await import('../../../lib/env-validator.js');
    const res = validateEnvironment();
    expect(res).toEqual(expect.objectContaining({ valid: true }));
    expect(res.warnings).toBeGreaterThanOrEqual(0);
  });

  test('does not warn for GOOGLE_PRIVATE_KEY when GOOGLE_SA_JSON_BASE64 present', async () => {
    process.env.DATABASE_URL = 'sqlite://:memory:';
    process.env.API_KEY = 'k';
    delete process.env.GOOGLE_PRIVATE_KEY;
    process.env.GOOGLE_SA_JSON_BASE64 = 'base64blob';

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { validateEnvironment } = await import('../../../lib/env-validator.js');
    validateEnvironment();
    const warnText = warnSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(warnText).not.toMatch(/GOOGLE_PRIVATE_KEY/);
    warnSpy.mockRestore();
  });

  test('debug logging prints configured variables list', async () => {
    process.env.DATABASE_URL = 'sqlite://:memory:';
    process.env.API_KEY = 'k';
    process.env.LOG_LEVEL = 'debug';

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const { validateEnvironment } = await import('../../../lib/env-validator.js');
    validateEnvironment();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});

