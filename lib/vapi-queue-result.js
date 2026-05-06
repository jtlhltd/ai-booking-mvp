/**
 * Shared helpers for classifying Vapi dial outcomes in the queue worker.
 *
 * These are behavioral/billing-affecting surfaces; keep them small and covered by canaries.
 */
export function isTransientVapiQueueResult(vapiResult) {
  if (!vapiResult) return true;
  const err = String(vapiResult.error || '');

  // If the pre-flight wallet gate is set, treat as transient so the queue worker
  // keeps rows pending (intent: billing.wallet-check-before-dial).
  if (err === 'vapi_wallet_depleted') return true;

  if (err === 'circuit_breaker_open') return true;
  if (err === 'vapi_client_error') {
    const sc = Number(vapiResult.statusCode);
    if (sc === 429 || sc === 502 || sc === 503 || sc === 504) return true;
    const d = String(vapiResult.details || '').toLowerCase();
    if (/timeout|temporarily|unavailable|overload|rate|too many|429|502|503|504/.test(d)) return true;
  }
  if (err === 'call_failed') {
    const d = String(vapiResult.details || '').toLowerCase();
    if (/timeout|timed out|502|503|504|429|econnreset|fetch|network|socket/i.test(d)) return true;
  }
  return false;
}

export function isNoCreditsVapiResult(vapiResult) {
  const detailsStr = typeof vapiResult?.details === 'string' ? vapiResult.details : '';
  return (
    vapiResult?.error === 'vapi_client_error' &&
    /wallet balance|purchase more credits|upgrade your plan/i.test(detailsStr)
  );
}

