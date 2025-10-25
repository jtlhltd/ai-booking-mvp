// test-direct-webhook.js
// Simulate a completed VAPI call webhook directly to test sheet writing

import fetch from 'node-fetch';

const WEBHOOK_URL = 'https://ai-booking-mvp.onrender.com/webhooks/vapi';

const simulateCompletedCall = async () => {
  console.log('🧪 Simulating a completed VAPI call webhook...\n');
  
  const webhookPayload = {
    id: 'test-call-' + Date.now(),
    event: 'function-call-completed',
    createdAt: new Date().toISOString(),
    call: {
      id: 'test-call-' + Date.now(),
      phoneNumber: '+447770090000',
      status: 'completed',
      outcome: 'interested',
      cost: 0.15,
      duration: 120,
      recordingUrl: 'https://example.com/recording.mp3',
      voicemail: false,
      endedReason: 'assistant-ended-call',
      transcript: `AI: Hi, please can I speak with the person in charge of logistics and shipping?
Prospect: Yes, that's me.
AI: Great! I am a partner of UPS, FEDEX and DHL, we offer all these couriers on one online platform. I am just wondering if I can get an email across to you with some rates and services we can offer?
Prospect: Sure, that would be great.
AI: Which is the best email to send to?
Prospect: You can send it to john.smith@example.com
AI: So that I can tailor this email to you a little bit more, do you send outside the UK at all?
Prospect: Yes, we do send internationally.
AI: Who are your main couriers you use?
Prospect: We use UPS, DHL, and Royal Mail mostly.
AI: How often is this?
Prospect: About 10 parcels per week internationally.
AI: Do you have any main countries you send to?
Prospect: Yes, mainly USA, China, and Germany.
AI: You don't happen to have a last example of a shipment you sent to one of these countries?
Prospect: Yeah, last week we sent something that was 5kg, dimensions were 60x60x60cm, cost us £42.
AI: How often do you send around the UK?
Prospect: Daily, we send around the UK every day.
AI: Who is your main courier for your UK parcels?
Prospect: We use UPS for UK.
AI: Do you have a standard rate you pay up to a certain kg?
Prospect: We pay £2.50 up to 2kg standard rate.
AI: Is that excluding fuel and VAT?
Prospect: Yes, that's excluding fuel and VAT.
AI: Do you mainly send single parcels or multiple parcels to one address?
Prospect: We mainly send single parcels.
AI: Perfect, thank you so much for your time. I'll send that email over shortly.
Prospect: Great, thanks!
AI: Have a great day!`
    },
    metadata: {
      tenantKey: 'logistics_client',
      leadPhone: '+447770090000',
      businessName: 'Test Logistics Company Ltd'
    }
  };
  
  console.log('📋 Sending webhook payload...');
  console.log('   - Call ID:', webhookPayload.call.id);
  console.log('   - Status:', webhookPayload.call.status);
  console.log('   - Transcript length:', webhookPayload.call.transcript.length);
  console.log('   - Tenant:', webhookPayload.metadata.tenantKey);
  console.log('');
  
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookPayload)
    });
    
    const responseText = await response.text();
    
    console.log('📥 Response Status:', response.status);
    console.log('📄 Response:', responseText);
    
    if (response.ok) {
      console.log('\n✅ Webhook processed successfully!');
      console.log('📊 Check your Google Sheet to see if data was written.');
    } else {
      console.log('\n❌ Webhook returned an error. Check the response above.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

simulateCompletedCall();





