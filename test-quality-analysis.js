// test-quality-analysis.js
// Test script to verify call quality analysis is working

import { analyzeCall, analyzeSentiment, extractObjections, calculateQualityScore } from './lib/call-quality-analysis.js';

console.log('🧪 Testing Call Quality Analysis System\n');

// Test Case 1: Positive Call (Should get high score)
console.log('═══════════════════════════════════════════════');
console.log('TEST 1: POSITIVE BOOKING CALL');
console.log('═══════════════════════════════════════════════');

const positiveCall = {
  outcome: 'booked',
  duration: 180, // 3 minutes
  transcript: `
    Agent: Hi, this is calling about our AI booking system. We help businesses like yours get 30% more appointments.
    Customer: Oh interesting! Tell me more.
    Agent: We automate your appointment booking, send SMS reminders, and sync with your calendar.
    Customer: That sounds great! I'm definitely interested.
    Agent: Wonderful! Can I schedule a demo for you?
    Customer: Yes, absolutely. Let's do it.
    Agent: Perfect! How about Tuesday at 2pm?
    Customer: That works perfectly. Thank you so much!
  `,
  metrics: {
    talk_time_ratio: 0.65, // Customer talked 65% of the time (good)
    interruptions: 1,
    response_time_avg: 1.2
  }
};

const result1 = analyzeCall(positiveCall);
console.log('📊 Analysis Results:');
console.log('   Sentiment:', result1.sentiment);
console.log('   Quality Score:', result1.qualityScore + '/10');
console.log('   Objections:', result1.objections);
console.log('   Key Phrases:', result1.keyPhrases.slice(0, 3));
console.log('   ✅ Expected: sentiment=positive, score=9-10');
console.log('   ' + (result1.sentiment === 'positive' && result1.qualityScore >= 9 ? '✅ PASS' : '❌ FAIL'));
console.log('');

// Test Case 2: Negative Call (Should get low score)
console.log('═══════════════════════════════════════════════');
console.log('TEST 2: NEGATIVE REJECTION CALL');
console.log('═══════════════════════════════════════════════');

const negativeCall = {
  outcome: 'not_interested',
  duration: 25, // Hung up quickly
  transcript: `
    Agent: Hi, this is calling about our AI booking system.
    Customer: Not interested. Too expensive. Don't call again.
    Agent: I understand, but—
    Customer: Stop calling. This is spam.
  `,
  metrics: {
    talk_time_ratio: 0.80, // Customer talked a lot but negatively
    interruptions: 2,
    response_time_avg: 0.5
  }
};

const result2 = analyzeCall(negativeCall);
console.log('📊 Analysis Results:');
console.log('   Sentiment:', result2.sentiment);
console.log('   Quality Score:', result2.qualityScore + '/10');
console.log('   Objections:', result2.objections);
console.log('   Key Phrases:', result2.keyPhrases.slice(0, 3));
console.log('   ✅ Expected: sentiment=negative, score=1-3, objections include "price"');
console.log('   ' + (result2.sentiment === 'negative' && result2.qualityScore <= 3 && result2.objections.includes('price') ? '✅ PASS' : '❌ FAIL'));
console.log('');

// Test Case 3: Neutral/Follow-up Call (Should get medium score)
console.log('═══════════════════════════════════════════════');
console.log('TEST 3: NEUTRAL FOLLOW-UP CALL');
console.log('═══════════════════════════════════════════════');

const neutralCall = {
  outcome: 'callback_requested',
  duration: 120, // 2 minutes
  transcript: `
    Agent: Hi, calling about our AI booking system.
    Customer: I'm busy right now. Can you call back later?
    Agent: Of course! When would be a good time?
    Customer: Next week sometime. Send me some information first.
    Agent: I'll email you details. Thanks!
    Customer: Okay, bye.
  `,
  metrics: {
    talk_time_ratio: 0.55,
    interruptions: 1,
    response_time_avg: 1.5
  }
};

const result3 = analyzeCall(neutralCall);
console.log('📊 Analysis Results:');
console.log('   Sentiment:', result3.sentiment);
console.log('   Quality Score:', result3.qualityScore + '/10');
console.log('   Objections:', result3.objections);
console.log('   Key Phrases:', result3.keyPhrases.slice(0, 3));
console.log('   ✅ Expected: sentiment=neutral, score=6-10 (good engagement), objections include "timing"');
console.log('   ' + (result3.sentiment === 'neutral' && result3.qualityScore >= 6 && result3.objections.includes('timing') ? '✅ PASS' : '❌ FAIL'));
console.log('');

// Test Case 4: No Answer (Should get low score)
console.log('═══════════════════════════════════════════════');
console.log('TEST 4: NO ANSWER / VOICEMAIL');
console.log('═══════════════════════════════════════════════');

const noAnswerCall = {
  outcome: 'no-answer',
  duration: 0,
  transcript: '',
  metrics: {}
};

const result4 = analyzeCall(noAnswerCall);
console.log('📊 Analysis Results:');
console.log('   Sentiment:', result4.sentiment);
console.log('   Quality Score:', result4.qualityScore + '/10');
console.log('   Objections:', result4.objections);
console.log('   Key Phrases:', result4.keyPhrases);
console.log('   ✅ Expected: sentiment=unknown, score=1-2');
console.log('   ' + (result4.sentiment === 'unknown' && result4.qualityScore <= 2 ? '✅ PASS' : '❌ FAIL'));
console.log('');

// Summary
console.log('═══════════════════════════════════════════════');
console.log('📋 TEST SUMMARY');
console.log('═══════════════════════════════════════════════');
const allPassed = [
  result1.sentiment === 'positive' && result1.qualityScore >= 9,
  result2.sentiment === 'negative' && result2.qualityScore <= 3,
  result3.sentiment === 'neutral' && result3.qualityScore >= 6 && result3.objections.includes('timing'),
  result4.sentiment === 'unknown' && result4.qualityScore <= 2
].every(x => x);

if (allPassed) {
  console.log('✅ ALL TESTS PASSED!');
  console.log('✅ Call quality analysis is working correctly');
  console.log('✅ Ready for production use');
} else {
  console.log('❌ SOME TESTS FAILED');
  console.log('⚠️  Review the analysis logic');
}

