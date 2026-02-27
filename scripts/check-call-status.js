#!/usr/bin/env node
// Check why outbound calls might not reach Vapi (same logic as GET /api/call-status)
import 'dotenv/config';

const missing = [];
if (!process.env.VAPI_PRIVATE_KEY) missing.push('VAPI_PRIVATE_KEY');
if (!process.env.VAPI_ASSISTANT_ID) missing.push('VAPI_ASSISTANT_ID');
if (!process.env.VAPI_PHONE_NUMBER_ID) missing.push('VAPI_PHONE_NUMBER_ID');

let circuitBreakerOpen = false;
try {
  const { isCircuitBreakerOpen } = await import('../lib/circuit-breaker.js');
  circuitBreakerOpen = isCircuitBreakerOpen('vapi_call');
} catch (e) {
  console.warn('Could not load circuit breaker:', e.message);
}

const vapiConfigured = missing.length === 0;
const hint = missing.length
  ? `Set ${missing.join(', ')} so outbound calls can reach Vapi.`
  : circuitBreakerOpen
    ? 'Circuit breaker is open; check logs for Vapi errors.'
    : 'Vapi env and circuit OK.';

const out = {
  vapiConfigured,
  missingVars: missing,
  circuitBreakerOpen,
  hint
};

console.log(JSON.stringify(out, null, 2));
process.exit(vapiConfigured && !circuitBreakerOpen ? 0 : 1);
