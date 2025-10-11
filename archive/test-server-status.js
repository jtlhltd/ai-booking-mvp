// Test server status and endpoints
import fetch from 'node-fetch';

const BASE_URL = 'https://ai-booking-mvp.onrender.com';

async function testEndpoint(endpoint, method = 'GET', body = null, headers = {}) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const text = await response.text();
    
    console.log(`✅ ${method} ${endpoint}: ${response.status} ${response.statusText}`);
    if (text.length < 200) {
      console.log(`   Response: ${text}`);
    } else {
      console.log(`   Response: ${text.substring(0, 200)}...`);
    }
    return true;
  } catch (error) {
    console.log(`❌ ${method} ${endpoint}: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🧪 Testing server endpoints...\n');
  
  // Test basic endpoints
  await testEndpoint('/');
  await testEndpoint('/api/test');
  await testEndpoint('/api/available-slots');
  await testEndpoint('/api/pipeline-stats');
  
  // Test with API key
  await testEndpoint('/mock-call', 'POST', {
    businessName: 'Test Business',
    decisionMaker: 'John Smith',
    phoneNumber: '+447491683261'
  }, {
    'X-API-Key': 'ad34b1de00c5b7380d6a447abcd78874'
  });
  
  console.log('\n✅ Tests completed');
}

runTests().catch(console.error);
