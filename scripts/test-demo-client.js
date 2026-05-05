#!/usr/bin/env node

/**
 * Test Demo Client Creator Script
 * 
 * Non-interactive test version with sample data
 */

import 'dotenv/config';
import { init, getFullClient, upsertFullClient } from '../db.js';
import { cloneVapiAssistant } from '../lib/client-onboarding.js';

const DEMO_CLIENT_KEY = 'demo-client';
const VAPI_API_URL = 'https://api.vapi.ai';

// Test prospect data
const testProspect = {
  businessName: 'Smith Dental Practice',
  industry: 'dentist',
  services: ['Dental Checkup', 'Teeth Cleaning', 'Fillings']
};

async function testDemoClient() {
  try {
    console.log('\n🧪 Testing Demo Client Creator\n');
    
    // Initialize database
    await init();
    
    // Get demo client
    let client = await getFullClient(DEMO_CLIENT_KEY);
    if (!client) {
      console.log('❌ Demo client not found. Run create-demo-client.js first to create it.');
      process.exit(1);
    }
    
    console.log('✅ Demo client found\n');
    
    // Get assistant ID
    const assistantId = client.vapi?.assistantId || client.vapiAssistantId;
    if (!assistantId) {
      console.log('❌ No assistant ID found. Run create-demo-client.js first to create assistant.');
      process.exit(1);
    }
    
    console.log(`✅ Assistant ID: ${assistantId}\n`);
    
    // Test updating assistant
    console.log('🔄 Testing assistant update with sample data...\n');
    console.log(`Business: ${testProspect.businessName}`);
    console.log(`Industry: ${testProspect.industry}`);
    console.log(`Services: ${testProspect.services.join(', ')}\n`);
    
    const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
    if (!VAPI_PRIVATE_KEY) {
      throw new Error('VAPI_PRIVATE_KEY not set');
    }
    
    // Get current assistant
    const getResponse = await fetch(`${VAPI_API_URL}/assistant/${assistantId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!getResponse.ok) {
      throw new Error(`Failed to get assistant: ${getResponse.status}`);
    }
    
    const assistant = await getResponse.json();
    
    // Update system prompt
    let systemPrompt = assistant.model?.messages?.[0]?.content || '';
    systemPrompt = systemPrompt
      .replace(/\{businessName\}/g, testProspect.businessName)
      .replace(/\[Practice\]/g, testProspect.businessName)
      .replace(/\[Firm Name\]/g, testProspect.businessName)
      .replace(/\[Company\]/g, testProspect.businessName)
      .replace(/\[Restaurant\]/g, testProspect.businessName)
      .replace(/\{industry\}/g, testProspect.industry)
      .replace(/\{services\}/g, testProspect.services.join(', '));
    
    // Update first message if it exists
    let firstMessage = assistant.firstMessage || '';
    if (firstMessage) {
      firstMessage = firstMessage
        .replace(/\{businessName\}/g, testProspect.businessName)
        .replace(/\[.*?\]/g, testProspect.businessName);
    }
    
    // Update assistant
    const updatePayload = {
      name: `${testProspect.businessName} - Booking Assistant`,
      model: {
        ...assistant.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          }
        ]
      }
    };
    
    if (firstMessage) {
      updatePayload.firstMessage = firstMessage;
    }
    
    const updateResponse = await fetch(`${VAPI_API_URL}/assistant/${assistantId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update assistant: ${updateResponse.status} - ${errorText}`);
    }
    
    console.log('✅ Assistant updated successfully!\n');
    
    // Generate demo script
    const baseUrl = process.env.BASE_URL || 'https://yourdomain.com';
    const dashboardUrl = `${baseUrl}/client-dashboard.html?client=${DEMO_CLIENT_KEY}`;
    
    const demoScript = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEMO SCRIPT FOR ${testProspect.businessName.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[0:00-0:10] PERSONAL OPENING
"Hi [Prospect Name], I saw ${testProspect.businessName} is a ${testProspect.industry} in [location]. 
I made a quick 2-minute demo showing exactly how we convert your leads 
into appointments."

[0:10-0:20] THE PROBLEM
"Most ${testProspect.industry} businesses lose 70% of their leads because they can't 
follow up fast enough. Watch this..."

[0:20-0:30] SHOW DASHBOARD
[Screen share dashboard]
"Here's your dashboard. When you upload leads, they appear here.
Right now I've got 5 test leads."

[0:30-1:00] THE MAGIC - AI CALLING
"Within 5 minutes, the AI calls them. Watch this..."
[Make call to your number]
[You answer as lead]
[AI books appointment naturally]
"See how natural that was? It just booked an appointment."

[1:00-1:15] SHOW RESULT
[Show calendar]
"And it just appeared in your calendar. The lead got a confirmation text. 
All automatic."

[1:15-1:30] SHOW METRICS
[Show dashboard metrics]
"5 leads, 3 calls, 2 appointments booked. That's a 40% conversion rate. 
Most businesses get 10-20%."

[1:30-2:00] CLOSE
"I've already set this up for ${testProspect.businessName}. Want to test it with 10 of 
your actual leads this week? Takes 5 minutes to set up. Just reply if 
interested."

[2:00] END

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NOTES:
- Business: ${testProspect.businessName}
- Industry: ${testProspect.industry}
- Services: ${testProspect.services.join(', ')}
- Replace [Prospect Name] and [location] with actual prospect details
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ TEST SUCCESSFUL!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Assistant ID: ${assistantId}`);
    console.log(`Dashboard URL: ${dashboardUrl}\n`);
    console.log(demoScript);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('✅ Everything is working! You can now use:');
    console.log('   node scripts/create-demo-client.js\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testDemoClient();





