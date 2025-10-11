import fetch from 'node-fetch';

// Test SMS reply webhook to see what happens
async function testSMSReplyWebhook() {
  try {
    console.log('🧪 Testing SMS reply webhook...');
    
    // Simulate the SMS reply webhook that Twilio should send
    const webhookPayload = {
      MessageSid: 'SM' + Date.now(),
      From: '+447491683261',
      To: '+447403934440',
      Body: 'jonahthomaslloydhughes@gmail.com',
      AccountSid: 'AC70407e0f0d15f286b3a9977c5312e1e5'
    };
    
    console.log('📱 Simulating SMS reply webhook...');
    console.log('📊 Payload:', webhookPayload);
    
    // Test the webhook endpoint
    const response = await fetch('https://ai-booking-mvp.onrender.com/webhooks/sms-reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(webhookPayload)
    });
    
    if (response.ok) {
      const result = await response.text();
      console.log('✅ SMS reply webhook processed!');
      console.log('📊 Response:', result);
      
      console.log('\n🎯 This should have triggered:');
      console.log('1. 📧 Email extraction from SMS body');
      console.log('2. 📧 Confirmation email to jonahthomaslloydhughes@gmail.com');
      console.log('3. 📧 Email with booking link');
      
    } else {
      const error = await response.text();
      console.log('❌ SMS reply webhook failed:', error);
      
      console.log('\n🔧 Let me check what endpoints are available...');
      
      // Check if the webhook endpoint exists
      const testResponse = await fetch('https://ai-booking-mvp.onrender.com/webhooks/sms-reply', {
        method: 'GET'
      });
      
      console.log('📊 GET response status:', testResponse.status);
      const testResult = await testResponse.text();
      console.log('📊 GET response:', testResult);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSMSReplyWebhook();
