// scripts/test-against-render.js
// Test against your Render deployment (uses Render's environment variables)

import 'dotenv/config';

// Use Render URL from env or prompt
const RENDER_URL = process.env.PUBLIC_BASE_URL || process.env.RENDER_URL || 'https://ai-booking-mvp.onrender.com';
const API_KEY = process.env.API_KEY; // This should be in Render env

const fetch = globalThis.fetch;

console.log('🚀 Testing Against Render Deployment');
console.log('====================================');
console.log('');
console.log('🌐 Render URL:', RENDER_URL);
console.log('');

if (!API_KEY) {
  console.log('⚠️  API_KEY not found in local env');
  console.log('💡 This script tests against Render where API_KEY is set');
  console.log('💡 Or set API_KEY locally to test with authentication');
  console.log('');
}

// Test 1: Server Health
console.log('1️⃣  Testing Render server health...');
try {
  const healthResponse = await fetch(`${RENDER_URL}/api/health`, {
    headers: API_KEY ? { 'X-API-Key': API_KEY } : {}
  });
  
  if (healthResponse.ok) {
    const health = await healthResponse.json();
    console.log('   ✅ Render server is running');
    console.log('   📊 Status:', health.status || 'ok');
  } else {
    const text = await healthResponse.text();
    console.log('   ⚠️  Server responded with:', healthResponse.status);
    if (healthResponse.status === 401) {
      console.log('   💡 This is expected - API key auth is working');
    }
  }
} catch (error) {
  console.log('   ❌ Cannot reach Render server:', error.message);
  console.log('   💡 Check if deployment is running on Render');
}
console.log('');

// Test 2: Submit Test Lead (if API_KEY available)
if (API_KEY) {
  console.log('2️⃣  Testing lead submission...');
  const testLead = {
    service: 'Consultation',
    lead: {
      name: 'Test Lead from Script',
      phone: '+447491683261'
    },
    source: 'test_script'
  };
  
  // You'll need to provide a client key
  const clientKey = process.argv[2] || process.env.DEFAULT_CLIENT_KEY;
  
  if (!clientKey) {
    console.log('   ⚠️  No client key provided');
    console.log('   💡 Usage: node scripts/test-against-render.js [clientKey]');
    console.log('   💡 Or set DEFAULT_CLIENT_KEY in .env');
  } else {
    try {
      const response = await fetch(`${RENDER_URL}/api/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
          'X-Client-Key': clientKey
        },
        body: JSON.stringify(testLead)
      });
      
      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText };
      }
      
      console.log('   📡 Response Status:', response.status);
      console.log('   📦 Response:', JSON.stringify(responseData, null, 2));
      
      if (response.ok) {
        console.log('   ✅ Lead submitted successfully!');
        console.log('');
        console.log('📊 Next Steps:');
        console.log('   1. Check Render logs for webhook processing');
        console.log('   2. Check VAPI dashboard for call status');
        console.log('   3. Check Google Sheet for new row');
      } else {
        console.log('   ❌ Lead submission failed');
        console.log('   💡 Check the error above');
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
    }
  }
} else {
  console.log('2️⃣  Skipping lead submission (no API_KEY)');
  console.log('   💡 Set API_KEY locally to test lead submission');
}
console.log('');

// Test 3: Check what's available
console.log('3️⃣  Available endpoints:');
const endpoints = [
  { path: '/api/health', method: 'GET', auth: false },
  { path: '/api/leads', method: 'GET', auth: true },
  { path: '/api/admin/system-health', method: 'GET', auth: true }
];

for (const endpoint of endpoints) {
  try {
    const headers = {};
    if (endpoint.auth && API_KEY) {
      headers['X-API-Key'] = API_KEY;
    }
    
    const response = await fetch(`${RENDER_URL}${endpoint.path}`, {
      method: endpoint.method,
      headers
    });
    
    const status = response.status;
    if (status === 200) {
      console.log(`   ✅ ${endpoint.path} - Working`);
    } else if (status === 401) {
      console.log(`   🔒 ${endpoint.path} - Requires auth (expected)`);
    } else {
      console.log(`   ⚠️  ${endpoint.path} - Status ${status}`);
    }
  } catch (error) {
    console.log(`   ❌ ${endpoint.path} - Error: ${error.message}`);
  }
}
console.log('');

console.log('✅ Testing complete!');
console.log('');
console.log('💡 Tips:');
console.log('   - All env vars are on Render, so production should work');
console.log('   - To test locally, copy env vars from Render dashboard');
console.log('   - Or test directly on Render deployment');
console.log('');



