// ElevenLabs / Vapi voice id shape for outbound A/B (format-only; no API round-trip).

const MIN_LEN = 10;
const MAX_LEN = 128;
/** Library ids are often 22 alnum chars; Vapi may expose compound ids with a single `/`. */
const VOICE_ID_RE = /^[A-Za-z0-9_\-/]+$/;

export const ELEVENLABS_VOICE_ID_REQUIREMENT = `Voice ID must be ${MIN_LEN}–${MAX_LEN} characters: letters, digits, and optional _ - / only (ElevenLabs voice id). Example: 21m00Tcm4TlvDq8ikWAM`;

export function normalizeElevenLabsVoiceId(raw) {
  if (raw == null) return '';
  return String(raw).trim();
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, id: string } | { ok: false, error: string }}
 */
export function validateElevenLabsVoiceIdForAb(raw) {
  const id = normalizeElevenLabsVoiceId(raw);
  if (!id) {
    return { ok: false, error: 'Voice ID is required' };
  }
  if (id.length < MIN_LEN || id.length > MAX_LEN) {
    return { ok: false, error: ELEVENLABS_VOICE_ID_REQUIREMENT };
  }
  if (!VOICE_ID_RE.test(id)) {
    return { ok: false, error: ELEVENLABS_VOICE_ID_REQUIREMENT };
  }
  return { ok: true, id };
}
