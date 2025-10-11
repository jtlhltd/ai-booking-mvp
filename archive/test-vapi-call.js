// Local VAPI Test Call
// Run with: node test-vapi-call.js

import fetch from 'node-fetch';

async function testVAPICall() {
  try {
    // Get VAPI key from environment
    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
    
    if (!vapiKey) {
      console.log('❌ VAPI API key not found in environment variables');
      console.log('Available keys:');
      console.log('- VAPI_PRIVATE_KEY:', !!process.env.VAPI_PRIVATE_KEY);
      console.log('- VAPI_PUBLIC_KEY:', !!process.env.VAPI_PUBLIC_KEY);
      console.log('- VAPI_API_KEY:', !!process.env.VAPI_API_KEY);
      return;
    }

    console.log('✅ VAPI Key found:', vapiKey.substring(0, 10) + '...');

    // Mock lead data
    const mockLead = {
      businessName: "Test Dental Practice",
      decisionMaker: "Dr. Sarah Johnson",
      industry: "dental",
      location: "London",
      phoneNumber: "+447491683261", // Your number
      email: "sarah@testdental.co.uk",
      website: "www.testdental.co.uk"
    };

    console.log('📞 Initiating call to:', mockLead.phoneNumber);
    console.log('👤 Calling as:', mockLead.decisionMaker);
    console.log('🏢 Business:', mockLead.businessName);

    // Create a call with correct VAPI format
    const callData = {
      assistantId: "dd67a51c-7485-4b62-930a-4a84f328a1c9",
      customer: {
        number: mockLead.phoneNumber,
        name: mockLead.decisionMaker
      }
    };

    console.log('📤 Sending request to VAPI...');
    console.log('Request data:', JSON.stringify(callData, null, 2));

    const vapiResponse = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(callData)
    });

    console.log('📥 Response status:', vapiResponse.status);
    console.log('📥 Response headers:', Object.fromEntries(vapiResponse.headers.entries()));

    if (vapiResponse.ok) {
      const callResult = await vapiResponse.json();
      console.log('✅ SUCCESS! Call initiated successfully!');
      console.log('📋 Call Details:');
      console.log('- Call ID:', callResult.id);
      console.log('- Status:', callResult.status);
      console.log('- Assistant ID:', callResult.assistantId);
      console.log('- Customer:', callResult.customer);
      console.log('🎉 Your phone should be ringing now!');
    } else {
      const errorData = await vapiResponse.json();
      console.log('❌ FAILED to initiate call');
      console.log('Error details:', JSON.stringify(errorData, null, 2));
    }

  } catch (error) {
    console.log('💥 ERROR:', error.message);
    console.log('Stack trace:', error.stack);
  }
}

// Run the test
testVAPICall();
