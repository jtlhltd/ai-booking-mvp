// test-vapi-manual-call.js
// Quick script to make a manual test call with correct metadata

const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY || 'ad34b1de00c5b7380d6a447abcd78874';
const ASSISTANT_ID = 'b1ba0ad3-c519-4ab7-aa6f-9fba6516a0ee';

async function makeTestCall() {
  try {
    console.log('📞 Making test call with correct metadata...\n');
    
    const callData = {
      assistantId: ASSISTANT_ID,
      customer: {
        number: '+447770090000', // Change this to your test number
        name: 'Test Business Owner'
      },
      metadata: {
        tenantKey: 'logistics_client',
        leadPhone: '+447770090000', // Change this to your test number
        businessName: 'Test Logistics Company',
        decisionMaker: { name: 'Test Business Owner' },
        businessAddress: '123 Test Street, London',
        callTime: new Date().toISOString(),
        priority: 1
      }
    };
    
    console.log('📋 Call metadata:', JSON.stringify(callData.metadata, null, 2));
    console.log('\n💡 NOTE: Structured Outputs are not needed!');
    console.log('   The webhook will extract data from the transcript automatically.\n');
    
    const response = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(callData)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Call initiated successfully!');
      console.log('📞 Call ID:', result.id);
      console.log('🔗 Webhook URL:', result.webhook || 'Using dashboard webhook');
      console.log('\n💡 The webhook will automatically extract data from the transcript!');
    } else {
      const error = await response.json();
      console.error('❌ Call failed:', error);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
makeTestCall();

