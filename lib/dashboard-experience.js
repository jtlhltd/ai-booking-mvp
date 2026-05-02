/**
 * Client-dashboard bundle: env-driven privacy copy, build metadata, integration hints.
 * Extracted from server.js for testability and smaller entrypoint.
 */

export function resolveLogisticsSpreadsheetId(client) {
  if (!client) return process.env.LOGISTICS_SHEET_ID || null;
  return (
    client.vapi_json?.logisticsSheetId ||
    client.vapi?.logisticsSheetId ||
    client.gsheet_id ||
    process.env.LOGISTICS_SHEET_ID ||
    null
  );
}

export function trimEnvDashboard(key) {
  const v = process.env[key];
  if (v == null || String(v).trim() === '') return null;
  return String(v).trim();
}

export function parseDashboardPrivacyBullets() {
  const raw = trimEnvDashboard('DASHBOARD_PRIVACY_BULLETS');
  if (!raw) return [];
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
}

/**
 * Client-dashboard-only bundle: integrations, sync timestamps, privacy copy, build ids, read-only flag.
 */
export function buildDashboardExperience(client, metricsAsOfIso) {
  const v = client?.vapi && typeof client.vapi === 'object' && !Array.isArray(client.vapi) ? client.vapi : {};
  const voiceOk = !!(client?.vapiAssistantId || v.assistantId);
  const tenantLogistics = !!(v.logisticsSheetId && String(v.logisticsSheetId).trim());
  const resolvedSheet = resolveLogisticsSpreadsheetId(client);
  const logisticsAny = !!resolvedSheet;
  const crmLeadSheet = !!(v.gsheet_id || v.gsheetId || v.crmSheetId || v.googleSheetId);
  const smsOk = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  const readOnlyGlobal = /^(1|true|yes)$/i.test(String(process.env.DASHBOARD_GLOBAL_READ_ONLY || '').trim());
  const readOnlyTenant = v.dashboardReadOnly === true || String(v.dashboardReadOnly || '').toLowerCase() === 'true';

  const sheetHint = tenantLogistics
    ? 'Logistics / call-result sheet id is set on this workspace.'
    : logisticsAny
      ? 'A sheet id is available via server default (e.g. LOGISTICS_SHEET_ID). Prefer setting logisticsSheetId on the tenant for production.'
      : 'No logistics sheet id — voice tool writes to Sheets may fail until configured.';

  return {
    integrations: [
      {
        id: 'voice',
        label: 'Voice (Vapi)',
        ok: voiceOk,
        hint: voiceOk ? 'Assistant is linked for outbound/inbound flows.' : 'Add assistantId to this workspace Vapi config.'
      },
      {
        id: 'google_sheets',
        label: 'Google Sheets',
        ok: logisticsAny || crmLeadSheet,
        hint: `${sheetHint}${crmLeadSheet ? ' Lead-list / CRM sheet id also present.' : ''}`.trim()
      },
      {
        id: 'sms',
        label: 'SMS (Twilio)',
        ok: smsOk,
        hint: smsOk ? 'Server Twilio credentials are set (tenant may still need templates).' : 'Twilio env vars missing — SMS may be unavailable.'
      }
    ],
    sync: {
      metricsAsOfIso: metricsAsOfIso || null,
      payloadGeneratedAtIso: new Date().toISOString()
    },
    privacy: {
      bullets: parseDashboardPrivacyBullets(),
      exportNote: trimEnvDashboard('DASHBOARD_PRIVACY_EXPORT_NOTE')
    },
    app: {
      version: trimEnvDashboard('DASHBOARD_APP_VERSION'),
      commit: trimEnvDashboard('RENDER_GIT_COMMIT')
    },
    ui: {
      readOnly: readOnlyGlobal || readOnlyTenant
    }
  };
}

/** Adjust hex color brightness (e.g. secondary from primary). */
export function adjustColorBrightness(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00ff) + amt;
  const B = (num & 0x0000ff) + amt;
  return (
    '#' +
    (0x1000000 + (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 + (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 + (B < 255 ? (B < 1 ? 0 : B) : 255))
      .toString(16)
      .slice(1)
  );
}
