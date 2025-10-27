// test-extraction-realistic.js
// Test data extraction with realistic call transcripts

import { extractLogisticsFields } from './routes/vapi-webhooks.js';

// Realistic transcript examples based on actual logistics calls
const testTranscripts = [
  {
    name: "Example 1: Receptionist with basic info",
    transcript: `
Hello, this is Sarah speaking from ABC Logistics. How can I help you today?

Hi, I'm calling about your shipping services. Do you send packages internationally?
Yes, we do send outside the UK.

What couriers do you use?
We mainly use DHL and DPD.

How many packages do you send per month?
About 500 packages a month.

Where do you send packages to?
Mostly to Germany, France, and the USA.

What size packages do you typically send?
Usually around 2 kilograms, sometimes up to 20cm x 30cm x 15cm.

Great, what's the best email to contact you?
You can reach me at sarah.jones@abclogistics.co.uk.

How much do you typically spend per package?
Around £8 to £12 per package.

For UK shipments, how often?
We send about 100 UK packages per week, using Royal Mail.

What's the biggest challenge?
Definitely the cost and fuel surcharges.

Do you send single parcels or bulk shipments?
We do both, but mostly single parcels.
`
  },
  {
    name: "Example 2: Decision maker with detailed info",
    transcript: `
This is John Smith, I'm the operations manager here.

Do you ship internationally?
Yes, we export to about 15 countries every month.

Which couriers?
We use UPS for the USA and Canada, FedEx for Europe, and DPD for UK.

Volume?
We ship approximately 200 packages weekly.

Main destinations?
USA, Germany, Italy, Spain, and France.

Typical shipment?
Usually 5kg packages, dimensions around 40cm x 30cm x 25cm.

Email?
john.smith@globalexports.com.

Cost?
Average cost is £15 per package, but that's excluding fuel and VAT.

UK domestic frequency?
About 50 UK packages per week via DPD.

Single or multi-parcel?
We do bulk shipments for our regular customers.
`
  },
  {
    name: "Example 3: Limited information call",
    transcript: `
This is the reception. We're not really interested right now.

Can you tell me if you ship internationally?
No, UK only.

What courier do you use?
Just Royal Mail.

How many packages?
Maybe 20 a month.

Can I get an email?
Sorry, I'm not the decision maker. You'll need to call back later.
`
  }
];

console.log('=== Testing Data Extraction ===\n');

testTranscripts.forEach((test, idx) => {
  console.log(`\n${idx + 1}. ${test.name}`);
  console.log('='.repeat(60));
  
  const extracted = extractLogisticsFields(test.transcript);
  
  console.log('📧 Email:', extracted.email);
  console.log('🌍 International:', extracted.international);
  console.log('🚚 Main Couriers:', extracted.mainCouriers);
  console.log('📊 Frequency:', extracted.frequency);
  console.log('🗺️  Countries:', extracted.mainCountries);
  console.log('📦 Example Shipment:', extracted.exampleShipment);
  console.log('💰 Cost:', extracted.exampleShipmentCost);
  console.log('🇬🇧 Domestic Frequency:', extracted.domesticFrequency);
  console.log('🚚 UK Courier:', extracted.ukCourier);
  console.log('📏 Standard Rate:', extracted.standardRateUpToKg);
  console.log('⛽ Excl Fuel & VAT:', extracted.excludingFuelVat);
  console.log('📦 Single vs Multi:', extracted.singleVsMulti);
  
  console.log('\n✅ Results:', 
    Object.values(extracted).filter(v => v && v.length > 0).length, 
    'out of 12 fields captured'
  );
});

