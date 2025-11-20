// scripts/test-submit-lead.js
// Test script to submit a lead to the system

import 'dotenv/config';

// Use built-in fetch (Node 18+)
const fetch = globalThis.fetch;

const API_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:10000';
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error('❌ ERROR: API_KEY not set in environment variables');
  console.log('Please set API_KEY in your .env file');
  process.exit(1);
}

// Get lead data from command line args or use defaults
// API format: { service, lead: { name, phone }, source }
const leadData = {
  service: process.argv[6] || process.argv[2] || 'Consultation',
  lead: {
    name: process.argv[2] || 'Test Lead',
    phone: process.argv[3] || '+447491683261',
    email: process.argv[4] || null
  },
  source: process.argv[7] || 'test_script'
};

const clientKey = process.argv[5] || process.env.DEFAULT_CLIENT_KEY || 'test_client';

console.log('🚀 Submitting test lead...');
console.log('📋 Lead Data:', JSON.stringify(leadData, null, 2));
console.log('🔑 Client Key:', clientKey);
console.log('🌐 API URL:', API_URL);
console.log('');
console.log('💡 Usage: node scripts/test-submit-lead.js [name] [phone] [email] [clientKey] [service] [source]');
console.log('💡 Example: node scripts/test-submit-lead.js "John Doe" "+447491683261" "john@example.com" "your_client_key" "Consultation"');
console.log('');

try {
  const response = await fetch(`${API_URL}/api/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      'X-Client-Key': clientKey
    },
    body: JSON.stringify(leadData)
  });

  const responseText = await response.text();
  let responseData;
  
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = { raw: responseText };
  }

  console.log('📡 Response Status:', response.status);
  console.log('📦 Response Data:', JSON.stringify(responseData, null, 2));

  if (response.ok) {
    console.log('');
    console.log('✅ Lead submitted successfully!');
    console.log('');
    console.log('📊 Next Steps:');
    console.log('1. Check server logs for webhook processing');
    console.log('2. Check VAPI dashboard for call status');
    console.log('3. Check Google Sheet for new row');
    console.log('4. Check database for lead record');
    console.log('');
    console.log('💡 Monitor with: node scripts/monitor-system.js');
  } else {
    console.log('');
    console.log('❌ Lead submission failed!');
    console.log('Check the error above for details.');
  }
} catch (error) {
  console.error('❌ Error submitting lead:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

