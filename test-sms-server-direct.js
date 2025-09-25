import fetch from 'node-fetch';

// Test SMS pipeline through server endpoint
async function testSMSServerDirect() {
  try {
    console.log('🧪 Testing SMS pipeline through server...');
    
    // Test data
    const testLead = {
      businessName: "Test Business",
      decisionMaker: "John Smith", 
      phoneNumber: "+447491683261",
      industry: "retail",
      location: "London"
    };
    
    console.log('📱 Test Lead:', testLead);
    
    // Test the server's SMS pipeline endpoint
    console.log('\n📱 Testing server SMS pipeline...');
    
    const response = await fetch('https://ai-booking-mvp.onrender.com/api/initiate-lead-capture', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'ad34b1de00c5b7380d6a447abcd78874'
      },
      body: JSON.stringify({ leadData: testLead })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ SMS pipeline initiated successfully!');
      console.log('📊 Result:', JSON.stringify(result, null, 2));
      
      console.log('\n🎯 What should happen:');
      console.log('1. 📱 You should receive SMS on +447491683261');
      console.log('2. 📧 Reply with: jonahthomaslloydhughes@gmail.com');
      console.log('3. 📧 Check Gmail for confirmation email');
      
    } else {
      const error = await response.text();
      console.log('❌ SMS pipeline failed:', error);
      
      // Try without API key to see if it's an auth issue
      console.log('\n🔧 Trying without API key...');
      const response2 = await fetch('https://ai-booking-mvp.onrender.com/api/initiate-lead-capture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ leadData: testLead })
      });
      
      if (response2.ok) {
        const result2 = await response2.json();
        console.log('✅ SMS pipeline works without API key!');
        console.log('📊 Result:', JSON.stringify(result2, null, 2));
      } else {
        const error2 = await response2.text();
        console.log('❌ Still failed:', error2);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSMSServerDirect();
