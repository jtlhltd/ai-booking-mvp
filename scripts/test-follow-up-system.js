// Test Follow-Up System
// Verifies that the follow-up system is working correctly

import fs from 'fs';
import path from 'path';

console.log('🧪 Testing Follow-Up System\n');

let allTestsPassed = true;

// Test 1: Check if follow-up sequences file exists
console.log('1. Checking follow-up sequences...');
const sequencesPath = path.join(process.cwd(), 'lib', 'follow-up-sequences.js');
if (fs.existsSync(sequencesPath)) {
  console.log('   ✅ lib/follow-up-sequences.js exists');
  
  const content = fs.readFileSync(sequencesPath, 'utf8');
  
  // Check for required sequences
  const requiredSequences = ['no_answer', 'voicemail', 'not_interested', 'callback_requested', 'interested_no_booking', 'technical_issues'];
  for (const seq of requiredSequences) {
    if (content.includes(`${seq}:`)) {
      console.log(`   ✅ ${seq} sequence found`);
    } else {
      console.log(`   ❌ ${seq} sequence not found`);
      allTestsPassed = false;
    }
  }
  
  // Check for key functions
  if (content.includes('scheduleFollowUps')) {
    console.log('   ✅ scheduleFollowUps function found');
  } else {
    console.log('   ❌ scheduleFollowUps function not found');
    allTestsPassed = false;
  }
  
  if (content.includes('cancelFollowUpSequence')) {
    console.log('   ✅ cancelFollowUpSequence function found');
  } else {
    console.log('   ❌ cancelFollowUpSequence function not found');
    allTestsPassed = false;
  }
} else {
  console.log('   ❌ lib/follow-up-sequences.js does not exist');
  allTestsPassed = false;
}

// Test 2: Check if follow-up processor exists
console.log('\n2. Checking follow-up processor...');
const processorPath = path.join(process.cwd(), 'lib', 'follow-up-processor.js');
if (fs.existsSync(processorPath)) {
  console.log('   ✅ lib/follow-up-processor.js exists');
  
  const content = fs.readFileSync(processorPath, 'utf8');
  
  if (content.includes('processFollowUpQueue')) {
    console.log('   ✅ processFollowUpQueue function found');
  } else {
    console.log('   ❌ processFollowUpQueue function not found');
    allTestsPassed = false;
  }
  
  // Check for SMS, email, and call handling
  if (content.includes('sendFollowUpSMS')) {
    console.log('   ✅ SMS sending function found');
  } else {
    console.log('   ❌ SMS sending function not found');
    allTestsPassed = false;
  }
  
  if (content.includes('sendFollowUpEmail')) {
    console.log('   ✅ Email sending function found');
  } else {
    console.log('   ❌ Email sending function not found');
    allTestsPassed = false;
  }
  
  if (content.includes('sendRetryCall')) {
    console.log('   ✅ Retry call function found');
  } else {
    console.log('   ❌ Retry call function not found');
    allTestsPassed = false;
  }
} else {
  console.log('   ❌ lib/follow-up-processor.js does not exist');
  allTestsPassed = false;
}

// Test 3: Check if cron job is set up
console.log('\n3. Checking cron job setup...');
const serverPath = path.join(process.cwd(), 'server.js');
if (fs.existsSync(serverPath)) {
  const serverContent = fs.readFileSync(serverPath, 'utf8');
  
  if (serverContent.includes('processFollowUpQueue')) {
    console.log('   ✅ Follow-up cron job found');
    
    if (serverContent.includes('*/5 * * * *')) {
      console.log('   ✅ Cron runs every 5 minutes');
    } else {
      console.log('   ⚠️  Cron schedule may be different');
    }
  } else {
    console.log('   ❌ Follow-up cron job not found');
    allTestsPassed = false;
  }
} else {
  console.log('   ❌ server.js not found');
  allTestsPassed = false;
}

// Test 4: Check if Vapi webhook triggers follow-ups
console.log('\n4. Checking Vapi webhook integration...');
const vapiWebhookPath = path.join(process.cwd(), 'routes', 'vapi-webhooks.js');
if (fs.existsSync(vapiWebhookPath)) {
  const content = fs.readFileSync(vapiWebhookPath, 'utf8');
  
  if (content.includes('scheduleFollowUps')) {
    console.log('   ✅ scheduleFollowUps called in Vapi webhook');
  } else {
    console.log('   ❌ scheduleFollowUps not called in Vapi webhook');
    allTestsPassed = false;
  }
  
  // Check for outcome handling
  if (content.includes('no-answer') || content.includes('no_answer')) {
    console.log('   ✅ No-answer outcome handling found');
  } else {
    console.log('   ⚠️  No-answer outcome handling may be missing');
  }
} else {
  console.log('   ❌ routes/vapi-webhooks.js not found');
  allTestsPassed = false;
}

// Test 5: Check database functions
console.log('\n5. Checking database functions...');
const dbPath = path.join(process.cwd(), 'db.js');
if (fs.existsSync(dbPath)) {
  const content = fs.readFileSync(dbPath, 'utf8');
  
  if (content.includes('addToRetryQueue')) {
    console.log('   ✅ addToRetryQueue function found');
  } else {
    console.log('   ❌ addToRetryQueue function not found');
    allTestsPassed = false;
  }
  
  if (content.includes('retry_queue')) {
    console.log('   ✅ retry_queue table referenced');
  } else {
    console.log('   ⚠️  retry_queue table may not be created');
  }
} else {
  console.log('   ❌ db.js not found');
  allTestsPassed = false;
}

// Test 6: Check for opt-out handling
console.log('\n6. Checking opt-out handling...');
if (fs.existsSync(processorPath)) {
  const content = fs.readFileSync(processorPath, 'utf8');
  
  if (content.includes('opt') && content.includes('out')) {
    console.log('   ✅ Opt-out checking found');
  } else {
    console.log('   ⚠️  Opt-out checking may be missing (GDPR compliance)');
  }
} else {
  console.log('   ⚠️  Cannot check opt-out handling');
}

// Summary
console.log('\n' + '='.repeat(50));
if (allTestsPassed) {
  console.log('✅ All critical tests passed!');
  console.log('\n📝 Next steps:');
  console.log('   1. Test with a real call outcome');
  console.log('   2. Verify follow-ups are scheduled in retry_queue');
  console.log('   3. Wait 5 minutes and check if cron processes them');
  console.log('   4. Verify SMS/Email/Call are sent');
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Please review the errors above.');
  process.exit(1);
}

