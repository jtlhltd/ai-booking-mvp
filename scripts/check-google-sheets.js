// scripts/check-google-sheets.js
// Test Google Sheets connection and verify setup

import 'dotenv/config';
import { readSheet, ensureHeader, HEADERS } from '../sheets.js';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

console.log('📊 Google Sheets Connection Test');
console.log('=================================');
console.log('');

if (!SPREADSHEET_ID) {
  console.error('❌ ERROR: GOOGLE_SHEETS_SPREADSHEET_ID not set');
  console.log('Please set GOOGLE_SHEETS_SPREADSHEET_ID in your .env file');
  process.exit(1);
}

console.log('📋 Spreadsheet ID:', SPREADSHEET_ID);
console.log('');

// Test 1: Check headers
console.log('1️⃣  Checking/creating headers...');
try {
  await ensureHeader(SPREADSHEET_ID);
  console.log('   ✅ Headers verified/created');
  console.log('   📝 Expected headers:', HEADERS.join(', '));
} catch (error) {
  console.log('   ❌ Error with headers:', error.message);
}
console.log('');

// Test 2: Read sheet
console.log('2️⃣  Reading sheet data...');
try {
  const data = await readSheet(SPREADSHEET_ID, 'Sheet1!A1:Z10');
  console.log('   ✅ Sheet is readable');
  if (data && data.length > 0) {
    console.log('   📊 Found', data.length, 'rows');
    if (data.length > 0) {
      console.log('   📝 First row:', data[0].slice(0, 5).join(', '), '...');
    }
  } else {
    console.log('   📊 Sheet is empty (this is OK for new sheets)');
  }
} catch (error) {
  console.log('   ❌ Error reading sheet:', error.message);
  console.log('   💡 Make sure:');
  console.log('      - Google Sheets API is enabled');
  console.log('      - Service account has access to the sheet');
  console.log('      - Spreadsheet ID is correct');
}
console.log('');

// Test 3: Check credentials
console.log('3️⃣  Checking credentials...');
const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'ai-agency-471712-7d24cc6ffd93.json';
try {
  const fs = await import('fs/promises');
  await fs.access(credsPath);
  console.log('   ✅ Credentials file found:', credsPath);
} catch (error) {
  console.log('   ⚠️  Credentials file not found:', credsPath);
  console.log('   💡 Make sure GOOGLE_APPLICATION_CREDENTIALS points to your service account JSON');
}
console.log('');

console.log('✅ Google Sheets check complete!');
console.log('');
console.log('💡 Next steps:');
console.log('   1. Submit a test lead: node scripts/test-submit-lead.js');
console.log('   2. Check the sheet manually to verify data appears');
console.log('   3. Monitor with: node scripts/monitor-system.js');



