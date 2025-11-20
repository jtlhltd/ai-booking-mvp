#!/usr/bin/env node
// Submit a test lead to trigger VAPI call with improved prompts
// Usage: node scripts/submit-test-lead.js [clientKey] [phone]

const BASE_URL = process.env.BASE_URL || 'https://ai-booking-mvp.onrender.com';
const API_KEY = process.env.API_KEY || process.argv[3];

const clientKey = process.argv[2] || 'demo-client';
const testPhone = process.argv[3] || process.env.TEST_PHONE_NUMBER || '+447491683261';
const service = process.argv[4] || 'Consultation';

console.log('\n📞 Submitting Test Lead\n');
console.log(`Client: ${clientKey}`);
console.log(`Phone: ${testPhone}`);
console.log(`Service: ${service}\n`);

const leadData = {
  service: service,
  lead: {
    name: 'Test Lead',
    phone: testPhone
  },
  source: 'test-script'
};

try {
  const response = await fetch(`${BASE_URL}/api/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY || clientKey
    },
    body: JSON.stringify(leadData)
  });

  if (response.ok) {
    const result = await response.json();
    console.log('✅ Lead submitted successfully!');
    console.log(`   Lead ID: ${result.leadId}`);
    console.log(`   Status: ${result.status}`);
    console.log('\n📞 VAPI call should be triggered within 5 minutes');
    console.log('   Check your phone:', testPhone);
  } else {
    const error = await response.text();
    console.log('❌ Failed to submit lead:', error);
  }
} catch (error) {
  console.log('❌ Error:', error.message);
}

