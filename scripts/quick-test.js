// scripts/quick-test.js
// Quick test script - runs all checks and submits a test lead

import 'dotenv/config';
import { spawn } from 'child_process';
import { promisify } from 'util';

const runScript = (script) => {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [script], {
      stdio: 'inherit',
      shell: true
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script ${script} exited with code ${code}`));
      }
    });
    
    proc.on('error', reject);
  });
};

console.log('🚀 Quick System Test');
console.log('===================');
console.log('');

// First check setup
console.log('Step 0: Checking environment setup...');
try {
  await runScript('scripts/check-setup.js');
  console.log('');
} catch (error) {
  console.log('⚠️  Setup check had issues, continuing anyway...');
  console.log('');
}

// Try each step, but don't fail completely if one fails
const steps = [
  { name: 'Checking Google Sheets...', script: 'scripts/check-google-sheets.js', required: false },
  { name: 'Monitoring system...', script: 'scripts/monitor-system.js', required: false },
  { name: 'Submitting test lead...', script: 'scripts/test-submit-lead.js', required: true }
];

let failedSteps = [];

for (let i = 0; i < steps.length; i++) {
  const step = steps[i];
  console.log(`Step ${i + 1}: ${step.name}`);
  try {
    await runScript(step.script);
    console.log('');
  } catch (error) {
    console.log(`   ⚠️  ${step.name} failed: ${error.message}`);
    console.log('');
    if (step.required) {
      failedSteps.push(step.name);
    }
  }
}

if (failedSteps.length === 0) {
  console.log('✅ Quick test complete!');
  console.log('');
  console.log('📊 Next steps:');
  console.log('   1. Check VAPI dashboard for call status');
  console.log('   2. Check Google Sheet for new row');
  console.log('   3. Monitor with: node scripts/monitor-system.js');
} else {
  console.log('⚠️  Some steps failed (see above)');
  console.log('');
  console.log('💡 Fix the issues and try again');
  console.log('💡 Or run individual scripts:');
  console.log('   - node scripts/check-setup.js (check environment)');
  console.log('   - node scripts/monitor-system.js (check system)');
  console.log('   - node scripts/test-submit-lead.js (submit lead)');
}

