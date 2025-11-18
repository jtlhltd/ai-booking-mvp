#!/usr/bin/env node

/**
 * Client Verification Script
 * 
 * Verifies that a client is fully configured and ready to use.
 * 
 * Usage: node scripts/verify-client.js <clientKey>
 */

import 'dotenv/config';
import { init, getFullClient } from '../db.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const VAPI_API_URL = 'https://api.vapi.ai';
const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;

// Initialize database
let dbConnected = false;
try {
  await init();
  dbConnected = true;
} catch (error) {
  console.warn('⚠️  Database not connected, checking local files only\n');
}

/**
 * Check if Vapi assistant exists and is configured
 */
async function verifyVapiAssistant(assistantId) {
  if (!assistantId) {
    return { valid: false, message: 'No assistant ID configured' };
  }
  
  if (!VAPI_PRIVATE_KEY) {
    return { valid: false, message: 'VAPI_PRIVATE_KEY not set in environment' };
  }
  
  try {
    const response = await axios.get(`${VAPI_API_URL}/assistant/${assistantId}`, {
      headers: {
        'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`
      }
    });
    
    if (response.data && response.data.id) {
      return { 
        valid: true, 
        message: `Assistant exists: ${response.data.name || 'Unnamed'}`,
        data: response.data
      };
    }
    
    return { valid: false, message: 'Assistant not found' };
  } catch (error) {
    if (error.response?.status === 404) {
      return { valid: false, message: 'Assistant not found in Vapi' };
    }
    return { valid: false, message: `Error checking assistant: ${error.message}` };
  }
}

/**
 * Check if dashboard is accessible
 */
async function verifyDashboard(clientKey) {
  const baseUrl = process.env.PUBLIC_BASE_URL || process.env.BASE_URL || 'https://ai-booking-mvp.onrender.com';
  const dashboardUrl = `${baseUrl}/client-dashboard.html?client=${clientKey}`;
  
  try {
    const response = await axios.get(dashboardUrl, { 
      timeout: 5000,
      validateStatus: () => true // Don't throw on any status
    });
    
    if (response.status === 200) {
      return { valid: true, message: 'Dashboard accessible', url: dashboardUrl };
    }
    
    return { valid: false, message: `Dashboard returned status ${response.status}`, url: dashboardUrl };
  } catch (error) {
    return { valid: false, message: `Dashboard not accessible: ${error.message}`, url: dashboardUrl };
  }
}

/**
 * Verify client configuration
 */
async function verifyClient(clientKey) {
  console.log(`\n🔍 Verifying client: ${clientKey}\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  let client = null;
  
  // Try to load from database
  if (dbConnected) {
    try {
      client = await getFullClient(clientKey);
    } catch (error) {
      console.warn(`⚠️  Could not load from database: ${error.message}\n`);
    }
  }
  
  // Try to load from local file
  if (!client) {
    const clientFile = path.join(process.cwd(), 'demos', `.client-${clientKey}.json`);
    if (fs.existsSync(clientFile)) {
      try {
        const fileContent = fs.readFileSync(clientFile, 'utf8');
        client = JSON.parse(fileContent);
        console.log('📁 Loaded from local file\n');
      } catch (error) {
        console.error(`❌ Error reading local file: ${error.message}\n`);
        return;
      }
    }
  }
  
  if (!client) {
    console.error(`❌ Client not found: ${clientKey}`);
    console.error(`   Checked: Database${dbConnected ? ' ✓' : ' ✗'} and local files\n`);
    return;
  }
  
  console.log(`📋 Client Configuration:\n`);
  console.log(`   Business Name: ${client.displayName || client.name || '—'}`);
  console.log(`   Industry: ${client.industry || '—'}`);
  console.log(`   Services: ${Array.isArray(client.services) ? client.services.join(', ') : (client.services || '—')}`);
  console.log(`   Location: ${client.location || '—'}`);
  console.log(`   Timezone: ${client.timezone || '—'}`);
  console.log(`   Phone: ${client.phone || client.numbers?.primary || '—'}`);
  console.log(`   Business Hours: ${client.businessHours || '—'}`);
  console.log(`   Description: ${client.description ? (client.description.substring(0, 50) + '...') : '—'}`);
  console.log(`   Tagline: ${client.tagline || '—'}`);
  console.log(`   Status: ${client.status || '—'}`);
  console.log(`   Logo: ${client.logo || '—'}`);
  console.log(`   Colors: ${client.primaryColor ? `${client.primaryColor} / ${client.secondaryColor}` : '—'}`);
  console.log('');
  
  // Check required fields
  console.log('✅ Required Fields Check:\n');
  const requiredFields = {
    'Business Name': client.displayName || client.name,
    'Industry': client.industry,
    'Services': client.services && (Array.isArray(client.services) ? client.services.length > 0 : true),
    'Timezone': client.timezone,
    'Vapi Assistant ID': client.vapi?.assistantId || client.vapi_json?.assistantId
  };
  
  let allRequired = true;
  for (const [field, value] of Object.entries(requiredFields)) {
    const valid = value !== null && value !== undefined && value !== '';
    const icon = valid ? '✅' : '❌';
    console.log(`   ${icon} ${field}: ${valid ? 'Present' : 'Missing'}`);
    if (!valid) allRequired = false;
  }
  console.log('');
  
  // Check optional but recommended fields
  console.log('📝 Recommended Fields:\n');
  const recommendedFields = {
    'Phone Number': client.phone || client.numbers?.primary,
    'Business Hours': client.businessHours,
    'Description': client.description,
    'Tagline': client.tagline,
    'Logo': client.logo,
    'Branding Colors': client.primaryColor
  };
  
  for (const [field, value] of Object.entries(recommendedFields)) {
    const valid = value !== null && value !== undefined && value !== '';
    const icon = valid ? '✅' : '⚠️ ';
    console.log(`   ${icon} ${field}: ${valid ? 'Present' : 'Missing (will use defaults)'}`);
  }
  console.log('');
  
  // Verify Vapi assistant
  console.log('🤖 Vapi Assistant:\n');
  const assistantId = client.vapi?.assistantId || client.vapi_json?.assistantId;
  if (assistantId) {
    const vapiCheck = await verifyVapiAssistant(assistantId);
    const icon = vapiCheck.valid ? '✅' : '❌';
    console.log(`   ${icon} ${vapiCheck.message}`);
    if (vapiCheck.data) {
      console.log(`      ID: ${assistantId}`);
      if (vapiCheck.data.voice) {
        console.log(`      Voice: ${vapiCheck.data.voice.provider || 'Unknown'}`);
      }
    }
  } else {
    console.log('   ❌ No assistant ID configured');
  }
  console.log('');
  
  // Verify dashboard
  console.log('🌐 Dashboard:\n');
  const dashboardCheck = await verifyDashboard(clientKey);
  const icon = dashboardCheck.valid ? '✅' : '❌';
  console.log(`   ${icon} ${dashboardCheck.message}`);
  if (dashboardCheck.url) {
    console.log(`      URL: ${dashboardCheck.url}`);
  }
  console.log('');
  
  // Integration status
  console.log('🔌 Integration Status:\n');
  const integrations = {
    'Vapi Voice': client.vapi?.assistantId || client.vapi_json?.assistantId ? '✅ Active' : '❌ Not configured',
    'Google Calendar': client.calendar_json?.calendarId || client.calendarId ? '✅ Connected' : '⚠️  Not connected',
    'Twilio SMS': client.twilio_json || client.sms ? '✅ Configured' : '⚠️  Not configured'
  };
  
  for (const [name, status] of Object.entries(integrations)) {
    console.log(`   ${status} ${name}`);
  }
  console.log('');
  
  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (allRequired && dashboardCheck.valid) {
    console.log('✅ Client is fully configured and ready to use!\n');
  } else {
    console.log('⚠️  Client has some missing fields or issues:\n');
    if (!allRequired) {
      console.log('   - Some required fields are missing');
    }
    if (!dashboardCheck.valid) {
      console.log('   - Dashboard is not accessible');
    }
    console.log('');
  }
}

// Main
const clientKey = process.argv[2];

if (!clientKey) {
  console.error('Usage: node scripts/verify-client.js <clientKey>');
  console.error('Example: node scripts/verify-client.js stay-focused-fitness-chris');
  process.exit(1);
}

await verifyClient(clientKey);

