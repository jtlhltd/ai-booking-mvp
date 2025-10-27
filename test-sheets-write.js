// test-sheets-write.js
// Test Google Sheets writing directly

import { appendLogistics } from './sheets.js';

const testData = {
  businessName: 'Test Logistics Company Ltd',
  decisionMaker: 'John Smith',
  phone: '+447770090000',
  email: 'john.smith@example.com',
  international: 'Yes',
  mainCouriers: 'UPS, DHL, Royal Mail',
  frequency: 'About 10 parcels per week internationally',
  mainCountries: 'USA, China, Germany',
  exampleShipment: '5kg, dimensions were 60x60x60cm',
  exampleShipmentCost: '£42',
  domesticFrequency: 'Daily',
  ukCourier: 'UPS',
  standardRateUpToKg: '£2.50 up to 2kg standard rate',
  excludingFuelVat: 'Yes',
  singleVsMulti: 'Single',
  receptionistName: '',
  callbackNeeded: 'FALSE',
  callId: 'test-call-' + Date.now(),
  recordingUrl: 'https://example.com/recording.mp3',
  transcriptSnippet: 'Test snippet'
};

console.log('🧪 Testing Google Sheets append...\n');

const SHEET_ID = '1Tnll3FXtNEERYdGHTOh4VtAn90FyG6INUIU46ZbsP6g';

try {
  console.log('📝 Writing test data to sheet:', SHEET_ID);
  console.log('📊 Data:', JSON.stringify(testData, null, 2));
  console.log('');
  
  await appendLogistics(SHEET_ID, testData);
  
  console.log('✅ Successfully wrote to Google Sheet!');
  console.log('📋 Check your sheet for the new row.');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('Stack:', error.stack);
}
