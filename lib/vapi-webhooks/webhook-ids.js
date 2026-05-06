export function pickVapiCallId(body) {
  return body?.call?.id || body?.id || body?.callId || body?.message?.call?.id || body?.message?.callId || null;
}

export function pickVapiEventType(body) {
  return body?.message?.type || body?.type || null;
}

/**
 * DB-backed idempotency key. Must be stable across retries and unique per webhook delivery.
 */
export function deriveVapiEventId(body) {
  const callId = pickVapiCallId(body) || 'no_call_id';
  const type = pickVapiEventType(body) || 'unknown';
  if (type === 'conversation-update') {
    const n = Array.isArray(body?.message?.messages)
      ? body.message.messages.length
      : Array.isArray(body?.message?.conversation)
        ? body.message.conversation.length
        : 0;
    return `${callId}:${type}:${n}`;
  }
  return `${callId}:${type}`;
}
