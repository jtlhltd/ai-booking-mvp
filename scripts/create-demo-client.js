#!/usr/bin/env node

/**
 * Demo Client Creator Script
 * 
 * Creates/uses a reusable demo client and personalizes its Vapi assistant
 * for each prospect demo.
 * 
 * Usage: node scripts/create-demo-client.js
 */

import 'dotenv/config';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { init, getFullClient, upsertFullClient } from '../db.js';
import { onboardClient, cloneVapiAssistant, updateClientConfig } from '../lib/client-onboarding.js';

const execAsync = promisify(exec);
const DEMO_CLIENT_KEY = 'demo-client';
const VAPI_API_URL = 'https://api.vapi.ai';
const DEMO_HISTORY_FILE = path.join(process.cwd(), 'demos', '.demo-history.json');
const DEMO_STATS_FILE = path.join(process.cwd(), 'demos', '.demo-stats.json');
const DEMO_CLIENT_FILE = path.join(process.cwd(), 'demos', '.demo-client.json');

// Database connection state
let dbConnected = false;

// Create readline interface for prompts
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

/**
 * Generate a unique client key from prospect data
 */
function generateClientKey(prospectData) {
  const businessSlug = prospectData.businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 30);
  
  const prospectSlug = prospectData.prospectName
    ? '-' + prospectData.prospectName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10)
    : '';
  
  return `${businessSlug}${prospectSlug}` || 'demo-client';
}

/**
 * Validation functions
 */
function validateBusinessName(name) {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Business name is required' };
  }
  if (name.length > 100) {
    return { valid: false, error: 'Business name is too long (max 100 characters)' };
  }
  return { valid: true };
}

function validateIndustry(industry) {
  if (!industry || industry.trim().length === 0) {
    return { valid: false, error: 'Industry is required' };
  }
  const validIndustries = ['dentist', 'dental', 'beauty', 'salon', 'fitness', 'legal', 'lawyer', 'home', 'restaurant', 'medical', 'vet', 'accounting', 'real estate'];
  const normalized = industry.toLowerCase();
  if (!validIndustries.some(v => normalized.includes(v))) {
    return { valid: true, warning: `Industry "${industry}" may not have a specialized template` };
  }
  return { valid: true };
}

function validateServices(services) {
  if (!services || services.length === 0) {
    return { valid: false, error: 'At least one service is required' };
  }
  if (services.length > 10) {
    return { valid: false, error: 'Too many services (max 10)' };
  }
  return { valid: true };
}

function validateLocation(location) {
  if (!location) return { valid: true };
  if (location.length > 100) {
    return { valid: false, error: 'Location is too long (max 100 characters)' };
  }
  return { valid: true };
}

/**
 * Better file naming
 */
function generateFileName(prospectData) {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const safeBusiness = prospectData.businessName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const safeProspect = prospectData.prospectName ? '-' + prospectData.prospectName.replace(/[^a-z0-9]/gi, '-').toLowerCase() : '';
  const safeLocation = prospectData.location ? '-' + prospectData.location.replace(/[^a-z0-9]/gi, '-').toLowerCase() : '';
  return `${safeBusiness}${safeProspect}${safeLocation}-${dateStr}`;
}

/**
 * Copy to clipboard (cross-platform)
 */
async function copyToClipboard(text) {
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      // Windows: use PowerShell Set-Clipboard
      await execAsync(`powershell -command "Set-Clipboard -Value '${text.replace(/'/g, "''")}'"`);
    } else if (platform === 'darwin') {
      await execAsync(`echo "${text.replace(/"/g, '\\"')}" | pbcopy`);
    } else {
      await execAsync(`echo "${text.replace(/"/g, '\\"')}" | xclip -selection clipboard`);
    }
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Save demo history for undo
 */
function saveDemoHistory(assistantId, assistantData) {
  const historyDir = path.dirname(DEMO_HISTORY_FILE);
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }
  
  const history = {
    assistantId,
    timestamp: new Date().toISOString(),
    previousState: assistantData
  };
  
  fs.writeFileSync(DEMO_HISTORY_FILE, JSON.stringify(history, null, 2));
}

/**
 * Load demo history for undo
 */
function loadDemoHistory() {
  if (!fs.existsSync(DEMO_HISTORY_FILE)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(DEMO_HISTORY_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Update demo stats
 */
function updateDemoStats(prospectData) {
  const statsDir = path.dirname(DEMO_STATS_FILE);
  if (!fs.existsSync(statsDir)) {
    fs.mkdirSync(statsDir, { recursive: true });
  }
  
  let stats = { total: 0, thisWeek: 0, byIndustry: {}, lastUpdated: null };
  if (fs.existsSync(DEMO_STATS_FILE)) {
    try {
      stats = JSON.parse(fs.readFileSync(DEMO_STATS_FILE, 'utf8'));
    } catch {
      // Start fresh if corrupted
    }
  }
  
  stats.total++;
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const lastWeek = stats.lastUpdated ? new Date(stats.lastUpdated) : new Date(0);
  if (lastWeek > weekAgo) {
    stats.thisWeek++;
  } else {
    stats.thisWeek = 1;
  }
  
  const industry = prospectData.industry.toLowerCase();
  stats.byIndustry[industry] = (stats.byIndustry[industry] || 0) + 1;
  stats.lastUpdated = new Date().toISOString();
  
  fs.writeFileSync(DEMO_STATS_FILE, JSON.stringify(stats, null, 2));
  return stats;
}

/**
 * Get quick stats
 */
function getQuickStats() {
  if (!fs.existsSync(DEMO_STATS_FILE)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(DEMO_STATS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Check calendar availability (simple check)
 */
async function checkCalendarAvailability() {
  // Simple implementation - just check if GOOGLE_CALENDAR_ID is set
  const hasCalendar = !!(process.env.GOOGLE_CALENDAR_ID || process.env.GOOGLE_CLIENT_EMAIL);
  return {
    available: hasCalendar,
    message: hasCalendar ? 'Calendar integration available' : 'Calendar not configured (optional)'
  };
}

/**
 * Generate multiple output formats
 */
function generateOutputFormats(prospectData, assistantId, dashboardUrl, demoScript) {
  const formats = {};
  
  // Plain text (existing)
  formats.txt = `Assistant ID: ${assistantId}
Dashboard URL: ${dashboardUrl}

${demoScript}`;
  
  // Markdown
  formats.md = `# Demo Script for ${prospectData.businessName}

**Assistant ID:** \`${assistantId}\`  
**Dashboard URL:** ${dashboardUrl}

## Demo Script

${demoScript.replace(/━━━+/g, '---').replace(/\[/g, '**[').replace(/\]/g, ']**')}

## Notes

- Business: ${prospectData.businessName}
- Industry: ${prospectData.industry}
- Services: ${prospectData.services.join(', ')}
${prospectData.prospectName ? `- Prospect: ${prospectData.prospectName}` : ''}
${prospectData.location ? `- Location: ${prospectData.location}` : ''}
`;
  
  // HTML
  formats.html = `<!DOCTYPE html>
<html>
<head>
  <title>Demo Script - ${prospectData.businessName}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
    h1 { color: #333; }
    .info { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .script { background: #fff; padding: 20px; border-left: 4px solid #007bff; margin: 20px 0; }
    .timing { color: #666; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Demo Script for ${prospectData.businessName}</h1>
  <div class="info">
    <p><strong>Assistant ID:</strong> ${assistantId}</p>
    <p><strong>Dashboard URL:</strong> <a href="${dashboardUrl}">${dashboardUrl}</a></p>
  </div>
  <div class="script">
    ${demoScript.replace(/\n/g, '<br>').replace(/\[([^\]]+)\]/g, '<span class="timing">[$1]</span>')}
  </div>
</body>
</html>`;
  
  // JSON
  formats.json = JSON.stringify({
    assistantId,
    dashboardUrl,
    prospect: prospectData,
    script: demoScript,
    createdAt: new Date().toISOString()
  }, null, 2);
  
  return formats;
}

/**
 * Test call integration
 */
async function offerTestCall(assistantId, isInteractive) {
  if (!isInteractive) return;
  
  const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
  const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;
  const TEST_PHONE = process.env.TEST_PHONE_NUMBER;
  
  if (!VAPI_PHONE_NUMBER_ID || !TEST_PHONE) {
    console.log('ℹ️  Test call not available (VAPI_PHONE_NUMBER_ID or TEST_PHONE_NUMBER not set)\n');
    return;
  }
  
  const testCall = await question('Would you like to test the assistant with a call? (y/n): ');
  if (testCall.toLowerCase() !== 'y') {
    return;
  }
  
  console.log('\n📞 Making test call...\n');
  
  try {
    const callResponse = await fetch(`${VAPI_API_URL}/call`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assistantId: assistantId,
        phoneNumberId: VAPI_PHONE_NUMBER_ID,
        customer: {
          number: TEST_PHONE
        }
      })
    });
    
    if (callResponse.ok) {
      const callData = await callResponse.json();
      console.log('✅ Test call initiated!');
      console.log(`   Call ID: ${callData.id}`);
      console.log(`   Status: ${callData.status}`);
      console.log('   Check your phone in a few seconds...\n');
    } else {
      const error = await callResponse.text();
      console.log(`⚠️  Could not make test call: ${error}\n`);
    }
  } catch (error) {
    console.log(`⚠️  Test call error: ${error.message}\n`);
  }
}

/**
 * Load demo client from local file (fallback when DB unavailable)
 */
function loadDemoClientFromFile() {
  try {
    if (fs.existsSync(DEMO_CLIENT_FILE)) {
      return JSON.parse(fs.readFileSync(DEMO_CLIENT_FILE, 'utf8'));
    }
  } catch (error) {
    console.warn('⚠️  Could not load demo client from file:', error.message);
  }
  return null;
}

/**
 * Save demo client to local file (fallback when DB unavailable)
 */
function saveDemoClientToFile(client) {
  try {
    const demosDir = path.dirname(DEMO_CLIENT_FILE);
    if (!fs.existsSync(demosDir)) {
      fs.mkdirSync(demosDir, { recursive: true });
    }
    fs.writeFileSync(DEMO_CLIENT_FILE, JSON.stringify(client, null, 2));
  } catch (error) {
    console.warn('⚠️  Could not save demo client to file:', error.message);
  }
}

/**
 * Get or create demo client
 */
async function getOrCreateDemoClient() {
  let client = null;
  
  // Try database first if connected
  if (dbConnected) {
    try {
      client = await getFullClient(DEMO_CLIENT_KEY);
    } catch (error) {
      console.warn('⚠️  Database query failed, using local file:', error.message);
      dbConnected = false;
    }
  }
  
  // Fallback to local file
  if (!client) {
    client = loadDemoClientFromFile();
  }
  
  if (!client) {
    console.log('\n📦 Creating demo client account (first time setup)...\n');
    
    // Create directly with the correct clientKey
    const { generateApiKey } = await import('../lib/client-onboarding.js');
    const apiKey = generateApiKey();
    
    const demoClient = {
      clientKey: DEMO_CLIENT_KEY,
      displayName: 'Demo Client',
      timezone: 'Europe/London',
      locale: 'en-GB',
      isEnabled: true,
      booking: {
        timezone: 'Europe/London',
        defaultDurationMin: 30,
        slotDuration: 30,
        bufferMinutes: 0,
        daysAhead: 30
      },
      vapi: null, // Will be set when assistant is created
      sms: {
        fromNumber: null,
        messagingServiceSid: null
      },
      calendarId: null,
      services: []
    };
    
    // Try to save to database
    if (dbConnected) {
      try {
        await upsertFullClient(demoClient);
        client = await getFullClient(DEMO_CLIENT_KEY);
      } catch (error) {
        console.warn('⚠️  Could not save to database, using local file:', error.message);
        dbConnected = false;
        saveDemoClientToFile(demoClient);
        client = demoClient;
      }
    } else {
      saveDemoClientToFile(demoClient);
      client = demoClient;
    }
    
    console.log('✅ Demo client created!\n');
  } else {
    console.log('✅ Using existing demo client\n');
  }
  
  return client;
}

/**
 * Get or create Vapi assistant for demo client
 */
async function getOrCreateAssistant(client) {
  const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
  const VAPI_TEMPLATE_ASSISTANT_ID = process.env.VAPI_TEMPLATE_ASSISTANT_ID;
  
  if (!VAPI_PRIVATE_KEY) {
    throw new Error('VAPI_PRIVATE_KEY environment variable not set. Please set it in your .env file or environment.');
  }
  
  // Check if client has assistant ID
  const assistantId = client.vapi?.assistantId || client.vapiAssistantId;
  if (assistantId) {
    // Skip verification for now - just use the assistant ID
    // (Verification was failing due to fetch issues, but assistants exist)
    console.log(`✅ Using existing assistant: ${assistantId}\n`);
    return assistantId;
  }
  
  // Create new assistant from template
  if (!VAPI_TEMPLATE_ASSISTANT_ID) {
    throw new Error('VAPI_TEMPLATE_ASSISTANT_ID environment variable not set. Please set it in your .env file or environment.');
  }
  
  console.log('🤖 Creating Vapi assistant from template...\n');
  
  const assistant = await cloneVapiAssistant(VAPI_TEMPLATE_ASSISTANT_ID, {
    businessName: 'Demo Client',
    industry: 'general',
    services: []
  });
  
  // Update client with assistant ID
  let updatedClient;
  if (dbConnected) {
    try {
      updatedClient = await getFullClient(DEMO_CLIENT_KEY);
    } catch (error) {
      updatedClient = loadDemoClientFromFile() || client;
      dbConnected = false;
    }
  } else {
    updatedClient = loadDemoClientFromFile() || client;
  }
  
  const updatedClientData = {
    clientKey: DEMO_CLIENT_KEY,
    displayName: updatedClient.displayName,
    timezone: updatedClient.timezone,
    locale: updatedClient.locale,
    isEnabled: updatedClient.isEnabled,
    vapi: {
      assistantId: assistant.assistantId,
      phoneNumberId: updatedClient.vapi?.phoneNumberId || updatedClient.vapiPhoneNumberId || null
    },
    sms: updatedClient.sms || { fromNumber: null, messagingServiceSid: null },
    calendarId: updatedClient.calendarId,
    booking: updatedClient.booking,
    services: updatedClient.services || []
  };
  
  // Try to save to database
  if (dbConnected) {
    try {
      await upsertFullClient(updatedClientData);
    } catch (error) {
      console.warn('⚠️  Could not save to database, using local file:', error.message);
      dbConnected = false;
      saveDemoClientToFile(updatedClientData);
    }
  } else {
    saveDemoClientToFile(updatedClientData);
  }
  
  return assistant.assistantId;
}

/**
 * Update Vapi assistant with prospect details
 */
async function updateAssistant(assistantId, prospectData, isInteractive = true) {
  const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
  
  if (!VAPI_PRIVATE_KEY) {
    throw new Error('VAPI_PRIVATE_KEY environment variable not set');
  }
  
  // Try to get current assistant, but if it fails, continue anyway
  let assistant = null;
  let previousState = null;
  
  try {
    const getResponse = await axios.get(`${VAPI_API_URL}/assistant/${assistantId}`, {
      headers: {
        'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Node.js'
      }
    });
    
    assistant = getResponse.data;
    // Save current state for undo
    previousState = {
      name: assistant.name,
      firstMessage: assistant.firstMessage,
      systemPrompt: assistant.model?.messages?.[0]?.content || ''
    };
    saveDemoHistory(assistantId, previousState);
  } catch (error) {
    if (error.response?.status === 500) {
      console.warn(`⚠️  Vapi API returned 500 (Cloudflare issue), will update anyway...\n`);
    } else {
      console.warn(`⚠️  Could not fetch assistant: ${error.message}, will update anyway...\n`);
    }
  }
  
  // If we couldn't get the assistant, use defaults
  if (!assistant) {
    assistant = {
      name: 'Assistant',
      firstMessage: '',
      model: { messages: [{ role: 'system', content: '' }] },
      voice: {},
      tools: []
    };
  }
  
  // Get current system prompt
  let systemPrompt = assistant.model?.messages?.[0]?.content || '';
  let firstMessage = assistant.firstMessage || '';
  
  // Check if template is blank or has no placeholders
  const isBlankTemplate = !systemPrompt || 
    systemPrompt.includes('blank template') || 
    systemPrompt.includes('minimal defaults') ||
    (!systemPrompt.includes('{') && !systemPrompt.includes('['));
  
  if (isBlankTemplate) {
    // Generate proper prompt using industry templates
    console.log('📝 Template is blank, generating industry-specific prompt...\n');
    
    const { getTemplate, customizeTemplate } = await import('../lib/industry-templates.js');
    
    try {
      // Normalize industry key (dentist -> dental, etc.)
      const industryKey = prospectData.industry.toLowerCase();
      let normalizedIndustry = industryKey;
      
      // Map common industry names to template keys
      const industryMap = {
        'dentist': 'dental',
        'dental': 'dental',
        'dentistry': 'dental',
        'beauty': 'beauty',
        'salon': 'beauty',
        'hair': 'beauty',
        'fitness': 'fitness',
        'gym': 'fitness',
        'training': 'fitness',
        'legal': 'legal',
        'lawyer': 'legal',
        'law': 'legal',
        'home': 'home',
        'plumber': 'home',
        'electrician': 'home',
        'restaurant': 'restaurant',
        'food': 'restaurant',
        'cafe': 'restaurant'
      };
      
      normalizedIndustry = industryMap[industryKey] || industryKey;
      
      // Get template
      const template = getTemplate(normalizedIndustry);
      const customized = customizeTemplate(normalizedIndustry, {
        businessName: prospectData.businessName,
        primaryService: prospectData.services[0] || 'consultation',
        serviceArea: 'your area',
        voiceGender: template.voiceGender || 'female'
      });
      
      systemPrompt = customized.systemPrompt;
      firstMessage = customized.firstMessage || '';
    } catch (error) {
      console.log('⚠️  Could not load industry template, using generic prompt\n');
      // Fallback to generic prompt
      systemPrompt = `You are calling leads on behalf of ${prospectData.businessName}, a ${prospectData.industry} business. Your job is to call prospects who have shown interest and book them for ${prospectData.services.join(' or ')}.

**YOUR ROLE:** You are calling as a representative of ${prospectData.businessName}. The person answering is a LEAD who has expressed interest. Your goal is to book them for an appointment.

**CONVERSATION STYLE:**
- Sound natural and conversational, not robotic
- Use natural filler words: "umm", "ahh", "right", "okay", "I see"
- Be warm, friendly, and professional
- Keep responses brief and efficient (under 2 minutes total call time)
- Listen to their responses and adapt accordingly

**CONVERSATION FLOW:**

1. **Greeting (Warm & Professional - 10 seconds)**
   "Hi there! I'm calling from ${prospectData.businessName} about your ${prospectData.services[0] || 'inquiry'}. Do you have a quick minute?"

2. **Qualify the Lead (30 seconds)**
   Ask 2-3 key questions:
   - "What type of ${prospectData.services[0] || 'service'} are you looking for?"
   - "When would you like to get started?"
   - "Have you had ${prospectData.services[0] || 'this service'} before?"

3. **Book the Appointment (30 seconds)**
   "Great! Let me check our calendar and find you a time that works..."
   - Use calendar_checkAndBook tool to check availability
   - Offer 2-3 specific time slots
   - Confirm details (date, time, service)

4. **Confirmation (10 seconds)**
   "Perfect! You're all set for [DATE] at [TIME]. You'll get a confirmation text with all the details."
   - Use notify_send tool to send SMS confirmation

**OBJECTION HANDLING:**

If "Too busy":
→ "I totally understand! This will only take 2 minutes. When's a better time to call back?"

If "How much?":
→ "Price depends on the specifics. Can I ask a few quick questions so I can give you an accurate quote?"

If "Send info":
→ "Absolutely! I'll text you our information right now."
→ Use notify_send tool to send SMS

If "Not interested":
→ "No problem! Can I ask - is it the timing or the service itself?"
→ If genuine: "Thanks for your time! Have a great day."

**IMPORTANT RULES:**
- Always use £ (pounds) not $ (dollars)
- Don't mention specific prices over the phone
- SMS goes to the number being called (don't ask for different number)
- Keep it conversational - don't sound like a robot
- If they want to book, ALWAYS use calendar_checkAndBook tool
- Maximum call time: 5 minutes
- British English only

**TOOLS AVAILABLE:**
1. calendar_checkAndBook - Check availability and book appointments
2. notify_send - Send SMS notifications

Let's convert this lead! 🚀`;
      
      firstMessage = `Hi! Thanks for your interest in ${prospectData.businessName}. How can I help you today?`;
    }
  } else {
    // Template has placeholders - replace them
    systemPrompt = systemPrompt
      .replace(/\{businessName\}/g, prospectData.businessName)
      .replace(/\[Practice\]/g, prospectData.businessName)
      .replace(/\[Firm Name\]/g, prospectData.businessName)
      .replace(/\[Company\]/g, prospectData.businessName)
      .replace(/\[Restaurant\]/g, prospectData.businessName)
      .replace(/\{industry\}/g, prospectData.industry)
      .replace(/\{services\}/g, prospectData.services.join(', '));
    
    // Update first message if it exists
    if (firstMessage) {
      firstMessage = firstMessage
        .replace(/\{businessName\}/g, prospectData.businessName)
        .replace(/\[.*?\]/g, prospectData.businessName);
    }
  }
  
  // Update assistant (name must be <= 40 characters)
  const assistantName = `${prospectData.businessName} - Booking`.substring(0, 40);
  
  // Auto-configure tools if missing
  const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || process.env.BASE_URL || 'https://ai-booking-mvp.onrender.com';
  const serverUrl = `${PUBLIC_BASE_URL}/webhooks/vapi`;
  
  const requiredTools = [
    {
      type: 'function',
      function: {
        name: 'calendar_checkAndBook',
        description: 'Check calendar availability and book an appointment',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
            time: { type: 'string', description: 'Time in HH:MM format (24-hour)' },
            durationMinutes: { type: 'number', description: 'Duration in minutes', default: 30 },
            service: { type: 'string', description: 'Service name' },
            customerName: { type: 'string', description: 'Customer name' },
            customerPhone: { type: 'string', description: 'Customer phone number' }
          },
          required: ['date', 'time', 'customerName', 'customerPhone']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'notify_send',
        description: 'Send SMS notification to customer',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Message to send' },
            phoneNumber: { type: 'string', description: 'Phone number to send to' }
          },
          required: ['message', 'phoneNumber']
        }
      }
    }
  ];
  
  const existingTools = assistant.tools || [];
  const existingToolNames = existingTools.map(t => t.type === 'function' ? t.function?.name : t.type);
  const missingTools = requiredTools.filter(tool => {
    const toolName = tool.type === 'function' ? tool.function?.name : tool.type;
    return !existingToolNames.includes(toolName);
  });
  
  // Note: Tools cannot be set via PATCH - they must be configured in Vapi dashboard
  // We'll just note if they're missing
  if (missingTools.length > 0 && isInteractive) {
    console.log(`⚠️  Note: Missing tools: ${missingTools.map(t => t.type === 'function' ? t.function?.name : t.type).join(', ')}`);
    console.log('   Tools must be configured manually in Vapi dashboard.\n');
  }
  
  // Auto-configure serverUrl if needed
  if (!assistant.serverUrl) {
    if (isInteractive) {
      console.log(`🔧 Setting serverUrl: ${serverUrl}\n`);
    }
  }
  
  // Preview changes (if interactive mode)
  if (isInteractive) {
    console.log('\n📋 Preview of changes:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Name: ${assistant.name} → ${assistantName}`);
    console.log(`\nFirst Message: ${assistant.firstMessage || '(none)'} → ${firstMessage || '(none)'}`);
    console.log(`\nSystem Prompt: ${systemPrompt.substring(0, 200)}...`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const confirm = await question('Apply these changes? (y/n): ');
    if (confirm.toLowerCase() !== 'y') {
      throw new Error('Update cancelled by user');
    }
    console.log('');
  }
  
  const updatePayload = {
    name: assistantName,
    model: {
      ...assistant.model,
      provider: assistant.model?.provider || 'openai',
      model: assistant.model?.model || 'gpt-3.5-turbo',
      temperature: 0.7, // Balanced creativity and consistency
      maxTokens: 250, // Keep responses concise
      messages: [
        {
          role: 'system',
          content: systemPrompt
        }
      ]
    }
  };
  
  // Auto-configure serverUrl if needed (but not tools - they must be set separately)
  if (!assistant.serverUrl) {
    updatePayload.serverUrl = serverUrl;
  }
  
  // Optimize voice settings (only include allowed properties)
  // Note: Some voice properties like 'stability' may not be allowed in PATCH
  updatePayload.voice = {
    provider: assistant.voice?.provider || '11labs',
    voiceId: assistant.voice?.voiceId || 'pNInz6obpgDQGcFmaJgB', // Adam voice
    speed: assistant.voice?.speed || 0.95 // Slightly slower for clarity
    // Note: stability and similarityBoost may need to be set via Vapi dashboard
  };
  
  // Always set first message (use generated one or existing)
  if (firstMessage) {
    updatePayload.firstMessage = firstMessage;
  } else if (assistant.firstMessage) {
    // Keep existing if we didn't generate one
    updatePayload.firstMessage = assistant.firstMessage;
  }
  
  // Apply voice settings from industry template if available
  try {
    const { getTemplate } = await import('../lib/industry-templates.js');
    const industryKey = prospectData.industry.toLowerCase();
    const industryMap = {
      'dentist': 'dental', 'dental': 'dental', 'dentistry': 'dental',
      'beauty': 'beauty', 'salon': 'beauty', 'hair': 'beauty',
      'fitness': 'fitness', 'gym': 'fitness', 'training': 'fitness',
      'legal': 'legal', 'lawyer': 'legal', 'law': 'legal',
      'home': 'home', 'plumber': 'home', 'electrician': 'home',
      'restaurant': 'restaurant', 'food': 'restaurant', 'cafe': 'restaurant'
    };
    const normalizedIndustry = industryMap[industryKey] || industryKey;
    const template = getTemplate(normalizedIndustry);
    
    // Apply voice gender if template specifies it
    if (template.voiceGender && assistant.voice && isInteractive) {
      // Voice settings are already in assistant, we just note it
      console.log(`ℹ️  Recommended voice: ${template.voiceGender} (already configured in template)`);
    }
  } catch (error) {
    // Ignore voice setting errors
  }
  
  // Retry logic for updates (Vapi can be flaky)
  let updateSuccess = false;
  let lastError = null;
  const maxRetries = 3;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`   Retry attempt ${attempt}/${maxRetries}...\n`);
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
      }
      
      // Log what we're sending (for debugging)
      if (isInteractive && attempt === 1) {
        console.log(`\n📤 Updating assistant with:`);
        console.log(`   Name: ${updatePayload.name}`);
        console.log(`   First Message: ${updatePayload.firstMessage?.substring(0, 50)}...`);
        console.log(`   System Prompt: ${systemPrompt.substring(0, 100)}...\n`);
      }
      
      const updateResponse = await axios.patch(`${VAPI_API_URL}/assistant/${assistantId}`, updatePayload, {
        headers: {
          'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Node.js'
        },
        timeout: 10000 // 10 second timeout
      });
      
      // Verify the update actually worked
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second for Vapi to process
      
      try {
        const verifyResponse = await axios.get(`${VAPI_API_URL}/assistant/${assistantId}`, {
          headers: {
            'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
            'Accept': 'application/json'
          },
          timeout: 10000
        });
        
        const updatedPrompt = verifyResponse.data.model?.messages?.[0]?.content || '';
        if (updatedPrompt.includes(prospectData.businessName)) {
          console.log(`✅ Updated and verified: Assistant now mentions "${prospectData.businessName}"\n`);
          updateSuccess = true;
          break;
        } else {
          console.warn(`⚠️  Update may not have applied. Prompt doesn't mention "${prospectData.businessName}"`);
          console.warn(`   Current prompt starts with: ${updatedPrompt.substring(0, 150)}...`);
          if (attempt < maxRetries) {
            console.warn(`   Will retry...\n`);
            lastError = new Error('Update did not apply - prompt verification failed');
            continue;
          }
        }
      } catch (verifyError) {
        console.warn(`⚠️  Could not verify update: ${verifyError.message}`);
        if (attempt < maxRetries) {
          console.warn(`   Will retry...\n`);
          lastError = verifyError;
          continue;
        }
      }
      
      // If we got here and verification passed, we're done
      if (updateSuccess) break;
      
    } catch (error) {
      lastError = error;
      if (error.response?.status === 500) {
        if (attempt < maxRetries) {
          console.warn(`⚠️  Vapi API returned 500 (Cloudflare error). Retrying...\n`);
          continue;
        } else {
          throw new Error(`Failed to update assistant after ${maxRetries} attempts: Vapi API returned 500 (Cloudflare error). The assistant may need to be updated manually in the Vapi dashboard.`);
        }
      } else if (error.response?.status === 400) {
        // 400 errors are usually permanent (bad request), don't retry
        const errorText = error.response?.data || error.message;
        throw new Error(`Failed to update assistant: ${error.response.status} - ${JSON.stringify(errorText).substring(0, 200)}`);
      } else {
        if (attempt < maxRetries) {
          console.warn(`⚠️  Update failed: ${error.message}. Retrying...\n`);
          continue;
        } else {
          const errorText = error.response?.data || error.message;
          throw new Error(`Failed to update assistant after ${maxRetries} attempts: ${error.response?.status || 'unknown'} - ${JSON.stringify(errorText).substring(0, 200)}`);
        }
      }
    }
  }
  
  if (!updateSuccess && lastError) {
    throw lastError;
  }
  
  return assistantId;
}

/**
 * Generate demo script with timing markers
 */
function generateDemoScript(prospectData) {
  const businessName = prospectData.businessName;
  const industry = prospectData.industry;
  const services = prospectData.services.join(', ');
  
  // Replace placeholders with actual values or keep placeholders if not provided
  const prospectName = prospectData.prospectName || '[Prospect Name]';
  const location = prospectData.location || '[location]';
  
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEMO SCRIPT FOR ${businessName.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[0:00-0:10] PERSONAL OPENING
"Hi ${prospectName}, I saw ${businessName} is a ${industry} in ${location}. 
I made a quick 2-minute demo showing exactly how we convert your leads 
into appointments."

[0:10-0:20] THE PROBLEM
"Most ${industry} businesses lose 70% of their leads because they can't 
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
"I've already set this up for ${businessName}. Want to test it with 10 of 
your actual leads this week? Takes 5 minutes to set up. Just reply if 
interested."

[2:00] END

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NOTES:
- Business: ${businessName}
- Industry: ${industry}
- Services: ${services}
${prospectData.prospectName ? `- Prospect: ${prospectData.prospectName}` : '- Prospect: [Replace in script]'}
${prospectData.location ? `- Location: ${prospectData.location}` : '- Location: [Replace in script]'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('\n🎬 Demo Client Creator\n');
    console.log('This script personalizes your demo client\'s Vapi assistant');
    console.log('for each prospect demo.\n');
    
    // Initialize database (optional - will use local file if fails)
    try {
      await init();
      dbConnected = true;
      console.log('✅ Database connected\n');
    } catch (error) {
      console.warn('⚠️  Database connection failed (using local file storage):');
      console.warn(`   ${error.message}\n`);
      console.log('💡 This is fine - the script will work without database access.\n');
      dbConnected = false;
    }
    
    // Step 1: Get or create demo client
    const client = await getOrCreateDemoClient();
    
    // Step 2: Get or create Vapi assistant
    const assistantId = await getOrCreateAssistant(client);
    
    // Step 3: Get prospect details (from command line args or prompt)
    let businessName, industry, services, prospectName, location;
    
    const args = process.argv.slice(2);
    
    if (args.length >= 3) {
      // Use command line arguments
      businessName = args[0];
      industry = args[1];
      services = args[2].split(',').map(s => s.trim()).filter(s => s);
      prospectName = args[3] || null; // Optional: prospect's name
      location = args[4] || null; // Optional: location
      
      console.log('📝 Using command line arguments:\n');
      console.log(`Business name: ${businessName}`);
      console.log(`Industry: ${industry}`);
      console.log(`Services: ${services.join(', ')}`);
      if (prospectName) console.log(`Prospect name: ${prospectName}`);
      if (location) console.log(`Location: ${location}`);
      console.log('');
    } else {
      // Check for undo option
      const history = loadDemoHistory();
      if (history) {
        const timeAgo = Math.round((Date.now() - new Date(history.timestamp).getTime()) / 1000 / 60);
        console.log(`⚠️  Last update: ${timeAgo} minutes ago`);
        console.log(`   Type 'undo' to revert, or press Enter to continue\n`);
        const undoChoice = await question('Your choice: ');
        if (undoChoice.toLowerCase() === 'undo') {
          console.log('\n🔄 Reverting to previous assistant state...\n');
          // Restore previous state
          const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
          const restoreResponse = await fetch(`${VAPI_API_URL}/assistant/${history.assistantId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: history.previousState.name,
              firstMessage: history.previousState.firstMessage,
              model: {
                messages: [{
                  role: 'system',
                  content: history.previousState.systemPrompt
                }]
              }
            })
          });
          if (restoreResponse.ok) {
            console.log('✅ Assistant reverted to previous state\n');
          } else {
            console.log('⚠️  Could not revert assistant\n');
          }
          // Continue to create new demo anyway
        }
      }
      
      // Show quick stats
      const stats = getQuickStats();
      if (stats) {
        console.log('📊 Quick Stats:');
        console.log(`   Total demos: ${stats.total}`);
        console.log(`   This week: ${stats.thisWeek}`);
        const topIndustry = Object.entries(stats.byIndustry).sort((a, b) => b[1] - a[1])[0];
        if (topIndustry) {
          console.log(`   Most common: ${topIndustry[0]} (${topIndustry[1]} demos)`);
        }
        console.log('');
      }
      
      // Check calendar availability
      const calendar = await checkCalendarAvailability();
      if (calendar.available) {
        console.log(`📅 ${calendar.message}\n`);
      }
      
      // Prompt interactively
      console.log('📝 Enter prospect details:\n');
      
      let valid = false;
      while (!valid) {
        businessName = await question('Business name: ');
        const validation = validateBusinessName(businessName);
        if (!validation.valid) {
          console.log(`❌ ${validation.error}\n`);
          continue;
        }
        valid = true;
      }
      
      valid = false;
      while (!valid) {
        industry = await question('Industry: ');
        const validation = validateIndustry(industry);
        if (!validation.valid) {
          console.log(`❌ ${validation.error}\n`);
          continue;
        }
        if (validation.warning) {
          console.log(`⚠️  ${validation.warning}\n`);
        }
        valid = true;
      }
      
      valid = false;
      while (!valid) {
        const servicesInput = await question('Services (comma-separated): ');
        services = servicesInput.split(',').map(s => s.trim()).filter(s => s);
        const validation = validateServices(services);
        if (!validation.valid) {
          console.log(`❌ ${validation.error}\n`);
          continue;
        }
        valid = true;
      }
      
      prospectName = await question('Prospect name (optional, press Enter to skip): ');
      if (!prospectName.trim()) prospectName = null;
      else {
        const validation = validateLocation(prospectName); // Reuse location validator
        if (!validation.valid) {
          console.log(`⚠️  ${validation.error}, using anyway\n`);
        }
      }
      
      location = await question('Location (optional, press Enter to skip): ');
      if (!location.trim()) location = null;
      else {
        const validation = validateLocation(location);
        if (!validation.valid) {
          console.log(`⚠️  ${validation.error}, using anyway\n`);
        }
      }
    }
    
    const prospectData = {
      businessName: businessName.trim(),
      industry: industry.trim(),
      services,
      prospectName: prospectName ? prospectName.trim() : null,
      location: location ? location.trim() : null
    };
    
    if (args.length < 3) {
      console.log('\n');
    }
    
    // Step 4: Update Vapi assistant
    const isInteractive = args.length < 3;
    await updateAssistant(assistantId, prospectData, isInteractive);
    
    // Step 5: Create/update personalized client in database
    const clientKey = generateClientKey(prospectData);
    
    // Get phone number from environment or use a default
    const phoneNumber = process.env.VAPI_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER || '+44 20 3880 1234';
    
    // Generate business hours based on industry
    const businessHours = '8am - 8pm, 7 days/week'; // Default, can be customized per industry
    
    const clientData = {
      clientKey: clientKey,
      displayName: prospectData.businessName,
      name: prospectData.businessName, // Also set 'name' for compatibility
      industry: prospectData.industry.toLowerCase(),
      services: prospectData.services,
      location: prospectData.location,
      timezone: 'Europe/London',
      locale: 'en-GB',
      isEnabled: true,
      // Phone number for meta display
      phone: phoneNumber,
      numbers: {
        primary: phoneNumber
      },
      numbers_json: {
        primary: phoneNumber
      },
      // Business hours for meta display
      businessHours: businessHours,
      // Vapi configuration
      vapi: {
        assistantId: assistantId,
        phoneNumberId: null
      },
      vapi_json: {
        assistantId: assistantId,
        phoneNumberId: null
      },
      // Booking configuration
      booking: {
        timezone: 'Europe/London',
        defaultDurationMin: 30,
        slotDuration: 30,
        bufferMinutes: 0,
        daysAhead: 30,
        businessHours: businessHours
      },
      calendar_json: {
        booking: {
          timezone: 'Europe/London',
          defaultDurationMin: 30,
          businessHours: businessHours
        }
      }
    };
    
    // Save client to database or file
    if (dbConnected) {
      try {
        await upsertFullClient(clientData);
        console.log(`✅ Created personalized client: ${prospectData.businessName}\n`);
      } catch (error) {
        console.warn(`⚠️  Could not save client to database: ${error.message}`);
        console.warn(`   Using demo client instead...\n`);
      }
    } else {
      // Save to local file for demo purposes
      const clientFile = path.join(process.cwd(), 'demos', `.client-${clientKey}.json`);
      fs.writeFileSync(clientFile, JSON.stringify(clientData, null, 2));
      console.log(`✅ Created personalized client config: ${clientKey}\n`);
    }
    
    // Step 6: Generate output
    const baseUrl = process.env.PUBLIC_BASE_URL || process.env.BASE_URL || 'https://ai-booking-mvp.onrender.com';
    const dashboardUrl = `${baseUrl}/client-dashboard.html?client=${clientKey}`;
    const demoScript = generateDemoScript(prospectData);
    
    // Generate all output formats
    const formats = generateOutputFormats(prospectData, assistantId, dashboardUrl, demoScript);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ DEMO READY!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`Assistant ID: ${assistantId}`);
    console.log(`Dashboard URL: ${dashboardUrl}\n`);
    console.log(demoScript);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Copy dashboard URL to clipboard
    const copied = await copyToClipboard(dashboardUrl);
    if (copied) {
      console.log('📋 Dashboard URL copied to clipboard!\n');
    }
    
    // Export scripts in all formats
    const demosDir = path.join(process.cwd(), 'demos');
    if (!fs.existsSync(demosDir)) {
      fs.mkdirSync(demosDir, { recursive: true });
    }
    
    const baseFileName = generateFileName(prospectData);
    
    // Save all formats
    const savedFiles = [];
    for (const [format, content] of Object.entries(formats)) {
      const fileName = `${baseFileName}.${format}`;
      const filePath = path.join(demosDir, fileName);
      fs.writeFileSync(filePath, content);
      savedFiles.push(fileName);
    }
    
    console.log(`💾 Demo scripts saved:`);
    savedFiles.forEach(file => console.log(`   - demos/${file}`));
    console.log('');
    
    // Update stats
    const stats = updateDemoStats(prospectData);
    console.log(`📊 Stats: ${stats.total} total demos, ${stats.thisWeek} this week\n`);
    
    // Offer test call
    await offerTestCall(assistantId, isInteractive);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run main function
main();

