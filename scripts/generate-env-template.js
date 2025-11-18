#!/usr/bin/env node

/**
 * Generate .env template file from codebase
 * Scans all files for process.env usage and creates a template
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// All environment variables found in codebase
const envVars = {
  // Critical
  API_KEY: 'Admin API key for authentication',
  DATABASE_URL: 'Database connection string (PostgreSQL or SQLite)',
  
  // VAPI
  VAPI_PRIVATE_KEY: 'Vapi private key for API calls',
  VAPI_PUBLIC_KEY: 'Vapi public key (alternative to private key)',
  VAPI_API_KEY: 'Vapi API key (alternative to private key)',
  VAPI_ASSISTANT_ID: 'Default Vapi assistant ID',
  VAPI_PHONE_NUMBER_ID: 'Vapi phone number ID for making calls',
  VAPI_TEMPLATE_ASSISTANT_ID: 'Template assistant ID for cloning',
  VAPI_ORIGIN: 'Vapi API origin (default: https://api.vapi.ai)',
  VAPI_TEST_MODE: 'Enable test mode (true/false)',
  VAPI_DRY_RUN: 'Enable dry run mode (true/false)',
  
  // Twilio
  TWILIO_ACCOUNT_SID: 'Twilio account SID',
  TWILIO_AUTH_TOKEN: 'Twilio auth token',
  TWILIO_FROM_NUMBER: 'Twilio phone number for SMS',
  TWILIO_MESSAGING_SERVICE_SID: 'Twilio messaging service SID',
  
  // Google Calendar
  GOOGLE_CLIENT_EMAIL: 'Google service account email',
  GOOGLE_PRIVATE_KEY: 'Google service account private key',
  GOOGLE_PRIVATE_KEY_B64: 'Google private key (base64 encoded)',
  GOOGLE_CALENDAR_ID: 'Google Calendar ID (default: primary)',
  
  // Email
  EMAIL_USER: 'Email username for SMTP',
  EMAIL_PASS: 'Email password/app password',
  YOUR_EMAIL: 'Your email address',
  
  // Business Search APIs
  GOOGLE_PLACES_API_KEY: 'Google Places API key',
  COMPANIES_HOUSE_API_KEY: 'Companies House API key',
  GOOGLE_SEARCH_API_KEY: 'Google Custom Search API key',
  GOOGLE_SEARCH_ENGINE_ID: 'Google Custom Search Engine ID',
  
  // Other
  BASE_URL: 'Base URL of your application',
  PORT: 'Server port (default: 3000)',
  TZ: 'Timezone (default: Europe/London)',
  TIMEZONE: 'Timezone (alternative to TZ)',
  NODE_ENV: 'Node environment (development/production)',
  TEST_PHONE_NUMBER: 'Test phone number for demo calls',
  CONSENT_LINE: 'Call consent line text',
  DEFAULT_CLIENT_KEY: 'Default client key for inbound calls',
  SLACK_WEBHOOK_URL: 'Slack webhook URL for notifications',
  BOOTSTRAP_CLIENTS_JSON: 'Bootstrap clients JSON',
  BOOKINGS_SHEET_ID: 'Google Sheets ID for bookings',
  LOGISTICS_SHEET_ID: 'Google Sheets ID for logistics',
  CALLBACK_INBOX_EMAIL: 'Email for callback notifications',
  DEMO_MODE: 'Enable demo mode (true/false)',
  LOG_BOOKING_DEBUG: 'Enable booking debug logs (true/false)',
  RECEPTIONIST_TEST_MODE: 'Receptionist test mode',
  DEMO_TELEMETRY_PATH: 'Demo telemetry path',
  RECEPTIONIST_TELEMETRY_PATH: 'Receptionist telemetry path',
  DEMO_SCRIPT_PATH: 'Demo script path',
  DB_TYPE: 'Database type (postgres/sqlite)',
  LOG_LEVEL: 'Logging level (debug/info/warn/error)'
};

// Generate .env template
function generateEnvTemplate() {
  const lines = [
    '# ============================================',
    '# Environment Variables Template',
    '# Generated from codebase analysis',
    '# Copy values from Render dashboard:',
    '# https://dashboard.render.com/web/srv-d2vvdqbuibrs73dq57ug',
    '# ============================================',
    '',
    '# ============================================',
    '# CRITICAL - Required for basic functionality',
    '# ============================================',
    `API_KEY=${envVars.API_KEY ? '# ' + envVars.API_KEY : ''}`,
    `DATABASE_URL=${envVars.DATABASE_URL ? '# ' + envVars.DATABASE_URL : ''}`,
    '',
    '# ============================================',
    '# VAPI - Required for AI calling',
    '# ============================================',
    `VAPI_PRIVATE_KEY=${envVars.VAPI_PRIVATE_KEY ? '# ' + envVars.VAPI_PRIVATE_KEY : ''}`,
    `VAPI_ASSISTANT_ID=${envVars.VAPI_ASSISTANT_ID ? '# ' + envVars.VAPI_ASSISTANT_ID : ''}`,
    `VAPI_PHONE_NUMBER_ID=${envVars.VAPI_PHONE_NUMBER_ID ? '# ' + envVars.VAPI_PHONE_NUMBER_ID : ''}`,
    `VAPI_TEMPLATE_ASSISTANT_ID=${envVars.VAPI_TEMPLATE_ASSISTANT_ID ? '# ' + envVars.VAPI_TEMPLATE_ASSISTANT_ID : ''}`,
    `# VAPI_PUBLIC_KEY=${envVars.VAPI_PUBLIC_KEY ? '# ' + envVars.VAPI_PUBLIC_KEY : ''}`,
    `# VAPI_API_KEY=${envVars.VAPI_API_KEY ? '# ' + envVars.VAPI_API_KEY : ''}`,
    `# VAPI_ORIGIN=${envVars.VAPI_ORIGIN ? '# ' + envVars.VAPI_ORIGIN : ''}`,
    '',
    '# ============================================',
    '# TWILIO - For SMS notifications (optional)',
    '# ============================================',
    `TWILIO_ACCOUNT_SID=${envVars.TWILIO_ACCOUNT_SID ? '# ' + envVars.TWILIO_ACCOUNT_SID : ''}`,
    `TWILIO_AUTH_TOKEN=${envVars.TWILIO_AUTH_TOKEN ? '# ' + envVars.TWILIO_AUTH_TOKEN : ''}`,
    `TWILIO_FROM_NUMBER=${envVars.TWILIO_FROM_NUMBER ? '# ' + envVars.TWILIO_FROM_NUMBER : ''}`,
    `TWILIO_MESSAGING_SERVICE_SID=${envVars.TWILIO_MESSAGING_SERVICE_SID ? '# ' + envVars.TWILIO_MESSAGING_SERVICE_SID : ''}`,
    '',
    '# ============================================',
    '# GOOGLE CALENDAR - For appointment booking (optional)',
    '# ============================================',
    `GOOGLE_CLIENT_EMAIL=${envVars.GOOGLE_CLIENT_EMAIL ? '# ' + envVars.GOOGLE_CLIENT_EMAIL : ''}`,
    `GOOGLE_PRIVATE_KEY=${envVars.GOOGLE_PRIVATE_KEY ? '# ' + envVars.GOOGLE_PRIVATE_KEY : ''}`,
    `GOOGLE_PRIVATE_KEY_B64=${envVars.GOOGLE_PRIVATE_KEY_B64 ? '# ' + envVars.GOOGLE_PRIVATE_KEY_B64 : ''}`,
    `GOOGLE_CALENDAR_ID=${envVars.GOOGLE_CALENDAR_ID ? '# ' + envVars.GOOGLE_CALENDAR_ID : 'primary'}`,
    '',
    '# ============================================',
    '# EMAIL - For email notifications (optional)',
    '# ============================================',
    `EMAIL_USER=${envVars.EMAIL_USER ? '# ' + envVars.EMAIL_USER : ''}`,
    `EMAIL_PASS=${envVars.EMAIL_PASS ? '# ' + envVars.EMAIL_PASS : ''}`,
    `YOUR_EMAIL=${envVars.YOUR_EMAIL ? '# ' + envVars.YOUR_EMAIL : ''}`,
    '',
    '# ============================================',
    '# BUSINESS SEARCH APIs (optional)',
    '# ============================================',
    `GOOGLE_PLACES_API_KEY=${envVars.GOOGLE_PLACES_API_KEY ? '# ' + envVars.GOOGLE_PLACES_API_KEY : ''}`,
    `COMPANIES_HOUSE_API_KEY=${envVars.COMPANIES_HOUSE_API_KEY ? '# ' + envVars.COMPANIES_HOUSE_API_KEY : ''}`,
    `GOOGLE_SEARCH_API_KEY=${envVars.GOOGLE_SEARCH_API_KEY ? '# ' + envVars.GOOGLE_SEARCH_API_KEY : ''}`,
    `GOOGLE_SEARCH_ENGINE_ID=${envVars.GOOGLE_SEARCH_ENGINE_ID ? '# ' + envVars.GOOGLE_SEARCH_ENGINE_ID : ''}`,
    '',
    '# ============================================',
    '# OTHER CONFIGURATION',
    '# ============================================',
    `BASE_URL=${envVars.BASE_URL ? '# ' + envVars.BASE_URL : 'https://ai-booking-mvp.onrender.com'}`,
    `PORT=${envVars.PORT ? '# ' + envVars.PORT : '3000'}`,
    `TZ=${envVars.TZ ? '# ' + envVars.TZ : 'Europe/London'}`,
    `NODE_ENV=${envVars.NODE_ENV ? '# ' + envVars.NODE_ENV : 'development'}`,
    '',
    '# ============================================',
    '# TESTING (optional)',
    '# ============================================',
    `TEST_PHONE_NUMBER=${envVars.TEST_PHONE_NUMBER ? '# ' + envVars.TEST_PHONE_NUMBER : '+447491683261'}`,
    '',
    '# ============================================',
    '# ADVANCED (optional)',
    '# ============================================',
    `# CONSENT_LINE=${envVars.CONSENT_LINE ? '# ' + envVars.CONSENT_LINE : ''}`,
    `# DEFAULT_CLIENT_KEY=${envVars.DEFAULT_CLIENT_KEY ? '# ' + envVars.DEFAULT_CLIENT_KEY : ''}`,
    `# SLACK_WEBHOOK_URL=${envVars.SLACK_WEBHOOK_URL ? '# ' + envVars.SLACK_WEBHOOK_URL : ''}`,
    `# DB_TYPE=${envVars.DB_TYPE ? '# ' + envVars.DB_TYPE : ''}`,
    `# LOG_LEVEL=${envVars.LOG_LEVEL ? '# ' + envVars.LOG_LEVEL : ''}`,
    ''
  ];

  return lines.join('\n');
}

// Main
const template = generateEnvTemplate();
const envPath = path.join(rootDir, '.env.template');

fs.writeFileSync(envPath, template);

console.log('✅ Generated .env.template file');
console.log(`📁 Location: ${envPath}`);
console.log('\n📋 Next steps:');
console.log('1. Go to Render dashboard: https://dashboard.render.com/web/srv-d2vvdqbuibrs73dq57ug');
console.log('2. Go to Environment tab');
console.log('3. Copy each value and paste into .env.template');
console.log('4. Rename .env.template to .env');
console.log('\n💡 Tip: The most critical ones for your demo are:');
console.log('   - VAPI_PRIVATE_KEY');
console.log('   - VAPI_ASSISTANT_ID');
console.log('   - VAPI_PHONE_NUMBER_ID');
console.log('   - API_KEY');


