// fix-tenants-remote.js - Script to fix tenant configurations via API
import fetch from 'node-fetch';

const API_KEY = 'ad34b1de00c5b7380d6a447abcd78874';
const BASE_URL = 'https://ai-booking-mvp.onrender.com';

async function fixTenantConfigurations() {
  console.log('🔧 Fixing tenant SMS configurations via API...');
  
  try {
    // First, let's check the current state
    console.log('📊 Checking current tenant configurations...');
    const checkResponse = await fetch(`${BASE_URL}/admin/check-tenants`, {
      method: 'GET',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    if (checkResponse.ok) {
      const checkData = await checkResponse.json();
      console.log('Current configurations:', JSON.stringify(checkData, null, 2));
    } else {
      console.log('Check failed:', checkResponse.status, await checkResponse.text());
    }
    
    // Now apply the fix
    console.log('🔧 Applying tenant configuration fix...');
    const fixResponse = await fetch(`${BASE_URL}/admin/fix-tenants`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    
    if (fixResponse.ok) {
      const fixData = await fixResponse.json();
      console.log('✅ Fix applied successfully!');
      console.log('Response:', JSON.stringify(fixData, null, 2));
      
      // Verify the fix worked
      console.log('🔍 Verifying fix...');
      const verifyResponse = await fetch(`${BASE_URL}/admin/check-tenants`, {
        method: 'GET',
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': 'application/json'
        }
      });
      
      if (verifyResponse.ok) {
        const verifyData = await verifyResponse.json();
        console.log('✅ Verification successful!');
        console.log('Updated configurations:', JSON.stringify(verifyData, null, 2));
      } else {
        console.log('Verification failed:', verifyResponse.status, await verifyResponse.text());
      }
    } else {
      console.log('❌ Fix failed:', fixResponse.status, await fixResponse.text());
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the fix
fixTenantConfigurations();
