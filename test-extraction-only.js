// test-extraction-only.js
// Test just the extraction logic without writing to sheets

// Copy the extraction function from routes/vapi-webhooks.js
function extractLogisticsFields(transcript) {
  const text = (transcript || '').toLowerCase();
  const transcriptOriginal = transcript || '';
  
  const pick = (re) => {
    const m = text.match(re);
    return m ? (m[1] || m[0]).trim() : '';
  };
  const pickAll = (re) => {
    const matches = [...text.matchAll(re)].map(m => (m[1] || m[0]).trim());
    return Array.from(new Set(matches));
  };

  // Email - Enhanced extraction with multiple patterns
  const email = pick(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i) || 
                 pick(/(?:email|address|contact)\s*[:\-]?\s*([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i) ||
                 pick(/([a-z0-9]+(?:\.[a-z0-9]+)*@(?:gmail|yahoo|hotmail|outlook|company|business)\.[a-z]{2,})/i);

  // International yes/no - Enhanced with more patterns
  let international = '';
  if (/outside\s+the\s+uk.*\byes\b|\binternational\b.*\byes\b|export.*yes|send.*abroad.*yes|do\s+send\s+internationally|send\s+internationally/i.test(transcript)) international = 'Y';
  else if (/outside\s+the\s+uk.*\bno\b|\binternational\b.*\bno\b|only\s+uk|uk\s+only|domestic\s+only/i.test(transcript)) international = 'N';

  // Main couriers - Enhanced extraction
  const knownCouriers = ['ups','fedex','dhl','dpd','hermes','evri','royal mail','parcel force','parcelforce','yodel','dpd','apc','citylink','dx','interlink','amazon logistics'];
  const mainCouriers = knownCouriers.filter(c => text.includes(c)).map(c => c.charAt(0).toUpperCase() + c.slice(1));

  // Frequency - Enhanced patterns
  const frequencyMatch = text.match(/(\d+)\s*(?:per|times)\s*(day|week|month)|(daily|weekly|monthly)|\b(\d+)\s*(packages?|parcels?|items?)/i);
  const frequency = frequencyMatch ? (frequencyMatch[1] ? `${frequencyMatch[1]} per ${frequencyMatch[2]}` : frequencyMatch[3] || frequencyMatch[4]) : pick(/(\b\d+\s*(?:per\s*)?(?:day|week|weekly|daily|month)\b|\b(daily|weekly|monthly)\b)/i) || pick(/(about\s+)?(\d+)\s*(?:parcels?|packages?)/i)?.[2];

  // Main countries - Enhanced with more countries
  const countryWords = ['usa','united states','canada','germany','france','spain','italy','netherlands','ireland','australia','china','hong kong','japan','uae','dubai','saudi','india','poland','sweden','norway','denmark','belgium','portugal','greece','south africa','mexico','brazil','singapore','malaysia','thailand','south korea','taiwan','new zealand'];
  const mainCountries = countryWords.filter(c => text.includes(c)).map(c => c.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));

  // Example shipment: weight/dimensions - Enhanced with multiple patterns
  const weightDims = pick(/(\b\d+(?:\.\d+)?\s*(?:kg|kilograms?|lbs?|pounds?)\b[^\n]{0,60}?(?:\b\d+\s*x\s*\d+\s*x\s*\d+\s*(?:cm|mm|in|inches?)?\b)?)/i) || 
                      text.match(/(\d+)\s*(?:x\s*)?(\d+)\s*(?:x\s*)?(\d+)\s*(?:cm|mm|inches?)/i)?.join(' x ') ||
                      pick(/(\d+)\s*(?:kg|kilograms?|lbs?|pounds?)/i) ||
                      pick(/(?:weight|size)[^\n]{0,40}?(\d+[^\n]{0,30})/i);

  // Cost - Enhanced extraction
  const cost = pick(/(£\s?\d+(?:[\.,]\d{2})?|\$\s?\d+(?:[\.,]\d{2})?|€\s?\d+(?:[\.,]\d{2})?)/) || pick(/(\d+)\s*(?:pounds?|dollars?|euros?)/i);

  // Domestic frequency - Enhanced
  const domesticFrequency = pick(/(\b\d+\s*(?:per\s*)?(?:day|week)\b.*\buk\b|\b(daily|weekly)\b.*\buk\b|\d+\s*uk.*per\s*(day|week))/i);

  // UK courier - Enhanced
  const ukCourier = pick(/uk[^\n]{0,50}\b(ups|fedex|dhl|dpd|hermes|evri|royal\s*mail|parcelforce|yodel|apc|citylink|dx|interlink)\b/i) || pick(/\buk\s+courier[^\n]{0,50}\b(ups|fedex|dhl|dpd|hermes|evri|royal\s*mail|parcelforce|yodel|apc|citylink|dx|interlink)\b/i);

  // Standard rate up to kg - Enhanced
  const standardRateUpToKg = pick(/standard\s+rate[^\n]{0,50}\b(\d+\s*kg?)/i) || pick(/rate.*up\s+to[^\n]{0,50}\b(\d+\s*kg?)/i) || pick(/pay\s+£?(\d+(?:\.\d+)?)\s*up\s+to\s*(\d+\s*kg?)/i)?.[0];

  // Excluding fuel and VAT? - Enhanced
  const excludingFuelVat = /excluding\s+fuel|excl\.?\s+fuel|excluding\s+vat|plus\s+fuel|plus\s+vat|additional\s+fuel|additional\s+vat/i.test(transcript) ? 'Y' : (/including\s+fuel|including\s+vat|all\s+inclusive/i.test(transcript) ? 'N' : '');

  // Single vs multi-parcel - Enhanced
  const singleVsMulti = /single\s+parcels?|one\s+parcel|individual\s+packages?/i.test(transcript) ? 'Single' : (/multiple\s+parcels?|multi-?parcel|bulk\s+shipments?|many\s+parcels?/i.test(transcript) ? 'Multiple' : '');

  return {
    email,
    international,
    mainCouriers,
    frequency,
    mainCountries,
    exampleShipment: weightDims,
    exampleShipmentCost: cost,
    domesticFrequency,
    ukCourier,
    standardRateUpToKg,
    excludingFuelVat,
    singleVsMulti
  };
}

// Test with realistic transcript
const testTranscript = `
Hi, I'm calling about logistics and shipping for our business.
Great! So do you send outside the UK at all?
Yes, we do send internationally, mainly to USA, China, and Germany.
Who are your main couriers?
We use UPS, DHL, and Royal Mail mostly.
How often do you send shipments?
About 10 parcels per week internationally.
And what about UK shipments?
Daily, we send around the UK every day using UPS.
Can you give me an example of a recent shipment?
Yeah, last week we sent something that was 5kg, dimensions were 60x60x60cm, cost us £42 including shipping.
What's your standard rate?
We pay £2.50 up to 2kg standard rate.
Is that excluding fuel and VAT?
Yes, that's excluding fuel and VAT, it's additional.
Do you mainly send single parcels or multiple?
We mainly send single parcels, not many bulk shipments.
What's the best email to send rates to?
You can send it to john.smith@example.com
`;

console.log('🧪 Testing extraction logic...\n');
console.log('📝 Transcript:', testTranscript);

const extracted = extractLogisticsFields(testTranscript);

console.log('\n📊 Extracted Data:');
console.log(JSON.stringify(extracted, null, 2));

console.log('\n📋 Column Mapping Check:');
const headers = [
  'Timestamp','Business Name','Decision Maker','Phone','Email','International (Y/N)',
  'Main Couriers','Frequency','Main Countries','Example Shipment (weight x dims)','Example Shipment Cost',
  'Domestic Frequency','UK Courier','Std Rate up to KG','Excl Fuel & VAT?','Single vs Multi-parcel',
  'Receptionist Name','Callback Needed','Call ID','Recording URL','Transcript Snippet'
];

const columnData = {
  'Timestamp': new Date().toISOString(),
  'Business Name': 'Test Business',
  'Decision Maker': '',
  'Phone': '+447770090000',
  'Email': extracted.email,
  'International (Y/N)': extracted.international,
  'Main Couriers': Array.isArray(extracted.mainCouriers) ? extracted.mainCouriers.join(', ') : '',
  'Frequency': extracted.frequency,
  'Main Countries': Array.isArray(extracted.mainCountries) ? extracted.mainCountries.join(', ') : '',
  'Example Shipment (weight x dims)': extracted.exampleShipment,
  'Example Shipment Cost': extracted.exampleShipmentCost,
  'Domestic Frequency': extracted.domesticFrequency,
  'UK Courier': extracted.ukCourier,
  'Std Rate up to KG': extracted.standardRateUpToKg,
  'Excl Fuel & VAT?': extracted.excludingFuelVat,
  'Single vs Multi-parcel': extracted.singleVsMulti,
  'Receptionist Name': '',
  'Callback Needed': 'FALSE',
  'Call ID': 'test-123',
  'Recording URL': '',
  'Transcript Snippet': testTranscript.slice(0, 300)
};

headers.forEach((header, index) => {
  console.log(`${index + 1}. ${header}: "${columnData[header]}"`);
});

console.log('\n✅ Extraction test complete!');

