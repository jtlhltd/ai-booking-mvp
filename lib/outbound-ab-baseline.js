// Resolve "live" creative baselines for outbound A/B when the tenant uploads a single challenger value.
// Order: active experiment (control arm) → vapi.assistantOverrides → Vapi GET assistant.

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

async function fetchAssistantBaselines(client) {
  const vapi = client?.vapi || {};
  const assistantId = client?.vapiAssistantId || vapi.assistantId || null;
  const key = process.env.VAPI_PRIVATE_KEY;
  if (!assistantId || !key) {
    return { voiceId: '', firstMessage: '', script: '' };
  }
  try {
    const r = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      headers: { Authorization: `Bearer ${key}` }
    });
    if (!r.ok) return { voiceId: '', firstMessage: '', script: '' };
    const j = await r.json();
    const voiceId = j?.voice?.voiceId ? String(j.voice.voiceId).trim() : '';
    const firstMessage = j?.firstMessage != null ? String(j.firstMessage).trim() : '';
    const script =
      j?.model?.messages?.[0]?.content != null ? String(j.model.messages[0].content).trim() : '';
    return { voiceId, firstMessage, script };
  } catch {
    return { voiceId: '', firstMessage: '', script: '' };
  }
}

/**
 * @param {string} clientKey
 * @param {object} client - getFullClient row
 * @param {'voice'|'opening'|'script'} dimension
 * @returns {Promise<string>} non-empty baseline text or ''
 */
export async function resolveOutboundAbBaselineForDimension(clientKey, client, dimension) {
  const dim = String(dimension || '').toLowerCase();
  const vapi = client?.vapi || {};
  const ao =
    vapi.assistantOverrides && typeof vapi.assistantOverrides === 'object'
      ? vapi.assistantOverrides
      : null;

  if (dim === 'voice') {
    const voiceExp = trimStr(vapi.outboundAbVoiceExperiment);
    if (voiceExp) {
      const cfg = await controlVariantConfigForExperiment(clientKey, voiceExp);
      const s = summarizeOutboundVariantConfig(cfg);
      if (s.voiceId && String(s.voiceId).trim()) return String(s.voiceId).trim();
    }
    const legacyExp = trimStr(vapi.outboundAbExperiment);
    if (legacyExp) {
      const cfg = await controlVariantConfigForExperiment(clientKey, legacyExp);
      const s = summarizeOutboundVariantConfig(cfg);
      if (s.voiceId && String(s.voiceId).trim()) return String(s.voiceId).trim();
    }
    const fromAo = ao ? voiceIdFromOverridesVoice(ao.voice) : '';
    if (fromAo) return fromAo;
    const { voiceId } = await fetchAssistantBaselines(client);
    return voiceId || '';
  }

  if (dim === 'opening') {
    const openingExp = trimStr(vapi.outboundAbOpeningExperiment);
    if (openingExp) {
      const cfg = await controlVariantConfigForExperiment(clientKey, openingExp);
      const c = cfg && typeof cfg === 'object' ? cfg : {};
      const line = String(c.firstMessage || '').trim();
      if (line) return line;
    }
    const legacyExp = trimStr(vapi.outboundAbExperiment);
    if (legacyExp) {
      const cfg = await controlVariantConfigForExperiment(clientKey, legacyExp);
      const c = cfg && typeof cfg === 'object' ? cfg : {};
      const line = String(c.firstMessage || '').trim();
      if (line) return line;
    }
    if (ao && ao.firstMessage != null && String(ao.firstMessage).trim()) {
      return String(ao.firstMessage).trim();
    }
    const { firstMessage } = await fetchAssistantBaselines(client);
    return firstMessage || '';
  }

  if (dim === 'script') {
    const scriptExp = trimStr(vapi.outboundAbScriptExperiment);
    if (scriptExp) {
      const cfg = await controlVariantConfigForExperiment(clientKey, scriptExp);
      const c = cfg && typeof cfg === 'object' ? cfg : {};
      const body = String(c.systemMessage || c.script || '').trim();
      if (body) return body;
    }
    const legacyExp = trimStr(vapi.outboundAbExperiment);
    if (legacyExp) {
      const cfg = await controlVariantConfigForExperiment(clientKey, legacyExp);
      const c = cfg && typeof cfg === 'object' ? cfg : {};
      const body = String(c.systemMessage || c.script || '').trim();
      if (body) return body;
    }
    if (ao?.model?.messages?.[0]?.content != null && String(ao.model.messages[0].content).trim()) {
      return String(ao.model.messages[0].content).trim();
    }
    const { script } = await fetchAssistantBaselines(client);
    return script || '';
  }

  return '';
}
