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

/** Same key resolution as other Vapi server calls (Render often has one of these names). */
export function timelineVapiAuthKey() {
  return (
    process.env.VAPI_PRIVATE_KEY ||
    process.env.VAPI_API_KEY ||
    process.env.VAPI_PUBLIC_KEY ||
    ''
  ).trim();
}

export async function fetchVapiCallSnapshotForTimeline(callId) {
  const key = timelineVapiAuthKey();
  if (!key || !callId || String(callId).trim().length < 10) return null;
  try {
    const res = await fetch(
      `https://api.vapi.ai/call/${encodeURIComponent(String(callId).trim())}`,
      { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } }
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn('[TIMELINE VAPI] GET /call failed', {
        callId: String(callId).slice(0, 12),
        status: res.status,
        detail: errBody.slice(0, 200)
      });
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn('[TIMELINE VAPI] GET /call error', String(callId).slice(0, 12), e?.message || e);
    return null;
  }
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
