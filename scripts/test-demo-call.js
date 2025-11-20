#!/usr/bin/env node
// Quick test call script for demo verification
// Usage: node scripts/test-demo-call.js [assistantId] [yourPhoneNumber]

import 'dotenv/config';

const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
const VAPI_API_URL = 'https://api.vapi.ai';

const assistantId = process.argv[2] || process.env.VAPI_TEMPLATE_ASSISTANT_ID;
const phoneNumber = process.argv[3] || process.env.TEST_PHONE_NUMBER;

if (!assistantId) {
  console.error('❌ ERROR: Assistant ID required');
  console.log('Usage: node scripts/test-demo-call.js [assistantId] [yourPhoneNumber]');
  console.log('Or set VAPI_TEMPLATE_ASSISTANT_ID and TEST_PHONE_NUMBER in .env');
  process.exit(1);
}

if (!phoneNumber) {
  console.error('❌ ERROR: Phone number required');
  console.log('Usage: node scripts/test-demo-call.js [assistantId] [yourPhoneNumber]');
  console.log('Example: node scripts/test-demo-call.js abc123 +447700900123');
  process.exit(1);
}

if (!VAPI_PRIVATE_KEY) {
  console.error('❌ ERROR: VAPI_PRIVATE_KEY not set in environment');
  process.exit(1);
}

console.log('\n📞 Making Test Call...\n');
console.log(`Assistant ID: ${assistantId}`);
console.log(`Calling: ${phoneNumber}\n`);

try {
  const payload = {
    assistantId: assistantId,
    customer: {
      number: phoneNumber,
      name: 'Jonah'
    },
    metadata: {
      clientKey: 'demo-client',
      callPurpose: 'demo_test',
      isDemo: true
    }
  };

  // Add phoneNumberId if available
  if (process.env.VAPI_PHONE_NUMBER_ID) {
    payload.phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
  }

  const response = await fetch(`${VAPI_API_URL}/call`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`VAPI API error: ${response.status} - ${error}`);
  }

  const call = await response.json();
  
  console.log('✅ Call initiated!\n');
  console.log(`Call ID: ${call.id}`);
  console.log(`Status: ${call.status}`);
  console.log(`\n📱 Answer your phone (${phoneNumber}) to test the assistant.\n`);
  console.log('💡 The assistant should say "Hi Jonah!" and try to book you.\n');
  
} catch (error) {
  console.error('❌ Error making test call:', error.message);
  process.exit(1);
}

