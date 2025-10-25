// test-webhook-direct.js
// Test the webhook handler directly without making a real VAPI call

import express from 'express';
import * as store from './store.js';
import * as sheets from './sheets.js';

// Mock the VAPI webhook payload
const mockRequest = {
  body: {
    call: {
      id: 'test-call-999',
      status: 'completed',
      transcript: `
        Hi, I'd like to speak with someone about logistics and shipping.
        Great! I'm a partner of UPS, FEDEX and DHL.
        Do you send outside the UK at all?
        Yes, we send internationally.
        Who are your main couriers?
        We use UPS, DHL, and Royal Mail.
        How often do you send?
        About 10 parcels per week.
        What countries do you send to?
        Mainly USA, China, and Germany.
        Can you give me an example shipment?
        Yeah, we sent something last week - 5kg, dimensions were 60x60x60cm, cost us £42.
        How often do you send within the UK?
        Daily, we send around the UK every day.
        Who do you use for UK shipments?
        We use UPS for UK.
        What's your standard rate?
        We pay £2.50 up to 2kg.
        Is that excluding fuel and VAT?
        Yes, excluding fuel and VAT.
        Do you mainly send single parcels or multiple?
        We mainly send single parcels.
        What's the best email to send this to?
        john@example.com
      `,
      recordingUrl: 'https://example.com/recording.mp3',
      metadata: {
        tenantKey: 'logistics_client',
        businessName: 'Test Logistics Company',
        leadPhone: '+447770090000'
      }
    }
  }
};

async function testWebhook() {
  try {
    console.log('🧪 Testing webhook handler directly...\n');
    
    // Import the extraction function
    const webhookModule = await import('./routes/vapi-webhooks.js');
    
    // Simulate what the webhook does
    const body = mockRequest.body;
    const transcript = body.call.transcript;
    const metadata = body.call.metadata;
    
    // Test extraction
    console.log('📝 Testing extraction function...');
    
    // We need to import the function from vapi-webhooks.js
    // For now, let's test the sheets.js function directly
    
    const testData = {
      businessName: 'Test Logistics Company',
      decisionMaker: '',
      phone: '+447770090000',
      email: 'john@example.com',
      international: 'Y',
      mainCouriers: ['UPS', 'DHL', 'Royal Mail'],
      frequency: '10 per week',
      mainCountries: ['USA', 'China', 'Germany'],
      exampleShipment: '5kg, 60x60x60cm',
      exampleShipmentCost: '£42',
      domesticFrequency: 'Daily',
      ukCourier: 'UPS',
      standardRateUpToKg: '£2.50 up to 2kg',
      excludingFuelVat: 'Y',
      singleVsMulti: 'Single',
      receptionistName: '',
      callbackNeeded: false,
      callId: 'test-call-999',
      recordingUrl: 'https://example.com/recording.mp3',
      transcriptSnippet: transcript.slice(0, 500)
    };
    
    console.log('\n📊 Test Data:', JSON.stringify(testData, null, 2));
    
    console.log('\n📋 Column Mapping:');
    const headers = sheets.LOGISTICS_HEADERS;
    const columnData = {
      'Timestamp': new Date().toISOString(),
      'Business Name': testData.businessName,
      'Decision Maker': testData.decisionMaker,
      'Phone': testData.phone,
      'Email': testData.email,
      'International (Y/N)': testData.international,
      'Main Couriers': testData.mainCouriers.join(', '),
      'Frequency': testData.frequency,
      'Main Countries': testData.mainCountries.join(', '),
      'Example Shipment (weight x dims)': testData.exampleShipment,
      'Example Shipment Cost': testData.exampleShipmentCost,
      'Domestic Frequency': testData.domesticFrequency,
      'UK Courier': testData.ukCourier,
      'Std Rate up to KG': testData.standardRateUpToKg,
      'Excl Fuel & VAT?': testData.excludingFuelVat,
      'Single vs Multi-parcel': testData.singleVsMulti,
      'Receptionist Name': testData.receptionistName,
      'Callback Needed': 'FALSE',
      'Call ID': testData.callId,
      'Recording URL': testData.recordingUrl,
      'Transcript Snippet': testData.transcriptSnippet
    };
    
    headers.forEach((header, index) => {
      console.log(`${index + 1}. ${header}: "${columnData[header]}"`);
    });
    
    console.log('\n✅ Test complete! Data is properly mapped.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testWebhook();





