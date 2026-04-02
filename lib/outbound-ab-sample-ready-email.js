// Email operator when the live outbound A/B experiment reaches min leads per variant.
// Does not pick a winner — only notifies so a human can set the new control.

import { OUTBOUND_AB_VAPI_KEYS } from './outbound-ab-variant.js';
import {
  experimentMeetsSampleThreshold,
  getSampleReadyNotifiedMap,
  parseMinSamplesPerVariant,
  resolveSampleReadyNotifyEmail
} from './outbound-ab-sample-ready-rules.js';

export {
  experimentMeetsSampleThreshold,
  getSampleReadyNotifiedMap,
  parseMinSamplesPerVariant,
  resolveSampleReadyNotifyEmail
} from './outbound-ab-sample-ready-rules.js';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildEmailHtml({ clientKey, dimensionLabel, experimentName, summary, minPerVariant, dashboardHint }) {
  const rows = summary.variants
    .map((v) => {
      const rate = v.conversionRatePct != null ? `${Number(v.conversionRatePct).toFixed(1)}%` : '—';
      return `<tr><td>${escapeHtml(v.variantName)}</td><td style="text-align:right">${escapeHtml(
        String(v.totalLeads)
      )}</td><td style="text-align:right">${escapeHtml(String(v.convertedLeads))}</td><td style="text-align:right">${escapeHtml(
        rate
      )}</td></tr>`;
    })
    .join('');
  return `
  <p><strong>Outbound A/B — sample target reached</strong></p>
  <p>There is <strong>no automatic winner</strong>. Review the numbers below, decide in your own process, then update variants or your control in the dashboard when ready.</p>
  <p><strong>Client:</strong> ${escapeHtml(clientKey)}<br/>
  <strong>Dimension currently live on dials:</strong> ${escapeHtml(dimensionLabel)}<br/>
  <strong>Experiment:</strong> <code>${escapeHtml(experimentName)}</code><br/>
  <strong>Threshold:</strong> ≥ ${minPerVariant} leads per variant (distinct leads assigned in this test)</p>
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
  <thead><tr><th>Variant</th><th>Leads</th><th>Converted</th><th>Rate</th></tr></thead>
  <tbody>${rows}</tbody>
  </table>
  ${dashboardHint ? `<p style="margin-top:16px">${dashboardHint}</p>` : ''}
  `;
}

/**
 * If the focused dimensional experiment has enough leads per arm and we have not emailed for this (experiment, threshold), send one email.
 */
export async function checkOutboundAbSampleReadyForClient(clientKey) {
  const { getFullClient, getOutboundAbExperimentSummary } = await import('../db.js');
  const client = await getFullClient(clientKey);
  if (!client?.vapi) return { checked: false, reason: 'no_client' };

  const vapi = client.vapi;
  const to = resolveSampleReadyNotifyEmail(vapi);
  if (!to) return { checked: false, reason: 'no_notify_email' };

  const minN = parseMinSamplesPerVariant(vapi);
  const focus = String(vapi.outboundAbFocusDimension || '').trim().toLowerCase();
  if (!['voice', 'opening', 'script'].includes(focus)) {
    return { checked: false, reason: 'no_focus' };
  }

  const vapiKey = OUTBOUND_AB_VAPI_KEYS[focus];
  const experimentName = vapi[vapiKey] != null ? String(vapi[vapiKey]).trim() : '';
  if (!experimentName) return { checked: false, reason: 'no_experiment' };

  const notified = getSampleReadyNotifiedMap(vapi);
  const thresholdKey = `${experimentName}@min${minN}`;
  if (notified[thresholdKey]) {
    return { checked: true, skipped: 'already_notified' };
  }

  const summary = await getOutboundAbExperimentSummary(clientKey, experimentName);
  if (!experimentMeetsSampleThreshold(summary, minN)) {
    return { checked: true, notReady: true };
  }

  const messagingService = (await import('./messaging-service.js')).default;
  if (!messagingService.emailTransporter) {
    console.warn('[OUTBOUND AB SAMPLE READY] Email not configured (EMAIL_SERVICE / EMAIL_USER / EMAIL_PASS)', {
      clientKey,
      experimentName
    });
    return { checked: true, error: 'email_not_configured' };
  }

  const dimLabels = { voice: 'Voice', opening: 'Opening line', script: 'Script' };
  const baseUrl = process.env.PUBLIC_DASHBOARD_URL || process.env.BASE_URL || '';
  const dashboardHint = baseUrl
    ? `Dashboard: <a href="${escapeHtml(baseUrl)}">${escapeHtml(baseUrl)}</a>`
    : '';

  const html = buildEmailHtml({
    clientKey,
    dimensionLabel: dimLabels[focus] || focus,
    experimentName,
    summary,
    minPerVariant: minN,
    dashboardHint
  });

  const plain = `Outbound A/B on ${clientKey} (${focus}) — experiment "${experimentName}" has at least ${minN} leads per variant. Review in the dashboard; no winner was chosen automatically.`;

  const r = await messagingService.sendEmail({
    to,
    subject: `[A/B ready for your review] ${clientKey} · ${dimLabels[focus] || focus}`,
    body: plain,
    html
  });

  if (!r.success) {
    console.error('[OUTBOUND AB SAMPLE READY] sendEmail failed', r);
    return { checked: true, error: r.error || 'send_failed' };
  }

  const { updateClientConfig } = await import('./client-onboarding.js');
  const nextNotified = { ...notified, [thresholdKey]: new Date().toISOString() };
  await updateClientConfig(clientKey, { vapi: { outboundAbSampleReadyNotified: nextNotified } });
  console.log('[OUTBOUND AB SAMPLE READY] Email sent', { clientKey, experimentName, to });
  return { checked: true, sent: true, experimentName };
}

export async function sweepOutboundAbSampleReady() {
  const { listFullClients } = await import('../db.js');
  const clients = await listFullClients();
  let sent = 0;
  for (const c of clients) {
    const vapi = c.vapi || {};
    const hasDim =
      (vapi.outboundAbVoiceExperiment && String(vapi.outboundAbVoiceExperiment).trim()) ||
      (vapi.outboundAbOpeningExperiment && String(vapi.outboundAbOpeningExperiment).trim()) ||
      (vapi.outboundAbScriptExperiment && String(vapi.outboundAbScriptExperiment).trim());
    if (!hasDim) continue;
    try {
      const r = await checkOutboundAbSampleReadyForClient(c.clientKey);
      if (r.sent) sent += 1;
    } catch (e) {
      console.error('[OUTBOUND AB SAMPLE READY SWEEP]', c.clientKey, e?.message || e);
    }
  }
  if (sent > 0) {
    console.log(`[OUTBOUND AB SAMPLE READY SWEEP] sent ${sent} notification(s)`);
  }
  return { sent };
}
