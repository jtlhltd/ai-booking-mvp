// Test VAPI Phone Numbers
// Run with: node test-vapi-phones.js

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

async function testVAPIPhones() {
  try {
    console.log('📞 VAPI Phone Numbers Test');
    console.log('=========================');
    
    // Ask for VAPI key
    const vapiKey = await askQuestion('Enter your VAPI API key: ');
    
    if (!vapiKey || vapiKey.trim() === '') {
      console.log('❌ No API key provided');
      rl.close();
      return;
    }

    console.log('✅ VAPI Key received:', vapiKey.substring(0, 10) + '...');

    console.log('\n📤 Fetching phone numbers from VAPI...');

    const vapiResponse = await fetch('https://api.vapi.ai/phone-number', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${vapiKey.trim()}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('📥 Response status:', vapiResponse.status);

    if (vapiResponse.ok) {
      const phoneData = await vapiResponse.json();
      console.log('✅ SUCCESS! Phone numbers retrieved!');
      console.log('\n📋 Available Phone Numbers:');
      
      if (phoneData && phoneData.length > 0) {
        phoneData.forEach((phone, index) => {
          console.log(`\n${index + 1}. Phone Number:`);
          console.log('- ID:', phone.id);
          console.log('- Number:', phone.number);
          console.log('- Twilio Account SID:', phone.twilioAccountSid);
          console.log('- Twilio Phone Number:', phone.twilioPhoneNumber);
          console.log('- Status:', phone.status);
        });
      } else {
        console.log('❌ No phone numbers found in your VAPI account');
        console.log('You need to add a Twilio phone number to your VAPI account first');
      }
    } else {
      const errorData = await vapiResponse.json();
      console.log('❌ FAILED to fetch phone numbers');
      console.log('Error details:', JSON.stringify(errorData, null, 2));
    }

  } catch (error) {
    console.log('💥 ERROR:', error.message);
  } finally {
    rl.close();
  }
}

// Run the test
testVAPIPhones();
