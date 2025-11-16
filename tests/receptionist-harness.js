#!/usr/bin/env node
/**
 * Lightweight receptionist test harness.
 * Simulates Twilio inbound voice and outbound follow-up to exercise receptionist wiring.
 *
 * Usage:
 *   node tests/receptionist-harness.js --baseUrl=https://ai-booking-mvp.onrender.com --tenant=test_client
 */

import { URLSearchParams } from 'url';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.split('=');
    return [key.replace(/^--/, ''), value ?? true];
  })
);

const baseUrl = args.baseUrl || process.env.HARNESS_BASE_URL || 'http://localhost:3000';
const tenant = args.tenant || process.env.HARNESS_TENANT || 'test_client';
const apiKey = args.apiKey || process.env.API_KEY || 'ad34b1de00c5b7380d6a447abcd78874';

async function deleteJson(path, headers = {}) {
  const res = await fetch(new URL(path, baseUrl), {
    method: 'DELETE',
    headers
  });
  return res.json().catch(() => ({}));
}

async function getJson(path, headers = {}) {
  const res = await fetch(new URL(path, baseUrl), {
    method: 'GET',
    headers
  });
  return res.json().catch(() => ({}));
}

async function postJson(path, payload, headers = {}) {
  const res = await fetch(new URL(path, baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload)
  });
  return res.json().catch(() => ({}));
}

async function postForm(path, form, headers = {}) {
  const params = new URLSearchParams();
  Object.entries(form).forEach(([key, value]) => {
    if (value !== undefined && value !== null) params.append(key, value);
  });
  const res = await fetch(new URL(path, baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: params
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function main() {
  console.log('=== Receptionist Harness ===');
  console.log('Base URL:', baseUrl);
  console.log('Tenant:', tenant);

  console.log('\nStep 0: Clear telemetry');
  await deleteJson('/admin/receptionist-telemetry');

  console.log('\nStep 1: Simulate inbound Twilio voice call');
  const inboundResponse = await postForm('/webhooks/twilio-voice-inbound', {
    CallSid: `CA${Date.now()}`,
    From: '+447700900123',
    To: '+441234567890',
    CallStatus: 'ringing',
    SignatureBypass: args.signatureBypass || process.env.HARNESS_SIGNATURE_BYPASS || 'true'
  }, {
    'X-Test-Signature-Bypass': 'true'
  });
  console.log('Twilio Voice response status:', inboundResponse.status);
  console.log('Twilio Voice response body:', inboundResponse.text.trim());

  console.log('\nStep 2: Trigger outbound follow-up launch');
  const outboundPayload = {
    phone: '+447700900123',
    name: 'Harness Prospect',
    service: 'Swedish Massage',
    intentHint: 'service:Swedish Massage, follow_up_demo',
    previousStatus: 'needs_followup',
    testMode: 'mock_vapi'
  };
  const outboundResponse = await postJson(`/webhooks/new-lead/${tenant}`, outboundPayload, {
    'X-API-Key': apiKey
  });
  console.log('Outbound launch response:', outboundResponse);

  console.log('\nStep 3: Fetch recent receptionist telemetry');
  const telemetry = await getJson('/admin/receptionist-telemetry?limit=10');
  console.log(JSON.stringify(telemetry, null, 2));

  console.log('\nHarness complete. Review telemetry to confirm receptionist flow.');
}

main().catch((err) => {
  console.error('Harness failed:', err);
  process.exitCode = 1;
});

