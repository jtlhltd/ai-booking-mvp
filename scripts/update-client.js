#!/usr/bin/env node

/**
 * Update Client Script
 * 
 * Updates specific fields of an existing client without re-running the full creation.
 * 
 * Usage: node scripts/update-client.js <clientKey> [options]
 * 
 * Options:
 *   --phone <number>          Update phone number
 *   --hours <hours>           Update business hours
 *   --timezone <tz>           Update timezone
 *   --description <text>      Update description
 *   --tagline <text>          Update tagline
 *   --logo <emoji>            Update logo (emoji)
 *   --color-primary <hex>     Update primary color
 *   --color-secondary <hex>   Update secondary color
 *   --color-accent <hex>      Update accent color
 *   --vapi-assistant <id>     Update VAPI assistant ID
 */

import 'dotenv/config';
import { init, getFullClient, upsertFullClient } from '../db.js';
import fs from 'fs';
import path from 'path';

// Initialize database
let dbConnected = false;
try {
  await init();
  dbConnected = true;
} catch (error) {
  console.warn('⚠️  Database not connected, updating local file only\n');
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const clientKey = args[0];
  
  if (!clientKey || clientKey.startsWith('--')) {
    return { clientKey: null, updates: {} };
  }
  
  const updates = {};
  let i = 1;
  
  while (i < args.length) {
    const arg = args[i];
    
    if (arg === '--phone' && i + 1 < args.length) {
      updates.phone = args[++i];
    } else if (arg === '--hours' && i + 1 < args.length) {
      updates.businessHours = args[++i];
    } else if (arg === '--timezone' && i + 1 < args.length) {
      updates.timezone = args[++i];
    } else if (arg === '--description' && i + 1 < args.length) {
      updates.description = args[++i];
    } else if (arg === '--tagline' && i + 1 < args.length) {
      updates.tagline = args[++i];
    } else if (arg === '--logo' && i + 1 < args.length) {
      updates.logo = args[++i];
    } else if (arg === '--color-primary' && i + 1 < args.length) {
      updates.primaryColor = args[++i];
    } else if (arg === '--color-secondary' && i + 1 < args.length) {
      updates.secondaryColor = args[++i];
    } else if (arg === '--color-accent' && i + 1 < args.length) {
      updates.accentColor = args[++i];
    } else if (arg === '--vapi-assistant' && i + 1 < args.length) {
      updates.vapiAssistantId = args[++i];
    }
    
    i++;
  }
  
  return { clientKey, updates };
}

/**
 * Update client
 */
async function updateClient(clientKey, updates) {
  console.log(`\n🔄 Updating client: ${clientKey}\n`);
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
  
  // Show what will be updated
  console.log('📝 Updates to apply:\n');
  for (const [key, value] of Object.entries(updates)) {
    const oldValue = client[key] || '—';
    console.log(`   ${key}:`);
    console.log(`      Old: ${oldValue}`);
    console.log(`      New: ${value}`);
    console.log('');
  }
  
  // Apply updates
  if (updates.phone) {
    client.phone = updates.phone;
    client.numbers = client.numbers || {};
    client.numbers.primary = updates.phone;
    client.numbers_json = client.numbers_json || {};
    client.numbers_json.primary = updates.phone;
  }
  
  if (updates.businessHours) {
    client.businessHours = updates.businessHours;
    if (client.booking) {
      client.booking.businessHours = updates.businessHours;
    }
    if (client.calendar_json?.booking) {
      client.calendar_json.booking.businessHours = updates.businessHours;
    }
  }
  
  if (updates.timezone) {
    client.timezone = updates.timezone;
    if (client.booking) {
      client.booking.timezone = updates.timezone;
    }
    if (client.calendar_json?.booking) {
      client.calendar_json.booking.timezone = updates.timezone;
    }
  }
  
  if (updates.description) {
    client.description = updates.description;
  }
  
  if (updates.tagline) {
    client.tagline = updates.tagline;
  }
  
  if (updates.logo) {
    client.logo = updates.logo;
    if (!client.whiteLabel) {
      client.whiteLabel = { branding: {} };
    }
    if (!client.whiteLabel.branding) {
      client.whiteLabel.branding = {};
    }
    client.whiteLabel.branding.logo = updates.logo;
  }
  
  if (updates.primaryColor) {
    client.primaryColor = updates.primaryColor;
    if (!client.whiteLabel) {
      client.whiteLabel = { branding: {} };
    }
    if (!client.whiteLabel.branding) {
      client.whiteLabel.branding = {};
    }
    client.whiteLabel.branding.primaryColor = updates.primaryColor;
  }
  
  if (updates.secondaryColor) {
    client.secondaryColor = updates.secondaryColor;
    if (!client.whiteLabel) {
      client.whiteLabel = { branding: {} };
    }
    if (!client.whiteLabel.branding) {
      client.whiteLabel.branding = {};
    }
    client.whiteLabel.branding.secondaryColor = updates.secondaryColor;
  }
  
  if (updates.accentColor) {
    client.accentColor = updates.accentColor;
    if (!client.whiteLabel) {
      client.whiteLabel = { branding: {} };
    }
    if (!client.whiteLabel.branding) {
      client.whiteLabel.branding = {};
    }
    client.whiteLabel.branding.accentColor = updates.accentColor;
  }
  
  if (updates.vapiAssistantId) {
    client.vapiAssistantId = updates.vapiAssistantId;
    client.vapi = client.vapi || {};
    client.vapi.assistantId = updates.vapiAssistantId;
    client.vapi_json = client.vapi_json || {};
    client.vapi_json.assistantId = updates.vapiAssistantId;
  }
  
  // Save to database
  if (dbConnected) {
    try {
      await upsertFullClient(client);
      console.log('✅ Updated in database\n');
    } catch (error) {
      console.warn(`⚠️  Could not update database: ${error.message}\n`);
    }
  }
  
  // Save to local file
  const clientFile = path.join(process.cwd(), 'demos', `.client-${clientKey}.json`);
  const demosDir = path.dirname(clientFile);
  if (!fs.existsSync(demosDir)) {
    fs.mkdirSync(demosDir, { recursive: true });
  }
  fs.writeFileSync(clientFile, JSON.stringify(client, null, 2));
  console.log('✅ Updated local file\n');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✅ Client updated successfully!\n');
}

// Main
const { clientKey, updates } = parseArgs();

if (!clientKey) {
  console.error('Usage: node scripts/update-client.js <clientKey> [options]');
  console.error('');
  console.error('Options:');
  console.error('  --phone <number>          Update phone number');
  console.error('  --hours <hours>           Update business hours');
  console.error('  --timezone <tz>           Update timezone');
  console.error('  --description <text>      Update description');
  console.error('  --tagline <text>          Update tagline');
  console.error('  --logo <emoji>            Update logo (emoji)');
  console.error('  --color-primary <hex>     Update primary color');
  console.error('  --color-secondary <hex>   Update secondary color');
  console.error('  --color-accent <hex>      Update accent color');
  console.error('  --vapi-assistant <id>     Update VAPI assistant ID');
  console.error('');
  console.error('Example:');
  console.error('  node scripts/update-client.js stay-focused-fitness-chris \\');
  console.error('    --phone "+44 7491 683261" \\');
  console.error('    --hours "9am-8pm, Mon-Sat"');
  process.exit(1);
}

if (Object.keys(updates).length === 0) {
  console.error('❌ No updates specified. Use --help to see options.');
  process.exit(1);
}

await updateClient(clientKey, updates);

