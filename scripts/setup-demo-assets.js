#!/usr/bin/env node

/**
 * Demo Assets Setup Script
 * 
 * One-time setup for demo assets (test calendar, CSV templates, etc.)
 * 
 * Usage: node scripts/setup-demo-assets.js
 */

import fs from 'fs';
import path from 'path';

const DEMO_DIR = path.join(process.cwd(), 'demo-assets');

/**
 * Create demo assets directory structure
 */
function createDemoAssetsDir() {
  if (!fs.existsSync(DEMO_DIR)) {
    fs.mkdirSync(DEMO_DIR, { recursive: true });
    console.log('✅ Created demo-assets directory');
  } else {
    console.log('✅ Demo-assets directory already exists');
  }
}

/**
 * Create sample CSV template for test leads
 */
function createSampleCSV() {
  const csvPath = path.join(DEMO_DIR, 'sample-leads.csv');
  
  const csvContent = `name,phone,service,source
John Smith,+441234567890,Consultation,Website
Sarah Johnson,+441234567891,Checkup,Referral
Mike Williams,+441234567892,Service,Google Ads
Emma Brown,+441234567893,Consultation,Facebook
David Jones,+441234567894,Checkup,Website`;

  if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(csvPath, csvContent);
    console.log('✅ Created sample-leads.csv template');
  } else {
    console.log('⚠️  sample-leads.csv already exists (skipping)');
  }
}

/**
 * Create demo configuration file
 */
function createDemoConfig() {
  const configPath = path.join(DEMO_DIR, 'demo-config.json');
  
  const config = {
    demoClientKey: 'demo-client',
    testPhoneNumber: '+441234567890', // Replace with your number for demo calls
    testCalendarId: null, // Set this to your test Google Calendar ID
    defaultServices: [
      'Consultation',
      'Checkup',
      'Service'
    ],
    notes: [
      'Replace testPhoneNumber with your actual number for demo calls',
      'Set testCalendarId to your test Google Calendar ID',
      'Use sample-leads.csv as a template for importing test leads'
    ]
  };

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('✅ Created demo-config.json');
  } else {
    console.log('⚠️  demo-config.json already exists (skipping)');
  }
}

/**
 * Create README for demo assets
 */
function createReadme() {
  const readmePath = path.join(DEMO_DIR, 'README.md');
  
  const readme = `# Demo Assets

This directory contains assets for creating Loom demos.

## Files

- \`sample-leads.csv\` - Template CSV file for test leads. Replace phone numbers with your number for demo calls.
- \`demo-config.json\` - Demo configuration. Update with your test phone number and calendar ID.

## Usage

1. Update \`demo-config.json\` with your test phone number
2. Update \`sample-leads.csv\` with your phone number (replace all phone numbers)
3. Use these files when creating demos

## Test Leads CSV Format

The CSV should have these columns:
- \`name\` - Lead name
- \`phone\` - Phone number (use your number for demo calls)
- \`service\` - Service they're interested in
- \`source\` - Where the lead came from

## Notes

- Always use your own phone number in test leads for demo calls
- Keep test data realistic but clearly test data
- Don't use real customer data in demos
`;

  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, readme);
    console.log('✅ Created README.md');
  } else {
    console.log('⚠️  README.md already exists (skipping)');
  }
}

/**
 * Main function
 */
function main() {
  console.log('\n🎬 Demo Assets Setup\n');
  console.log('This script creates demo assets for Loom demos.\n');
  
  try {
    createDemoAssetsDir();
    createSampleCSV();
    createDemoConfig();
    createReadme();
    
    console.log('\n✅ Demo assets setup complete!');
    console.log(`\n📁 Assets created in: ${DEMO_DIR}`);
    console.log('\nNext steps:');
    console.log('1. Update demo-config.json with your test phone number');
    console.log('2. Update sample-leads.csv with your phone number');
    console.log('3. Use these files when creating demos\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run main function
main();





