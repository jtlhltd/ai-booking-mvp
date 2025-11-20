// tests/fixtures/test-data.js
// Test data generators

export function generateTestLead(overrides = {}) {
  return {
    name: `Test Lead ${Date.now()}`,
    phone: '+447700900001',
    email: `lead${Date.now()}@example.com`,
    service: 'logistics',
    source: 'test',
    ...overrides
  };
}

export function generateTestClient(overrides = {}) {
  return {
    clientKey: `test_client_${Date.now()}`,
    displayName: `Test Business ${Date.now()}`,
    businessName: `Test Business ${Date.now()}`,
    phone: '+447700900000',
    email: `client${Date.now()}@example.com`,
    timezone: 'Europe/London',
    locale: 'en-GB',
    isEnabled: true,
    ...overrides
  };
}

export function generateTestCall(overrides = {}) {
  return {
    callId: `test_call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    clientKey: 'test_client',
    leadPhone: '+447491683261',
    status: 'completed',
    outcome: 'completed',
    duration: 180,
    cost: 0.15,
    transcript: 'Test call transcript',
    recordingUrl: 'https://api.vapi.ai/recordings/test.mp3',
    sentiment: 'positive',
    qualityScore: 8,
    ...overrides
  };
}

export function generateTestAppointment(overrides = {}) {
  const start = new Date();
  start.setHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setHours(10, 30, 0, 0);
  
  return {
    clientKey: 'test_client',
    leadPhone: '+447491683261',
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    service: 'consultation',
    status: 'booked',
    ...overrides
  };
}

export function generateTestTenant(overrides = {}) {
  return {
    client_key: `test_tenant_${Date.now()}`,
    display_name: `Test Tenant ${Date.now()}`,
    timezone: 'Europe/London',
    locale: 'en-GB',
    is_enabled: true,
    gsheet_id: 'test_sheet_id',
    ...overrides
  };
}

