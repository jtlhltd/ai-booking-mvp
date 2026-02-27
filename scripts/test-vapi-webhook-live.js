#!/usr/bin/env node
// Quick test: POST a VAPI end-of-call-report style webhook to the live webhook URL and verify 200.

const BASE = process.env.PUBLIC_BASE_URL || process.env.TEST_BASE_URL || 'https://ai-booking-mvp.onrender.com';
const URL = `${BASE.replace(/\/$/, '')}/webhooks/vapi`;

const payload = {
  message: {
    type: 'end-of-call-report',
    endedReason: 'customer-did-not-answer',
    call: {
      id: `test_eoc_${Date.now()}`,
      status: 'ended',
      duration: 8
    }
  },
  metadata: {
    tenantKey: 'test_client',
    leadPhone: '+447700900999'
  }
};

async function main() {
  console.log('POST', URL);
  console.log('Payload (end-of-call-report with endedReason):', JSON.stringify(payload, null, 2).slice(0, 400) + '...');
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    console.log('Status:', res.status, res.statusText);
    console.log('Body:', text.slice(0, 300));
    if (res.ok) {
      console.log('\n✅ Webhook accepted (2xx). End-of-call handling works.');
      process.exit(0);
    } else {
      console.log('\n❌ Webhook returned non-2xx.');
      process.exit(1);
    }
  } catch (e) {
    console.error('Request failed:', e.message);
    process.exit(1);
  }
}

main();
