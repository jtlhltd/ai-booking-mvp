#!/usr/bin/env node

/**
 * Fix VAPI Voice Settings - Optimize for Clear Speech
 * 
 * This script updates your VAPI assistant with optimized voice settings
 * to fix slurring and weird speech patterns.
 * 
 * Usage:
 *   node scripts/fix-vapi-voice-settings.js <ASSISTANT_ID>
 * 
 * Or set VAPI_PRIVATE_KEY and ASSISTANT_ID in .env
 */

import 'dotenv/config';
import fetch from 'node-fetch';

const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || process.argv[2];

if (!VAPI_PRIVATE_KEY) {
  console.error('❌ Error: VAPI_PRIVATE_KEY not found in environment');
  console.error('   Set it in .env or export VAPI_PRIVATE_KEY=your_key');
  process.exit(1);
}

if (!ASSISTANT_ID) {
  console.error('❌ Error: Assistant ID required');
  console.error('   Usage: node scripts/fix-vapi-voice-settings.js <ASSISTANT_ID>');
  console.error('   Or set ASSISTANT_ID in .env');
  process.exit(1);
}

// Optimized voice settings to fix slurring
const OPTIMIZED_VOICE_SETTINGS = {
  stability: 0.75,        // Higher = more stable, clearer (was often 0.5-0.6)
  clarity: 0.85,          // Higher = clearer pronunciation
  style: 0.15,            // Lower = less expressive, more consistent (was often 0.3+)
  similarityBoost: 0.75,  // Balanced
  useSpeakerBoost: true   // Enhances clarity
};

// Optimized model settings
const OPTIMIZED_MODEL_SETTINGS = {
  temperature: 0.3,       // Lower = more consistent speech patterns (was often 0.7)
  maxTokens: 200          // Shorter responses = less chance of issues
};

async function getAssistant(assistantId) {
  const response = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
    headers: {
      'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get assistant: ${error}`);
  }

  return await response.json();
}

async function updateAssistant(assistantId, updates) {
  const response = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update assistant: ${error}`);
  }

  return await response.json();
}

async function main() {
  console.log('🔧 Fixing VAPI Voice Settings...\n');
  console.log(`📞 Assistant ID: ${ASSISTANT_ID}\n`);

  try {
    // Get current assistant config
    console.log('📥 Fetching current assistant configuration...');
    const current = await getAssistant(ASSISTANT_ID);
    console.log('✅ Got current config\n');

    // Show current settings
    console.log('📊 Current Voice Settings:');
    if (current.voice) {
      console.log(`   Stability: ${current.voice.stability || 'not set'}`);
      console.log(`   Clarity: ${current.voice.clarity || 'not set'}`);
      console.log(`   Style: ${current.voice.style || 'not set'}`);
      console.log(`   Similarity Boost: ${current.voice.similarityBoost || 'not set'}`);
      console.log(`   Speaker Boost: ${current.voice.useSpeakerBoost || false}`);
    } else {
      console.log('   ⚠️  No voice settings found');
    }

    console.log('\n📊 Current Model Settings:');
    if (current.model) {
      console.log(`   Temperature: ${current.model.temperature || 'not set'}`);
      console.log(`   Max Tokens: ${current.model.maxTokens || 'not set'}`);
    } else {
      console.log('   ⚠️  No model settings found');
    }

    // Prepare updates
    const updates = {};

    // Update voice settings
    if (current.voice) {
      updates.voice = {
        ...current.voice,
        ...OPTIMIZED_VOICE_SETTINGS
      };
    } else {
      // If no voice config, we need to set it (but need provider and voiceId)
      console.log('\n⚠️  Warning: No existing voice config found.');
      console.log('   You may need to set voice provider and voiceId manually in VAPI dashboard.');
    }

    // Update model settings
    if (current.model) {
      updates.model = {
        ...current.model,
        ...OPTIMIZED_MODEL_SETTINGS
      };
    }

    if (Object.keys(updates).length === 0) {
      console.log('\n❌ No updates to apply. Assistant may not have voice/model config.');
      process.exit(1);
    }

    // Show what will be updated
    console.log('\n🔧 Optimized Settings to Apply:');
    if (updates.voice) {
      console.log('\n   Voice Settings:');
      console.log(`   ✅ Stability: ${updates.voice.stability} (higher = clearer)`);
      console.log(`   ✅ Clarity: ${updates.voice.clarity} (higher = clearer)`);
      console.log(`   ✅ Style: ${updates.voice.style} (lower = more consistent)`);
      console.log(`   ✅ Similarity Boost: ${updates.voice.similarityBoost}`);
      console.log(`   ✅ Speaker Boost: ${updates.voice.useSpeakerBoost}`);
    }
    if (updates.model) {
      console.log('\n   Model Settings:');
      console.log(`   ✅ Temperature: ${updates.model.temperature} (lower = more consistent)`);
      console.log(`   ✅ Max Tokens: ${updates.model.maxTokens}`);
    }

    // Confirm update
    console.log('\n💾 Updating assistant...');
    const updated = await updateAssistant(ASSISTANT_ID, updates);
    console.log('✅ Assistant updated successfully!\n');

    // Show final settings
    console.log('📊 Final Voice Settings:');
    if (updated.voice) {
      console.log(`   Stability: ${updated.voice.stability}`);
      console.log(`   Clarity: ${updated.voice.clarity}`);
      console.log(`   Style: ${updated.voice.style}`);
      console.log(`   Similarity Boost: ${updated.voice.similarityBoost}`);
      console.log(`   Speaker Boost: ${updated.voice.useSpeakerBoost}`);
    }

    console.log('\n📊 Final Model Settings:');
    if (updated.model) {
      console.log(`   Temperature: ${updated.model.temperature}`);
      console.log(`   Max Tokens: ${updated.model.maxTokens}`);
    }

    console.log('\n🎉 Done! Test your assistant with a call to verify the improvements.');
    console.log('   The voice should now be clearer with no slurring.\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.error('   Check that VAPI_PRIVATE_KEY is correct');
    } else if (error.message.includes('404') || error.message.includes('not found')) {
      console.error('   Check that ASSISTANT_ID is correct');
    }
    process.exit(1);
  }
}

main();

