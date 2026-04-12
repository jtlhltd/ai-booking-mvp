/**
 * High-volume Vapi webhook debug logging (payloads, transcripts, sheet rows).
 * Off in production unless VAPI_WEBHOOK_VERBOSE is enabled — reduces sync I/O and CPU on hot paths.
 */
export function isVapiWebhookVerbose() {
  const v = String(process.env.VAPI_WEBHOOK_VERBOSE || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'debug'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return process.env.NODE_ENV !== 'production';
}

export function vapiWebhookVerboseLog(...args) {
  if (isVapiWebhookVerbose()) console.log(...args);
}
