import fetch from 'node-fetch';

async function testVAPICallWithSMS() {
  try {
    console.log('🚀 Testing VAPI call with SMS pipeline...');
    
    const vapiKey = '1aea8983-fc8b-44da-8880-8abde4ea2cfd'; // Your VAPI private key
    
    const callData = {
      phoneNumberId: "934ecfdb-fe7b-4d53-81c0-7908b97036b5",
      customer: {
        number: "+447491683261"
      },
      assistantId: "dd67a51c-7485-4b62-930a-4a84f328a1c9",
      metadata: {
        tenantKey: "test-tenant",
        businessName: "Test Business",
        decisionMaker: "John Smith",
        industry: "retail",
        location: "London",
        leadPhone: "+447491683261"
      },
      assistantOverrides: {
        firstMessage: "Hi John, this is Alice from AI Booking Solutions. I'm calling about your Test Business. I understand you might be interested in our AI-powered appointment booking service. Would you like to hear more about how this could help your business?",
        silenceTimeoutSeconds: 20,
        startSpeakingPlan: {
          waitSeconds: 3
        }
      }
    };
    
    console.log('📞 Making VAPI call...');
    
    const response = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(callData)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ VAPI call initiated successfully!');
      console.log('📞 Call ID:', result.id);
      console.log('📱 Calling:', result.customer?.number);
      
      console.log('\n🎯 What should happen:');
      console.log('1. 📞 You should receive a call on +447491683261');
      console.log('2. 🤖 Alice will pitch the AI booking service');
      console.log('3. 📱 If interested, you should get an SMS asking for your email');
      console.log('4. 📧 Reply with your email to get the booking link');
      
    } else {
      const error = await response.text();
      console.log('❌ VAPI call failed:', error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testVAPICallWithSMS();
