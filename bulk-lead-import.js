// Bulk Lead Import Script
// Usage: node bulk-lead-import.js

import fetch from 'node-fetch';

const API_BASE = 'https://ai-booking-mvp.onrender.com';
const API_KEY = process.env.API_KEY; // Set your API key

// Example leads data
const leads = [
  {
    name: "John Smith",
    phone: "+447123456789",
    company: "Tech Solutions Ltd",
    industry: "Technology",
    source: "cold-call"
  },
  {
    name: "Sarah Johnson", 
    phone: "+447987654321",
    company: "Marketing Pro",
    industry: "Marketing",
    source: "linkedin"
  },
  {
    name: "Mike Wilson",
    phone: "+447555123456", 
    company: "Business Growth Co",
    industry: "Consulting",
    source: "referral"
  }
];

async function importLeads() {
  console.log('🚀 Starting bulk lead import...');
  
  for (const lead of leads) {
    try {
      const response = await fetch(`${API_BASE}/api/initiate-lead-capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify({
          leadData: {
            phoneNumber: lead.phone,
            businessName: lead.company,
            decisionMaker: lead.name,
            industry: lead.industry,
            location: 'UK'
          }
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ Lead created: ${lead.name} (${lead.phone}) - Lead ID: ${result.leadId}`);
      } else {
        console.log(`❌ Failed to create lead: ${lead.name} - ${result.message}`);
      }
      
      // Wait 2 seconds between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`❌ Error creating lead ${lead.name}:`, error.message);
    }
  }
  
  console.log('🎉 Bulk import completed!');
}

// Run the import
importLeads().catch(console.error);
