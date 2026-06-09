/**
 * Severity-tiered alert routing with incident grouping.
 *
 * critical → ALERT_CRITICAL_EMAIL + SLACK_WEBHOOK_URL_CRITICAL (or YOUR_EMAIL / SLACK_WEBHOOK_URL)
 * error    → same as critical (treated as critical for routing)
 * warning  → ALERT_WARNING_EMAIL (throttled via incidents)
 * info     → log only
 */
import messagingService from './messaging-service.js';
import {
  buildIncidentFingerprint,
  markIncidentNotified,
  normalizeIncidentSeverity,
  recordIncidentEvent,
} from './incidents.js';

const SUBJECT_PREFIX = {
  critical: '🚨',
  error: '🚨',
  warning: '⚠️',
  info: 'ℹ️',
};

export function isAlertsSuppressed() {
  return (
    process.env.ALERTS_SUPPRESSED === 'true' || process.env.MAINTENANCE_MODE === 'true'
  );
}

export function resolveAlertEmails(severity) {
  const critical =
    process.env.ALERT_CRITICAL_EMAIL?.trim()
    || process.env.YOUR_EMAIL?.trim()
    || null;
  const warning =
    process.env.ALERT_WARNING_EMAIL?.trim()
    || process.env.YOUR_EMAIL?.trim()
    || null;
  const sev = normalizeIncidentSeverity(severity);
  if (sev === 'critical' || sev === 'error') return critical ? [critical] : [];
  if (sev === 'warning') return warning ? [warning] : [];
  return [];
}

export function resolveSlackWebhook(severity) {
  const sev = normalizeIncidentSeverity(severity);
  if (sev === 'critical' || sev === 'error') {
    return (
      process.env.SLACK_WEBHOOK_URL_CRITICAL?.trim()
      || process.env.SLACK_WEBHOOK_URL?.trim()
      || null
    );
  }
  if (sev === 'warning') {
    return process.env.SLACK_WEBHOOK_URL_WARNING?.trim() || null;
  }
  return null;
}

async function sendEmailAlert({ to, subject, body, html }) {
  if (!to?.length || !messagingService?.emailTransporter) return false;
  await messagingService.sendEmail({
    to: to.join(','),
    subject,
    body: body || subject,
    html: html || null,
  });
  return true;
}

async function sendSlackAlert(webhookUrl, text, severity) {
  if (!webhookUrl) return false;
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${text}*\nSeverity: \`${severity}\`\nTime: ${new Date().toISOString()}`,
          },
        },
      ],
    }),
  });
  return true;
}

/**
 * Route an alert through incident grouping and severity-specific channels.
 *
 * @returns {Promise<{ sent: boolean, reason?: string, incident?: object }>}
 */
export async function routeAlert({
  severity = 'warning',
  title,
  message,
  dedupeKey = null,
  fingerprint = null,
  source = 'system',
  metadata = {},
  throttleMinutes = null,
  html = null,
  skipIncident = false,
}) {
  const sev = normalizeIncidentSeverity(severity);
  const ttl = String(title || message || 'Alert').trim();
  const body = String(message || title || '').trim();

  if (sev === 'info') {
    console.log('[ALERT:info]', { title: ttl, source, body: body.slice(0, 500) });
    return { sent: false, reason: 'info_log_only' };
  }

  if (isAlertsSuppressed()) {
    console.log('[ALERT] suppressed (ALERTS_SUPPRESSED or MAINTENANCE_MODE):', ttl);
    return { sent: false, reason: 'suppressed' };
  }

  let incident = null;
  if (!skipIncident) {
    incident = await recordIncidentEvent({
      fingerprint,
      dedupeKey,
      title: ttl,
      severity: sev,
      source,
      metadata,
      throttleMinutes,
    });
    if (!incident.shouldNotify) {
      return {
        sent: false,
        reason: 'incident_throttled',
        incident,
      };
    }
  }

  const fp =
    incident?.fingerprint
    || buildIncidentFingerprint({ fingerprint, dedupeKey, source, title: ttl });
  const prefix = SUBJECT_PREFIX[sev] || '⚠️';
  const countSuffix =
    incident && incident.eventCount > 1 ? ` (${incident.eventCount} events)` : '';
  const subject = `${prefix} [${sev.toUpperCase()}] ${ttl}${countSuffix}`;
  const fullBody = [
    body,
    '',
    incident
      ? `Incident: ${fp}\nEvents: ${incident.eventCount}\nSource: ${source}`
      : `Source: ${source}`,
    `Environment: ${process.env.NODE_ENV || 'production'}`,
    `Time: ${new Date().toISOString()}`,
  ].join('\n');

  const emails = resolveAlertEmails(sev);
  if (!emails.length && !resolveSlackWebhook(sev)) {
    console.warn('[ALERT] No destinations configured for severity', sev, '—', ttl);
    return { sent: false, reason: 'no_destinations', incident };
  }

  let sent = false;
  try {
    if (emails.length) {
      sent = (await sendEmailAlert({ to: emails, subject, body: fullBody, html })) || sent;
    }
    const slack = resolveSlackWebhook(sev);
    if (slack) {
      sent = (await sendSlackAlert(slack, `${subject}\n\n${body}`, sev)) || sent;
    }
    if (sent && incident) {
      await markIncidentNotified(fp);
    }
    return { sent, incident, fingerprint: fp };
  } catch (e) {
    console.error('[ALERT] delivery failed:', e?.message || e);
    return { sent: false, reason: e?.message || 'delivery_error', incident };
  }
}
