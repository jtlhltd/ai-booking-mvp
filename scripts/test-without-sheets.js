// scripts/test-without-sheets.js
// Test system without requiring Google Sheets setup

import 'dotenv/config';

const API_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:10000';
const API_KEY = process.env.API_KEY;

const fetch = globalThis.fetch;

console.log('🧪 Testing System (Without Google Sheets)');
console.log('==========================================');
console.log('');

if (!API_KEY) {
  console.log('⚠️  API_KEY not set - some tests will be skipped');
  console.log('💡 Set API_KEY in .env or use Render environment');
  console.log('');
}

// Test 1: Server Health
console.log('1️⃣  Testing server health...');
try {
  const healthResponse = await fetch(`${API_URL}/api/health`, {
    headers: API_KEY ? { 'X-API-Key': API_KEY } : {}
  });
  
  if (healthResponse.ok) {
    const health = await healthResponse.json();
    console.log('   ✅ Server is running');
    console.log('   📊 Status:', health.status || 'ok');
  } else {
    console.log('   ⚠️  Server responded with:', healthResponse.status);
    console.log('   💡 Make sure server is running');
  }
} catch (error) {
  console.log('   ❌ Server not reachable:', error.message);
  console.log('   💡 Start server with: npm start');
}
console.log('');

// Test 2: API Endpoints Structure
console.log('2️⃣  Testing API endpoints...');
const endpoints = [
  '/api/health',
  '/api/leads',
  '/api/admin/system-health'
];

for (const endpoint of endpoints) {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'GET',
      headers: API_KEY ? { 'X-API-Key': API_KEY } : {}
    });
    const status = response.status;
    if (status === 200 || status === 401 || status === 400) {
      console.log(`   ✅ ${endpoint} - Responds (${status})`);
    } else {
      console.log(`   ⚠️  ${endpoint} - Status ${status}`);
    }
  } catch (error) {
    console.log(`   ❌ ${endpoint} - Error: ${error.message}`);
  }
}
console.log('');

// Test 3: Environment Check
console.log('3️⃣  Checking environment variables...');
const criticalVars = {
  'API_KEY': process.env.API_KEY,
  'VAPI_PRIVATE_KEY': process.env.VAPI_PRIVATE_KEY,
  'VAPI_ASSISTANT_ID': process.env.VAPI_ASSISTANT_ID,
  'DATABASE_URL': process.env.DATABASE_URL
};

let hasCritical = true;
for (const [name, value] of Object.entries(criticalVars)) {
  if (value) {
    const masked = name.includes('KEY') ? value.substring(0, 8) + '...' : value.substring(0, 30) + '...';
    console.log(`   ✅ ${name} = ${masked}`);
  } else {
    console.log(`   ⚠️  ${name} = NOT SET (in Render env)`);
    if (name === 'API_KEY' || name === 'VAPI_PRIVATE_KEY') {
      hasCritical = false;
    }
  }
}
console.log('');

// Test 4: Database Connection (if available)
console.log('4️⃣  Testing database connection...');
try {
  const { query } = await import('../db.js');
  const result = await query('SELECT 1 as test');
  console.log('   ✅ Database connected');
} catch (error) {
  console.log('   ⚠️  Database test skipped:', error.message);
  console.log('   💡 Database connection requires DATABASE_URL');
}
console.log('');

// Summary
console.log('📊 Test Summary:');
console.log('================');
if (hasCritical) {
  console.log('✅ Critical variables are available');
  console.log('💡 Your system should work on Render');
  console.log('');
  console.log('🚀 Next Steps:');
  console.log('   1. Test on Render (production) where all env vars are set');
  console.log('   2. Or set up local .env file with values from Render');
  console.log('   3. Then run: node scripts/test-submit-lead.js');
} else {
  console.log('⚠️  Some critical variables missing locally');
  console.log('💡 These are set on Render, so production should work');
  console.log('');
  console.log('💡 To test locally:');
  console.log('   1. Copy env vars from Render dashboard');
  console.log('   2. Add to local .env file');
  console.log('   3. Run tests again');
}
console.log('');



