// scripts/test-render-deployment.js
// Comprehensive test of Render deployment

import 'dotenv/config';

const RENDER_URL = process.env.PUBLIC_BASE_URL || 'https://ai-booking-mvp.onrender.com';
const fetch = globalThis.fetch;

console.log('🚀 Testing Render Deployment');
console.log('============================');
console.log('');
console.log('🌐 Testing:', RENDER_URL);
console.log('');

// Test results
const results = {
  passed: [],
  failed: [],
  warnings: []
};

// Helper to test endpoint
async function testEndpoint(name, path, method = 'GET', body = null, headers = {}) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${RENDER_URL}${path}`, options);
    const status = response.status;
    let data;
    
    try {
      const text = await response.text();
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    
    if (status >= 200 && status < 300) {
      results.passed.push({ name, path, status });
      return { success: true, status, data };
    } else if (status === 401 || status === 403) {
      results.warnings.push({ name, path, status, message: 'Requires authentication (expected)' });
      return { success: true, status, data, auth: true };
    } else if (status === 404) {
      results.warnings.push({ name, path, status, message: 'Endpoint not found' });
      return { success: false, status, data };
    } else {
      results.failed.push({ name, path, status });
      return { success: false, status, data };
    }
  } catch (error) {
    results.failed.push({ name, path, error: error.message });
    return { success: false, error: error.message };
  }
}

// Test 1: Health endpoints
console.log('1️⃣  Testing Health Endpoints...');
console.log('');

const healthResult = await testEndpoint('Health Check', '/health');
if (healthResult.success) {
  console.log('   ✅ /health - Working');
  if (healthResult.data) {
    console.log('   📊 Status:', healthResult.data.status || 'ok');
  }
} else if (healthResult.status === 404) {
  console.log('   ⚠️  /health - Not found, trying alternatives...');
  
  const quickHealth = await testEndpoint('Quick Health', '/health/quick');
  if (quickHealth.success) {
    console.log('   ✅ /health/quick - Working');
  }
  
  const healthz = await testEndpoint('Healthz', '/healthz');
  if (healthz.success) {
    console.log('   ✅ /healthz - Working');
  }
} else {
  console.log('   ❌ /health - Failed:', healthResult.status || healthResult.error);
}

console.log('');

// Test 2: System Health (Admin)
console.log('2️⃣  Testing Admin Endpoints...');
console.log('');

const systemHealth = await testEndpoint('System Health', '/api/admin/system-health');
if (systemHealth.success) {
  console.log('   ✅ /api/admin/system-health - Working');
  if (systemHealth.data) {
    console.log('   📊 Uptime:', systemHealth.data.uptime || 'N/A');
    console.log('   📊 Status:', systemHealth.data.status || 'N/A');
  }
} else if (systemHealth.auth) {
  console.log('   🔒 /api/admin/system-health - Requires API key (expected)');
} else {
  console.log('   ⚠️  /api/admin/system-health - Status:', systemHealth.status);
}

console.log('');

// Test 3: Leads Endpoint Structure
console.log('3️⃣  Testing Leads Endpoint...');
console.log('');

const leadsGet = await testEndpoint('Get Leads', '/api/leads', 'GET');
if (leadsGet.success) {
  console.log('   ✅ GET /api/leads - Working');
} else if (leadsGet.auth) {
  console.log('   🔒 GET /api/leads - Requires authentication (expected)');
} else {
  console.log('   ⚠️  GET /api/leads - Status:', leadsGet.status);
}

// Test POST (will fail without proper auth/client key, but tests structure)
const testLead = {
  service: 'Consultation',
  lead: {
    name: 'Test Lead',
    phone: '+447491683261'
  },
  source: 'test_script'
};

const leadsPost = await testEndpoint('Post Lead', '/api/leads', 'POST', testLead);
if (leadsPost.success) {
  console.log('   ✅ POST /api/leads - Working!');
  console.log('   📦 Response:', JSON.stringify(leadsPost.data, null, 2));
} else if (leadsPost.status === 400) {
  console.log('   ⚠️  POST /api/leads - Bad request (missing client key - expected)');
  console.log('   💡 This is normal - you need X-Client-Key header');
} else if (leadsPost.auth) {
  console.log('   🔒 POST /api/leads - Requires authentication (expected)');
} else {
  console.log('   ⚠️  POST /api/leads - Status:', leadsPost.status);
}

console.log('');

// Test 4: Other endpoints
console.log('4️⃣  Testing Other Endpoints...');
console.log('');

const endpoints = [
  { name: 'Appointments', path: '/api/appointments' },
  { name: 'Clients', path: '/api/clients' },
  { name: 'Monitoring', path: '/api/monitoring' }
];

for (const endpoint of endpoints) {
  const result = await testEndpoint(endpoint.name, endpoint.path);
  if (result.success && !result.auth) {
    console.log(`   ✅ ${endpoint.path} - Working`);
  } else if (result.auth) {
    console.log(`   🔒 ${endpoint.path} - Requires auth`);
  } else {
    console.log(`   ⚠️  ${endpoint.path} - Status ${result.status || 'error'}`);
  }
}

console.log('');

// Test 5: VAPI Webhook endpoint (structure only)
console.log('5️⃣  Testing Webhook Endpoints...');
console.log('');

const vapiWebhook = await testEndpoint('VAPI Webhook', '/webhooks/vapi', 'POST', { test: true });
if (vapiWebhook.status === 400 || vapiWebhook.status === 200) {
  console.log('   ✅ /webhooks/vapi - Endpoint exists');
  console.log('   💡 Will process webhooks when VAPI sends them');
} else {
  console.log('   ⚠️  /webhooks/vapi - Status:', vapiWebhook.status);
}

const twilioWebhook = await testEndpoint('Twilio Webhook', '/webhooks/twilio-inbound', 'POST', { test: true });
if (twilioWebhook.status === 400 || twilioWebhook.status === 200) {
  console.log('   ✅ /webhooks/twilio-inbound - Endpoint exists');
} else {
  console.log('   ⚠️  /webhooks/twilio-inbound - Status:', twilioWebhook.status);
}

console.log('');

// Summary
console.log('📊 Test Summary');
console.log('===============');
console.log('');
console.log(`✅ Passed: ${results.passed.length}`);
console.log(`⚠️  Warnings: ${results.warnings.length}`);
console.log(`❌ Failed: ${results.failed.length}`);
console.log('');

if (results.passed.length > 0) {
  console.log('✅ Working Endpoints:');
  results.passed.forEach(r => {
    console.log(`   - ${r.name} (${r.path})`);
  });
  console.log('');
}

if (results.warnings.length > 0) {
  console.log('⚠️  Endpoints Requiring Auth:');
  results.warnings.forEach(r => {
    console.log(`   - ${r.name} (${r.path}) - ${r.message || 'Status ' + r.status}`);
  });
  console.log('');
}

if (results.failed.length > 0) {
  console.log('❌ Issues Found:');
  results.failed.forEach(r => {
    console.log(`   - ${r.name} (${r.path}) - ${r.error || 'Status ' + r.status}`);
  });
  console.log('');
}

console.log('💡 Next Steps:');
console.log('   1. Get a client key from your database/dashboard');
console.log('   2. Test lead submission with:');
console.log('      node scripts/test-submit-lead.js "Name" "+447491683261" "email@example.com" "CLIENT_KEY" "Consultation"');
console.log('   3. Monitor VAPI dashboard for calls');
console.log('   4. Check Google Sheet for new data');
console.log('');



