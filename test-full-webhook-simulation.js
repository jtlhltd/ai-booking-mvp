// test-full-webhook-simulation.js
// Simulate a complete VAPI webhook POST request

import https from 'https';
import http from 'http';

const DEPLOYED_URL = 'https://ai-booking-mvp.onrender.com';
const LOCAL_URL = 'http://localhost:3000';

const USE_LOCAL = false;
const TARGET_URL = USE_LOCAL ? LOCAL_URL : DEPLOYED_URL;

const simulateWebhook = () => {
  const payload = {
    id: 'test-call-id-' + Date.now(),
    event: 'function-call',
    createdAt: new Date().toISOString(),
    call: {
      id: 'test-call-id-' + Date.now(),
      phoneNumber: '+447770090000',
      cost: 0.01,
      duration: 120,
      recordingUrl: 'https://example.com/recording.mp3',
      voicemail: false,
      endedReason: 'assistant-ended-call',
      transcript: "AI: Hi, please can I speak with the person in charge of logistics and shipping? Prospect: Yes, that's me. AI: Great! I am a partner of UPS, FEDEX and DHL, we offer all these couriers on one online platform. I am just wondering if I can get an email across to you with some rates and services we can offer? Prospect: Sure, that would be great. AI: Which is the best email to send to? Prospect: You can send it to john.smith@example.com AI: So that I can tailor this email to you a little bit more, do you send outside the UK at all? Prospect: Yes, we do send internationally. AI: Who are your main couriers you use? Prospect: We use UPS, DHL, and Royal Mail mostly. AI: How often is this? Prospect: About 10 parcels per week internationally. AI: Do you have any main countries you send to? Prospect: Yes, mainly USA, China, and Germany. AI: You don't happen to have a last example of a shipment you sent to one of these countries? Prospect: Yeah, last week we sent something that was 5kg, dimensions were 60x60x60cm, cost us £42. AI: How often do you send around the UK? Prospect: Daily, we send around the UK every day. AI: Who is your main courier for your UK parcels? Prospect: We use UPS for UK. AI: Do you have a standard rate you pay up to a certain kg? Prospect: We pay £2.50 up to 2kg standard rate. AI: Is that excluding fuel and VAT? Prospect: Yes, that's excluding fuel and VAT. AI: Do you mainly send single parcels or multiple parcels to one address? Prospect: We mainly send single parcels. AI: Perfect, thank you so much for your time. I'll send that email over shortly. Prospect: Great, thanks! AI: Have a great day!"
    },
    functionCall: {
      name: 'add_to_sheet',
      arguments: JSON.stringify({
        businessName: 'Test Business Ltd',
        decisionMaker: 'John Smith',
        phone: '+447770090000',
        email: 'john.smith@example.com',
        international: 'Y',
        mainCouriers: 'UPS, DHL, Royal Mail',
        frequency: '10 per week',
        mainCountries: 'USA, China, Germany',
        exampleShipment: '5kg',
        exampleShipmentCost: '£42',
        domesticFrequency: 'Daily',
        ukCourier: 'UPS',
        standardRateUpToKg: '£2.50 up to 2kg',
        excludingFuelVat: 'Y',
        singleVsMulti: 'Single',
        receptionistName: '',
        callbackNeeded: false
      })
    },
    transcript: {
      id: 'transcript-id',
      endedReason: 'assistant-ended-call',
      messages: []
    },
    model: {
      provider: 'openai',
      model: 'gpt-4o'
    },
    messages: [],
    metadata: {
      tenantKey: 'logistics_client',
      businessName: 'Test Business Ltd',
      phone: '+447770090000'
    }
  };

  const data = JSON.stringify(payload);
  
  console.log('🧪 Simulating VAPI webhook to:', TARGET_URL);
  console.log('📋 Payload:', JSON.stringify(payload, null, 2).substring(0, 500) + '...\n');

  const url = new URL(TARGET_URL + '/webhooks/vapi');
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const protocol = url.protocol === 'https:' ? https : http;

  const req = protocol.request(options, (res) => {
    console.log('📥 Response Status:', res.statusCode);
    console.log('📋 Response Headers:', res.headers);

    let responseData = '';
    res.on('data', (chunk) => {
      responseData += chunk;
    });

    res.on('end', () => {
      console.log('📄 Response Body:', responseData);
      console.log('\n✅ Webhook simulation complete!');
      console.log('📊 Check your Google Sheet to see if data was written.');
    });
  });

  req.on('error', (error) => {
    console.error('❌ Error:', error.message);
  });

  req.write(data);
  req.end();
};

simulateWebhook();

