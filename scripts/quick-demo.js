#!/usr/bin/env node
// Quick demo creator - non-interactive
// Usage: node scripts/quick-demo.js "Business Name" "Industry" "Prospect Name" "Location"

import 'dotenv/config';
import { init } from '../db.js';
import { cloneVapiAssistant, updateClientConfig } from '../lib/client-onboarding.js';
import { getTemplate, customizeTemplate } from '../lib/industry-templates.js';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const businessName = args[0] || 'Demo Business';
const industry = args[1] || 'fitness';
const prospectName = args[2] || 'Chris';
const location = args[3] || 'Birmingham';

const DEMO_CLIENT_KEY = 'demo-client';
const VAPI_API_URL = 'https://api.vapi.ai';
const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
const VAPI_TEMPLATE_ASSISTANT_ID = process.env.VAPI_TEMPLATE_ASSISTANT_ID;

console.log('\n🎬 Creating Quick Demo\n');
console.log(`Business: ${businessName}`);
console.log(`Industry: ${industry}`);
console.log(`Prospect: ${prospectName}`);
console.log(`Location: ${location}\n`);

try {
  // Initialize DB
  await init();
  console.log('✅ Database connected\n');

  // For demos, hardcode leadName to "Jonah" (the person being called during demo)
  // Get industry template
  const template = getTemplate(industry);
  const customized = customizeTemplate(industry, {
    businessName,
    primaryService: template.name,
    serviceArea: location,
    voiceGender: template.voiceGender,
    leadName: 'Jonah' // Hardcoded for VAPI assistant calls - this is who gets called
  });

  console.log('📝 Generated improved prompt:');
  console.log(customized.systemPrompt.substring(0, 200) + '...\n');

  // Get or create assistant
  let assistantId = VAPI_TEMPLATE_ASSISTANT_ID;
  
  if (VAPI_TEMPLATE_ASSISTANT_ID && VAPI_PRIVATE_KEY) {
    console.log('🔄 Updating VAPI assistant with improved prompt...\n');
    
    try {
      // Get current assistant
      const getResponse = await fetch(`${VAPI_API_URL}/assistant/${VAPI_TEMPLATE_ASSISTANT_ID}`, {
        headers: {
          'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (getResponse.ok) {
        const assistant = await getResponse.json();
        
        // Update with improved prompt
        const updateResponse = await fetch(`${VAPI_API_URL}/assistant/${VAPI_TEMPLATE_ASSISTANT_ID}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: {
              ...assistant.model,
              messages: [{
                role: 'system',
                content: customized.systemPrompt
              }]
            },
            firstMessage: customized.firstMessage
          })
        });

        if (updateResponse.ok) {
          console.log('✅ Assistant updated with improved prompt!\n');
        } else {
          const error = await updateResponse.text();
          console.log('⚠️  Could not update assistant:', error);
        }
      }
    } catch (error) {
      console.log('⚠️  Could not update assistant:', error.message);
    }
  }

  // Generate demo script
  const demoScript = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEMO SCRIPT FOR ${businessName.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[0:00-0:12] HOOK - GRAB ATTENTION
"Hi ${prospectName}, quick question - how many leads did ${businessName} 
get last week that you never followed up with? 

[PAUSE - Let them think]

Because I just set up something for you that turns those missed leads into 
booked appointments automatically. Want to see it?"

[0:12-0:25] THE PAIN - MAKE IT REAL
"Here's what I see with ${industry} businesses in ${location}: 
Most ${industry} businesses lose 60-70% of leads because they can't 
follow up fast enough.

That's why I built this - watch what happens when a lead comes in..."

[0:25-0:40] SHOW DASHBOARD - BUILD ANTICIPATION
[Screen share dashboard]
"See this? This is your dashboard. I've loaded 5 test leads here.
Now watch what happens in the next 30 seconds..."

[0:40-1:15] THE MAGIC - LIVE DEMO
"Within 5 minutes of a lead coming in, our AI calls them. 
[Click 'Make Call' or show call in progress]

[When call connects - answer as the lead]
[AI books appointment naturally - let it flow]

[After call ends]
"Did you hear that? It sounded completely natural. It handled the 
conversation, answered questions, and booked an appointment - all 
without you lifting a finger."

[1:15-1:30] SHOW THE RESULT - PROVE IT WORKS
[Switch to calendar view]
"Look - it's already in your calendar. The lead got a confirmation text. 
All automatic."

[1:30-1:45] THE NUMBERS - BUILD URGENCY
[Show dashboard metrics]
"Here's what this means: 5 leads, 3 calls made, 2 appointments booked. 
That's a 40% conversion rate.

Most ${industry} businesses get 10-15% conversion. You're seeing 40% here. 
That's 2-3x more appointments from the same leads."

[1:45-2:00] STRONG CLOSE - CLEAR NEXT STEP
"I've already set this up for ${businessName} - your assistant is ready, 
your calendar is connected, everything's done.

Here's what I'm proposing: Let's test this with 10 of your actual leads 
this week. If it works, great. If not, no charge. Takes 5 minutes to 
upload the leads.

Sound good? Just reply 'yes' and I'll send you the link to upload them."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  // Save demo files
  const demosDir = path.join(process.cwd(), 'demos');
  if (!fs.existsSync(demosDir)) {
    fs.mkdirSync(demosDir, { recursive: true });
  }

  const timestamp = Date.now();
  const filename = `${businessName.toLowerCase().replace(/\s+/g, '-')}-${prospectName.toLowerCase()}-${location.toLowerCase()}-${timestamp}`;
  
  // Save as text
  fs.writeFileSync(
    path.join(demosDir, `${filename}.txt`),
    `Assistant ID: ${assistantId || 'N/A'}\nDashboard URL: https://ai-booking-mvp.onrender.com/client-dashboard.html?client=${DEMO_CLIENT_KEY}\n\n${demoScript}`
  );

  // Save as JSON
  fs.writeFileSync(
    path.join(demosDir, `${filename}.json`),
    JSON.stringify({
      assistantId: assistantId || null,
      dashboardUrl: `https://ai-booking-mvp.onrender.com/client-dashboard.html?client=${DEMO_CLIENT_KEY}`,
      prospect: {
        businessName,
        industry,
        prospectName,
        location
      },
      script: demoScript,
      createdAt: new Date().toISOString()
    }, null, 2)
  );

  console.log('✅ Demo created!\n');
  console.log(`📄 Files saved:`);
  console.log(`   - demos/${filename}.txt`);
  console.log(`   - demos/${filename}.json\n`);
  console.log(`🎯 Assistant ID: ${assistantId || 'N/A'}`);
  console.log(`🌐 Dashboard: https://ai-booking-mvp.onrender.com/client-dashboard.html?client=${DEMO_CLIENT_KEY}\n`);

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

