import fetch from 'node-fetch';

// Test available slots endpoint
async function testSlots() {
  try {
    console.log('🧪 Testing available slots endpoint...');
    
    const response = await fetch('https://ai-booking-mvp.onrender.com/api/available-slots?days=7');
    
    console.log('📊 Response Status:', response.status);
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Slots loaded successfully!');
      console.log('📊 Result:', JSON.stringify(result, null, 2));
    } else {
      const error = await response.text();
      console.log('❌ Slots failed:', error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSlots();
