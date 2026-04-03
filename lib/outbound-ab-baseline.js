// Resolve "live" creative baselines for outbound A/B when the tenant uploads a single challenger value.
// Order: Vapi GET assistant → vapi.assistantOverrides → legacy outboundAbExperiment control.
// When excludeSameDimensionExperiment: skip outboundAb{Voice|Opening|Script}Experiment (self-referential; same test being replaced).

import { query, summarizeOutboundVariantConfig } from '../db.js';

function trimStr(x) {
  return x != null && String(x).trim() !== '' ? String(x).trim() : '';
}

function parseConfig(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

function pickControlRow(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const byName = rows.find((r) => String(r.variant_name || '').toLowerCase() === 'control');
  return byName || rows[0];
}

async function controlVariantConfigForExperiment(clientKey, experimentName) {
  const name = trimStr(experimentName);
  if (!name) return null;
  const { rows } = await query(
    `
    SELECT variant_name, variant_config
    FROM ab_test_experiments
    WHERE client_key = $1 AND experiment_name = $2 AND is_active = TRUE
    ORDER BY variant_name ASC
  `,
    [clientKey, name]
  );
  const row = pickControlRow(rows);
  if (!row) return null;
  return parseConfig(row.variant_config);
}

function voiceIdFromOverridesVoice(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object' && v.voiceId) return String(v.voiceId).trim();
  return '';
}

/** Vapi GET /assistant shape varies slightly; extract ElevenLabs (or other) voice id. */
function extractVoiceIdFromAssistantPayload(j) {
  if (!j || typeof j !== 'object') return '';
  if (j.voiceId != null && String(j.voiceId).trim()) return String(j.voiceId).trim();
  const v = j.voice;
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (v && typeof v === 'object') {
    if (v.voiceId != null && String(v.voiceId).trim()) return String(v.voiceId).trim();
    if (v.id != null && String(v.id).trim()) return String(v.id).trim();
  }
  return '';
}

function extractSystemScriptFromAssistantPayload(j) {
  const msgs = j?.model?.messages;
  if (!Array.isArray(msgs)) return '';
  const sys = msgs.find((m) => m && String(m.role || '').toLowerCase() === 'system');
  if (sys && sys.content != null && String(sys.content).trim()) return String(sys.content).trim();
  const first = msgs[0];
  if (first && first.content != null && String(first.content).trim()) return String(first.content).trim();
  return '';
}

async function fetchAssistantBaselines(client) {
  const vapi = client?.vapi || {};
  const assistantId = client?.vapiAssistantId || vapi.assistantId || null;
  const key = process.env.VAPI_PRIVATE_KEY;
  if (!assistantId || !key) {
    return { voiceId: '', firstMessage: '', script: '', fetchFailedReason: !key ? 'no_vapi_private_key' : 'no_assistant_id' };
  }
  try {
    const r = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      console.warn('[OUTBOUND AB BASELINE] Vapi assistant GET failed', {
        assistantId,
        status: r.status,
        body: errText ? errText.slice(0, 200) : ''
      });
      return { voiceId: '', firstMessage: '', script: '', fetchFailedReason: `http_${r.status}` };
    }
    const j = await r.json();
    const voiceId = extractVoiceIdFromAssistantPayload(j);
    const firstMessage = j?.firstMessage != null ? String(j.firstMessage).trim() : '';
    const script = extractSystemScriptFromAssistantPayload(j);
    return { voiceId, firstMessage, script, fetchFailedReason: '' };
  } catch (e) {
    console.warn('[OUTBOUND AB BASELINE] Vapi assistant GET error', e?.message || e);
    return { voiceId: '', firstMessage: '', script: '', fetchFailedReason: 'network_or_parse' };
  }
}

/**
 * @param {string} clientKey
 * @param {object} client - getFullClient row
 * @param {'voice'|'opening'|'script'} dimension
 * @param {{ excludeSameDimensionExperiment?: boolean }} [options] When true (single creative upload), do not read baseline from the active dimensional experiment for this slice — that experiment is what we are replacing and often has the same bad value on both arms.
 * @returns {Promise<string>} non-empty baseline text or ''
 */
export async function resolveOutboundAbBaselineForDimension(clientKey, client, dimension, options = {}) {
  const dim = String(dimension || '').toLowerCase();
  const skipDimExp = options.excludeSameDimensionExperiment === true;
  const vapi = client?.vapi || {};
  const ao =
    vapi.assistantOverrides && typeof vapi.assistantOverrides === 'object'
      ? vapi.assistantOverrides
      : null;

  const assistant = await fetchAssistantBaselines(client);

  if (dim === 'voice') {
    const fromAssistant = assistant.voiceId && String(assistant.voiceId).trim();
    if (fromAssistant) return fromAssistant;
    const fromAo = ao ? voiceIdFromOverridesVoice(ao.voice) : '';
    if (fromAo) return fromAo;
    if (!skipDimExp) {
      const voiceExp = trimStr(vapi.outboundAbVoiceExperiment);
      if (voiceExp) {
        const cfg = await controlVariantConfigForExperiment(clientKey, voiceExp);
        const s = summarizeOutboundVariantConfig(cfg);
        if (s.voiceId && String(s.voiceId).trim()) return String(s.voiceId).trim();
      }
    }
    const legacyExp = trimStr(vapi.outboundAbExperiment);
    if (legacyExp) {
      const cfg = await controlVariantConfigForExperiment(clientKey, legacyExp);
      const s = summarizeOutboundVariantConfig(cfg);
      if (s.voiceId && String(s.voiceId).trim()) return String(s.voiceId).trim();
    }
    return '';
  }

  if (dim === 'opening') {
    const fromAssistant =
      assistant.firstMessage != null && String(assistant.firstMessage).trim()
        ? String(assistant.firstMessage).trim()
        : '';
    if (fromAssistant) return fromAssistant;
    if (ao && ao.firstMessage != null && String(ao.firstMessage).trim()) {
      return String(ao.firstMessage).trim();
    }
    if (!skipDimExp) {
      const openingExp = trimStr(vapi.outboundAbOpeningExperiment);
      if (openingExp) {
        const cfg = await controlVariantConfigForExperiment(clientKey, openingExp);
        const c = cfg && typeof cfg === 'object' ? cfg : {};
        const line = String(c.firstMessage || '').trim();
        if (line) return line;
      }
    }
    const legacyExp = trimStr(vapi.outboundAbExperiment);
    if (legacyExp) {
      const cfg = await controlVariantConfigForExperiment(clientKey, legacyExp);
      const c = cfg && typeof cfg === 'object' ? cfg : {};
      const line = String(c.firstMessage || '').trim();
      if (line) return line;
    }
    return '';
  }

  if (dim === 'script') {
    const fromAssistant =
      assistant.script != null && String(assistant.script).trim()
        ? String(assistant.script).trim()
        : '';
    if (fromAssistant) return fromAssistant;
    const aoScript =
      ao?.model?.messages?.[0]?.content != null && String(ao.model.messages[0].content).trim()
        ? String(ao.model.messages[0].content).trim()
        : '';
    if (aoScript) return aoScript;
    if (!skipDimExp) {
      const scriptExp = trimStr(vapi.outboundAbScriptExperiment);
      if (scriptExp) {
        const cfg = await controlVariantConfigForExperiment(clientKey, scriptExp);
        const c = cfg && typeof cfg === 'object' ? cfg : {};
        const body = String(c.systemMessage || c.script || '').trim();
        if (body) return body;
      }
    }
    const legacyExp = trimStr(vapi.outboundAbExperiment);
    if (legacyExp) {
      const cfg = await controlVariantConfigForExperiment(clientKey, legacyExp);
      const c = cfg && typeof cfg === 'object' ? cfg : {};
      const body = String(c.systemMessage || c.script || '').trim();
      if (body) return body;
    }
    return '';
  }

  return '';
}

/** Raw voice / opener / script from GET /assistant (dashboard: control = live assistant). */
export async function getVapiAssistantCreativeSnapshot(client) {
  return fetchAssistantBaselines(client);
}
