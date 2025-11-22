#!/usr/bin/env node
// Auto-populate demo leads for testing
// Usage: node scripts/populate-demo-leads.js [clientKey]

import 'dotenv/config';

const API_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:10000';
const API_KEY = process.env.API_KEY;
const clientKey = process.argv[2] || 'demo-client';

const testLeads = [
  { name: 'Sarah Patel', phone: '+447700900123', email: 'sarah@example.com', service: 'Consultation' },
  { name: 'Marcus Flynn', phone: '+447700900124', email: 'marcus@example.com', service: 'Personal Training' },
  { name: 'Laura Chen', phone: '+447700900125', email: 'laura@example.com', service: 'Consultation' },
  { name: 'Rick Alvarez', phone: '+447700900126', email: 'rick@example.com', service: 'Personal Training' },
  { name: 'Emma Thompson', phone: '+447700900127', email: 'emma@example.com', service: 'Consultation' }
];

console.log(`\n📥 Populating ${testLeads.length} test leads for ${clientKey}...\n`);

for (const lead of testLeads) {
  try {
    const response = await fetch(`${API_URL}/api/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY || '',
        'X-Client-Key': clientKey
      },
      body: JSON.stringify({
        service: lead.service,
        lead: {
          name: lead.name,
          phone: lead.phone,
          email: lead.email
        },
        source: 'demo_test'
      })
    });

    if (response.ok) {
      console.log(`✅ ${lead.name} added`);
    } else {
      const error = await response.text();
      console.log(`⚠️  ${lead.name} failed: ${error}`);
    }
  } catch (error) {
    console.log(`❌ ${lead.name} error: ${error.message}`);
  }
}

console.log(`\n✅ Done! Check dashboard: ${API_URL}/client-dashboard.html?client=${clientKey}\n`);




