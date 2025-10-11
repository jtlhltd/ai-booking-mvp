import fetch from 'node-fetch';

// Test SMS reply webhook with correct endpoint
async function testSMSReplyWebhookCorrect() {
  try {
    console.log('🧪 Testing SMS reply webhook with correct endpoint...');
    
    // Simulate the SMS reply webhook that Twilio should send
    const webhookPayload = {
      MessageSid: 'SM' + Date.now(),
      From: '+447491683261',
      To: '+447403934440',
      Body: 'jonahthomaslloydhughes@gmail.com',
      AccountSid: 'AC70407e0f0d15f286b3a9977c5312e1e5'
    };
    
    console.log('📱 Testing /webhook/sms-reply (singular)...');
    console.log('📊 Payload:', webhookPayload);
    
    // Test the correct webhook endpoint
    const response = await fetch('https://ai-booking-mvp.onrender.com/webhook/sms-reply', {
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
      
      console.log('\n📧 Check your Gmail now for the confirmation email!');
      
    } else {
      const error = await response.text();
      console.log('❌ SMS reply webhook failed:', error);
      
      console.log('\n🔧 Let me check server status...');
      
      // Check server status
      const statusResponse = await fetch('https://ai-booking-mvp.onrender.com/api/test');
      if (statusResponse.ok) {
        const statusResult = await statusResponse.text();
        console.log('📊 Server status:', statusResult);
      } else {
        console.log('❌ Server not responding');
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSMSReplyWebhookCorrect();
