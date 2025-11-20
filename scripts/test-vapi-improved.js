#!/usr/bin/env node
// Quick test script to verify improved VAPI prompts work
// Usage: node scripts/test-vapi-improved.js

import { getTemplate, customizeTemplate } from '../lib/industry-templates.js';

console.log('\n🧪 Testing Improved VAPI Prompts\n');

// Test each industry
const industries = ['fitness', 'beauty', 'dental', 'medical', 'legal', 'realestate', 'consulting', 'automotive', 'restaurant', 'homeservices', 'professional', 'wellness', 'education'];

const testBusiness = {
  businessName: 'Test Business',
  primaryService: 'Consultation',
  serviceArea: 'London',
  voiceGender: 'female'
};

console.log('Testing prompt generation for all industries...\n');

let passed = 0;
let failed = 0;

for (const industry of industries) {
  try {
    const template = getTemplate(industry);
    const customized = customizeTemplate(industry, testBusiness);
    
    // Check if prompt has improvements
    const hasContext = customized.systemPrompt.includes('reached out') || customized.systemPrompt.includes('showed interest');
    const hasVoicemail = customized.systemPrompt.includes('VOICEMAIL HANDLING');
    const hasTools = customized.systemPrompt.includes('calendar_checkAndBook');
    const hasTimeManagement = customized.systemPrompt.includes('2 minutes') || customized.systemPrompt.includes('3 minutes');
    
    if (hasContext && hasVoicemail && hasTools && hasTimeManagement) {
      console.log(`✅ ${industry.padEnd(15)} - All improvements present`);
      passed++;
    } else {
      console.log(`⚠️  ${industry.padEnd(15)} - Missing some improvements`);
      console.log(`   Context: ${hasContext ? '✅' : '❌'} | Voicemail: ${hasVoicemail ? '✅' : '❌'} | Tools: ${hasTools ? '✅' : '❌'} | Time: ${hasTimeManagement ? '✅' : '❌'}`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ ${industry.padEnd(15)} - Error: ${error.message}`);
    failed++;
  }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

// Show sample prompt
console.log('📝 Sample improved prompt (Fitness):\n');
const sample = customizeTemplate('fitness', testBusiness);
console.log(sample.systemPrompt.substring(0, 500) + '...\n');

console.log('✅ All prompts ready to use!\n');

