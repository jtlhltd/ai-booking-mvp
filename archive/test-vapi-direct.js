// Direct VAPI Test Call
// Run with: node test-vapi-direct.js

import fetch from 'node-fetch';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function testVAPICall() {
  try {
    console.log('🔑 VAPI Direct Test Call');
    console.log('========================');
    
    // Ask for VAPI key
    const vapiKey = await askQuestion('Enter your VAPI API key: ');
    
    if (!vapiKey || vapiKey.trim() === '') {
      console.log('❌ No API key provided');
      rl.close();
      return;
    }

    console.log('✅ VAPI Key received:', vapiKey.substring(0, 10) + '...');

    // Mock lead data
    const mockLead = {
      businessName: "Peter's Pear Drop Shop",
      decisionMaker: "Peter",
      industry: "retail",
      location: "Manchester",
      phoneNumber: "+447491683261", // Your number
      email: "peter@peardropshop.co.uk",
      website: "www.peardropshop.co.uk"
    };

    console.log('\n📞 Call Details:');
    console.log('- Phone:', mockLead.phoneNumber);
    console.log('- Calling as:', mockLead.decisionMaker);
    console.log('- Business:', mockLead.businessName);
    console.log('- Assistant ID:', 'dd67a51c-7485-4b62-930a-4a84f328a1c9');

    // Create a call with British-optimized assistant
    const callData = {
      assistantId: "dd67a51c-7485-4b62-930a-4a84f328a1c9",
      phoneNumberId: "934ecfdb-fe7b-4d53-81c0-7908b97036b5",
      customer: {
        number: mockLead.phoneNumber,
        name: mockLead.decisionMaker
      },
      assistantOverrides: {
        firstMessage: "Hello, this is Sarah from AI Booking Solutions. I hope I'm not catching you at a bad time? I'm calling to help businesses like yours with appointment booking. Do you have a couple of minutes to chat about this?",
        silenceTimeoutSeconds: 15,
        startSpeakingPlan: {
          waitSeconds: 2
        }
      }
    };

    console.log('\n📤 Sending request to VAPI...');
    console.log('Request data:', JSON.stringify(callData, null, 2));

    const vapiResponse = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(callData)
    });

    console.log('\n📥 Response status:', vapiResponse.status);

    if (vapiResponse.ok) {
      const callResult = await vapiResponse.json();
      console.log('✅ SUCCESS! Call initiated successfully!');
      console.log('\n📋 Call Details:');
      console.log('- Call ID:', callResult.id);
      console.log('- Status:', callResult.status);
      console.log('- Assistant ID:', callResult.assistantId);
      console.log('- Customer:', callResult.customer);
      console.log('\n🎉 Your phone should be ringing now!');
    } else {
      const errorData = await vapiResponse.json();
      console.log('❌ FAILED to initiate call');
      console.log('Error details:', JSON.stringify(errorData, null, 2));
    }

  } catch (error) {
    console.log('💥 ERROR:', error.message);
  } finally {
    rl.close();
  }
}

// Run the test
testVAPICall();
