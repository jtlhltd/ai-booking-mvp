import { describe, expect, test, jest, beforeEach } from '@jest/globals';

beforeEach(() => {
  jest.resetModules();
  delete process.env.DEMO_MODE;
  delete process.env.DEMO_SCRIPT_PATH;
});

describe('lib/demo-script', () => {
  test('isDemoModeEnabled respects DEMO_MODE env', async () => {
    process.env.DEMO_MODE = 'true';
    const { isDemoModeEnabled } = await import('../../../lib/demo-script.js');
    expect(isDemoModeEnabled()).toBe(true);
  });

  test('loadDemoScript returns default when missing file and caches (until cleared)', async () => {
    jest.unstable_mockModule('fs/promises', () => ({
      default: {
        readFile: jest.fn(async () => {
          const err = new Error('nope');
          err.code = 'ENOENT';
          throw err;
        })
      },
      readFile: jest.fn(async () => {
        const err = new Error('nope');
        err.code = 'ENOENT';
        throw err;
      })
    }));

    const { loadDemoScript, clearDemoScriptCache } = await import('../../../lib/demo-script.js');
    const a = await loadDemoScript();
    const b = await loadDemoScript();
    expect(a).toBe(b); // cached object
    expect(a).toEqual(expect.objectContaining({ scenarios: [] }));
    clearDemoScriptCache();
    const c = await loadDemoScript();
    // default script is a stable frozen object
    expect(c).toBe(a);
  });

  test('getDemoOverrides merges defaults + scenario and resolves slot override', async () => {
    process.env.DEMO_MODE = 'true';
    jest.unstable_mockModule('fs/promises', () => ({
      default: {
        readFile: jest.fn(async () =>
          JSON.stringify({
            meta: { version: 2 },
            defaults: { overrides: { sms: { message: 'hi', skip: false } } },
            scenarios: [
              {
                id: 's1',
                match: { clientKey: 'c1' },
                overrides: {
                  slot: { offsetMinutes: 30, second: 0 },
                  sms: { skip: true }
                }
              }
            ]
          })
        )
      }
    }));

    const { getDemoOverrides } = await import('../../../lib/demo-script.js');
    const now = new Date('2026-01-01T10:00:00.000Z');
    const out = await getDemoOverrides({ clientKey: 'c1', timezone: 'UTC' }, { now, timezone: 'UTC', forceReload: true });

    expect(out).toEqual(
      expect.objectContaining({
        scenarioId: 's1',
        sms: expect.objectContaining({ message: 'hi', skip: true }),
        slot: expect.objectContaining({ iso: expect.any(String) })
      })
    );
  });

  test('resolveSlotOverride supports iso + weekday/time + time-only and clamps invalid time parts', async () => {
    const { resolveSlotOverride } = await import('../../../lib/demo-script.js');

    const reference = new Date('2026-01-02T10:00:00.000Z'); // Friday
    const iso = resolveSlotOverride({ iso: '2026-01-03T10:00:00.000Z' }, { now: reference, timezone: 'UTC' });
    expect(iso).toContain('2026-01-03');

    const nextMon = resolveSlotOverride({ weekday: 'mon', time: '25:99:99' }, { now: reference, timezone: 'UTC' });
    expect(nextMon).toContain('T23:59:59'); // clamped

    const tomorrowAt = resolveSlotOverride({ time: '09:00:00' }, { now: reference, timezone: 'UTC' });
    // 09:00 is in the past for the reference date, so it should bump to next day
    expect(tomorrowAt).toContain('T09:00:00');
  });

  test('formatOverridesForTelemetry is stable for missing parts', async () => {
    const { formatOverridesForTelemetry } = await import('../../../lib/demo-script.js');
    expect(formatOverridesForTelemetry(null)).toBeNull();
    expect(formatOverridesForTelemetry({ scenarioId: 's', slot: { iso: 'x' }, sms: { message: 'm', skip: true } })).toEqual({
      scenarioId: 's',
      slotIso: 'x',
      smsTemplate: 'm',
      smsSkip: true
    });
  });
});

