import fetch from 'node-fetch';

// Test booking endpoint directly
async function testBookingDirect() {
  try {
    console.log('🧪 Testing booking endpoint directly...');
    
    const leadData = {
      businessName: "Test Business",
      decisionMaker: "John Smith",
      email: "jonahthomaslloydhughes@gmail.com",
      phoneNumber: "+447491683261",
      industry: "business",
      location: "UK"
    };
    
    const preferredTimes = [{
      date: "2025-09-26",
      startTime: "10:00",
      endTime: "11:00"
    }];
    
    console.log('📊 Lead Data:', leadData);
    console.log('📊 Preferred Times:', preferredTimes);
    
    const response = await fetch('https://ai-booking-mvp.onrender.com/api/book-demo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        leadData: leadData,
        preferredTimes: preferredTimes
      })
    });
    
    console.log('📊 Response Status:', response.status);
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Booking successful!');
      console.log('📊 Result:', JSON.stringify(result, null, 2));
    } else {
      const error = await response.text();
      console.log('❌ Booking failed:', error);
      
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

testBookingDirect();
