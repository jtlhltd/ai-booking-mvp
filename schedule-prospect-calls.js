// Schedule Cold Calls to Prospects for Client Acquisition
// Run: node schedule-prospect-calls.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || null; // Leave null to create new one
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Cold call script for selling your lead follow-up service
const CLIENT_ACQUISITION_SCRIPT = `You are Sarah, a friendly sales representative from JTLH Media calling business owners to offer a proven lead follow-up service.

YOUR GOAL: Book a 15-minute demo call or offer a free trial week.

YOUR OFFER:
- We follow up with YOUR existing leads using AI
- Call leads within 5 minutes
- Follow up 5-7 times persistently  
- Book appointments directly into your calendar
- You just show up to the meetings
- Price: £500/month
- Most clients see 8-12 extra appointments per month

OPENING:
"Hi [FirstName], this is Sarah from JTLH Media. Quick question - are you currently following up with all your leads within 5 minutes? Most [Industry] businesses lose 50-70% of their leads because staff are too busy to call back quickly."

IF INTERESTED:
"Great! Here's what we do: We call YOUR leads within 5 minutes, follow up 5-7 times, and book appointments into your calendar. Most clients see 8-12 extra appointments per month for just £500/month. Would a quick 15-minute demo be valuable?"

IF NOT INTERESTED:
"No problem! Can I ask - what's your current process for following up with leads?" [Listen and offer free trial]

OBJECTION HANDLING:
- "Too expensive" → "If I book just 4 extra appointments at £125 each, that's £500 - we break even. Most see 8-12 extra bookings = £1,000-1,500 in extra revenue."
- "Already following up" → "That's great! How quickly do you typically call back? We do it within 5 minutes, which studies show captures 78% more leads."
- "Need to think about it" → "Totally understand. How about a free trial week? Give us 10 leads, we'll book 3-5 appointments to prove it works. No charge."

CLOSE:
"Perfect! I'll send you details about our free trial week. Can I get your best email address?"

Keep it conversational, friendly, and focused on their pain point: losing leads because they're too busy to follow up.`;

// Parse CSV file
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  const prospects = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const prospect = {};
    headers.forEach((header, index) => {
      prospect[header] = values[index] || '';
    });
    return prospect;
  });
  
  return prospects.filter(p => p.Phone && p['First Name']); // Only valid prospects
}

// Create cold call assistant
async function createColdCallAssistant() {
  console.log('Creating cold call assistant for client acquisition...');
  
  const assistantConfig = {
    name: "Client Acquisition Assistant - Lead Follow-Up Service",
    model: {
      provider: "openai",
      model: "gpt-4o",
      messages: [{
        role: "system",
        content: CLIENT_ACQUISITION_SCRIPT
      }],
      temperature: 0.7,
      maxTokens: 500
    },
    voice: {
      provider: "11labs",
      voiceId: "21m00Tcm4TlvDq8ikWAM", // Professional female voice (Sarah)
      stability: 0.6,
      similarityBoost: 0.8,
      style: 0.3,
      useSpeakerBoost: true
    },
    firstMessage: "Hi {{FirstName}}, this is Sarah from JTLH Media. Quick question - are you currently following up with all your leads within 5 minutes?",
    recordingEnabled: true,
    endCallPhrases: ["goodbye", "no thanks", "not interested", "take me off your list"],
    maxDurationSeconds: 180, // 3 minutes max
    silenceTimeoutSeconds: 30,
    responseDelaySeconds: 0.5,
    llmRequestDelaySeconds: 0.1,
    numWordsToInterruptAssistant: 2,
    voicemailDetection: {
      enabled: true,
      provider: "twilio"
    },
    voicemailMessage: "Hi, this is Sarah from JTLH Media calling about helping you convert more of your leads into appointments. I'll try you again later. Have a great day!"
  };
  
  const response = await fetch('https://api.vapi.ai/assistant', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(assistantConfig)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create assistant: ${error}`);
  }
  
  const assistant = await response.json();
  console.log(`✅ Assistant created: ${assistant.id}`);
  return assistant;
}

// Make outbound call to prospect
async function callProspect(prospect, assistantId) {
  console.log(`\n📞 Calling ${prospect['First Name']} ${prospect['Last Name']} at ${prospect.Phone}...`);
  
  const callPayload = {
    assistantId: assistantId,
    phoneNumberId: VAPI_PHONE_NUMBER_ID,
    customer: {
      number: prospect.Phone,
      name: `${prospect['First Name']} ${prospect['Last Name']}`,
      numberE164CheckEnabled: true
    },
    maxDurationSeconds: 180, // 3 minutes
    assistantOverrides: {
      variableValues: {
        FirstName: prospect['First Name'],
        Company: prospect.Company || 'your business',
        Industry: prospect.Industry || 'business',
        Website: prospect.Website || '',
        Notes: prospect.Notes || ''
      }
    },
    metadata: {
      prospectType: 'client_acquisition',
      prospectName: `${prospect['First Name']} ${prospect['Last Name']}`,
      prospectCompany: prospect.Company,
      prospectIndustry: prospect.Industry,
      prospectEmail: prospect['Email Address'],
      campaignType: 'lead_follow_up_service',
      callPurpose: 'book_demo_or_trial',
      timestamp: new Date().toISOString()
    }
  };
  
  const response = await fetch('https://api.vapi.ai/call', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(callPayload)
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error(`❌ Failed to call ${prospect['First Name']}: ${error}`);
    return { success: false, error };
  }
  
  const call = await response.json();
  console.log(`✅ Call initiated! Call ID: ${call.id}`);
  console.log(`   Status: ${call.status}`);
  
  return { success: true, callId: call.id, call };
}

// Schedule calls with delays to avoid rate limits
async function scheduleCalls(prospects, assistantId, delayBetweenCalls = 5000) {
  console.log(`\n🚀 Starting campaign to call ${prospects.length} prospects...`);
  console.log(`   Delay between calls: ${delayBetweenCalls / 1000} seconds\n`);
  
  const results = [];
  
  for (let i = 0; i < prospects.length; i++) {
    const prospect = prospects[i];
    
    try {
      const result = await callProspect(prospect, assistantId);
      results.push({
        prospect: `${prospect['First Name']} ${prospect['Last Name']}`,
        company: prospect.Company,
        phone: prospect.Phone,
        ...result
      });
      
      // Wait between calls to avoid rate limits
      if (i < prospects.length - 1) {
        console.log(`\n⏳ Waiting ${delayBetweenCalls / 1000} seconds before next call...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenCalls));
      }
    } catch (error) {
      console.error(`❌ Error calling ${prospect['First Name']}:`, error.message);
      results.push({
        prospect: `${prospect['First Name']} ${prospect['Last Name']}`,
        company: prospect.Company,
        phone: prospect.Phone,
        success: false,
        error: error.message
      });
    }
  }
  
  return results;
}

// Main execution
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  VAPI CLIENT ACQUISITION CALL SCHEDULER');
  console.log('  Selling: Lead Follow-Up Service (£500/month)');
  console.log('═══════════════════════════════════════════════════\n');
  
  // Validate configuration
  if (!VAPI_PRIVATE_KEY) {
    console.error('❌ Error: VAPI_PRIVATE_KEY not set in environment');
    process.exit(1);
  }
  
  if (!VAPI_PHONE_NUMBER_ID) {
    console.error('❌ Error: VAPI_PHONE_NUMBER_ID not set in environment');
    process.exit(1);
  }
  
  try {
    // Load prospects from CSV
    const csvPath = path.join(__dirname, 'test-leads.csv');
    console.log(`📋 Loading prospects from: ${csvPath}`);
    const prospects = parseCSV(csvPath);
    console.log(`✅ Loaded ${prospects.length} valid prospects\n`);
    
    // Display prospects
    console.log('Prospects to call:');
    prospects.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p['First Name']} ${p['Last Name']} - ${p.Company} (${p.Industry}) - ${p.Phone}`);
    });
    console.log('');
    
    // Create or use existing assistant
    let assistantId = VAPI_ASSISTANT_ID;
    if (!assistantId) {
      const assistant = await createColdCallAssistant();
      assistantId = assistant.id;
      console.log(`\n💡 TIP: Save this assistant ID for reuse:`);
      console.log(`   VAPI_ASSISTANT_ID=${assistantId}\n`);
    } else {
      console.log(`✅ Using existing assistant: ${assistantId}\n`);
    }
    
    // Schedule calls
    const results = await scheduleCalls(prospects, assistantId, 5000); // 5 seconds between calls
    
    // Display results
    console.log('\n\n═══════════════════════════════════════════════════');
    console.log('  CAMPAIGN RESULTS');
    console.log('═══════════════════════════════════════════════════\n');
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(`✅ Successful calls: ${successful.length}`);
    console.log(`❌ Failed calls: ${failed.length}`);
    console.log(`📊 Success rate: ${((successful.length / results.length) * 100).toFixed(1)}%\n`);
    
    if (successful.length > 0) {
      console.log('Successful calls:');
      successful.forEach(r => {
        console.log(`  ✅ ${r.prospect} (${r.company}) - Call ID: ${r.callId}`);
      });
    }
    
    if (failed.length > 0) {
      console.log('\nFailed calls:');
      failed.forEach(r => {
        console.log(`  ❌ ${r.prospect} (${r.company}) - ${r.error}`);
      });
    }
    
    console.log('\n💡 Next steps:');
    console.log('  1. Monitor calls in Vapi dashboard: https://dashboard.vapi.ai');
    console.log('  2. Check for interested prospects in call transcripts');
    console.log('  3. Follow up with emails to warm leads');
    console.log('  4. Schedule demo calls with interested prospects\n');
    
  } catch (error) {
    console.error('\n❌ Campaign failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { scheduleCalls, createColdCallAssistant, callProspect };

