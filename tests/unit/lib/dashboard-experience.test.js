import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import {
  resolveLogisticsSpreadsheetId,
  trimEnvDashboard,
  parseDashboardPrivacyBullets,
  buildDashboardExperience,
  adjustColorBrightness
} from '../../../lib/dashboard-experience.js';

describe('dashboard-experience', () => {
  const KEYS = [
    'LOGISTICS_SHEET_ID',
    'DASHBOARD_PRIVACY_BULLETS',
    'DASHBOARD_PRIVACY_EXPORT_NOTE',
    'DASHBOARD_APP_VERSION',
    'RENDER_GIT_COMMIT',
    'DASHBOARD_GLOBAL_READ_ONLY',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'FOO'
  ];
  const snapshot = {};

  beforeEach(() => {
    for (const k of KEYS) {
      snapshot[k] = process.env[k];
    }
    delete process.env.LOGISTICS_SHEET_ID;
    delete process.env.DASHBOARD_PRIVACY_BULLETS;
    delete process.env.DASHBOARD_PRIVACY_EXPORT_NOTE;
    delete process.env.DASHBOARD_APP_VERSION;
    delete process.env.RENDER_GIT_COMMIT;
    delete process.env.DASHBOARD_GLOBAL_READ_ONLY;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.FOO;
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  });

  test('resolveLogisticsSpreadsheetId prefers tenant then env default', () => {
    process.env.LOGISTICS_SHEET_ID = 'env_sheet';
    expect(resolveLogisticsSpreadsheetId(null)).toBe('env_sheet');
    expect(
      resolveLogisticsSpreadsheetId({
        vapi_json: { logisticsSheetId: 'vjson' },
        gsheet_id: 'gs'
      })
    ).toBe('vjson');
    expect(resolveLogisticsSpreadsheetId({ gsheet_id: 'gs', vapi: {} })).toBe('gs');
  });

  test('trimEnvDashboard returns null for empty or missing', () => {
    delete process.env.FOO;
    expect(trimEnvDashboard('FOO')).toBe(null);
    process.env.FOO = '  ';
    expect(trimEnvDashboard('FOO')).toBe(null);
    process.env.FOO = ' bar ';
    expect(trimEnvDashboard('FOO')).toBe('bar');
  });

  test('parseDashboardPrivacyBullets splits pipe list and caps', () => {
    process.env.DASHBOARD_PRIVACY_BULLETS = ' a | b |  ';
    expect(parseDashboardPrivacyBullets()).toEqual(['a', 'b']);
    const many = Array.from({ length: 15 }, (_, i) => `x${i}`).join('|');
    process.env.DASHBOARD_PRIVACY_BULLETS = many;
    expect(parseDashboardPrivacyBullets().length).toBe(10);
  });

  test('buildDashboardExperience reflects voice, sheets, sms, read-only', () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC';
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    process.env.DASHBOARD_APP_VERSION = '1.2.3';
    process.env.RENDER_GIT_COMMIT = 'abc';
    process.env.DASHBOARD_PRIVACY_EXPORT_NOTE = 'export ok';
    process.env.DASHBOARD_PRIVACY_BULLETS = 'one|two';

    const client = {
      vapiAssistantId: 'asst',
      vapi: { logisticsSheetId: 'sh1' }
    };
    const exp = buildDashboardExperience(client, '2020-01-01T00:00:00.000Z');
    expect(exp.integrations.find((i) => i.id === 'voice')?.ok).toBe(true);
    expect(exp.integrations.find((i) => i.id === 'google_sheets')?.ok).toBe(true);
    expect(exp.integrations.find((i) => i.id === 'sms')?.ok).toBe(true);
    expect(exp.sync.metricsAsOfIso).toBe('2020-01-01T00:00:00.000Z');
    expect(exp.privacy.bullets).toEqual(['one', 'two']);
    expect(exp.privacy.exportNote).toBe('export ok');
    expect(exp.app.version).toBe('1.2.3');
    expect(exp.app.commit).toBe('abc');
    expect(exp.ui.readOnly).toBe(false);
  });

  test('buildDashboardExperience read-only from env or tenant flag', () => {
    process.env.DASHBOARD_GLOBAL_READ_ONLY = 'true';
    expect(buildDashboardExperience({ vapi: {} }, null).ui.readOnly).toBe(true);
    process.env.DASHBOARD_GLOBAL_READ_ONLY = '0';
    expect(
      buildDashboardExperience({ vapi: { dashboardReadOnly: true } }, null).ui.readOnly
    ).toBe(true);
  });

  test('adjustColorBrightness darkens primary', () => {
    expect(adjustColorBrightness('#667eea', -20)).toMatch(/^#[0-9a-f]{6}$/i);
    expect(adjustColorBrightness('#667eea', -20)).not.toBe('#667eea');
  });
});
