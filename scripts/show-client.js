#!/usr/bin/env node

/**
 * Show Client Details Script
 * 
 * Shows detailed information about a specific client.
 * 
 * Usage: node scripts/show-client.js <clientKey>
 */

import 'dotenv/config';
import { init, getFullClient } from '../db.js';
import fs from 'fs';
import path from 'path';

// Initialize database
let dbConnected = false;
try {
  await init();
  dbConnected = true;
} catch (error) {
  console.warn('⚠️  Database not connected, checking local files only\n');
}

/**
 * Show client details
 */
async function showClient(clientKey) {
  console.log(`\n📋 Client Details: ${clientKey}\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  let client = null;
  
  // Try to load from database
  if (dbConnected) {
    try {
      client = await getFullClient(clientKey);
      if (client) {
        console.log('📊 Source: Database\n');
      }
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
        console.log('📁 Source: Local file\n');
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
  
  // Basic Info
  console.log('📝 Basic Information:\n');
  console.log(`   Business Name: ${client.displayName || client.name || '—'}`);
  console.log(`   Client Key: ${client.clientKey}`);
  console.log(`   Industry: ${client.industry || '—'}`);
  console.log(`   Services: ${Array.isArray(client.services) ? client.services.join(', ') : (client.services || '—')}`);
  console.log(`   Location: ${client.location || '—'}`);
  console.log(`   Status: ${client.status || '—'}`);
  console.log(`   Enabled: ${client.isEnabled !== false ? 'Yes' : 'No'}`);
  console.log('');
  
  // Contact & Hours
  console.log('📞 Contact & Hours:\n');
  console.log(`   Phone: ${client.phone || client.numbers?.primary || client.numbers_json?.primary || '—'}`);
  console.log(`   Timezone: ${client.timezone || '—'}`);
  console.log(`   Business Hours: ${client.businessHours || '—'}`);
  console.log(`   Locale: ${client.locale || '—'}`);
  console.log('');
  
  // Branding
  console.log('🎨 Branding:\n');
  console.log(`   Logo: ${client.logo || client.whiteLabel?.branding?.logo || '—'}`);
  console.log(`   Primary Color: ${client.primaryColor || client.whiteLabel?.branding?.primaryColor || '—'}`);
  console.log(`   Secondary Color: ${client.secondaryColor || client.whiteLabel?.branding?.secondaryColor || '—'}`);
  console.log(`   Accent Color: ${client.accentColor || client.whiteLabel?.branding?.accentColor || '—'}`);
  console.log(`   Font: ${client.fontFamily || client.whiteLabel?.branding?.fontFamily || '—'}`);
  console.log('');
  
  // Content
  console.log('📄 Content:\n');
  console.log(`   Description: ${client.description || '—'}`);
  if (client.description) {
    console.log(`      "${client.description}"`);
  }
  console.log(`   Tagline: ${client.tagline || '—'}`);
  if (client.tagline) {
    console.log(`      "${client.tagline}"`);
  }
  console.log('');
  
  // Integrations
  console.log('🔌 Integrations:\n');
  const assistantId = client.vapi?.assistantId || client.vapi_json?.assistantId;
  console.log(`   Vapi Assistant ID: ${assistantId || '—'}`);
  console.log(`   Vapi Phone Number ID: ${client.vapi?.phoneNumberId || client.vapi_json?.phoneNumberId || '—'}`);
  console.log(`   Google Calendar ID: ${client.calendar_json?.calendarId || client.calendarId || '—'}`);
  console.log(`   Twilio Configured: ${client.twilio_json || client.sms ? 'Yes' : 'No'}`);
  console.log('');
  
  // Booking Config
  if (client.booking || client.calendar_json?.booking) {
    console.log('📅 Booking Configuration:\n');
    const booking = client.booking || client.calendar_json?.booking || {};
    console.log(`   Timezone: ${booking.timezone || '—'}`);
    console.log(`   Default Duration: ${booking.defaultDurationMin || '—'} minutes`);
    console.log(`   Slot Duration: ${booking.slotDuration || '—'} minutes`);
    console.log(`   Buffer: ${booking.bufferMinutes || '—'} minutes`);
    console.log(`   Days Ahead: ${booking.daysAhead || '—'}`);
    console.log(`   Business Hours: ${booking.businessHours || '—'}`);
    console.log('');
  }
  
  // Dashboard URL
  const baseUrl = process.env.PUBLIC_BASE_URL || process.env.BASE_URL || 'https://ai-booking-mvp.onrender.com';
  const dashboardUrl = `${baseUrl}/client-dashboard.html?client=${clientKey}`;
  console.log('🌐 Dashboard:\n');
  console.log(`   URL: ${dashboardUrl}\n`);
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Main
const clientKey = process.argv[2];

if (!clientKey) {
  console.error('Usage: node scripts/show-client.js <clientKey>');
  console.error('Example: node scripts/show-client.js stay-focused-fitness-chris');
  process.exit(1);
}

await showClient(clientKey);

