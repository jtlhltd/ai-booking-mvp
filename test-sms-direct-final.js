import fetch from 'node-fetch';

// Direct SMS test using your Twilio credentials
async function sendDirectSMS() {
  try {
    console.log('🧪 Sending SMS directly using Twilio...');
    
    // Your Twilio credentials
    const accountSid = 'AC70407e0f0d15f286b3a9977c5312e1e5';
    const authToken = '4b6fe80b9cd7e4fddac16212fef87c20';
    
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
      console.log('📱 To:', result.to);
      console.log('📱 From:', result.from);
      
      console.log('\n🎯 NEXT STEPS:');
      console.log('1. 📱 Check your phone (+447491683261) for the SMS');
      console.log('2. 📧 Reply with: jonahthomaslloydhughes@gmail.com');
      console.log('3. 📧 Check Gmail for confirmation email');
      console.log('4. 🎯 Let me know what happens!');
      
    } else {
      const error = await response.text();
      console.log('❌ SMS failed:', error);
      
      // Try to parse error details
      try {
        const errorData = JSON.parse(error);
        console.log('📊 Error details:', errorData);
      } catch (e) {
        console.log('📊 Raw error response:', error);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

sendDirectSMS();
