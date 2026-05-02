// scripts/monitor-system.js
// Monitor system status and recent activity

import 'dotenv/config';
import { query } from '../db.js';

// Use built-in fetch (Node 18+)
const fetch = globalThis.fetch;

const API_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:10000';
const API_KEY = process.env.API_KEY;

console.log('🔍 System Monitor');
console.log('================');
console.log('');

// Check 1: Server Health
console.log('1️⃣  Checking server health...');
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
  }
} catch (error) {
  console.log('   ❌ Server not reachable:', error.message);
}
console.log('');

// Check 2: Recent Leads
console.log('2️⃣  Checking recent leads...');
try {
  const leadsResponse = await fetch(`${API_URL}/api/leads?limit=5`, {
    headers: API_KEY ? { 'X-API-Key': API_KEY } : {}
  });
  
  if (leadsResponse.ok) {
    const leads = await leadsResponse.json();
    const leadCount = Array.isArray(leads) ? leads.length : (leads.leads?.length || 0);
    console.log('   ✅ Found', leadCount, 'recent leads');
    if (leadCount > 0) {
      const latest = Array.isArray(leads) ? leads[0] : (leads.leads?.[0] || {});
      console.log('   📝 Latest:', latest.name || 'N/A', '-', latest.phone || 'N/A');
    }
  } else {
    console.log('   ⚠️  Could not fetch leads:', leadsResponse.status);
  }
} catch (error) {
  console.log('   ❌ Error fetching leads:', error.message);
}
console.log('');

// Check 3: Recent Calls
console.log('3️⃣  Checking recent calls...');
try {
  const callsResponse = await fetch(`${API_URL}/api/admin/calls?limit=5`, {
    headers: API_KEY ? { 'X-API-Key': API_KEY } : {}
  });
  
  if (callsResponse.ok) {
    const calls = await callsResponse.json();
    const callCount = Array.isArray(calls) ? calls.length : (calls.calls?.length || 0);
    console.log('   ✅ Found', callCount, 'recent calls');
    if (callCount > 0) {
      const latest = Array.isArray(calls) ? calls[0] : (calls.calls?.[0] || {});
      console.log('   📞 Latest:', latest.status || 'N/A', '-', latest.outcome || 'N/A');
    }
  } else {
    console.log('   ⚠️  Could not fetch calls:', callsResponse.status);
  }
} catch (error) {
  console.log('   ❌ Error fetching calls:', error.message);
}
console.log('');

// Check 4: Database Connection
console.log('4️⃣  Checking database...');
try {
  const result = await query('SELECT COUNT(*) as count FROM leads LIMIT 1');
  const count = result.rows?.[0]?.count || 0;
  console.log('   ✅ Database connected');
  console.log('   📊 Total leads in database:', count);
} catch (error) {
  console.log('   ❌ Database error:', error.message);
}
console.log('');

// Check 5: Environment Variables
console.log('5️⃣  Checking environment variables...');
const requiredVars = [
  'VAPI_API_KEY',
  'GOOGLE_SHEETS_SPREADSHEET_ID',
  'TWILIO_ACCOUNT_SID',
  'API_KEY'
];

const missingVars = [];
requiredVars.forEach(varName => {
  if (!process.env[varName]) {
    missingVars.push(varName);
  }
});

if (missingVars.length === 0) {
  console.log('   ✅ All required environment variables are set');
} else {
  console.log('   ⚠️  Missing environment variables:');
  missingVars.forEach(v => console.log('      -', v));
}
console.log('');

console.log('✅ Monitoring complete!');
console.log('');
console.log('💡 Tips:');
console.log('   - Run this script periodically to check system health');
console.log('   - Check server logs for detailed activity');
console.log('   - Monitor VAPI dashboard for call status');

