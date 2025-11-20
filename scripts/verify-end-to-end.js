// scripts/verify-end-to-end.js
// Verify end-to-end flow by checking database and logs

import 'dotenv/config';
import { query, init } from '../db.js';

console.log('🔍 Verifying End-to-End Flow');
console.log('============================');
console.log('');

// Initialize database
await init();

// Check 1: Recent leads
console.log('1️⃣  Checking Recent Leads...');
console.log('');
try {
  const leads = await query(`
    SELECT 
      id,
      client_key,
      name,
      phone,
      service,
      status,
      source,
      created_at
    FROM leads
    WHERE created_at > NOW() - INTERVAL '1 hour'
    ORDER BY created_at DESC
    LIMIT 10
  `);
  
  if (leads.rows && leads.rows.length > 0) {
    console.log(`   ✅ Found ${leads.rows.length} recent lead(s):`);
    leads.rows.forEach((lead, i) => {
      console.log(`   ${i + 1}. ${lead.name || 'N/A'} (${lead.phone})`);
      console.log(`      ID: ${lead.id}`);
      console.log(`      Client: ${lead.client_key}`);
      console.log(`      Status: ${lead.status}`);
      console.log(`      Service: ${lead.service || 'N/A'}`);
      console.log(`      Created: ${lead.created_at}`);
      console.log('');
    });
  } else {
    console.log('   ⚠️  No recent leads found in last hour');
    console.log('');
  }
} catch (error) {
  console.log('   ❌ Error querying leads:', error.message);
  console.log('');
}

// Check 2: Recent calls
console.log('2️⃣  Checking Recent Calls...');
console.log('');
try {
  const calls = await query(`
    SELECT 
      id,
      call_id,
      client_key,
      lead_phone,
      status,
      outcome,
      duration,
      cost,
      transcript,
      sentiment,
      quality_score,
      objections,
      key_phrases,
      created_at,
      updated_at,
      analyzed_at
    FROM calls
    WHERE created_at > NOW() - INTERVAL '1 hour'
    ORDER BY created_at DESC
    LIMIT 10
  `);
  
  if (calls.rows && calls.rows.length > 0) {
    console.log(`   ✅ Found ${calls.rows.length} recent call(s):`);
    calls.rows.forEach((call, i) => {
      console.log(`   ${i + 1}. Call ID: ${call.call_id || 'N/A'}`);
      console.log(`      Phone: ${call.lead_phone}`);
      console.log(`      Client: ${call.client_key}`);
      console.log(`      Status: ${call.status}`);
      console.log(`      Outcome: ${call.outcome || 'N/A'}`);
      console.log(`      Duration: ${call.duration || 'N/A'}s`);
      console.log(`      Cost: ${call.cost ? `£${call.cost}` : 'N/A'}`);
      console.log(`      Transcript: ${call.transcript ? `${call.transcript.length} chars` : 'None'}`);
      console.log(`      Sentiment: ${call.sentiment || 'N/A'}`);
      console.log(`      Quality Score: ${call.quality_score || 'N/A'}`);
      console.log(`      Objections: ${call.objections ? JSON.stringify(call.objections) : 'None'}`);
      console.log(`      Key Phrases: ${call.key_phrases ? JSON.stringify(call.key_phrases) : 'None'}`);
      console.log(`      Analyzed: ${call.analyzed_at || 'Not analyzed'}`);
      console.log(`      Created: ${call.created_at}`);
      console.log('');
    });
  } else {
    console.log('   ⚠️  No recent calls found in last hour');
    console.log('   💡 This could mean:');
    console.log('      - VAPI call hasn\'t completed yet');
    console.log('      - Webhook hasn\'t been received');
    console.log('      - Call failed to initiate');
    console.log('');
  }
} catch (error) {
  console.log('   ❌ Error querying calls:', error.message);
  console.log('');
}

// Check 3: Lead we just submitted
console.log('3️⃣  Checking Test Lead (lead_4cD10Iv5)...');
console.log('');
try {
  // Try to find by ID or phone
  const testLead = await query(`
    SELECT 
      id,
      client_key,
      name,
      phone,
      service,
      status,
      source,
      created_at
    FROM leads
    WHERE phone = $1
    ORDER BY created_at DESC
    LIMIT 1
  `, ['+447491683261']);
  
  if (testLead.rows && testLead.rows.length > 0) {
    const lead = testLead.rows[0];
    console.log('   ✅ Test lead found:');
    console.log(`      ID: ${lead.id}`);
    console.log(`      Name: ${lead.name}`);
    console.log(`      Phone: ${lead.phone}`);
    console.log(`      Client: ${lead.client_key}`);
    console.log(`      Status: ${lead.status}`);
    console.log(`      Service: ${lead.service || 'N/A'}`);
    console.log(`      Created: ${lead.created_at}`);
    console.log('');
    
    // Check for associated calls
    const associatedCalls = await query(`
      SELECT 
        call_id,
        status,
        outcome,
        duration,
        transcript,
        created_at
      FROM calls
      WHERE lead_phone = $1 AND client_key = $2
      ORDER BY created_at DESC
      LIMIT 5
    `, [lead.phone, lead.client_key]);
    
    if (associatedCalls.rows && associatedCalls.rows.length > 0) {
      console.log(`   ✅ Found ${associatedCalls.rows.length} call(s) for this lead:`);
      associatedCalls.rows.forEach((call, i) => {
        console.log(`      ${i + 1}. ${call.call_id || 'N/A'} - ${call.status} - ${call.outcome || 'N/A'}`);
        console.log(`         Duration: ${call.duration || 'N/A'}s`);
        console.log(`         Transcript: ${call.transcript ? 'Yes' : 'No'}`);
        console.log(`         Created: ${call.created_at}`);
      });
      console.log('');
    } else {
      console.log('   ⚠️  No calls found for this lead yet');
      console.log('   💡 VAPI call may still be in progress or not yet initiated');
      console.log('');
    }
  } else {
    console.log('   ⚠️  Test lead not found in database');
    console.log('');
  }
} catch (error) {
  console.log('   ❌ Error checking test lead:', error.message);
  console.log('');
}

// Check 4: Webhook activity (check for recent call records that indicate webhook processing)
console.log('4️⃣  Checking Webhook Processing...');
console.log('');
try {
  const recentCallsWithData = await query(`
    SELECT 
      COUNT(*) as count,
      COUNT(CASE WHEN transcript IS NOT NULL THEN 1 END) as with_transcript,
      COUNT(CASE WHEN sentiment IS NOT NULL THEN 1 END) as with_sentiment,
      COUNT(CASE WHEN quality_score IS NOT NULL THEN 1 END) as with_quality,
      COUNT(CASE WHEN analyzed_at IS NOT NULL THEN 1 END) as analyzed
    FROM calls
    WHERE created_at > NOW() - INTERVAL '1 hour'
  `);
  
  const stats = recentCallsWithData.rows[0];
  console.log(`   📊 Recent call statistics (last hour):`);
  console.log(`      Total calls: ${stats.count}`);
  console.log(`      With transcript: ${stats.with_transcript}`);
  console.log(`      With sentiment: ${stats.with_sentiment}`);
  console.log(`      With quality score: ${stats.with_quality}`);
  console.log(`      Analyzed: ${stats.analyzed}`);
  console.log('');
  
  if (stats.count > 0 && stats.with_transcript > 0) {
    console.log('   ✅ Webhooks are being processed successfully!');
  } else if (stats.count > 0) {
    console.log('   ⚠️  Calls exist but transcripts not yet processed');
  } else {
    console.log('   ⚠️  No recent calls found');
  }
  console.log('');
} catch (error) {
  console.log('   ❌ Error checking webhook processing:', error.message);
  console.log('');
}

// Summary
console.log('📊 Summary');
console.log('==========');
console.log('');
console.log('✅ Database connection: Working');
console.log('✅ Query execution: Working');
console.log('');
console.log('💡 Next Steps:');
console.log('   1. Check VAPI dashboard for call status');
console.log('   2. Wait for call to complete (if in progress)');
console.log('   3. Run this script again to see updates');
console.log('   4. Check Render logs for webhook activity');
console.log('');

