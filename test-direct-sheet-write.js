// test-direct-sheet-write.js
// Test writing directly to Google Sheets to verify credentials

import * as sheets from './sheets.js';

const SHEET_ID = '1Tnll3FXtNEERYdGHTOh4VtAn90FyG6INUIU46ZbsP6g';

async function testDirectWrite() {
  try {
    console.log('🧪 Testing direct write to Google Sheets...\n');
    
    const testData = {
      businessName: 'DIRECT TEST Business',
      decisionMaker: 'Test Decision Maker',
      phone: '+447770090000',
      email: 'test@example.com',
      international: 'Y',
      mainCouriers: ['UPS', 'DHL'],
      frequency: '10 per week',
      mainCountries: ['USA', 'China'],
      exampleShipment: '5kg',
      exampleShipmentCost: '£42',
      domesticFrequency: 'Daily',
      ukCourier: 'UPS',
      standardRateUpToKg: '£2.50 up to 2kg',
      excludingFuelVat: 'Y',
      singleVsMulti: 'Single',
      receptionistName: 'Test Receptionist',
      callbackNeeded: false,
      callId: 'test-direct-' + Date.now(),
      recordingUrl: 'https://test.com/recording.mp3',
      transcriptSnippet: 'Test transcript'
    };
    
    console.log('📊 Writing test data:', JSON.stringify(testData, null, 2));
    
    await sheets.appendLogistics(SHEET_ID, testData);
    
    console.log('\n✅ Test data written to Google Sheets!');
    console.log('📋 Check your sheet to see if data is in the correct columns.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testDirectWrite();







