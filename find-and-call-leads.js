#!/usr/bin/env node
// Find 10 leads and call them automatically
// Usage: node find-and-call-leads.js "dental practices in London"

import fetch from 'node-fetch';
import 'dotenv/config';

const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;
const API_KEY = process.env.API_KEY;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Get search query from command line
const searchQuery = process.argv[2] || 'dental practices in London';

console.log('╔═══════════════════════════════════════════════════╗');
console.log('║   FIND & CALL LEADS - AUTOMATED WORKFLOW         ║');
console.log('╚═══════════════════════════════════════════════════╝\n');

// Step 1: Search for businesses
async function findLeads(query) {
  console.log(`🔍 Step 1: Searching for "${query}"...\n`);
  
  try {
    // Use your existing API endpoint
    const response = await fetch(`${BASE_URL}/api/uk-business-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        filters: {
          limit: 10,
          mobilesOnly: true  // Only get mobile numbers (07xxx)
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    const businesses = data.businesses || [];
    
    console.log(`✅ Found ${businesses.length} businesses!\n`);
    
    // Display found businesses
    businesses.forEach((b, i) => {
      console.log(`  ${i + 1}. ${b.name}`);
      console.log(`     📞 ${b.phone}`);
      console.log(`     📍 ${b.address}`);
      console.log(`     🌐 ${b.website || 'No website'}`);
      console.log('');
    });
    
    return businesses;
  } catch (error) {
    console.error('❌ Failed to search businesses:', error.message);
    if (error.message.includes('Google Places API key not configured')) {
      console.log('\n💡 TIP: Add GOOGLE_PLACES_API_KEY to your .env file');
      console.log('   Get one at: https://console.cloud.google.com/apis/credentials');
    }
    throw error;
  }
}

// Step 2: Create cold call assistant
async function createAssistant() {
  console.log('🤖 Step 2: Creating Vapi cold call assistant...\n');
  
  try {
    const response = await fetch(`${BASE_URL}/admin/vapi/cold-call-assistant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create assistant');
    }
    
    const data = await response.json();
    console.log(`✅ Assistant created: ${data.assistant.id}\n`);
    return data.assistant.id;
  } catch (error) {
    console.error('❌ Failed to create assistant:', error.message);
    throw error;
  }
}

// Step 3: Format businesses for cold calling
function formatBusinessesForCalling(businesses) {
  console.log('📋 Step 3: Formatting businesses for cold calling...\n');
  
  return businesses.map((b, i) => ({
    id: `lead-${i + 1}`,
    name: b.name,
    phone: b.phone,
    email: b.email || '',
    address: b.address,
    website: b.website || '',
    decisionMaker: b.decisionMaker || {
      name: 'Owner',
      role: 'Business Owner',
      email: b.email || '',
      phone: b.phone
    },
    industry: b.category || 'Unknown',
    notes: `Found via search: ${searchQuery}`
  }));
}

// Step 4: Start calling campaign
async function startCampaign(assistantId, businesses) {
  console.log(`📞 Step 4: Starting campaign to call ${businesses.length} businesses...\n`);
  
  try {
    const response = await fetch(`${BASE_URL}/admin/vapi/cold-call-campaign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({
        assistantId,
        businesses,
        campaignName: `Campaign: ${searchQuery}`,
        maxCallsPerDay: 100
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to start campaign');
    }
    
    const data = await response.json();
    console.log('✅ Campaign started!\n');
    console.log(`   Campaign ID: ${data.campaign.id}`);
    console.log(`   Businesses to call: ${data.campaign.businessCount}`);
    console.log(`   Status: ${data.campaign.status}\n`);
    
    return data;
  } catch (error) {
    console.error('❌ Failed to start campaign:', error.message);
    throw error;
  }
}

// Main execution
async function main() {
  // Validate environment
  if (!VAPI_PRIVATE_KEY) {
    console.error('❌ Error: VAPI_PRIVATE_KEY not set');
    console.log('   Add it to your .env file');
    process.exit(1);
  }
  
  if (!VAPI_PHONE_NUMBER_ID) {
    console.error('❌ Error: VAPI_PHONE_NUMBER_ID not set');
    console.log('   Add it to your .env file');
    process.exit(1);
  }
  
  if (!API_KEY) {
    console.error('❌ Error: API_KEY not set');
    console.log('   Add it to your .env file');
    process.exit(1);
  }
  
  console.log(`📊 Search Query: "${searchQuery}"\n`);
  console.log('─────────────────────────────────────────────────────\n');
  
  try {
    // Step 1: Find leads
    const foundBusinesses = await findLeads(searchQuery);
    
    if (foundBusinesses.length === 0) {
      console.log('❌ No businesses found. Try a different search query.');
      process.exit(1);
    }
    
    // Limit to 10 businesses
    const businessesToCall = foundBusinesses.slice(0, 10);
    console.log(`📌 Selected ${businessesToCall.length} businesses to call\n`);
    console.log('─────────────────────────────────────────────────────\n');
    
    // Step 2: Create assistant
    const assistantId = await createAssistant();
    console.log('─────────────────────────────────────────────────────\n');
    
    // Step 3: Format businesses
    const formattedBusinesses = formatBusinessesForCalling(businessesToCall);
    console.log('─────────────────────────────────────────────────────\n');
    
    // Step 4: Start campaign
    const campaignResult = await startCampaign(assistantId, formattedBusinesses);
    
    console.log('═════════════════════════════════════════════════════');
    console.log('🎉 SUCCESS! Campaign is running!');
    console.log('═════════════════════════════════════════════════════\n');
    
    console.log('📊 Next Steps:');
    console.log('  1. Monitor calls in Vapi dashboard: https://dashboard.vapi.ai');
    console.log('  2. Check server console for [COLD CALL] logs');
    console.log('  3. Review call transcripts for interested prospects');
    console.log('  4. Follow up with warm leads via email\n');
    
    console.log('💡 Tips:');
    console.log('  - First 2-3 calls usually connect within 2-5 minutes');
    console.log('  - Voicemails are detected automatically');
    console.log('  - Interested prospects will request demos');
    console.log('  - Check transcripts for objections to improve script\n');
    
  } catch (error) {
    console.error('\n❌ Campaign failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { findLeads, createAssistant, startCampaign };

