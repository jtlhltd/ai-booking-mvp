// Bounded in-memory stores shared by Vapi webhook route + payload processor.

export const callStore = new Map();
export const CALL_STORE_MAX = 200;

export const processedCallIds = new Set();
export function markProcessed(callId) {
  if (!callId) return;
  processedCallIds.add(callId);
  if (processedCallIds.size > 500) {
    const first = processedCallIds.values().next().value;
    processedCallIds.delete(first);
  }
}

/** Format message array (from conversation-update) to transcript string */
export function formatMessagesToTranscript(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  return messages
    .map((m) => {
      const role = m?.role || m?.type || 'unknown';
      const content = m?.content || m?.text || m?.message || m?.body || '';
      if (!content) return null;
      if (role === 'system' || role === 'function' || role === 'tool') return null;
      const contentUpper = (typeof content === 'string' ? content : '').toUpperCase();
      if (contentUpper.includes('TOOLS:') || contentUpper.includes('CRITICAL:') ||
          contentUpper.includes('FOLLOW THIS SCRIPT') || contentUpper.includes('DO NOT ADD YOUR OWN') ||
          contentUpper.includes('USE ACCESS_GOOGLE_SHEET') || contentUpper.includes('USE SCHEDULE_CALLBACK')) return null;
      const roleLower = (role || '').toLowerCase();
      const label = (roleLower === 'user' || roleLower === 'customer' || roleLower === 'caller' ||
                     roleLower === 'human' || roleLower === 'person') ? 'User' : 'AI';
      return `${label}: ${content}`;
    })
    .filter(Boolean)
    .join('\n\n');
}
