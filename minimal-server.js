import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'ai-booking-mvp',
    time: new Date().toISOString(),
    status: 'minimal server for deployment testing'
  });
});

// Test endpoint with environment variables
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Test endpoint working', 
    timestamp: new Date().toISOString(),
    env: {
      googlePlaces: process.env.GOOGLE_PLACES_API_KEY ? 'SET' : 'NOT SET',
      companiesHouse: process.env.COMPANIES_HOUSE_API_KEY ? 'SET' : 'NOT SET',
      nodeEnv: process.env.NODE_ENV || 'not set'
    }
  });
});

// Simple UK Business Search endpoint
app.post('/api/uk-business-search', (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    console.log(`[UK BUSINESS SEARCH] Simple search for: "${query}"`);
    
    // Check API keys
    const apiKeysStatus = {
      googlePlaces: process.env.GOOGLE_PLACES_API_KEY ? 'SET' : 'NOT SET',
      companiesHouse: process.env.COMPANIES_HOUSE_API_KEY ? 'SET' : 'NOT SET'
    };
    
    console.log(`[UK BUSINESS SEARCH] API Keys Status:`, apiKeysStatus);
    
    // Simple sample data
    const results = [
      {
        name: "Bright Smile Dental Practice",
        address: "12 Harley Street, London, W1G 9QD",
        phone: "+44 20 7580 1234",
        email: "info@brightsmile.co.uk",
        website: "https://brightsmile.co.uk",
        employees: "15-25",
        services: ["General Dentistry", "Cosmetic Dentistry", "Orthodontics"],
        rating: 4.9,
        category: "dental",
        leadScore: 95,
        source: "sample",
        apiKeysStatus
      }
    ];
    
    res.json({
      success: true,
      results,
      count: results.length,
      query,
      usingRealData: false,
      apiKeysStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[UK BUSINESS SEARCH ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to search businesses',
      message: error.message 
    });
  }
});

// Simple Decision Maker Contacts endpoint
app.post('/api/decision-maker-contacts', (req, res) => {
  try {
    const { business, industry, targetRole } = req.body;
    
    if (!business || !industry || !targetRole) {
      return res.status(400).json({ 
        error: 'Business, industry, and targetRole are required' 
      });
    }
    
    console.log(`[DECISION MAKER CONTACT] Simple contact research for ${targetRole} at ${business.name}`);
    
    const contacts = {
      primary: [
        {
          type: "email",
          value: `${targetRole.toLowerCase().replace(' ', '.')}@${business.name.toLowerCase().replace(/\s+/g, '')}.co.uk`,
          confidence: 0.7,
          source: "email_pattern",
          title: targetRole
        }
      ],
      secondary: [
        {
          type: "phone",
          value: business.phone || "+44 20 1234 5678",
          confidence: 0.8,
          source: "business_contact",
          title: "Reception"
        }
      ],
      gatekeeper: [
        {
          type: "email",
          value: `info@${business.name.toLowerCase().replace(/\s+/g, '')}.co.uk`,
          confidence: 0.9,
          source: "business_contact",
          title: "General Contact"
        }
      ]
    };
    
    const strategy = {
      approach: "Direct outreach to decision maker",
      message: `Hi ${targetRole}, I noticed ${business.name} and wanted to reach out about our AI booking system that could help streamline your appointment scheduling.`,
      followUp: "Follow up in 3-5 days if no response",
      bestTime: "Tuesday-Thursday, 10am-2pm"
    };
    
    res.json({
      success: true,
      contacts,
      strategy,
      business,
      industry,
      targetRole,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[DECISION MAKER CONTACT ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to research decision maker contacts',
      message: error.message 
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`[MINIMAL SERVER] Server running on port ${PORT}`);
  console.log(`[MINIMAL SERVER] Health check: http://localhost:${PORT}/health`);
  console.log(`[MINIMAL SERVER] Test endpoint: http://localhost:${PORT}/api/test`);
  console.log(`[MINIMAL SERVER] UK Business Search: POST http://localhost:${PORT}/api/uk-business-search`);
  console.log(`[MINIMAL SERVER] Decision Maker Contacts: POST http://localhost:${PORT}/api/decision-maker-contacts`);
});
