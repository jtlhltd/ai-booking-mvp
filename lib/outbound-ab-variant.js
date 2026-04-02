// lib/outbound-ab-variant.js
// DB-backed A/B assignment + mapping variant_config → Vapi assistantOverrides.
//
// variant_config (JSON on ab_test_experiments) supports:
// - firstMessage: opening line
// - systemMessage | script: system prompt (sent as model.messages[0] role system)
// - voice: ElevenLabs object { provider?, voiceId, stability?, ... } or a voiceId string
// - model: partial model override (provider, model, temperature, maxTokens, tools, …)
// - variableValues: merged with tenant assistantOverrides.variableValues
// - assistantId | vapiAssistantId: optional; replaces payload.assistantId for this call

import { createHash } from 'crypto';

function parseVariantConfig(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw;
  return null;
}

/**
 * Stable per-lead variant; records one `assigned` row in ab_test_results (same as admin assign).
 */
export async function selectABTestVariantForLead(clientKey, experimentName, leadPhone) {
  try {
    const { getActiveABTests, recordABTestResult } = await import('../db.js');

    const activeTests = await getActiveABTests(clientKey);
    const experimentVariants = activeTests.filter((test) => test.experiment_name === experimentName);

    if (!experimentVariants || experimentVariants.length === 0) {
      return null;
    }

    const hash = createHash('md5').update(`${clientKey}_${experimentName}_${leadPhone}`).digest('hex');
    const hashValue = parseInt(hash.substring(0, 8), 16);
    const variantIndex = hashValue % experimentVariants.length;
    const selectedVariant = experimentVariants[variantIndex];

    await recordABTestResult({
      experimentId: selectedVariant.id,
      clientKey,
      leadPhone,
      variantName: selectedVariant.variant_name,
      outcome: 'assigned',
      outcomeData: {
        assignmentMethod: 'hash_based',
        hashValue,
        variantIndex
      }
    });

    console.log('[AB TEST VARIANT SELECTED]', {
      clientKey,
      experimentName,
      leadPhone,
      variantName: selectedVariant.variant_name,
      variantIndex
    });

    return {
      name: selectedVariant.variant_name,
      config: parseVariantConfig(selectedVariant.variant_config)
    };
  } catch (error) {
    console.error('[AB TEST VARIANT SELECTION ERROR]', error);
    return null;
  }
}

/**
 * Build Vapi assistantOverrides + optional assistantId swap from variant_config.
 */
export function buildAssistantOverridesFromVariantConfig(config) {
  const c = parseVariantConfig(config);
  if (!c || typeof c !== 'object') {
    return { overrides: {}, assistantIdOverride: null };
  }

  const assistantIdOverride = c.assistantId || c.vapiAssistantId || null;
  const overrides = {};

  if (c.firstMessage != null && String(c.firstMessage).trim() !== '') {
    overrides.firstMessage = String(c.firstMessage);
  }

  const systemText =
    c.systemMessage != null && String(c.systemMessage).trim() !== ''
      ? String(c.systemMessage)
      : c.script != null && String(c.script).trim() !== ''
        ? String(c.script)
        : null;

  if (systemText) {
    const baseModel = c.model && typeof c.model === 'object' ? { ...c.model } : {};
    const { messages: _dropMessages, ...restModel } = baseModel;
    overrides.model = {
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.3,
      maxTokens: 500,
      ...restModel,
      messages: [{ role: 'system', content: systemText }]
    };
  } else if (c.model && typeof c.model === 'object' && Object.keys(c.model).length > 0) {
    overrides.model = { ...c.model };
  }

  if (c.voice != null) {
    if (typeof c.voice === 'string' && c.voice.trim() !== '') {
      overrides.voice = { provider: '11labs', voiceId: c.voice.trim() };
    } else if (typeof c.voice === 'object') {
      const v = { ...c.voice };
      if (!v.provider) v.provider = '11labs';
      if (v.voiceId) {
        overrides.voice = v;
      }
    }
  }

  if (c.variableValues && typeof c.variableValues === 'object') {
    overrides.variableValues = { ...c.variableValues };
  }

  return { overrides, assistantIdOverride };
}

/**
 * Merge tenant/client assistantOverrides with A/B overrides (variableValues and model combine sensibly).
 */
export function mergeAssistantOverrides(base, ab) {
  const a = base && typeof base === 'object' ? base : {};
  const b = ab && typeof ab === 'object' ? ab : {};
  const out = { ...a, ...b };

  if (a.variableValues || b.variableValues) {
    out.variableValues = {
      ...(typeof a.variableValues === 'object' ? a.variableValues : {}),
      ...(typeof b.variableValues === 'object' ? b.variableValues : {})
    };
  }

  if (a.model || b.model) {
    out.model = {
      ...(typeof a.model === 'object' ? a.model : {}),
      ...(typeof b.model === 'object' ? b.model : {})
    };
    if (b.model && Array.isArray(b.model.messages)) {
      out.model.messages = b.model.messages;
    }
  }

  return out;
}
