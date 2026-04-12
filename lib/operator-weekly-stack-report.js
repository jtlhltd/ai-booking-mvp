/**
 * Single weekly email + PDF attachment to YOUR_EMAIL (all enabled tenants, rolling 7 days).
 */

import PDFDocument from 'pdfkit';
import { query } from '../db.js';
import { DateTime } from 'luxon';
import messagingService from './messaging-service.js';
import { getOperatorInboxEmail } from './operator-alerts.js';

function buildPdfBuffer(lines) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.fontSize(14).text('AI Booking — weekly stack summary', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#444').text(`Generated ${DateTime.utc().toISO()} (UTC)`, { lineGap: 2 });
    doc.moveDown();
    doc.fillColor('#000').fontSize(10);
    for (const line of lines) {
      doc.text(line, { width: 500, lineGap: 3 });
      doc.moveDown(0.25);
    }
    doc.end();
  });
}

export async function sendOperatorWeeklyStackReport() {
  const usesPg = (process.env.DB_TYPE || '').toLowerCase() === 'postgres';
  if (!usesPg) {
    console.log('[OPERATOR WEEKLY] Skipped (Postgres-only SQL)');
    return { sent: false, reason: 'not_postgres' };
  }
  const to = getOperatorInboxEmail();
  if (!to) {
    console.log('[OPERATOR WEEKLY] YOUR_EMAIL unset — skip stack summary');
    return { sent: false, reason: 'no_your_email' };
  }
  if (!messagingService?.emailTransporter) {
    console.warn('[OPERATOR WEEKLY] Email not configured — skip');
    return { sent: false, reason: 'email_not_configured' };
  }

  const until = DateTime.utc().toISO();
  const since = DateTime.utc().minus({ days: 7 }).toISO();
  const periodLabel = `Rolling 7 days ending ${DateTime.utc().toFormat('dd MMM yyyy HH:mm')} UTC`;

  const { rows } = await query(
    `
    SELECT
      t.client_key,
      COALESCE(NULLIF(TRIM(t.display_name), ''), t.client_key) AS display_name,
      (SELECT COUNT(*)::int FROM calls c WHERE c.client_key = t.client_key AND c.created_at >= $1 AND c.created_at < $2) AS calls_7d,
      (SELECT COALESCE(SUM(COALESCE(c.duration, 0)), 0)::bigint FROM calls c WHERE c.client_key = t.client_key AND c.created_at >= $1 AND c.created_at < $2) AS talk_seconds_7d,
      (SELECT COUNT(*)::int FROM leads l WHERE l.client_key = t.client_key AND l.created_at >= $1 AND l.created_at < $2) AS leads_7d,
      (SELECT COUNT(*)::int FROM appointments a WHERE a.client_key = t.client_key AND a.created_at >= $1 AND a.created_at < $2) AS appts_7d
    FROM tenants t
    WHERE t.is_enabled = TRUE
    ORDER BY t.client_key
    `,
    [since, until]
  );

  const pdfLines = [`Period: ${periodLabel}`, ''];
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    body{font-family:system-ui,sans-serif;color:#1a1d2e;line-height:1.5;padding:16px}
    h1{font-size:1.25rem}
    table{border-collapse:collapse;width:100%;max-width:720px;margin-top:12px;font-size:0.875rem}
    th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left}
    th{background:#f1f5f9}
    .num{text-align:right;font-variant-numeric:tabular-nums}
  </style></head><body>`;
  html += `<h1>Weekly stack summary</h1><p><strong>${periodLabel}</strong></p><p>Enabled tenants: <strong>${rows.length}</strong></p>`;
  html +=
    '<table><thead><tr><th>Client</th><th class="num">Calls</th><th class="num">Talk min</th><th class="num">New leads</th><th class="num">Appts</th></tr></thead><tbody>';

  let text = `Weekly stack summary\n${periodLabel}\nTenants: ${rows.length}\n\n`;

  for (const r of rows) {
    const calls = Number(r.calls_7d) || 0;
    const sec = Number(r.talk_seconds_7d) || 0;
    const talkMin = Math.round((sec / 60) * 10) / 10;
    const leads = Number(r.leads_7d) || 0;
    const appts = Number(r.appts_7d) || 0;
    const name = escapeHtml(String(r.display_name || r.client_key));
    const key = escapeHtml(String(r.client_key));
    html += `<tr><td><strong>${name}</strong><br/><small style="color:#64748b">${key}</small></td><td class="num">${calls}</td><td class="num">${talkMin}</td><td class="num">${leads}</td><td class="num">${appts}</td></tr>`;
    text += `${r.client_key}\tcalls=${calls}\ttalkMin=${talkMin}\tleads=${leads}\tappts=${appts}\n`;
    pdfLines.push(
      `${r.client_key} (${r.display_name}) — calls: ${calls}, talk: ${talkMin} min, new leads: ${leads}, appts: ${appts}`
    );
  }
  html += '</tbody></table><p style="margin-top:20px;font-size:0.8rem;color:#64748b">Operator copy — YOUR_EMAIL on Render. Client-facing weekly reports still go to tenant emails when configured.</p></body></html>';

  let pdfBuf;
  try {
    pdfBuf = await buildPdfBuffer(pdfLines);
  } catch (e) {
    console.error('[OPERATOR WEEKLY] PDF build failed:', e?.message || e);
    pdfBuf = null;
  }

  const attachments =
    pdfBuf && pdfBuf.length
      ? [{ filename: `weekly-stack-summary-${DateTime.utc().toFormat('yyyy-MM-dd')}.pdf`, content: pdfBuf }]
      : [];

  const r = await messagingService.sendEmail({
    to,
    subject: `📊 Weekly stack summary — ${periodLabel}`,
    body: text,
    html,
    attachments: attachments.length ? attachments : undefined
  });
  return { sent: r?.success !== false, messageId: r?.messageId };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
