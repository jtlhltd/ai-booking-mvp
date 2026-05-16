/**
 * Per-lead, per-stage outbound sequence script generation via OpenAI Chat Completions.
 * Gated by SEQUENCE_LLM_SCRIPTS=1 and OPENAI_API_KEY.
 */

import {
  buildAssistantOverridesForStage,
  getHandoffImportContextKeys,
  mergeStructuredFromCompletedStages,
} from './outbound-sequence.js';
import {
  normalizeLeadDialContext,
  sanitizeLeadDialContextMessage,
} from './lead-dial-context.js';

const ENV_ENABLE = 'SEQUENCE_LLM_SCRIPTS';
const ENV_MODEL = 'SEQUENCE_SCRIPT_LLM_MODEL';
const DEFAULT_MODEL = 'gpt-4o-mini';
const FIRST_MESSAGE_MAX_CHARS = 500;
const SYSTEM_MESSAGE_MAX_CHARS = 4500;
const LLM_TIMEOUT_MS = 28_000;

/** @returns {boolean} */
export function isSequenceLlmScriptsEnabled() {
  const v = String(process.env[ENV_ENABLE] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function truthyEnv(name) {
  const v = String(process.env[name] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>|null}
 */
function parseJsonObjectFromLlm(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  if (!text) return null;
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} stage
 * @param {object} lead
 * @param {object} client
 * @param {object} ctx
 * @param {unknown} leadDialContextRaw
 */
export function buildSequenceLlmPromptPayload(stage, lead, client, ctx = {}, leadDialContextRaw = null) {
  const st = /** @type {any} */ (stage);
  const prior = mergeStructuredFromCompletedStages(ctx.stagesCompleted || []);
  const importScalars = normalizeLeadDialContext(leadDialContextRaw);
  const cfg =
    client?.outboundSequence && typeof client.outboundSequence === 'object'
      ? client.outboundSequence
      : client;
  const importKeys = getHandoffImportContextKeys(cfg);
  const importHints = {};
  for (const key of importKeys) {
    if (importScalars[key] != null && String(importScalars[key]).trim()) {
      importHints[key] = importScalars[key];
    }
  }

  return {
    stageId: String(st.id || '').trim(),
    stageLabel: String(st.label || st.id || '').trim(),
    isFinalStage: st.isFinal === true,
    requiredFields: Array.isArray(st.requiredFields) ? st.requiredFields : [],
    optionalFields: Array.isArray(st.optionalFields) ? st.optionalFields : [],
    referenceFirstMessage: String(st.firstMessage || '').trim(),
    referenceSystemMessage: String(st.systemMessage || '').trim(),
    tenantDisplayName: String(client?.displayName || client?.name || 'the business').trim(),
    lead: {
      name: String(lead?.name || lead?.businessName || '').trim(),
      phone: String(lead?.phone || '').trim(),
      service: String(lead?.service || '').trim(),
      source: String(lead?.source || '').trim(),
      notes: String(lead?.notes || '').trim().slice(0, 800),
    },
    importHints,
    priorStructured: prior,
    stagesCompletedCount: Array.isArray(ctx.stagesCompleted) ? ctx.stagesCompleted.length : 0,
  };
}

/**
 * @param {ReturnType<typeof buildSequenceLlmPromptPayload>} payload
 */
function buildSequenceLlmUserPrompt(payload) {
  const stageId = payload.stageId || 'unknown';
  const isGatekeeper =
    stageId.includes('gatekeeper') || stageId.includes('stage1') || payload.stagesCompletedCount === 0;

  const rules = [
    'Return JSON only: {"firstMessage":"...","systemMessage":"..."}',
    `firstMessage max ${FIRST_MESSAGE_MAX_CHARS} chars; systemMessage max ${SYSTEM_MESSAGE_MAX_CHARS} chars.`,
    'Speak as the caller from tenantDisplayName — never mention internal tenant keys or "AI booking".',
    'systemMessage must state REQUIRED fields to capture on this call and stage rules.',
    'Use priorStructured and importHints naturally; do not read a bullet list aloud.',
    'UK professional logistics/courier tone; concise.',
  ];
  if (isGatekeeper && !payload.isFinalStage) {
    rules.push(
      'GATEKEEPER STAGE: identify decision maker for shipping/logistics only. Do NOT pitch rates, lanes, volumes, or quotes.'
    );
  }
  if (payload.isFinalStage) {
    rules.push('FINAL STAGE: confirm timeline and human callback preference; do not repeat full discovery.');
  }

  return [
    'Write a Vapi outbound call script for ONE stage of a multi-call qualification sequence.',
    '',
    'Hard rules:',
    ...rules.map((r) => `- ${r}`),
    '',
    'Stage contract (must honour goals and requiredFields):',
    JSON.stringify(
      {
        stageId: payload.stageId,
        stageLabel: payload.stageLabel,
        requiredFields: payload.requiredFields,
        optionalFields: payload.optionalFields,
        referenceFirstMessage: payload.referenceFirstMessage,
        referenceSystemMessage: payload.referenceSystemMessage,
      },
      null,
      2
    ),
    '',
    'Lead-specific facts:',
    JSON.stringify(
      {
        tenantDisplayName: payload.tenantDisplayName,
        lead: payload.lead,
        importHints: payload.importHints,
        priorStructured: payload.priorStructured,
      },
      null,
      2
    ),
  ].join('\n');
}

/**
 * @param {object} params
 * @param {object} params.stage
 * @param {object} params.lead
 * @param {object} params.client
 * @param {object} [params.ctx]
 * @param {unknown} [params.leadDialContextRaw]
 * @param {string} [params.correlationId]
 */
export async function generateSequenceStageScriptWithLlm({
  stage,
  lead,
  client,
  ctx = {},
  leadDialContextRaw = null,
  correlationId = '',
}) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return { ok: false, error: 'openai_not_configured' };

  const model = String(process.env[ENV_MODEL] || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const payload = buildSequenceLlmPromptPayload(stage, lead, client, ctx, leadDialContextRaw);
  const userPrompt = buildSequenceLlmUserPrompt(payload);

  const timeoutMs = Number(process.env.SEQUENCE_SCRIPT_LLM_TIMEOUT_MS) || LLM_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You produce outbound phone scripts as strict JSON. No markdown. Obey stage constraints exactly.',
          },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, error: `openai_http_${res.status}`, detail: errText.slice(0, 200) };
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = parseJsonObjectFromLlm(content);
    if (!parsed) return { ok: false, error: 'openai_invalid_json' };

    const firstMessage = sanitizeLeadDialContextMessage(
      parsed.firstMessage,
      FIRST_MESSAGE_MAX_CHARS
    );
    const systemMessage = sanitizeLeadDialContextMessage(
      parsed.systemMessage,
      SYSTEM_MESSAGE_MAX_CHARS
    );
    if (!firstMessage || !systemMessage) {
      return { ok: false, error: 'openai_missing_fields' };
    }

    return {
      ok: true,
      model,
      script: { firstMessage, systemMessage },
      correlationId: correlationId || undefined,
    };
  } catch (err) {
    const msg = err?.name === 'AbortError' ? 'openai_timeout' : err?.message || String(err);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Merge LLM script text into static stage overrides (keeps variableValues / caps).
 * @param {Record<string, unknown>} baseOverrides
 * @param {{ firstMessage: string, systemMessage: string }} script
 */
export function applyLlmScriptToAssistantOverrides(baseOverrides, script) {
  const base = baseOverrides && typeof baseOverrides === 'object' ? { ...baseOverrides } : {};
  const out = {
    ...base,
    firstMessage: script.firstMessage,
  };
  const priorModel = base.model && typeof base.model === 'object' ? base.model : {};
  out.model = {
    ...priorModel,
    provider: 'openai',
    model: 'gpt-4o',
    temperature: 0.3,
    maxTokens: 500,
    messages: [{ role: 'system', content: script.systemMessage }],
  };
  return out;
}

/**
 * @param {object} params
 * @param {object} params.stage
 * @param {object} params.lead
 * @param {object} params.client
 * @param {object} [params.ctx]
 * @param {unknown} [params.leadDialContextRaw]
 * @param {string} [params.correlationId]
 */
export async function resolveSequenceStageAssistantOverrides({
  stage,
  lead,
  client,
  ctx = {},
  leadDialContextRaw = null,
  correlationId = '',
}) {
  const base = buildAssistantOverridesForStage(stage, lead, client, ctx);
  if (!isSequenceLlmScriptsEnabled()) {
    return { overrides: base, scriptSource: 'static' };
  }

  const llm = await generateSequenceStageScriptWithLlm({
    stage,
    lead,
    client,
    ctx,
    leadDialContextRaw,
    correlationId,
  });

  if (!llm.ok) {
    if (!truthyEnv('SEQUENCE_LLM_SCRIPTS_SILENT')) {
      console.warn('[SEQUENCE LLM] using static stage script:', llm.error, correlationId || '');
    }
    return { overrides: base, scriptSource: 'static', llmError: llm.error };
  }

  return {
    overrides: applyLlmScriptToAssistantOverrides(base, llm.script),
    scriptSource: 'llm',
    llmModel: llm.model,
  };
}
