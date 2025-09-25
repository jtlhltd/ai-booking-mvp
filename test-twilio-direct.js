import fetch from 'node-fetch';

// Test Twilio SMS directly to verify credentials work
async function testTwilioDirect() {
  try {
    console.log('🧪 Testing Twilio SMS directly...');
    
    // Use your Twilio credentials
    const accountSid = 'AC70407e0f0d15f286b3a9977c5312e1e5';
    const authToken = 'your_auth_token_here'; // You'll need to provide this
    
    const message = 'Hi John Smith, thanks for your interest in our AI booking service! Please reply with your email address so I can send you the demo booking link.';
    
    console.log('📱 Sending SMS to +447491683261...');
    console.log('📱 Message:', message);
    
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'To': '+447491683261',
        'From': '+447403934440',
        'Body': message
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ SMS sent successfully!');
      console.log('📱 Message SID:', result.sid);
      console.log('📱 Status:', result.status);
      
      console.log('\n🎯 What should happen:');
      console.log('1. 📱 You should receive SMS on +447491683261');
      console.log('2. 📧 Reply with: jonahthomaslloydhughes@gmail.com');
      console.log('3. 📧 Check Gmail for confirmation email');
      
    } else {
      const error = await response.text();
      console.log('❌ SMS failed:', error);
      console.log('\n🔧 This means:');
      console.log('- Twilio credentials need to be verified');
      console.log('- Auth token might be incorrect');
      console.log('- Account might have restrictions');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testTwilioDirect();
