// scripts/test-lead-submission-render.js
// Test lead submission against Render deployment

import 'dotenv/config';

const RENDER_URL = process.env.PUBLIC_BASE_URL || 'https://ai-booking-mvp.onrender.com';
const API_KEY = process.env.API_KEY;
const fetch = globalThis.fetch;

// Get client key from args or use test client
const clientKey = process.argv[2] || 'test_client';

// Get lead data from args or use defaults
const leadData = {
  service: process.argv[6] || 'Consultation',
  lead: {
    name: process.argv[3] || 'Test Lead from Render Test',
    phone: process.argv[4] || '+447491683261',
    email: process.argv[5] || null
  },
  source: 'render_test_script'
};

console.log('🚀 Testing Lead Submission on Render');
console.log('====================================');
console.log('');
console.log('🌐 Render URL:', RENDER_URL);
console.log('🔑 Client Key:', clientKey);
console.log('📋 Lead Data:', JSON.stringify(leadData, null, 2));
console.log('');

if (!API_KEY) {
  console.log('⚠️  API_KEY not set locally');
  console.log('💡 Testing without API key (may require auth on Render)');
  console.log('');
}

try {
  console.log('📤 Submitting lead...');
  
  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Key': clientKey
  };
  
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }
  
  const response = await fetch(`${RENDER_URL}/api/leads`, {
    method: 'POST',
    headers,
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
  console.log('📦 Response:', JSON.stringify(responseData, null, 2));
  console.log('');
  
  if (response.ok) {
    console.log('✅ Lead submitted successfully!');
    console.log('');
    console.log('📊 What happens next:');
    console.log('   1. ✅ Lead stored in database');
    console.log('   2. 📞 VAPI will be triggered to call the lead');
    console.log('   3. 📝 Call transcript will be processed');
    console.log('   4. 📊 Logistics data extracted (if applicable)');
    console.log('   5. 📋 Data added to Google Sheet');
    console.log('   6. 📧 Follow-up sequences triggered (if needed)');
    console.log('');
    console.log('🔍 Monitor the process:');
    console.log('   - Check Render logs: https://dashboard.render.com');
    console.log('   - Check VAPI dashboard: https://dashboard.vapi.ai');
    console.log('   - Check Google Sheet for new row');
    console.log('   - Run: node scripts/monitor-system.js');
    console.log('');
  } else {
    console.log('❌ Lead submission failed');
    console.log('');
    
    if (response.status === 400) {
      console.log('💡 Common issues:');
      console.log('   - Invalid client key');
      console.log('   - Missing required fields');
      console.log('   - Invalid phone number format');
    } else if (response.status === 401 || response.status === 403) {
      console.log('💡 Authentication issue:');
      console.log('   - API key may be required');
      console.log('   - Client key may be invalid');
    } else {
      console.log('💡 Check the error above for details');
    }
    console.log('');
  }
} catch (error) {
  console.error('❌ Error submitting lead:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}



