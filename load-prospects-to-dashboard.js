// Convert test-leads.csv to format for cold-call-dashboard.html
// This generates the businesses array for your existing /admin/vapi/cold-call-campaign endpoint

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse CSV
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  const rows = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    return row;
  });
  
  return rows.filter(r => r.Phone && r['First Name']);
}

// Convert to format expected by /admin/vapi/cold-call-campaign
function convertToBusinesses(prospects) {
  return prospects.map((p, index) => ({
    id: `prospect-${index + 1}`,
    name: p.Company || `${p['First Name']} ${p['Last Name']}'s Business`,
    phone: p.Phone,
    email: p['Email Address'] || '',
    address: '', // Not in your CSV
    website: p.Website || '',
    decisionMaker: {
      name: `${p['First Name']} ${p['Last Name']}`,
      role: 'Owner', // Assuming owner
      email: p['Email Address'] || '',
      phone: p.Phone
    },
    industry: p.Industry || '',
    notes: p.Notes || ''
  }));
}

// Main
const csvPath = path.join(__dirname, 'test-leads.csv');
console.log('📋 Loading prospects from test-leads.csv...\n');

const prospects = parseCSV(csvPath);
const businesses = convertToBusinesses(prospects);

console.log(`✅ Loaded ${businesses.length} prospects\n`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 FORMATTED DATA FOR DASHBOARD');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Display formatted data
console.log('Copy this array and paste into your cold-call-dashboard.html:');
console.log('\n```javascript');
console.log(JSON.stringify(businesses, null, 2));
console.log('```\n');

// Save to file for easy copy-paste
const outputPath = path.join(__dirname, 'prospects-formatted.json');
fs.writeFileSync(outputPath, JSON.stringify(businesses, null, 2));
console.log(`✅ Saved to: ${outputPath}\n`);

// Display instructions
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 HOW TO USE YOUR EXISTING DASHBOARD');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('STEP 1: Start your server');
console.log('  npm start\n');

console.log('STEP 2: Open dashboard');
console.log('  http://localhost:3000/cold-call-dashboard\n');

console.log('STEP 3: Create assistant (click "Create Assistant" button)');
console.log('  - The assistant will use the script built into server.js\n');

console.log('STEP 4: Load prospects');
console.log('  - Open prospects-formatted.json');
console.log('  - Copy the array');
console.log('  - Paste in dashboard or modify loadBusinessesFromSearch() function\n');

console.log('STEP 5: Start campaign');
console.log('  - Enter the assistant ID from Step 3');
console.log('  - Click "Start Campaign"\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('⚡ QUICK API CALL METHOD (Faster):\n');
console.log('You can also call the endpoints directly:\n');

console.log('1. Create Assistant:');
console.log(`curl -X POST http://localhost:3000/admin/vapi/cold-call-assistant \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json"\n`);

console.log('2. Start Campaign:');
console.log(`curl -X POST http://localhost:3000/admin/vapi/cold-call-campaign \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d @prospects-formatted.json\n`);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Display individual prospects
console.log('Your prospects:');
businesses.forEach((b, i) => {
  console.log(`  ${i + 1}. ${b.decisionMaker.name} - ${b.name} (${b.industry}) - ${b.phone}`);
});
console.log('');

