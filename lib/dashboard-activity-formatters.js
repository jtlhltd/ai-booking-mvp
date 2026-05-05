/**
 * Pure formatting / classification helpers used by the client dashboard
 * activity feed, lead timeline, and demo dashboard renderers.
 *
 * Extracted from server.js (PR-10 of the hygiene burndown). Every function
 * in this module must remain pure: no DB access, no fetch, no module-level
 * mutable state. The point of pulling them out is to make them
 * unit-testable in isolation and to shrink server.js.
 *
 * If a renderer needs network or DB access, build a thin wrapper around
 * these helpers in the caller — do not push side-effects down here.
 */

/** Rolling activity windows & touchpoint day buckets on the client dashboard. */
export const DASHBOARD_ACTIVITY_TZ = 'Europe/London';

export function formatGBP(value = 0) {
  const formatter = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0
  });
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

/** Align with vapi-webhooks mapEndedReasonToOutcome for GET /call hydration. */
export function mapVapiEndedReasonToTimelineOutcome(endedReason) {
  if (!endedReason || typeof endedReason !== 'string') return null;
  const r = endedReason.toLowerCase();
  if (r.includes('customer-did-not-answer') || r.includes('did-not-answer')) return 'no-answer';
  if (r.includes('customer-busy') || r.includes('busy')) return 'busy';
  if (r === 'voicemail' || r.includes('voicemail')) return 'voicemail';
  if (r.includes('rejected') || r.includes('declined') || r.includes('failed-to-connect') || r.includes('misdialed')) {
    return 'declined';
  }
  if (r.includes('vonage-rejected') || r.includes('twilio-reported')) return 'declined';
  if (r.includes('assistant-ended-call') || r.includes('customer-ended-call') || r.includes('vonage-completed')) {
    return 'completed';
  }
  if (r.includes('silence-timed-out') || r.includes('exceeded-max-duration')) return 'completed';
  if (r.includes('error') || r.includes('fault')) return 'failed';
  return 'completed';
}

/** Merge nested `call` + `artifact` shapes from Vapi GET /call responses. */
export function flattenVapiGetCallPayload(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const nested = raw.call && typeof raw.call === 'object' ? raw.call : {};
  const s = { ...nested, ...raw };
  const art = s.artifact && typeof s.artifact === 'object' ? s.artifact : {};
  if (!s.recordingUrl && art.recordingUrl) s.recordingUrl = art.recordingUrl;
  if (!s.stereoRecordingUrl && art.stereoRecordingUrl) s.stereoRecordingUrl = art.stereoRecordingUrl;
  if (!s.transcript && art.transcript) s.transcript = art.transcript;
  return s;
}

export function messageContentToString(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === 'object' ? p.text || p.content || '' : String(p)))
      .filter(Boolean)
      .join(' ');
  }
  return String(content);
}

/** Map Vapi GET /call/:id JSON into fields inferTimelinePickupStatus already understands. */
export function vapiCallSnapshotToTimelineHints(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return {};
  const s = flattenVapiGetCallPayload(snapshot);
  const hints = {};

  const er = s.endedReason || s.endReason;
  if (er && typeof er === 'string') {
    const oc = mapVapiEndedReasonToTimelineOutcome(er);
    if (oc) hints.outcome = oc;
  }

  let dur = null;
  if (typeof s.duration === 'number' && s.duration >= 0) dur = Math.round(s.duration);
  else if (s.duration != null && String(s.duration).trim() !== '') {
    const p = parseInt(String(s.duration), 10);
    if (Number.isFinite(p) && p >= 0) dur = p;
  }
  if (dur == null && s.endedAt && s.startedAt) {
    const ms = new Date(s.endedAt) - new Date(s.startedAt);
    if (ms > 0) dur = Math.round(ms / 1000);
  }
  if (dur != null && dur >= 0) hints.duration = dur;

  let tr = s.transcript || s.summary || s.analysis?.summary || null;
  if (!tr && Array.isArray(s.messages) && s.messages.length > 0) {
    const parts = [];
    for (const m of s.messages) {
      const role = String(m?.role || m?.type || '').toLowerCase();
      if (role === 'system' || role === 'function' || role === 'tool') continue;
      const rawC = m?.content ?? m?.text ?? m?.message ?? m?.body;
      const content = messageContentToString(rawC);
      if (!content) continue;
      const contentUpper = content.toUpperCase();
      if (
        contentUpper.includes('TOOLS:') ||
        contentUpper.includes('CRITICAL:') ||
        contentUpper.includes('FOLLOW THIS SCRIPT')
      ) {
        continue;
      }
      parts.push(content);
    }
    tr = parts.length ? parts.join(' ') : null;
  }
  if (tr && String(tr).trim()) {
    hints.transcript_snippet = String(tr).trim().slice(0, 320);
  }

  const rec = s.recordingUrl || s.stereoRecordingUrl;
  if (rec && String(rec).trim() && /^https?:\/\//i.test(String(rec).trim())) {
    hints.recording_url = String(rec).trim();
  }

  return hints;
}

export function mapStatusClass(status) {
  const normalized = (status || '').toLowerCase();
  if (normalized.includes('book')) return 'success';
  if (normalized.includes('await') || normalized.includes('pending')) return 'pending';
  return 'info';
}
