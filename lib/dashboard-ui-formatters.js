export function formatGBP(value = 0) {
  const formatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
  return formatter.format(value);
}

export function formatTimeAgoLabel(dateString) {
  if (!dateString) return 'Just now';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Live activity feed: only mention SMS when tenant has Twilio fields set (twilio_json → client.sms). */
export function activityFeedChannelLabel(client) {
  const sms = client?.sms && typeof client.sms === 'object' ? client.sms : {};
  const hasSmsConfig = !!(
    sms.messagingServiceSid ||
    sms.fromNumber ||
    sms.accountSid ||
    sms.authToken
  );
  return hasSmsConfig ? 'AI call + SMS' : 'AI call';
}

export function mapCallStatus(status) {
  const normalized = (status || '').toLowerCase();
  if (normalized.includes('book')) return 'Booked';
  if (normalized.includes('completed') || normalized === 'ended') return 'Completed';
  if (normalized.includes('pending')) return 'Awaiting reply';
  if (normalized.includes('missed')) return 'Missed call';
  if (normalized === 'initiated') return 'In progress';
  return status || 'Live';
}

export function formatCallDuration(seconds) {
  if (seconds == null || seconds === '') return null;
  const s = parseInt(seconds, 10);
  if (isNaN(s) || s < 0) return null;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
}

/** Short plain text for live activity feed (avoid huge payloads). */
export function truncateActivityFeedText(str, maxLen = 220) {
  const s = String(str || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1).trim()}…`;
}

export function parseCallsRowMetadata(meta) {
  if (meta == null) return null;
  if (typeof meta === 'object' && !Array.isArray(meta)) return meta;
  if (typeof meta === 'string') {
    try {
      return JSON.parse(meta);
    } catch {
      return null;
    }
  }
  return null;
}

/** Synthetic rows when outbound queue could not start a Vapi call (not the same as an in-call failure). */
export function isCallQueueStartFailureRow(row) {
  const cid = String(row?.call_id || '');
  if (cid.startsWith('failed_q')) return true;
  const m = parseCallsRowMetadata(row?.metadata);
  return !!(m && m.fromQueue === true && String(row?.outcome || '').toLowerCase() === 'failed');
}

export function formatVapiEndedReasonDisplay(reason) {
  if (reason == null || reason === '') return '';
  return String(reason)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** For transcript modal: map Vapi `endedReason` to who ended a live call. */
export function inferCallEndedByFromVapiReason(endedReason) {
  const detail = formatVapiEndedReasonDisplay(endedReason);
  if (!endedReason || typeof endedReason !== 'string') {
    return {
      callEndedBy: 'unknown',
      callEndedByLabel: 'Who ended the call: not recorded',
      endedReasonDetail: ''
    };
  }
  const r = endedReason.toLowerCase();
  if (r.includes('assistant-ended-call')) {
    return { callEndedBy: 'assistant', callEndedByLabel: 'Ended by: AI', endedReasonDetail: detail };
  }
  if (r.includes('customer-ended-call')) {
    return { callEndedBy: 'customer', callEndedByLabel: 'Ended by: contact', endedReasonDetail: detail };
  }
  if (r.includes('silence-timed-out')) {
    return { callEndedBy: 'system', callEndedByLabel: 'Ended by: system (silence timeout)', endedReasonDetail: detail };
  }
  if (r.includes('exceeded-max-duration')) {
    return { callEndedBy: 'system', callEndedByLabel: 'Ended by: system (max duration)', endedReasonDetail: detail };
  }
  if (
    r.includes('customer-did-not-answer') ||
    r.includes('did-not-answer') ||
    r.includes('voicemail') ||
    r.includes('customer-busy') ||
    r.includes('rejected') ||
    r.includes('failed-to-connect') ||
    r.includes('misdialed') ||
    r.includes('vonage-rejected') ||
    r.includes('twilio-reported') ||
    r.includes('error') ||
    r.includes('fault')
  ) {
    return {
      callEndedBy: 'unknown',
      callEndedByLabel: detail ? `End reason: ${detail}` : 'Who ended the call: not applicable',
      endedReasonDetail: detail
    };
  }
  if (r.includes('vonage-completed')) {
    return {
      callEndedBy: 'unknown',
      callEndedByLabel: 'Call completed (carrier — who hung up not specified)',
      endedReasonDetail: detail
    };
  }
  return {
    callEndedBy: 'unknown',
    callEndedByLabel: detail ? `End reason: ${detail}` : 'Who ended the call: unknown',
    endedReasonDetail: detail
  };
}

export function endedReasonFromCallRow(row) {
  const m = parseCallsRowMetadata(row?.metadata);
  if (!m || typeof m !== 'object') return null;
  return m.endedReason || m.endReason || null;
}

export function outcomeToFriendlyLabel(outcome) {
  if (!outcome) return null;
  const o = (outcome || '').toLowerCase();
  if (o === 'no-answer' || o === 'no_answer') return 'No answer';
  if (o === 'voicemail') return 'Voicemail';
  if (o === 'busy') return 'Busy';
  if (o === 'rejected' || o === 'declined') return 'Declined';
  if (o === 'failed') return 'Failed';
  if (o === 'booked') return 'Booked';
  if (o === 'completed') return 'Picked up';
  return outcome.replace(/-/g, ' ');
}

/** Lead timeline: did a human pick up? (distinct from raw DB status / missing webhooks) */
export function inferTimelinePickupStatus(call) {
  let outcome = (call.outcome || '').toLowerCase().trim().replace(/_/g, '-');
  // Some pipelines mirror line status into outcome; ignore for pickup inference
  if (outcome === 'initiated' || outcome === 'in-progress' || outcome === 'ringing' || outcome === 'queued') {
    outcome = '';
  }
  const status = (call.status || '').toLowerCase().trim();
  const durRaw = call.duration != null ? parseInt(call.duration, 10) : NaN;
  const durNum = Number.isFinite(durRaw) && durRaw >= 0 ? durRaw : null;
  const snip = String(call.transcript_snippet || '').trim();
  const snipLen = snip.replace(/\s/g, '').length;
  const hasRec = !!(call.recording_url && String(call.recording_url).trim());

  const noHuman = new Set(['no-answer', 'busy', 'failed', 'voicemail', 'declined', 'rejected', 'cancelled', 'canceled']);
  if (outcome && noHuman.has(outcome)) {
    const friendly = outcomeToFriendlyLabel(call.outcome);
    return {
      status: 'no',
      headline: 'They did not pick up',
      reason: friendly || outcome.replace(/-/g, ' ')
    };
  }

  if (outcome === 'booked' || outcome === 'completed' || (outcome && !noHuman.has(outcome))) {
    return {
      status: 'yes',
      headline: 'They picked up',
      reason: outcomeToFriendlyLabel(call.outcome) || outcome.replace(/-/g, ' ')
    };
  }

  if (status === 'initiated') {
    // Often stuck here when the "call ended" webhook never ran — still use anything we captured.
    if (durNum != null && durNum >= 15) {
      return {
        status: 'yes',
        headline: 'They picked up',
        reason: `Connected about ${formatCallDuration(durNum)} (status never left “initiated”; final webhook likely missing).`
      };
    }
    if (durNum != null && durNum >= 10 && durNum < 15) {
      return {
        status: 'yes',
        headline: 'They picked up',
        reason: `Short connection (${formatCallDuration(durNum)}); likely answered but status never left initiated.`
      };
    }
    const qsInit = call.quality_score != null ? Number(call.quality_score) : null;
    const hasSentiment = call.sentiment != null && String(call.sentiment).trim().length > 0;
    if (hasSentiment || (qsInit != null && Number.isFinite(qsInit))) {
      return {
        status: 'yes',
        headline: 'They picked up',
        reason: hasSentiment
          ? `Post-call analysis saved (${String(call.sentiment).trim()} sentiment); status still shows initiated.`
          : `Quality score saved (${Math.round(qsInit)}/100); status still shows initiated.`
      };
    }
    // Shorter snippet threshold than “ended” rows — partial transcripts still imply a conversation.
    const snipOkInit = snipLen > 25;
    if (snipOkInit || hasRec) {
      return {
        status: 'yes',
        headline: 'They picked up',
        reason: hasRec
          ? 'Recording on file (status still “initiated”; hang-up event may not have synced).'
          : 'Conversation text on file (status still “initiated”; hang-up event may not have synced).'
      };
    }
    if (durNum != null && durNum > 0 && durNum < 12) {
      return {
        status: 'no',
        headline: 'They did not pick up',
        reason: `Very short ring (${formatCallDuration(durNum)}); call never progressed past initiated.`
      };
    }
    const created = call.created_at ? new Date(call.created_at).getTime() : 0;
    const ageMin = created ? (Date.now() - created) / 60000 : 999;
    if (ageMin > 15) {
      return {
        status: 'unknown',
        headline: 'Pickup unknown',
        reason:
          'No usable duration, transcript snippet, or recording on this row — we cannot tell if someone answered. Check the transcript/recording links or your telephony webhooks.'
      };
    }
    return {
      status: 'unknown',
      headline: 'Pickup unknown',
      reason: 'Still connecting or first webhook not received yet (line shows initiated).'
    };
  }

  const endedLike = status === 'ended' || status === 'completed';
  if (endedLike) {
    if (durNum != null && durNum >= 15) {
      return {
        status: 'yes',
        headline: 'They picked up',
        reason: `Connected about ${formatCallDuration(durNum)} (no outcome stored).`
      };
    }
    if (snipLen > 40 || hasRec) {
      return {
        status: 'yes',
        headline: 'They picked up',
        reason: hasRec ? 'Recording on file.' : 'Conversation text captured.'
      };
    }
    if (durNum != null && durNum > 0 && durNum < 12) {
      return {
        status: 'no',
        headline: 'They did not pick up',
        reason: `Very short ring (${formatCallDuration(durNum)}).`
      };
    }
    return {
      status: 'unknown',
      headline: 'Pickup unknown',
      reason: 'Call ended in our logs but no outcome, duration, or transcript yet.'
    };
  }

  if (status === 'failed' || status === 'cancelled' || status === 'canceled') {
    return {
      status: 'no',
      headline: 'They did not pick up',
      reason: mapCallStatus(call.status)
    };
  }

  return {
    status: 'unknown',
    headline: 'Pickup unknown',
    reason: mapCallStatus(call.status) || 'Not enough data yet.'
  };
}


export function mapStatusClass(status) {
  const normalized = (status || '').toLowerCase();
  if (normalized.includes('book')) return 'success';
  if (normalized.includes('await') || normalized.includes('pending')) return 'pending';
  return 'info';
}

// moved: /api/retry-queue/* → routes/retry-queue.js

export function resolveLogisticsSpreadsheetId(client) {
  if (!client) return process.env.LOGISTICS_SHEET_ID || null;
  return (
    client.vapi_json?.logisticsSheetId
    || client.vapi?.logisticsSheetId
    || client.gsheet_id
    || process.env.LOGISTICS_SHEET_ID
    || null
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

// Helper function to adjust color brightness
export function adjustColorBrightness(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}
