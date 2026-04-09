/**
 * Dashboard Testing Script
 * 
 * Tests that a client dashboard loads correctly with all data populated.
 * 
 * Usage: node scripts/test-dashboard.js [clientKey]
 * Example: node scripts/test-dashboard.js d2d-xpress-tom
 */

const BASE_URL = process.env.BASE_URL || 'https://ai-booking-mvp.onrender.com';

async function testDashboard(clientKey) {
  console.log(`\n🧪 Testing Dashboard for: ${clientKey}\n`);
  console.log('━'.repeat(60));
  
  try {
    // Test 1: Fetch client data from API
    console.log('\n📡 Test 1: Fetching client data from API...');
    const response = await fetch(`${BASE_URL}/api/clients/${clientKey}`);
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.ok || !data.client) {
      throw new Error('API response missing client data');
    }
    
    const client = data.client;
    console.log('✅ API returned client data');
    
    // Test 2: Verify required fields
    console.log('\n📋 Test 2: Verifying required fields...');
    const checks = {
      'Business Name': client.displayName || client.name || client.whiteLabel?.businessName || client.whiteLabel?.name,
      'Phone': client.phone || client.numbers?.primary || client.whiteLabel?.phone,
      'Timezone': client.timezone || client.booking?.timezone,
      'Business Hours': client.businessHours || client.booking?.businessHours || client.whiteLabel?.businessHours,
      'Industry': client.industry || client.whiteLabel?.industry,
      'Description': client.description || client.whiteLabel?.description,
      'Tagline': client.tagline || client.whiteLabel?.tagline,
      'Primary Color': client.primaryColor || client.whiteLabel?.branding?.primaryColor,
      'Secondary Color': client.secondaryColor || client.whiteLabel?.branding?.secondaryColor,
    };
    
    const results = [];
    for (const [field, value] of Object.entries(checks)) {
      const hasValue = value !== undefined && value !== null && value !== '';
      results.push({ field, hasValue, value: value || 'MISSING' });
      console.log(`   ${hasValue ? '✅' : '❌'} ${field}: ${hasValue ? value : 'MISSING'}`);
    }
    
    const missingFields = results.filter(r => !r.hasValue);
    if (missingFields.length > 0) {
      console.log(`\n⚠️  Warning: ${missingFields.length} field(s) missing:`);
      missingFields.forEach(r => console.log(`   - ${r.field}`));
    } else {
      console.log('\n✅ All required fields present');
    }
    
    // Test 3: Check dashboard URL
    console.log('\n🌐 Test 3: Dashboard URL...');
    const dashboardUrl = `${BASE_URL}/client-dashboard.html?client=${clientKey}`;
    console.log(`   URL: ${dashboardUrl}`);
    
    // Test 4: Verify data structure
    console.log('\n🔍 Test 4: Data structure verification...');
    const structure = {
      'Has whiteLabel': !!client.whiteLabel,
      'Has branding': !!client.whiteLabel?.branding,
      'Has booking config': !!client.booking,
      'Has numbers': !!client.numbers,
      'Is enabled': client.isEnabled !== false,
    };
    
    for (const [check, passed] of Object.entries(structure)) {
      console.log(`   ${passed ? '✅' : '❌'} ${check}: ${passed}`);
    }
    
    // Summary
    console.log('\n' + '━'.repeat(60));
    console.log('\n📊 Test Summary:');
    console.log(`   Client Key: ${clientKey}`);
    console.log(`   Business Name: ${client.displayName || client.name || 'MISSING'}`);
    console.log(`   Dashboard URL: ${dashboardUrl}`);
    console.log(`   Missing Fields: ${missingFields.length}`);
    console.log(`   Status: ${missingFields.length === 0 ? '✅ PASS' : '⚠️  PARTIAL'}`);
    
    if (missingFields.length === 0) {
      console.log('\n✅ Dashboard should work correctly!');
      console.log(`\n   Open in browser: ${dashboardUrl}`);
    } else {
      console.log('\n⚠️  Dashboard may show "—" for missing fields.');
      console.log('   Consider updating the client data to include all fields.');
    }
    
    return { success: true, missingFields: missingFields.length };
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('   Stack:', error.stack);
    return { success: false, error: error.message };
  }
}

// Main
const clientKey = (process.argv[2] || '').trim() || process.env.AB_CLIENT_KEY;
if (!clientKey) {
  console.error('Usage: node scripts/test-dashboard.js <client_key> (or set AB_CLIENT_KEY)');
  process.exit(1);
}

testDashboard(clientKey)
  .then(result => {
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

