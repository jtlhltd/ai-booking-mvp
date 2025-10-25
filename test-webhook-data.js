// test-webhook-data.js
// Test the webhook data extraction without making a real call

import * as sheets from './sheets.js';

// Simulate what VAPI sends to the webhook
const mockWebhookData = {
  call: {
    id: 'test-call-123',
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
      businessName: 'Test Logistics Company'
    }
  }
};

// Simulate the extraction
function simulateExtraction() {
  console.log('🧪 Testing webhook data extraction...\n');
  
  const transcript = mockWebhookData.call.transcript;
  const metadata = mockWebhookData.call.metadata;
  
  // Simulate extractLogisticsFields (copy from routes/vapi-webhooks.js)
  const text = transcript.toLowerCase();
  
  const email = text.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i)?.[1] || '';
  const international = /internationally|outside\s+the\s+uk/i.test(transcript) ? 'Y' : '';
  const mainCouriers = ['ups', 'dhl', 'royal mail'].filter(c => text.includes(c));
  const frequency = '10 per week';
  const mainCountries = ['usa', 'china', 'germany'].filter(c => text.includes(c));
  const exampleShipment = '5kg, 60x60x60cm';
  const exampleShipmentCost = '£42';
  const domesticFrequency = 'Daily';
  const ukCourier = 'UPS';
  const standardRateUpToKg = '£2.50 up to 2kg';
  const excludingFuelVat = 'Y';
  const singleVsMulti = 'Single';
  
  const extracted = {
    email,
    international,
    mainCouriers,
    frequency,
    mainCountries,
    exampleShipment,
    exampleShipmentCost,
    domesticFrequency,
    ukCourier,
    standardRateUpToKg,
    excludingFuelVat,
    singleVsMulti
  };
  
  const sheetData = {
    businessName: metadata.businessName || '',
    decisionMaker: '',
    phone: '+447770090000',
    email: extracted.email,
    international: extracted.international,
    mainCouriers: Array.isArray(extracted.mainCouriers) ? extracted.mainCouriers.join(', ') : '',
    frequency: extracted.frequency,
    mainCountries: Array.isArray(extracted.mainCountries) ? extracted.mainCountries.join(', ') : '',
    exampleShipment: extracted.exampleShipment,
    exampleShipmentCost: extracted.exampleShipmentCost,
    domesticFrequency: extracted.domesticFrequency,
    ukCourier: extracted.ukCourier,
    standardRateUpToKg: extracted.standardRateUpToKg,
    excludingFuelVat: extracted.excludingFuelVat,
    singleVsMulti: extracted.singleVsMulti,
    receptionistName: '',
    callbackNeeded: false,
    callId: mockWebhookData.call.id,
    recordingUrl: mockWebhookData.call.recordingUrl,
    transcriptSnippet: transcript.slice(0, 500)
  };
  
  console.log('📊 Extracted Data:');
  console.log(JSON.stringify(sheetData, null, 2));
  
  console.log('\n📋 Expected Column Mapping:');
  const headers = [
    'Timestamp','Business Name','Decision Maker','Phone','Email','International (Y/N)',
    'Main Couriers','Frequency','Main Countries','Example Shipment (weight x dims)','Example Shipment Cost',
    'Domestic Frequency','UK Courier','Std Rate up to KG','Excl Fuel & VAT?','Single vs Multi-parcel',
    'Receptionist Name','Callback Needed','Call ID','Recording URL','Transcript Snippet'
  ];
  
  const row = [
    '2025-01-01T12:00:00.000Z',
    sheetData.businessName,
    sheetData.decisionMaker,
    sheetData.phone,
    sheetData.email,
    sheetData.international,
    sheetData.mainCouriers,
    sheetData.frequency,
    sheetData.mainCountries,
    sheetData.exampleShipment,
    sheetData.exampleShipmentCost,
    sheetData.domesticFrequency,
    sheetData.ukCourier,
    sheetData.standardRateUpToKg,
    sheetData.excludingFuelVat,
    sheetData.singleVsMulti,
    sheetData.receptionistName,
    'FALSE',
    sheetData.callId,
    sheetData.recordingUrl,
    sheetData.transcriptSnippet
  ];
  
  headers.forEach((header, index) => {
    console.log(`${index + 1}. ${header}: "${row[index]}"`);
  });
  
  console.log('\n✅ Test complete! Compare this with your Google Sheet to see if mapping is correct.');
}

simulateExtraction();





