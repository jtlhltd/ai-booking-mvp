import fetch from 'node-fetch';

// Test the SMS pipeline by simulating a VAPI webhook call ending with interest
async function testWebhookSMSPipeline() {
  try {
    console.log('🧪 Testing SMS pipeline via simulated VAPI webhook...');
    
    // Simulate a VAPI webhook payload for a call that ended with interest
    const webhookPayload = {
      call: {
        id: "test-call-" + Date.now(),
        status: "completed",
        outcome: "interested",
        duration: 120,
        cost: 0.15,
        summary: "Customer showed interest in booking a demo call. They said 'yes, I'm interested' and want to know more about the service.",
        metadata: {
          tenantKey: "test-tenant",
          businessName: "Test Business",
          decisionMaker: "John Smith",
          industry: "retail",
          location: "London",
          leadPhone: "+447491683261"
        }
      },
      clientKey: "test-tenant",
      service: "ai-booking",
      lead: {
        phone: "+447491683261"
      },
      customer: {
        number: "+447491683261"
      }
    };
    
    console.log('📞 Simulating VAPI webhook call ending with interest...');
    console.log('📊 Call Summary:', webhookPayload.call.summary);
    
    // Send webhook to our server
    const response = await fetch('https://ai-booking-mvp.onrender.com/webhooks/vapi', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookPayload)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Webhook processed successfully!');
      console.log('📊 Response:', result);
      
      console.log('\n🎯 What should happen:');
      console.log('1. 📱 SMS should be sent to +447491683261');
      console.log('2. 📱 SMS message: "Hi John Smith, thanks for your interest in our AI booking service! Please reply with your email address so I can send you the demo booking link."');
      console.log('3. 📧 Reply with: jonahthomaslloydhughes@gmail.com');
      console.log('4. 📧 Confirmation email should arrive');
      
    } else {
      const error = await response.text();
      console.log('❌ Webhook failed:', error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testWebhookSMSPipeline();
