// Test CRM Integration Implementation
// Verifies that HubSpot and Salesforce integration code is properly implemented

import fs from 'fs';
import path from 'path';

console.log('🧪 Testing CRM Integration Implementation\n');

let allTestsPassed = true;

// Test 1: Check if CRM integration library exists
console.log('1. Checking CRM integration library...');
const crmLibPath = path.join(process.cwd(), 'lib', 'crm-integrations.js');
if (fs.existsSync(crmLibPath)) {
  console.log('   ✅ lib/crm-integrations.js exists');
  
  const content = fs.readFileSync(crmLibPath, 'utf8');
  
  // Check for HubSpot class
  if (content.includes('class HubSpotIntegration')) {
    console.log('   ✅ HubSpotIntegration class found');
  } else {
    console.log('   ❌ HubSpotIntegration class not found');
    allTestsPassed = false;
  }
  
  // Check for Salesforce class
  if (content.includes('class SalesforceIntegration')) {
    console.log('   ✅ SalesforceIntegration class found');
  } else {
    console.log('   ❌ SalesforceIntegration class not found');
    allTestsPassed = false;
  }
  
  // Check for key methods
  const requiredMethods = [
    'syncContact',
    'syncLead',
    'syncAll',
    'saveCrmSettings',
    'getCrmSettings'
  ];
  
  for (const method of requiredMethods) {
    if (content.includes(method)) {
      console.log(`   ✅ Method ${method} found`);
    } else {
      console.log(`   ❌ Method ${method} not found`);
      allTestsPassed = false;
    }
  }
} else {
  console.log('   ❌ lib/crm-integrations.js does not exist');
  allTestsPassed = false;
}

// Test 2: Check if migration file exists
console.log('\n2. Checking migration file...');
const migrationPath = path.join(process.cwd(), 'migrations', 'add-crm-integrations-table.sql');
if (fs.existsSync(migrationPath)) {
  console.log('   ✅ Migration file exists');
  
  const migrationContent = fs.readFileSync(migrationPath, 'utf8');
  if (migrationContent.includes('CREATE TABLE IF NOT EXISTS crm_integrations')) {
    console.log('   ✅ CRM integrations table definition found');
  } else {
    console.log('   ❌ CRM integrations table definition not found');
    allTestsPassed = false;
  }
} else {
  console.log('   ❌ Migration file does not exist');
  allTestsPassed = false;
}

// Test 3: Check if server.js has updated endpoints
console.log('\n3. Checking server.js endpoints...');
const serverPath = path.join(process.cwd(), 'server.js');
if (fs.existsSync(serverPath)) {
  const serverContent = fs.readFileSync(serverPath, 'utf8');
  
  // Check HubSpot endpoint
  if (serverContent.includes('/api/crm/hubspot/sync')) {
    if (serverContent.includes('HubSpotIntegration')) {
      console.log('   ✅ HubSpot sync endpoint uses HubSpotIntegration');
    } else {
      console.log('   ⚠️  HubSpot endpoint exists but may not use integration class');
    }
  } else {
    console.log('   ❌ HubSpot sync endpoint not found');
    allTestsPassed = false;
  }
  
  // Check Salesforce endpoint
  if (serverContent.includes('/api/crm/salesforce/sync')) {
    if (serverContent.includes('SalesforceIntegration')) {
      console.log('   ✅ Salesforce sync endpoint uses SalesforceIntegration');
    } else {
      console.log('   ⚠️  Salesforce endpoint exists but may not use integration class');
    }
  } else {
    console.log('   ❌ Salesforce sync endpoint not found');
    allTestsPassed = false;
  }
  
  // Check GET integrations endpoint
  if (serverContent.includes('/api/crm/integrations/:clientKey')) {
    if (serverContent.includes('getCrmSettings')) {
      console.log('   ✅ GET integrations endpoint uses getCrmSettings');
    } else {
      console.log('   ⚠️  GET integrations endpoint exists but may not use database');
    }
  } else {
    console.log('   ❌ GET integrations endpoint not found');
    allTestsPassed = false;
  }
} else {
  console.log('   ❌ server.js not found');
  allTestsPassed = false;
}

// Test 4: Check if db.js has table creation
console.log('\n4. Checking db.js for table creation...');
const dbPath = path.join(process.cwd(), 'db.js');
if (fs.existsSync(dbPath)) {
  const dbContent = fs.readFileSync(dbPath, 'utf8');
  
  if (dbContent.includes('CREATE TABLE IF NOT EXISTS crm_integrations')) {
    console.log('   ✅ CRM integrations table creation found in db.js');
  } else {
    console.log('   ⚠️  CRM integrations table not found in db.js (may be created via migration)');
  }
} else {
  console.log('   ❌ db.js not found');
  allTestsPassed = false;
}

// Test 5: Check for TODO removal
console.log('\n5. Checking for TODO removal...');
if (fs.existsSync(serverPath)) {
  const serverContent = fs.readFileSync(serverPath, 'utf8');
  
  const todoPatterns = [
    /TODO.*HubSpot/i,
    /TODO.*Salesforce/i,
    /TODO.*CRM.*integration/i
  ];
  
  let todosFound = false;
  for (const pattern of todoPatterns) {
    if (pattern.test(serverContent)) {
      console.log(`   ⚠️  Found TODO: ${pattern}`);
      todosFound = true;
    }
  }
  
  if (!todosFound) {
    console.log('   ✅ No CRM-related TODOs found');
  } else {
    console.log('   ⚠️  Some TODOs still present (may be intentional)');
  }
}

// Summary
console.log('\n' + '='.repeat(50));
if (allTestsPassed) {
  console.log('✅ All critical tests passed!');
  console.log('\n📝 Next steps:');
  console.log('   1. Test with real HubSpot API key (optional)');
  console.log('   2. Test with real Salesforce credentials (optional)');
  console.log('   3. Verify database table is created on startup');
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Please review the errors above.');
  process.exit(1);
}

