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

function pushKey(lines, key) {
  const desc = envVars[key];
  if (!desc) return;
  lines.push(`# ${desc}`, `${key}=`, '');
}

function pushCommentedKey(lines, key) {
  const desc = envVars[key];
  if (!desc) return;
  lines.push(`# ${desc}`, `# ${key}=`, '');
}

function pushSection(lines, title, keys, { commented = [] } = {}) {
  lines.push(
    '# ============================================',
    `# ${title}`,
    '# ============================================',
    ''
  );
  for (const key of keys) {
    pushKey(lines, key);
  }
  for (const key of commented) {
    pushCommentedKey(lines, key);
  }
}

// Generate .env template (empty values; descriptions as comments — safe to commit)
function generateEnvTemplate() {
  const lines = [
    '# ============================================',
    '# Environment variables template',
    '# See docs/HOW-TO-RUN.md. Regenerate: node scripts/generate-env-template.js',
    '# ============================================',
    ''
  ];

  pushSection(lines, 'CRITICAL — required for basic functionality', [
    'API_KEY',
    'DATABASE_URL'
  ]);

  pushSection(
    lines,
    'VAPI — AI calling',
    [
      'VAPI_PRIVATE_KEY',
      'VAPI_ASSISTANT_ID',
      'VAPI_PHONE_NUMBER_ID',
      'VAPI_TEMPLATE_ASSISTANT_ID'
    ],
    {
      commented: [
        'VAPI_PUBLIC_KEY',
        'VAPI_API_KEY',
        'VAPI_ORIGIN',
        'VAPI_TEST_MODE',
        'VAPI_DRY_RUN'
      ]
    }
  );

  pushSection(lines, 'TWILIO — SMS', [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_FROM_NUMBER',
    'TWILIO_MESSAGING_SERVICE_SID'
  ]);

  pushSection(lines, 'GOOGLE CALENDAR', [
    'GOOGLE_CLIENT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_PRIVATE_KEY_B64',
    'GOOGLE_CALENDAR_ID'
  ]);

  pushSection(lines, 'EMAIL', ['EMAIL_USER', 'EMAIL_PASS', 'YOUR_EMAIL']);

  pushSection(lines, 'BUSINESS SEARCH APIs (optional)', [
    'GOOGLE_PLACES_API_KEY',
    'COMPANIES_HOUSE_API_KEY',
    'GOOGLE_SEARCH_API_KEY',
    'GOOGLE_SEARCH_ENGINE_ID'
  ]);

  pushSection(lines, 'OTHER CONFIGURATION', [
    'BASE_URL',
    'PORT',
    'TZ',
    'TIMEZONE',
    'NODE_ENV',
    'TEST_PHONE_NUMBER'
  ]);

  lines.push(
    '# ============================================',
    '# ADVANCED (optional)',
    '# ============================================',
    ''
  );
  const advanced = [
    'CONSENT_LINE',
    'DEFAULT_CLIENT_KEY',
    'SLACK_WEBHOOK_URL',
    'BOOTSTRAP_CLIENTS_JSON',
    'BOOKINGS_SHEET_ID',
    'LOGISTICS_SHEET_ID',
    'CALLBACK_INBOX_EMAIL',
    'DEMO_MODE',
    'LOG_BOOKING_DEBUG',
    'RECEPTIONIST_TEST_MODE',
    'DEMO_TELEMETRY_PATH',
    'RECEPTIONIST_TELEMETRY_PATH',
    'DEMO_SCRIPT_PATH',
    'DB_TYPE',
    'LOG_LEVEL'
  ];
  for (const key of advanced) {
    pushCommentedKey(lines, key);
  }

  return lines.join('\n');
}

// Main
const template = generateEnvTemplate();
const envPath = path.join(rootDir, '.env.template');

fs.writeFileSync(envPath, template);

console.log('✅ Generated .env.template file');
console.log(`📁 Location: ${envPath}`);
console.log('\n📋 Next steps:');
console.log('1. Copy to .env (or paste values from your host, e.g. Render → Environment)');
console.log('2. See docs/HOW-TO-RUN.md for required variables and local run');
console.log('\n💡 Critical for most deployments: DATABASE_URL, API_KEY, Vapi keys, VAPI_ASSISTANT_ID');


