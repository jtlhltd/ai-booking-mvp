import fetch from 'node-fetch';

// Test the SMS-Email Pipeline directly without VAPI calls
async function testSMSPipelineDirect() {
  try {
    console.log('🧪 Testing SMS-Email Pipeline directly...');
    
    // Test data
    const testLead = {
      businessName: "Test Business",
      decisionMaker: "John Smith", 
      phoneNumber: "+447491683261",
      industry: "retail",
      location: "London"
    };
    
    console.log('📱 Test Lead:', testLead);
    
    // Test Twilio SMS directly
    console.log('\n📱 Testing Twilio SMS...');
    
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || 'your_account_sid';
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || 'your_auth_token';
    
    const smsMessage = `Hi ${testLead.decisionMaker}, thanks for your interest in our AI booking service! Please reply with your email address so I can send you the demo booking link.`;
    
    const twilioResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'To': testLead.phoneNumber,
        'From': '+447403934440',
        'Body': smsMessage
      })
    });
    
    if (twilioResponse.ok) {
      const result = await twilioResponse.json();
      console.log('✅ SMS sent successfully!');
      console.log('📱 Message SID:', result.sid);
      console.log('📱 To:', result.to);
      console.log('📱 From:', result.from);
      console.log('📱 Status:', result.status);
      
      console.log('\n🎯 What should happen:');
      console.log('1. 📱 You should receive SMS on +447491683261');
      console.log('2. 📧 Reply with: jonahthomaslloydhughes@gmail.com');
      console.log('3. 📧 You should get confirmation email');
      
    } else {
      const error = await twilioResponse.text();
      console.log('❌ SMS failed:', error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSMSPipelineDirect();