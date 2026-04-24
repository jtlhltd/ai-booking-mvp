import { describe, test, expect, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
});

describe('lib/feature-flags', () => {
  test('isFeatureEnabled returns false when globally disabled', async () => {
    const { disableFeature, isFeatureEnabled } = await import('../../../lib/feature-flags.js');
    disableFeature('smsEnabled');
    await expect(isFeatureEnabled('smsEnabled')).resolves.toBe(false);
  });

  test('isFeatureEnabled returns false when client override disables feature', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      getFullClient: jest.fn(async () => ({ featureFlags: { smsEnabled: false } })),
    }));
    const { isFeatureEnabled } = await import('../../../lib/feature-flags.js');
    await expect(isFeatureEnabled('smsEnabled', 'c1')).resolves.toBe(false);
  });

  test('isFeatureEnabled fails open when getFullClient throws', async () => {
    jest.unstable_mockModule('../../../db.js', () => ({
      getFullClient: jest.fn(async () => {
        throw new Error('db_down');
      }),
    }));
    const { isFeatureEnabled } = await import('../../../lib/feature-flags.js');
    await expect(isFeatureEnabled('smsEnabled', 'c1')).resolves.toBe(true);
  });

  test('withDegradation uses fallback when disabled', async () => {
    const { disableFeature, withDegradation } = await import('../../../lib/feature-flags.js');
    disableFeature('calendarEnabled');
    const out = await withDegradation('calendarEnabled', async () => 'primary', async () => 'fallback');
    expect(out).toBe('fallback');
  });

  test('withDegradation throws when disabled and no fallback provided', async () => {
    const { disableFeature, withDegradation } = await import('../../../lib/feature-flags.js');
    disableFeature('vapiEnabled');
    await expect(withDegradation('vapiEnabled', async () => 'primary')).rejects.toThrow(
      /no fallback provided/,
    );
  });

  test('withDegradation returns primary on success', async () => {
    const { withDegradation, enableFeature } = await import('../../../lib/feature-flags.js');
    enableFeature('webhooksEnabled');
    await expect(withDegradation('webhooksEnabled', async () => 'ok')).resolves.toBe('ok');
  });

  test('withDegradation uses fallback when primary throws', async () => {
    const { withDegradation, enableFeature } = await import('../../../lib/feature-flags.js');
    enableFeature('remindersEnabled');
    const out = await withDegradation(
      'remindersEnabled',
      async () => {
        throw new Error('boom');
      },
      async () => 'fallback_ok',
    );
    expect(out).toBe('fallback_ok');
  });

  test('withDegradation throws combined error when primary and fallback both fail', async () => {
    const { withDegradation, enableFeature } = await import('../../../lib/feature-flags.js');
    enableFeature('remindersEnabled');
    await expect(
      withDegradation(
        'remindersEnabled',
        async () => {
          throw new Error('primary_bad');
        },
        async () => {
          throw new Error('fallback_bad');
        },
      ),
    ).rejects.toThrow(/Primary and fallback both failed/);
  });
});

