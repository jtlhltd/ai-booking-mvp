// fix-tenants.js - Script to fix tenant SMS configuration
import { init, upsertFullClient } from './db.js';

async function fixTenantConfigurations() {
  console.log('🔧 Fixing tenant SMS configurations...');
  
  // Initialize database
  await init();
  
  // Fix victory_dental configuration
  console.log('📞 Updating victory_dental...');
  await upsertFullClient({
    clientKey: 'victory_dental',
    displayName: 'Victory Dental',
    timezone: 'Europe/London',
    locale: 'en-GB',
    numbers: {
      clinic: '+447491683261',
      inbound: '+447403934440'
    },
    sms: {
      fromNumber: '+447403934440',
      messagingServiceSid: 'MG_victory_dental'
    },
    vapi: {},
    calendarId: null,
    booking: {
      defaultDurationMin: 30,
      timezone: 'Europe/London'
    },
    smsTemplates: {}
  });
  
  // Fix northside_vet configuration
  console.log('🐕 Updating northside_vet...');
  await upsertFullClient({
    clientKey: 'northside_vet',
    displayName: 'Northside Vet',
    timezone: 'Europe/London',
    locale: 'en-GB',
    numbers: {
      clinic: '+447491683261',
      inbound: '+447491683261'
    },
    sms: {
      fromNumber: '+447491683261',
      messagingServiceSid: 'MG_northside_vet'
    },
    vapi: {},
    calendarId: null,
    booking: {
      defaultDurationMin: 30,
      timezone: 'Europe/London'
    },
    smsTemplates: {}
  });
  
  console.log('✅ Tenant configurations updated successfully!');
  console.log('');
  console.log('📋 Summary:');
  console.log('  victory_dental: fromNumber=+447403934440, messagingServiceSid=MG_victory_dental');
  console.log('  northside_vet:  fromNumber=+447491683261, messagingServiceSid=MG_northside_vet');
  console.log('');
  console.log('🧪 You can now test the tenant resolution with:');
  console.log('  - SMS to +447403934440 should resolve to victory_dental');
  console.log('  - SMS to +447491683261 should resolve to northside_vet');
}

// Run the fix
fixTenantConfigurations().catch(console.error);
