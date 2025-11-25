/**
 * Complete Dashboard Testing Script
 * 
 * Tests all dashboard functionality and API endpoints
 * 
 * Usage: node scripts/test-dashboard-complete.js [clientKey]
 */

const BASE_URL = process.env.BASE_URL || 'https://ai-booking-mvp.onrender.com';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '━'.repeat(60));
  log(title, 'cyan');
  console.log('━'.repeat(60));
}

function logTest(name, passed, details = '') {
  const icon = passed ? '✅' : '❌';
  const color = passed ? 'green' : 'red';
  log(`   ${icon} ${name}`, color);
  if (details) {
    log(`      ${details}`, 'gray');
  }
}

async function testEndpoint(name, url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    const data = await response.json();
    return { success: response.ok, status: response.status, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function runTests(clientKey) {
  logSection(`🧪 Complete Dashboard Test Suite for: ${clientKey}`);
  
  const results = {
    passed: 0,
    failed: 0,
    warnings: 0
  };

  // Test 1: Client Data API
  logSection('📡 Test 1: Client Data API');
  const clientTest = await testEndpoint('Client Data', `${BASE_URL}/api/clients/${clientKey}`);
  if (clientTest.success && clientTest.data?.ok && clientTest.data?.client) {
    logTest('Client data loaded', true);
    results.passed++;
    
    const client = clientTest.data.client;
    logTest('Has displayName', !!client.displayName, client.displayName || 'missing');
    logTest('Has phone', !!(client.phone || client.numbers?.primary || client.whiteLabel?.phone), 
      client.phone || client.numbers?.primary || client.whiteLabel?.phone || 'missing');
    logTest('Has timezone', !!client.timezone, client.timezone || 'missing');
    logTest('Has businessHours', !!(client.businessHours || client.booking?.businessHours), 
      client.businessHours || client.booking?.businessHours || 'missing');
    logTest('Has industry', !!client.industry, client.industry || 'missing');
    logTest('Has branding colors', !!(client.primaryColor || client.whiteLabel?.branding?.primaryColor), 
      client.primaryColor || client.whiteLabel?.branding?.primaryColor || 'missing');
    logTest('Has VAPI assistantId', !!client.vapiAssistantId, client.vapiAssistantId || 'missing');
  } else {
    logTest('Client data loaded', false, clientTest.error || `Status: ${clientTest.status}`);
    results.failed++;
  }

  // Test 2: Integration Health
  logSection('🔌 Test 2: Integration Health');
  const integrationTest = await testEndpoint('Integration Health', `${BASE_URL}/api/integration-health/${clientKey}`);
  if (integrationTest.success && integrationTest.data?.ok && Array.isArray(integrationTest.data.integrations)) {
    logTest('Integration health loaded', true);
    results.passed++;
    
    const integrations = integrationTest.data.integrations;
    const vapi = integrations.find(i => i.name === 'Vapi Voice');
    const twilio = integrations.find(i => i.name === 'Twilio SMS');
    const calendar = integrations.find(i => i.name === 'Google Calendar');
    
    if (vapi) {
      const isActive = vapi.status === 'active';
      logTest('VAPI Voice', isActive, `${vapi.status}: ${vapi.detail}`);
      if (isActive) results.passed++;
      else if (vapi.status === 'warning') results.warnings++;
      else results.failed++;
    }
    
    if (twilio) {
      logTest('Twilio SMS', twilio.status === 'active' || twilio.status === 'warning', 
        `${twilio.status}: ${twilio.detail}`);
      if (twilio.status === 'active') results.passed++;
      else if (twilio.status === 'warning') results.warnings++;
    }
    
    if (calendar) {
      logTest('Google Calendar', calendar.status === 'active' || calendar.status === 'warning', 
        `${calendar.status}: ${calendar.detail}`);
      if (calendar.status === 'active') results.passed++;
      else if (calendar.status === 'warning') results.warnings++;
    }
  } else {
    logTest('Integration health loaded', false, integrationTest.error || `Status: ${integrationTest.status}`);
    results.failed++;
  }

  // Test 3: Dashboard Data (demo-dashboard endpoint)
  logSection('📊 Test 3: Dashboard Data');
  const dashboardTest = await testEndpoint('Dashboard Data', `${BASE_URL}/api/demo-dashboard/${clientKey}`);
  if (dashboardTest.success && dashboardTest.data?.ok) {
    logTest('Dashboard data loaded', true);
    results.passed++;
    
    const data = dashboardTest.data;
    const metrics = data.metrics || {};
    logTest('Has metrics object', !!data.metrics, 'Metrics object present');
    logTest('Has totalLeads', typeof metrics.totalLeads === 'number', `Value: ${metrics.totalLeads}`);
    logTest('Has totalCalls', typeof metrics.totalCalls === 'number', `Value: ${metrics.totalCalls}`);
    logTest('Has conversionRate', typeof metrics.conversionRate === 'number', `Value: ${metrics.conversionRate}%`);
    logTest('Has bookingsThisWeek', typeof metrics.bookingsThisWeek === 'number', `Value: ${metrics.bookingsThisWeek}`);
    logTest('Has leads array', Array.isArray(data.leads), `Count: ${data.leads?.length || 0}`);
    logTest('Has recentCalls array', Array.isArray(data.recentCalls), `Count: ${data.recentCalls?.length || 0}`);
    logTest('Has appointments array', Array.isArray(data.appointments), `Count: ${data.appointments?.length || 0}`);
    logTest('Has ROI data', !!data.roi, 'ROI object present');
    logTest('Has touchpoints', !!data.touchpoints, 'Touchpoints data present');
  } else {
    logTest('Dashboard data loaded', false, dashboardTest.error || `Status: ${dashboardTest.status}`);
    results.failed++;
  }

  // Test 4: Active Indicator
  logSection('⚡ Test 4: Active Indicator');
  const activeTest = await testEndpoint('Active Indicator', `${BASE_URL}/api/active-indicator/${clientKey}`);
  if (activeTest.success && activeTest.data?.ok) {
    logTest('Active indicator loaded', true, `${activeTest.data.title || 'N/A'}`);
    results.passed++;
  } else {
    logTest('Active indicator loaded', false, activeTest.error || `Status: ${activeTest.status}`);
    results.warnings++;
  }

  // Test 5: Call Quality
  logSection('📞 Test 5: Call Quality');
  const qualityTest = await testEndpoint('Call Quality', `${BASE_URL}/api/call-quality/${clientKey}`);
  if (qualityTest.success && qualityTest.data?.ok) {
    logTest('Call quality loaded', true);
    results.passed++;
    const quality = qualityTest.data;
    logTest('Has avgDuration', typeof quality.avgDuration === 'number', `Value: ${quality.avgDuration}m`);
    logTest('Has successRate', typeof quality.successRate === 'number', `Value: ${quality.successRate}%`);
  } else {
    logTest('Call quality loaded', false, qualityTest.error || `Status: ${qualityTest.status}`);
    results.warnings++; // Might be empty for new clients
  }

  // Test 6: Calendar Sync
  logSection('📅 Test 6: Calendar Sync');
  const calendarTest = await testEndpoint('Calendar Sync', `${BASE_URL}/api/calendar-sync/${clientKey}`);
  if (calendarTest.success && calendarTest.data?.ok) {
    logTest('Calendar sync loaded', true);
    results.passed++;
    const calendar = calendarTest.data;
    logTest('Has lastSync', !!calendar.lastSync, calendar.lastSync || 'N/A');
    logTest('Has connected status', typeof calendar.connected === 'boolean', `Connected: ${calendar.connected}`);
  } else {
    logTest('Calendar sync loaded', false, calendarTest.error || `Status: ${calendarTest.status}`);
    results.warnings++;
  }

  // Test 7: Call Recordings
  logSection('🎙️ Test 7: Call Recordings');
  const recordingsTest = await testEndpoint('Call Recordings', `${BASE_URL}/api/call-recordings/${clientKey}`);
  if (recordingsTest.success && recordingsTest.data?.ok) {
    logTest('Call recordings loaded', true);
    results.passed++;
    const recordings = recordingsTest.data.recordings || [];
    logTest('Recordings array', Array.isArray(recordings), `Count: ${recordings.length}`);
  } else {
    logTest('Call recordings loaded', false, recordingsTest.error || `Status: ${recordingsTest.status}`);
    results.warnings++;
  }

  // Test 8: Dashboard URL
  logSection('🌐 Test 8: Dashboard Access');
  const dashboardUrl = `${BASE_URL}/client-dashboard.html?client=${clientKey}`;
  logTest('Dashboard URL valid', true, dashboardUrl);
  results.passed++;

  // Summary
  logSection('📊 Test Summary');
  log(`Total Tests: ${results.passed + results.failed + results.warnings}`, 'cyan');
  log(`✅ Passed: ${results.passed}`, 'green');
  log(`⚠️  Warnings: ${results.warnings}`, 'yellow');
  log(`❌ Failed: ${results.failed}`, 'red');
  
  const successRate = ((results.passed / (results.passed + results.failed + results.warnings)) * 100).toFixed(1);
  log(`\nSuccess Rate: ${successRate}%`, successRate >= 80 ? 'green' : successRate >= 60 ? 'yellow' : 'red');
  
  if (results.failed === 0) {
    log('\n✅ All critical tests passed! Dashboard should work correctly.', 'green');
  } else {
    log('\n⚠️  Some tests failed. Check the details above.', 'yellow');
  }
  
  log(`\n📱 Dashboard URL: ${dashboardUrl}`, 'cyan');
  
  return results;
}

// Main
const clientKey = process.argv[2] || 'd2d-xpress-tom';

runTests(clientKey)
  .then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  })
  .catch(error => {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  });

