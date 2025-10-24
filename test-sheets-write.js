// test-sheets-write.js
// Actually write test data to Google Sheets

import * as sheets from './sheets.js';

const SHEET_ID = '1Tnll3FXtNEERYdGHTOh4VtAn90FyG6INUIU46ZbsP6g';

async function testWriteToSheet() {
  try {
    console.log('🧪 Testing actual write to Google Sheets...\n');
    
    const testData = {
      businessName: 'TEST Business Name',
      decisionMaker: 'TEST Decision Maker',
      phone: '+447770090000',
      email: 'test@example.com',
      international: 'Y',
      mainCouriers: ['UPS', 'DHL'],
      frequency: '10 per week',
      mainCountries: ['USA', 'China'],
      exampleShipment: '5kg test',
      exampleShipmentCost: '£42',
      domesticFrequency: 'Daily',
      ukCourier: 'UPS',
      standardRateUpToKg: '£2.50',
      excludingFuelVat: 'Y',
      singleVsMulti: 'Single',
      receptionistName: 'TEST Receptionist',
      callbackNeeded: false,
      callId: 'test-call-write-123',
      recordingUrl: 'https://test.com/recording.mp3',
      transcriptSnippet: 'TEST transcript snippet'
    };
    
    console.log('📊 Writing test data:', JSON.stringify(testData, null, 2));
    
    await sheets.appendLogistics(SHEET_ID, testData);
    
    console.log('\n✅ Test data written to Google Sheets!');
    console.log('📋 Check your sheet to see if data is in the correct columns.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

testWriteToSheet();


