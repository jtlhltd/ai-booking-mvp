// Server-side Vapi assistant list / read / limited edit for operator dashboards.

const VAPI_DEFAULT_BASE = 'https://api.vapi.ai';

function vapiBaseUrl() {
  const origin = process.env.VAPI_ORIGIN && String(process.env.VAPI_ORIGIN).trim();
  return origin ? origin.replace(/\/+$/, '') : VAPI_DEFAULT_BASE;
}

export function getVapiPrivateKey() {
  return (
    process.env.VAPI_PRIVATE_KEY ||
    process.env.VAPI_API_KEY ||
    ''
  ).trim();
}

function vapiHeaders() {
  const key = getVapiPrivateKey();
  if (!key) {
    throw new Error('VAPI_PRIVATE_KEY is not configured');
  }
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function readVapiError(res) {
  const text = await res.text().catch(() => '');
  if (!text) return `HTTP ${res.status}`;
  try {
    const j = JSON.parse(text);
    return j.message || j.error || text.slice(0, 240);
  } catch {
    return text.slice(0, 240);
  }
}

export function extractVoiceIdFromAssistantPayload(j) {
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

export function extractSystemScriptFromAssistantPayload(j) {
  const msgs = j?.model?.messages;
  if (!Array.isArray(msgs)) return '';
  const sys = msgs.find((m) => m && String(m.role || '').toLowerCase() === 'system');
  if (sys && sys.content != null && String(sys.content).trim()) return String(sys.content).trim();
  const first = msgs[0];
  if (first && first.content != null && String(first.content).trim()) return String(first.content).trim();
  return '';
}

export function summarizeAssistant(a) {
  if (!a || typeof a !== 'object') return null;
  const id = a.id != null ? String(a.id).trim() : '';
  if (!id) return null;
  const firstMessage = a.firstMessage != null ? String(a.firstMessage) : '';
  return {
    id,
    name: a.name != null && String(a.name).trim() ? String(a.name).trim() : 'Untitled assistant',
    firstMessagePreview: firstMessage.length > 96 ? `${firstMessage.slice(0, 96)}…` : firstMessage,
    updatedAt: a.updatedAt || null,
  };
}

export function toEditableAssistant(a) {
  if (!a || typeof a !== 'object') {
    throw new Error('Invalid assistant payload');
  }
  const id = a.id != null ? String(a.id).trim() : '';
  if (!id) throw new Error('Assistant payload missing id');
  return {
    id,
    name: a.name != null ? String(a.name) : '',
    firstMessage: a.firstMessage != null ? String(a.firstMessage) : '',
    systemPrompt: extractSystemScriptFromAssistantPayload(a),
    voiceId: extractVoiceIdFromAssistantPayload(a),
    updatedAt: a.updatedAt || null,
  };
}

export async function listVapiAssistants() {
  const res = await fetch(`${vapiBaseUrl()}/assistant`, {
    method: 'GET',
    headers: vapiHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to list Vapi assistants: ${await readVapiError(res)}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('Unexpected Vapi assistants list response');
  }
  return data;
}

export async function getVapiAssistant(assistantId) {
  const id = String(assistantId || '').trim();
  if (!id) throw new Error('assistantId is required');
  const res = await fetch(`${vapiBaseUrl()}/assistant/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: vapiHeaders(),
  });
  if (res.status === 404) {
    const err = new Error('Assistant not found');
    err.code = 'not_found';
    throw err;
  }
  if (!res.ok) {
    throw new Error(`Failed to get Vapi assistant: ${await readVapiError(res)}`);
  }
  return res.json();
}

export async function assistantExistsInOrg(assistantId) {
  const id = String(assistantId || '').trim();
  if (!id) return false;
  try {
    await getVapiAssistant(id);
    return true;
  } catch (e) {
    if (e?.code === 'not_found') return false;
    throw e;
  }
}

function buildPatchPayload(current, updates) {
  const patch = {};
  if (updates.name !== undefined) {
    const name = String(updates.name ?? '').trim();
    if (!name) throw new Error('Assistant name cannot be empty');
    patch.name = name;
  }
  if (updates.firstMessage !== undefined) {
    patch.firstMessage = String(updates.firstMessage ?? '');
  }
  if (updates.systemPrompt !== undefined) {
    const content = String(updates.systemPrompt ?? '');
    const model = current?.model && typeof current.model === 'object' ? { ...current.model } : {};
    const messages = Array.isArray(model.messages) ? model.messages.map((m) => ({ ...m })) : [];
    const sysIdx = messages.findIndex((m) => m && String(m.role || '').toLowerCase() === 'system');
    if (sysIdx >= 0) {
      messages[sysIdx] = { ...messages[sysIdx], role: 'system', content };
    } else if (messages.length) {
      messages[0] = { ...messages[0], role: messages[0].role || 'system', content };
    } else {
      messages.push({ role: 'system', content });
    }
    patch.model = { ...model, messages };
  }
  return patch;
}

export async function patchVapiAssistant(assistantId, updates) {
  const id = String(assistantId || '').trim();
  if (!id) throw new Error('assistantId is required');
  if (!updates || typeof updates !== 'object') {
    throw new Error('updates object is required');
  }

  const allowedKeys = ['name', 'firstMessage', 'systemPrompt'];
  const keys = Object.keys(updates).filter((k) => updates[k] !== undefined);
  if (!keys.length) throw new Error('No editable fields provided');
  for (const k of keys) {
    if (!allowedKeys.includes(k)) {
      throw new Error(`Field not allowed: ${k}`);
    }
  }

  const current = await getVapiAssistant(id);
  const patch = buildPatchPayload(current, updates);
  if (!Object.keys(patch).length) {
    throw new Error('Nothing to update');
  }

  const res = await fetch(`${vapiBaseUrl()}/assistant/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: vapiHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(`Failed to update Vapi assistant: ${await readVapiError(res)}`);
  }
  const updated = await res.json();
  return toEditableAssistant(updated);
}

export async function createVapiAssistant(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Assistant payload is required');
  }
  const res = await fetch(`${vapiBaseUrl()}/assistant`, {
    method: 'POST',
    headers: vapiHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to create Vapi assistant: ${await readVapiError(res)}`);
  }
  return res.json();
}
