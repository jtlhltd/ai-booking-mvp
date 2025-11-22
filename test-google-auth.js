// Test Google Calendar authentication
import dotenv from 'dotenv';
dotenv.config();

import { google } from 'googleapis';

async function testAuth() {
  try {
    // Load credentials from GOOGLE_SA_JSON_BASE64
    if (!process.env.GOOGLE_SA_JSON_BASE64) {
      console.error('❌ GOOGLE_SA_JSON_BASE64 not set');
      process.exit(1);
    }

    const saJson = JSON.parse(Buffer.from(process.env.GOOGLE_SA_JSON_BASE64, 'base64').toString('utf8'));
    const clientEmail = saJson.client_email;
    let privateKey = saJson.private_key;

    // Fix newlines if needed
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    console.log('✅ Loaded service account:', clientEmail);
    console.log('✅ Key ID:', saJson.private_key_id);
    console.log('✅ Key length:', privateKey.length);

    // Create JWT auth
    const auth = new google.auth.JWT(
      clientEmail,
      null,
      privateKey,
      [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events'
      ]
    );

    console.log('\n🔄 Attempting to authorize...');
    await auth.authorize();
    console.log('✅ Authorization successful!');

    // Test calendar access
    const calendar = google.calendar({ version: 'v3', auth });
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    console.log(`\n🔄 Testing calendar access: ${calendarId}`);
    try {
      const calendarInfo = await calendar.calendars.get({ calendarId });
      console.log('✅ Calendar access successful!');
      console.log('   Calendar name:', calendarInfo.data.summary);
      console.log('   Calendar timezone:', calendarInfo.data.timeZone);
    } catch (calError) {
      console.error('❌ Calendar access failed:', calError.message);
      if (calError.message.includes('not found')) {
        console.error('\n💡 SOLUTION: Share the calendar with the service account email:');
        console.error(`   ${clientEmail}`);
        console.error('\n   Steps:');
        console.error('   1. Open Google Calendar');
        console.error('   2. Find your calendar in the left sidebar');
        console.error('   3. Click the three dots → Settings and sharing');
        console.error(`   4. Under "Share with specific people", click "Add people"`);
        console.error(`   5. Add: ${clientEmail}`);
        console.error('   6. Give it "Make changes to events" permission');
        console.error('   7. Click "Send"');
      } else if (calError.message.includes('permission')) {
        console.error('\n💡 SOLUTION: The service account needs "Make changes to events" permission on the calendar.');
      }
    }

    // Test listing events
    console.log(`\n🔄 Testing event listing...`);
    try {
      const events = await calendar.events.list({
        calendarId,
        maxResults: 1,
        timeMin: new Date().toISOString()
      });
      console.log('✅ Event listing successful!');
      console.log('   Found', events.data.items?.length || 0, 'upcoming events');
    } catch (eventError) {
      console.error('❌ Event listing failed:', eventError.message);
    }

  } catch (error) {
    console.error('\n❌ Authentication failed:', error.message);
    console.error('\nError details:', {
      name: error.name,
      code: error.code,
      status: error.status,
      response: error.response?.data
    });

    if (error.message.includes('Invalid JWT Signature')) {
      console.error('\n💡 TROUBLESHOOTING:');
      console.error('1. Verify the key ID matches an ACTIVE key in Google Cloud Console:');
      console.error('   https://console.cloud.google.com/iam-admin/serviceaccounts');
      console.error('2. Check if the service account is enabled');
      console.error('3. Verify Google Calendar API is enabled:');
      console.error('   https://console.cloud.google.com/apis/library/calendar-json.googleapis.com');
      console.error('4. Try regenerating the key in Google Cloud Console');
      console.error('5. Make sure you\'re using the FULL JSON file (not just the private key)');
    }
  }
}

testAuth();








