// scripts/check-setup.js
// Check what environment variables are set and what's missing

import 'dotenv/config';

console.log('🔍 Environment Setup Checker');
console.log('============================');
console.log('');

const required = {
  'Critical': [
    'API_KEY',
    'DATABASE_URL'
  ],
  'VAPI (for calling)': [
    'VAPI_PRIVATE_KEY',
    'VAPI_ASSISTANT_ID',
    'VAPI_PHONE_NUMBER_ID'
  ],
  'Google Sheets (for data storage)': [
    'GOOGLE_SHEETS_SPREADSHEET_ID',
    'GOOGLE_APPLICATION_CREDENTIALS'
  ],
  'Twilio (for SMS)': [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN'
  ]
};

const optional = {
  'Server': [
    'PUBLIC_BASE_URL',
    'PORT',
    'NODE_ENV'
  ],
  'Google Calendar (for bookings)': [
    'GOOGLE_CLIENT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_CALENDAR_ID'
  ],
  'Email': [
    'EMAIL_USER',
    'EMAIL_PASS'
  ]
};

let allGood = true;

// Check required
console.log('📋 REQUIRED Environment Variables:');
console.log('');
for (const [category, vars] of Object.entries(required)) {
  console.log(`\n${category}:`);
  let categoryGood = true;
  vars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      const masked = varName.includes('KEY') || varName.includes('TOKEN') || varName.includes('PASS') 
        ? value.substring(0, 8) + '...' 
        : value;
      console.log(`   ✅ ${varName} = ${masked}`);
    } else {
      console.log(`   ❌ ${varName} = NOT SET`);
      categoryGood = false;
      allGood = false;
    }
  });
  if (!categoryGood) {
    console.log(`   ⚠️  ${category} is incomplete - some features may not work`);
  }
}

// Check optional
console.log('\n\n📋 OPTIONAL Environment Variables:');
console.log('');
for (const [category, vars] of Object.entries(optional)) {
  console.log(`\n${category}:`);
  vars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      console.log(`   ✅ ${varName} = ${value.substring(0, 30)}...`);
    } else {
      console.log(`   ⚪ ${varName} = not set (optional)`);
    }
  });
}

console.log('\n\n📊 Summary:');
console.log('===========');
if (allGood) {
  console.log('✅ All required environment variables are set!');
  console.log('🚀 You can run: node scripts/quick-test.js');
} else {
  console.log('❌ Some required environment variables are missing');
  console.log('');
  console.log('💡 Next Steps:');
  console.log('   1. Create a .env file in the root directory');
  console.log('   2. Add the missing variables');
  console.log('   3. Get values from:');
  console.log('      - VAPI: https://dashboard.vapi.ai');
  console.log('      - Google Sheets: Your spreadsheet URL');
  console.log('      - Twilio: https://console.twilio.com');
  console.log('');
  console.log('📝 Example .env file:');
  console.log('   API_KEY=your_api_key_here');
  console.log('   VAPI_PRIVATE_KEY=your_vapi_key');
  console.log('   GOOGLE_SHEETS_SPREADSHEET_ID=your_sheet_id');
  console.log('   ...');
}

console.log('');



