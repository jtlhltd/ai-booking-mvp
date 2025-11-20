// scripts/monitor-lead-status.js
// Monitor a specific lead's status on Render

import 'dotenv/config';

const RENDER_URL = process.env.PUBLIC_BASE_URL || 'https://ai-booking-mvp.onrender.com';
const API_KEY = process.env.API_KEY;
const fetch = globalThis.fetch;

const leadId = process.argv[2];
const clientKey = process.argv[3] || 'test_client';

if (!leadId) {
  console.log('❌ Usage: node scripts/monitor-lead-status.js [leadId] [clientKey]');
  console.log('💡 Example: node scripts/monitor-lead-status.js lead_4cD10Iv5 test_client');
  process.exit(1);
}

console.log('🔍 Monitoring Lead Status');
console.log('========================');
console.log('');
console.log('🌐 Render URL:', RENDER_URL);
console.log('🆔 Lead ID:', leadId);
console.log('🔑 Client Key:', clientKey);
console.log('');

// Check lead status
async function checkLeadStatus() {
  try {
    const headers = {
      'X-Client-Key': clientKey
    };
    
    if (API_KEY) {
      headers['X-API-Key'] = API_KEY;
    }
    
    // Try to get lead details
    const response = await fetch(`${RENDER_URL}/api/leads/${leadId}`, {
      headers
    });
    
    if (response.ok) {
      const lead = await response.json();
      console.log('✅ Lead Found:');
      console.log('   Name:', lead.name || 'N/A');
      console.log('   Phone:', lead.phone || 'N/A');
      console.log('   Status:', lead.status || 'N/A');
      console.log('   Service:', lead.service || 'N/A');
      console.log('   Created:', lead.createdAt || 'N/A');
      console.log('');
      
      // Check for calls
      if (lead.calls && lead.calls.length > 0) {
        console.log('📞 Calls Found:', lead.calls.length);
        lead.calls.forEach((call, i) => {
          console.log(`   Call ${i + 1}:`);
          console.log(`      Status: ${call.status || 'N/A'}`);
          console.log(`      Outcome: ${call.outcome || 'N/A'}`);
          console.log(`      Duration: ${call.duration || 'N/A'}s`);
          console.log(`      Created: ${call.createdAt || 'N/A'}`);
        });
        console.log('');
      } else {
        console.log('📞 No calls yet - VAPI may still be processing');
        console.log('');
      }
      
      return lead;
    } else {
      console.log('⚠️  Could not fetch lead details:', response.status);
      const text = await response.text();
      console.log('   Response:', text);
      return null;
    }
  } catch (error) {
    console.log('❌ Error checking lead:', error.message);
    return null;
  }
}

// Check recent calls for this client
async function checkRecentCalls() {
  try {
    const headers = {};
    if (API_KEY) {
      headers['X-API-Key'] = API_KEY;
    }
    
    const response = await fetch(`${RENDER_URL}/api/admin/calls?limit=5&clientKey=${clientKey}`, {
      headers
    });
    
    if (response.ok) {
      const data = await response.json();
      const calls = Array.isArray(data) ? data : (data.calls || []);
      
      if (calls.length > 0) {
        console.log('📞 Recent Calls for Client:');
        calls.forEach((call, i) => {
          console.log(`   ${i + 1}. ${call.leadName || 'Unknown'} - ${call.status || 'N/A'} - ${call.outcome || 'N/A'}`);
        });
        console.log('');
      } else {
        console.log('📞 No recent calls found');
        console.log('');
      }
    }
  } catch (error) {
    // Silent fail
  }
}

// Run checks
await checkLeadStatus();
await checkRecentCalls();

console.log('💡 Next Steps:');
console.log('   1. Check Render logs for VAPI webhook processing');
console.log('   2. Check VAPI dashboard: https://dashboard.vapi.ai');
console.log('   3. Check Google Sheet for new data');
console.log('   4. Run this script again to see updates');
console.log('');



