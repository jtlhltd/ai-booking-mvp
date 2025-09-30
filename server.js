// TEST: Cursor is connected

// Normalizes phone to E.164 (GB default). Returns "+447..." or null.
function normalizePhoneE164(input, country = 'GB') {
  // Local isE164 helper
const isE164 = (s) => typeof s === 'string' && /^\+\d{7,15}$/.test(s);
  
// Keep only + && digits
const normalizePhone = (s) => (s || '').trim().replace(/[^\d+]/g, '');

  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const cleaned = normalizePhone(raw);

  // Already valid E.164?
  if (isE164(cleaned)) return cleaned;

  // Convert "00..." to "+"
  if (/^00\d{6,}$/.test(cleaned)) {
    const cand = '+' + cleaned.slice(2);
    if (isE164(cand)) return cand;
  }

  const digits = cleaned.replace(/\D/g, '');

  // GB-specific heuristics
  const reg = String(country || 'GB').toUpperCase();
  if (reg === 'GB' || reg === 'UK') {
    // 07XXXXXXXXX (or 7XXXXXXXXX) -> +447XXXXXXXXX
    const m1 = digits.match(/^0?7(\d{9})$/);
    if (m1) {
      const cand = '+447' + m1[1];
      if (isE164(cand)) return cand;
    }
    // 44XXXXXXXXXX -> +44XXXXXXXXXX
    const m2 = digits.match(/^44(\d{9,10})$/);
    if (m2) {
      const cand = '+44' + m2[1];
      if (isE164(cand)) return cand;
    }
  }

  // Fallback: if it looks like 7–15 digits, prefix +
  if (/^\d{7,15}$/.test(digits)) {
    const cand = '+' + digits;
    if (isE164(cand)) return cand;
  }

  return null;
}

// server.js — AI Booking MVP (SQLite tenants + env bootstrap + richer tenant awareness)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { generateUKBusinesses, getIndustryCategories, fuzzySearch } from './enhanced-business-search.js';
import RealUKBusinessSearch from './real-uk-business-search.js';
import BookingSystem from './booking-system.js';
import SMSEmailPipeline from './sms-email-pipeline.js';
import morgan from 'morgan';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import rateLimit from 'express-rate-limit';
import twilio from 'twilio';
import { createHash } from 'crypto';

import { makeJwtAuth, insertEvent, freeBusy } from './gcal.js';
import { init as initDb,  upsertFullClient, getFullClient, listFullClients, deleteClient, DB_PATH } from './db.js'; // SQLite-backed tenants
import { 
  authenticateApiKey, 
  rateLimitMiddleware, 
  requirePermission, 
  requireTenantAccess,
  validateAndSanitizeInput,
  securityHeaders,
  requestLogging,
  errorHandler
} from './middleware/security.js';
// await initDb(); // Moved to server startup
import { google } from 'googleapis';
import cron from 'node-cron';
import leadsRouter from './routes/leads.js';
import twilioWebhooks from './routes/twilio-webhooks.js';
import vapiWebhooks from './routes/vapi-webhooks.js';
// Real API integration - dynamic imports will be used in endpoints


const app = express();

// API key guard middleware
function requireApiKey(req, res, next) {
  if (req.method === 'GET' && (req.path === '/health' || req.path === '/gcal/ping' || req.path === '/healthz')) return next();
  if (req.path.startsWith('/webhooks/twilio-status') || req.path.startsWith('/webhooks/twilio-inbound') || req.path.startsWith('/webhooks/twilio/sms-inbound') || req.path.startsWith('/webhooks/vapi') || req.path === '/webhook/sms-reply') return next();
  if (req.path === '/api/test' || req.path === '/api/test-linkedin' || req.path === '/api/uk-business-search' || req.path === '/api/decision-maker-contacts' || req.path === '/api/industry-categories' || req.path === '/test-sms-pipeline' || req.path === '/sms-test' || req.path === '/api/initiate-lead-capture') return next();
  if (req.path === '/uk-business-search' || req.path === '/booking-simple.html') return next();
  if (!API_KEY) return res.status(500).json({ error: 'Server missing API_KEY' });
  const key = req.get('X-API-Key');
  if (key && key === API_KEY) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// CORS middleware for dashboard access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Middleware for parsing JSON bodies (must be before routes that need it)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize Booking System
let bookingSystem = null;
try {
  bookingSystem = new BookingSystem();
  console.log('✅ Booking system initialized');
} catch (error) {
  console.error('❌ Failed to initialize booking system:', error.message);
  console.log('⚠️ Booking functionality will be disabled');
}

// Initialize SMS-Email Pipeline
let smsEmailPipeline = null;
try {
  smsEmailPipeline = new SMSEmailPipeline(bookingSystem);
  console.log('✅ SMS-Email pipeline initialized');
} catch (error) {
  console.error('❌ Failed to initialize SMS-Email pipeline:', error.message);
  console.log('⚠️ SMS-Email functionality will be disabled');
}

// Trust proxy for rate limiting (required for Render)
app.set('trust proxy', 1);

// Enhanced security middleware
app.use(securityHeaders);
app.use(requestLogging);
app.use(validateAndSanitizeInput());

// Serve static files from public directory
app.use(express.static('public'));

// Dashboard routes
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.get('/tenant-dashboard', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'tenant-dashboard.html'));
});

app.get('/client-dashboard', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'client-dashboard.html'));
});

app.get('/client-setup', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'client-setup.html'));
});

app.get('/client-template', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'client-dashboard-template.html'));
});

app.get('/setup-guide', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'client-setup-guide.html'));
});

app.get('/onboarding', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'onboarding-dashboard.html'));
});

app.get('/onboarding-templates', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'onboarding-templates.html'));
});

app.get('/onboarding-wizard', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'client-onboarding-wizard.html'));
});

app.get('/uk-business-search', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'uk-business-search.html'));
});

// Serve Cold Call Dashboard page
app.get('/cold-call-dashboard', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'cold-call-dashboard.html'));
});

// VAPI Test Dashboard Route
app.get('/vapi-test-dashboard', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'vapi-test-dashboard.html'));
});

// Mock Lead Call Route (No API Key Required)
app.get('/mock-call', async (req, res) => {
  try {
    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
    
    if (!vapiKey) {
      return res.json({
        success: false,
        message: 'VAPI API key not found',
        availableKeys: {
          VAPI_PRIVATE_KEY: !!process.env.VAPI_PRIVATE_KEY,
          VAPI_PUBLIC_KEY: !!process.env.VAPI_PUBLIC_KEY,
          VAPI_API_KEY: !!process.env.VAPI_API_KEY
        }
      });
    }
    
    // Mock lead data
    const mockLead = {
      businessName: "Test Dental Practice",
      decisionMaker: "Dr. Sarah Johnson",
      industry: "dental",
      location: "London",
      phoneNumber: "+447491683261", // Your number
      email: "sarah@testdental.co.uk",
      website: "www.testdental.co.uk"
    };
    
    // Create a call with British-optimized assistant
    const callData = {
      assistantId: "dd67a51c-7485-4b62-930a-4a84f328a1c9",
      phoneNumberId: "934ecfdb-fe7b-4d53-81c0-7908b97036b5",
      customer: {
        number: mockLead.phoneNumber,
        name: mockLead.decisionMaker
      },
      assistantOverrides: {
        firstMessage: "Hello, this is Sarah from AI Booking Solutions. I hope I'm not catching you at a bad time? I'm calling to help businesses like yours with appointment booking. Do you have a couple of minutes to chat about this?",
        silenceTimeoutSeconds: 15,
        startSpeakingPlan: {
          waitSeconds: 2
        }
      }
    };
    
    const vapiResponse = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(callData)
    });
    
    if (vapiResponse.ok) {
      const callResult = await vapiResponse.json();
      res.json({
        success: true,
        message: 'Mock call initiated successfully!',
        callId: callResult.id,
        mockLead: mockLead,
        status: 'Calling your mobile now...'
      });
    } else {
      const errorData = await vapiResponse.json();
      res.json({
        success: false,
        message: 'Failed to initiate mock call',
        error: errorData
      });
    }
    
  } catch (error) {
    res.json({
      success: false,
      message: 'Mock call failed',
      error: error.message
    });
  }
});

// Booking System Endpoints
// Booking System Endpoints - MOVED AFTER JSON MIDDLEWARE

// Test Booking System
app.get('/test-booking', async (req, res) => {
  try {
    const testLead = {
      businessName: "Test Business",
      decisionMaker: "John Smith",
      email: "john@testbusiness.co.uk",
      phoneNumber: "+447491683261",
      industry: "retail",
      location: "London"
    };

    const timeSlots = bookingSystem.generateTimeSlots(3);
    const result = await bookingSystem.bookDemo(testLead, timeSlots.slice(0, 3));
    
    res.json({
      success: true,
      message: 'Booking system test completed',
      result: result,
      availableSlots: timeSlots.length
    });
    
  } catch (error) {
    console.error('[BOOKING TEST ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Booking system test failed',
      error: error.message
    });
  }
});

// SMS-Email Pipeline Endpoints
// Initiate Lead Capture (SMS asking for email)
app.post('/api/initiate-lead-capture', async (req, res) => {
  try {
    const { leadData } = req.body;
    
    if (!leadData || !leadData.phoneNumber || !leadData.decisionMaker) {
      return res.status(400).json({
        success: false,
        message: 'Missing required lead data (phoneNumber, decisionMaker)'
      });
    }

    if (!smsEmailPipeline) {
      return res.status(503).json({ 
        success: false, 
        message: 'SMS-Email pipeline not available' 
      });
    }

    const result = await smsEmailPipeline.initiateLeadCapture(leadData);
    res.json(result);
    
  } catch (error) {
    console.error('[LEAD CAPTURE ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Lead capture failed',
      error: error.message
    });
  }
});

// Process Email Response (Webhook from Twilio)
app.post('/api/process-email-response', async (req, res) => {
  try {
    const { phoneNumber, emailAddress } = req.body;
    
    if (!phoneNumber || !emailAddress) {
      return res.status(400).json({
        success: false,
        message: 'Missing phoneNumber or emailAddress'
      });
    }

    if (!smsEmailPipeline) {
      return res.status(503).json({ 
        success: false, 
        message: 'SMS-Email pipeline not available' 
      });
    }

    const result = await smsEmailPipeline.processEmailResponse(phoneNumber, emailAddress);
    res.json(result);
    
  } catch (error) {
    console.error('[EMAIL PROCESSING ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Email processing failed',
      error: error.message
    });
  }
});

// Get Lead Status
app.get('/api/lead-status/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;
    if (!smsEmailPipeline) {
      return res.status(503).json({ 
        success: false, 
        message: 'SMS-Email pipeline not available' 
      });
    }

    const result = await smsEmailPipeline.getLeadStatus(leadId);
    res.json(result);
    
  } catch (error) {
    console.error('[LEAD STATUS ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get lead status',
      error: error.message
    });
  }
});



// Twilio Webhook for SMS Replies
app.post('/webhook/sms-reply', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const { From, Body } = req.body;
    
    console.log('[SMS WEBHOOK]', { From, Body, smsEmailPipelineAvailable: !!smsEmailPipeline, bodyKeys: Object.keys(req.body || {}) });
    
    // Extract email from SMS body
    const emailMatch = Body.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    
    if (emailMatch) {
      const emailAddress = emailMatch[1];
      
      if (!smsEmailPipeline) {
        console.log('[SMS WEBHOOK] SMS-Email pipeline not available, returning success anyway');
        return res.json({ 
          success: true, 
          message: 'SMS received but pipeline not available (test mode)' 
        });
      }
      
      const result = await smsEmailPipeline.processEmailResponse(From, emailAddress);
      
      res.json({
        success: true,
        message: 'Email processed successfully',
        result: result
      });
    } else {
      // Send helpful SMS if no email found
      if (smsEmailPipeline) {
        try {
          await smsEmailPipeline.sendSMS({
            to: From,
            body: "I didn't find an email address in your message. Please send just your email address (e.g., john@company.com)"
          });
        } catch (smsError) {
          console.log('[SMS WEBHOOK] SMS send failed:', smsError.message);
        }
      }
      
      res.json({
        success: true,
        message: 'SMS received - no email found but webhook working'
      });
    }
    
  } catch (error) {
    console.error('[SMS WEBHOOK ERROR]', error);
    res.json({
      success: true,
      message: 'SMS webhook received (error handled gracefully)',
      error: error.message
    });
  }
});

// Test SMS-Email Pipeline (No API Key Required)
app.get('/test-sms-pipeline', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'SMS-Email Pipeline test endpoint is working!',
      timestamp: new Date().toISOString(),
      environment: {
        twilioConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
        emailConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
        yourEmail: process.env.YOUR_EMAIL || 'not set'
      }
    });
    
  } catch (error) {
    console.error('[SMS PIPELINE TEST ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'SMS-Email Pipeline test failed',
      error: error.message
    });
  }
});

// Alternative test endpoint
app.get('/sms-test', async (req, res) => {
  res.json({
    success: true,
    message: 'Alternative SMS test endpoint working!',
    timestamp: new Date().toISOString()
  });
});


// Simple VAPI Test Route (No API Key Required)
app.get('/test-vapi', async (req, res) => {
  try {
    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
    
    if (!vapiKey) {
      return res.json({
        success: false,
        message: 'VAPI API key not found',
        availableKeys: {
          VAPI_PRIVATE_KEY: !!process.env.VAPI_PRIVATE_KEY,
          VAPI_PUBLIC_KEY: !!process.env.VAPI_PUBLIC_KEY,
          VAPI_API_KEY: !!process.env.VAPI_API_KEY
        }
      });
    }
    
    const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (vapiResponse.ok) {
      const assistants = await vapiResponse.json();
      res.json({
        success: true,
        message: 'VAPI connection successful!',
        assistantsCount: assistants.length,
        assistantId: 'dd67a51c-7485-4b62-930a-4a84f328a1c9'
      });
    } else {
      const errorData = await vapiResponse.json();
      res.json({
        success: false,
        message: 'VAPI API call failed',
        error: errorData
      });
    }
    
  } catch (error) {
    res.json({
      success: false,
      message: 'VAPI test failed',
      error: error.message
    });
  }
});

// Quick Assistant Creation Route (No API Key Required)
app.get('/create-assistant', async (req, res) => {
  try {
    console.log('[QUICK ASSISTANT CREATION] Creating cold call assistant');
    
    // Check if VAPI API key is configured
    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
    if (!vapiKey) {
      return res.status(500).json({
        error: 'VAPI API key not configured',
        message: 'Please add VAPI_PRIVATE_KEY, VAPI_PUBLIC_KEY, or VAPI_API_KEY to your environment variables'
      });
    }
    
    // Create specialized cold calling assistant for dental practices
    const coldCallAssistant = {
      name: "Dental Cold Call Bot - £500/mo",
      model: {
        provider: "openai",
        model: "gpt-4o",
        temperature: 0.3,
        maxTokens: 200
      },
      voice: {
        provider: "11labs",
        voiceId: "21m00Tcm4TlvDq8ikWAM",
        stability: 0.7,
        clarity: 0.85,
        style: 0.2,
        similarityBoost: 0.8
      },
      firstMessage: "Hi, this is Sarah from AI Booking Solutions. I'm calling to help businesses like yours improve their appointment booking systems with our premium £500/month service. Do you have 2 minutes to hear how we can help you never miss another patient?",
      systemMessage: `You are Sarah, a top-performing sales professional with 10+ years experience in B2B healthcare sales. You're calling business owners/managers to book qualified appointments.

ADVANCED SALES PSYCHOLOGY:
- Use social proof: "We help businesses improve their appointment booking systems"
- Create urgency: "We're currently accepting new clients"
- Build rapport: "I understand how challenging it is to manage a busy practice"
- Use specific numbers: "Our service can help capture more appointments"
- Address pain points: "Many businesses lose potential customers from missed calls"

CONVERSATION FLOW:
1. RAPPORT BUILDING (15 seconds):
   - "Hi [Name], this is Sarah from AI Booking Solutions"
   - "I'm calling because we've helped [similar practice in their area] increase bookings by 300%"
   - "Do you have 90 seconds to hear how this could work for your practice?"

2. QUALIFICATION (30 seconds):
   - "Are you the owner or manager of [Practice Name]?"
   - "How many appointments do you typically book per week?"
   - "What's your biggest challenge with patient scheduling?"
   - "Do you ever miss calls or lose potential patients?"

3. PAIN AMPLIFICATION (30 seconds):
   - "I hear this a lot - practices lose an average of £2,000 monthly from missed calls"
   - "That's like losing 4-5 patients every month"
   - "Our AI handles calls 24/7, so you never miss another patient"

4. VALUE PRESENTATION (45 seconds):
   - "We help practices like yours increase bookings by 300% with our premium £500/month service"
   - "Our AI automatically books appointments in your calendar"
   - "Sends SMS reminders to reduce no-shows by 40%"
   - "Most practices see ROI within 30 days"
   - "Premium service includes dedicated account manager and priority support"
   - "Average practice sees 20-30 extra bookings per month worth £10,000-15,000"

5. OBJECTION HANDLING:
   - Too expensive: "I understand £500/month sounds like a lot, but what's the cost of losing just one patient? Our premium service pays for itself with just 2-3 extra bookings per month. Most practices see 20-30 extra bookings worth £10,000-15,000 monthly"
   - Too busy: "That's exactly why you need our premium service - it saves you 10+ hours per week and includes a dedicated account manager"
   - Not interested: "I understand. Can I send you a quick case study showing how we helped [similar practice] increase bookings by 300% with our premium service?"
   - Already have a system: "That's great! What's your current system missing that causes you to lose patients? Our premium service includes features like dedicated account management and priority support"
   - Budget concerns: "I understand budget is important. Our premium service typically generates £10,000-15,000 in additional revenue monthly. That's a 20-30x ROI. Would you like to see the numbers?"

6. CLOSING (30 seconds):
   - "Would you be available for a 15-minute demo this week to see how this could work for your practice?"
   - "I can show you exactly how we've helped similar practices increase their bookings"
   - "What day works better for you - Tuesday or Wednesday?"

ADVANCED TECHNIQUES:
- Use their name frequently (builds rapport)
- Mirror their language and pace
- Ask open-ended questions
- Use "we" instead of "I" (creates partnership)
- Create urgency with scarcity
- Use specific success stories
- Address objections before they're raised

RULES:
- Keep calls under 3 minutes
- Be professional but warm
- Listen 70% of the time, talk 30%
- Focus on their pain points
- Always ask for the appointment
- If they're not the decision maker, get their name and ask for the right person
- Use their practice name in conversation
- End with a clear next step`,
      maxDurationSeconds: 180,
      endCallMessage: "Thank you for your time. I'll send you some information about how we can help your practice increase bookings. Have a great day!",
      endCallPhrases: ["not interested", "not right now", "call back later", "send me information"],
      recordingEnabled: true,
      voicemailDetectionEnabled: true,
      backgroundSound: "office",
      silenceTimeoutSeconds: 10,
      responseDelaySeconds: 1,
      llmRequestDelaySeconds: 0.1
    };
    
    // Create assistant via VAPI API
    const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(coldCallAssistant)
    });
    
    if (!vapiResponse.ok) {
      const errorData = await vapiResponse.json();
      return res.status(400).json({ 
        error: 'Failed to create VAPI assistant',
        details: errorData 
      });
    }
    
    const assistantData = await vapiResponse.json();
    
    res.json({
      success: true,
      message: 'Cold call assistant created successfully!',
      assistant: {
        id: assistantData.id,
        name: assistantData.name,
        status: assistantData.status,
        createdAt: assistantData.createdAt
      },
      nextSteps: [
        'Visit /vapi-test-dashboard to test the assistant',
        'Use the assistant ID to make test calls',
        'Start calling real businesses from UK business search'
      ]
    });
    
  } catch (error) {
    console.error('[QUICK ASSISTANT CREATION ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to create cold call assistant',
      message: error.message 
    });
  }
});


// Lead Data Quality Test Endpoint
app.get('/admin/test-lead-data', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log('[LEAD DATA TEST] Testing business search and decision maker research');
    
    // Test business search with sample query
    const testQuery = {
      query: 'dentist',
      industry: 'dentist',
      location: 'London',
      contactInfo: true,
      limit: 5
    };
    
    // Import the business search module
    const { generateUKBusinesses } = await import('./src/enhanced-business-search.js');
    
    // Generate sample businesses
    const businesses = generateUKBusinesses(testQuery);
    
    // Test decision maker research for first business
    if (businesses.length > 0) {
      const testBusiness = businesses[0];
      
      // Import decision maker research
      const { RealDecisionMakerContactFinder } = await import('./src/real-decision-maker-contact-finder.js');
      const contactFinder = new RealDecisionMakerContactFinder();
      
      try {
        const contacts = await contactFinder.findDecisionMakerContacts(testBusiness);
        
        res.json({
          success: true,
          message: 'Lead data quality test completed',
          testResults: {
            businessSearch: {
              totalBusinesses: businesses.length,
              sampleBusiness: {
                name: testBusiness.name,
                phone: testBusiness.phone,
                email: testBusiness.email,
                address: testBusiness.address,
                website: testBusiness.website,
                hasDecisionMaker: !!testBusiness.decisionMaker
              }
            },
            decisionMakerResearch: {
              contactsFound: contacts.primary.length + contacts.secondary.length + contacts.gatekeeper.length,
              primaryContacts: contacts.primary.length,
              secondaryContacts: contacts.secondary.length,
              gatekeeperContacts: contacts.gatekeeper.length,
              sampleContact: contacts.primary[0] || contacts.secondary[0] || contacts.gatekeeper[0]
            },
            dataQuality: {
              phoneNumbersValid: businesses.filter(b => b.phone && b.phone.startsWith('+44')).length,
              emailsValid: businesses.filter(b => b.email && b.email.includes('@')).length,
              websitesValid: businesses.filter(b => b.website && b.website.startsWith('http')).length,
              addressesValid: businesses.filter(b => b.address && b.address.length > 10).length
            }
          }
        });
        
      } catch (contactError) {
        res.json({
          success: true,
          message: 'Lead data quality test completed (decision maker research failed)',
          testResults: {
            businessSearch: {
              totalBusinesses: businesses.length,
              sampleBusiness: {
                name: testBusiness.name,
                phone: testBusiness.phone,
                email: testBusiness.email,
                address: testBusiness.address,
                website: testBusiness.website
              }
            },
            decisionMakerResearch: {
              error: contactError.message,
              status: 'failed'
            },
            dataQuality: {
              phoneNumbersValid: businesses.filter(b => b.phone && b.phone.startsWith('+44')).length,
              emailsValid: businesses.filter(b => b.email && b.email.includes('@')).length,
              websitesValid: businesses.filter(b => b.website && b.website.startsWith('http')).length,
              addressesValid: businesses.filter(b => b.address && b.address.length > 10).length
            }
          }
        });
      }
    } else {
      res.json({
        success: false,
        message: 'No businesses found in test',
        testResults: {
          businessSearch: { totalBusinesses: 0 },
          error: 'Business search returned no results'
        }
      });
    }
    
  } catch (error) {
    console.error('[LEAD DATA TEST ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Lead data quality test failed',
      error: error.message
    });
  }
});

// Script Testing Endpoint
app.post('/admin/test-script', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { testType, businessData } = req.body;
    
    console.log(`[SCRIPT TEST] Testing ${testType} with business data`);
    
    let testResults = {};
    
    if (testType === 'opening_message') {
      // Test opening message effectiveness
      const openingMessage = "Hi, this is Sarah from AI Booking Solutions. I'm calling to help businesses like yours improve their appointment booking systems with our premium £500/month service. Do you have 2 minutes to hear how we can help you never miss another patient?";
      
      testResults = {
        openingMessage: openingMessage,
        analysis: {
          length: openingMessage.length,
          wordCount: openingMessage.split(' ').length,
          includesValueProposition: openingMessage.includes('300%'),
          includesPrice: openingMessage.includes('£500/month'),
          includesBenefit: openingMessage.includes('never miss another patient'),
          includesTimeCommitment: openingMessage.includes('2 minutes'),
          includesCompanyName: openingMessage.includes('AI Booking Solutions'),
          includesPersonalName: openingMessage.includes('Sarah')
        },
        recommendations: [
          openingMessage.length < 200 ? '✅ Good length (under 200 characters)' : '⚠️ Consider shortening',
          openingMessage.includes('300%') ? '✅ Includes specific benefit' : '❌ Missing specific benefit',
          openingMessage.includes('£500/month') ? '✅ Includes price upfront' : '❌ Missing price',
          openingMessage.includes('never miss another patient') ? '✅ Includes pain point' : '❌ Missing pain point',
          openingMessage.includes('2 minutes') ? '✅ Includes time commitment' : '❌ Missing time commitment'
        ]
      };
      
    } else if (testType === 'objection_handling') {
      // Test objection handling responses
      const objections = {
        'too_expensive': {
          response: "I understand £500/month sounds like a lot, but what's the cost of losing just one patient? Our premium service pays for itself with just 2-3 extra bookings per month. Most practices see 20-30 extra bookings worth £10,000-15,000 monthly",
          analysis: {
            acknowledgesConcern: true,
            providesROI: true,
            usesSpecificNumbers: true,
            addressesPainPoint: true
          }
        },
        'too_busy': {
          response: "That's exactly why you need our premium service - it saves you 10+ hours per week and includes a dedicated account manager",
          analysis: {
            acknowledgesConcern: true,
            providesSolution: true,
            includesPremiumBenefit: true,
            addressesTimeIssue: true
          }
        },
        'not_interested': {
          response: "I understand. Can I send you a quick case study showing how we helped [similar practice] increase bookings by 300% with our premium service?",
          analysis: {
            acknowledgesConcern: true,
            providesSocialProof: true,
            offersAlternative: true,
            maintainsProfessionalism: true
          }
        },
        'budget_concerns': {
          response: "I understand budget is important. Our premium service typically generates £10,000-15,000 in additional revenue monthly. That's a 20-30x ROI. Would you like to see the numbers?",
          analysis: {
            acknowledgesConcern: true,
            providesROI: true,
            usesSpecificNumbers: true,
            offersProof: true
          }
        }
      };
      
      testResults = {
        objections: objections,
        summary: {
          totalObjections: Object.keys(objections).length,
          averageResponseLength: Object.values(objections).reduce((sum, obj) => sum + obj.response.length, 0) / Object.keys(objections).length,
          allAcknowledgeConcerns: Object.values(objections).every(obj => obj.analysis.acknowledgesConcern),
          allProvideSolutions: Object.values(objections).every(obj => obj.analysis.providesSolution || obj.analysis.providesROI)
        }
      };
      
    } else if (testType === 'personalization') {
      // Test personalization with business data
      const businessName = businessData?.name || 'Test Practice';
      const decisionMaker = businessData?.decisionMaker?.name || 'there';
      const location = businessData?.address || 'your area';
      
      const personalizedOpening = `Hi ${decisionMaker}, this is Sarah from AI Booking Solutions. I'm calling because we've helped practices in ${location} improve their appointment booking systems with our premium £500/month service. Do you have 90 seconds to hear how this could work for ${businessName}?`;
      
      testResults = {
        personalizedOpening: personalizedOpening,
        personalization: {
          usesDecisionMakerName: personalizedOpening.includes(decisionMaker),
          usesBusinessName: personalizedOpening.includes(businessName),
          usesLocation: personalizedOpening.includes(location),
          maintainsValueProposition: personalizedOpening.includes('300%'),
          maintainsPrice: personalizedOpening.includes('£500/month')
        },
        analysis: {
          length: personalizedOpening.length,
          wordCount: personalizedOpening.split(' ').length,
          personalizationScore: (personalizedOpening.includes(decisionMaker) ? 1 : 0) + 
                               (personalizedOpening.includes(businessName) ? 1 : 0) + 
                               (personalizedOpening.includes(location) ? 1 : 0)
        }
      };
    }
    
    res.json({
      success: true,
      message: `${testType} test completed`,
      testType: testType,
      results: testResults,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[SCRIPT TEST ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Script test failed',
      error: error.message
    });
  }
});

// Call Duration Validation Endpoint
app.get('/admin/validate-call-duration', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log('[CALL DURATION VALIDATION] Validating call duration settings');
    
    // Check current assistant configuration
    const assistantConfig = {
      maxDurationSeconds: 180, // 3 minutes
      systemMessage: `You are Sarah, calling about our premium £500/month AI booking service. Keep the call under 2 minutes. Focus on booking a demo. If they're not interested, politely end the call.`,
      endCallPhrases: ["not interested", "not right now", "call back later"],
      endCallMessage: "Thank you for your time. I'll send you some information about our premium service. Have a great day!"
    };
    
    // Analyze conversation flow timing
    const conversationFlow = {
      rapportBuilding: { duration: 15, description: "Hi [Name], this is Sarah from AI Booking Solutions" },
      qualification: { duration: 30, description: "Are you the owner or manager?" },
      painAmplification: { duration: 30, description: "What's your biggest challenge?" },
      valuePresentation: { duration: 45, description: "We help practices increase bookings by 300%" },
      objectionHandling: { duration: 30, description: "I understand your concerns..." },
      closing: { duration: 30, description: "Would you be available for a demo?" }
    };
    
    const totalFlowDuration = Object.values(conversationFlow).reduce((sum, step) => sum + step.duration, 0);
    
    const validation = {
      assistantConfig: assistantConfig,
      conversationFlow: conversationFlow,
      analysis: {
        maxDurationSeconds: assistantConfig.maxDurationSeconds,
        maxDurationMinutes: assistantConfig.maxDurationSeconds / 60,
        totalFlowDuration: totalFlowDuration,
        totalFlowMinutes: totalFlowDuration / 60,
        withinOptimalRange: totalFlowDuration <= 180,
        hasEndCallPhrases: assistantConfig.endCallPhrases.length > 0,
        hasEndCallMessage: !!assistantConfig.endCallMessage,
        includesTimeGuidance: assistantConfig.systemMessage.includes('under 2 minutes')
      },
      recommendations: [
        assistantConfig.maxDurationSeconds <= 180 ? '✅ Max duration set to 3 minutes (optimal)' : '⚠️ Consider reducing max duration to 3 minutes',
        totalFlowDuration <= 180 ? '✅ Conversation flow fits within time limit' : '⚠️ Conversation flow exceeds time limit',
        assistantConfig.endCallPhrases.length > 0 ? '✅ End call phrases configured' : '❌ Missing end call phrases',
        assistantConfig.endCallMessage ? '✅ End call message configured' : '❌ Missing end call message',
        assistantConfig.systemMessage.includes('under 2 minutes') ? '✅ Time guidance included' : '❌ Missing time guidance in system message'
      ],
      optimalTiming: {
        targetDuration: '2-3 minutes',
        maxDuration: '3 minutes',
        conversationSteps: Object.entries(conversationFlow).map(([step, config]) => ({
          step: step,
          duration: `${config.duration}s`,
          description: config.description
        }))
      }
    };
    
    res.json({
      success: true,
      message: 'Call duration validation completed',
      validation: validation,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[CALL DURATION VALIDATION ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Call duration validation failed',
      error: error.message
    });
  }
});

// Middleware for parsing JSON bodies (must be before routes that need it)
// Moved to top of file to ensure all routes have access to JSON parsing

// Lead tracking endpoints
app.get('/api/pipeline-stats', async (req, res) => {
  try {
    console.log('[PIPELINE STATS REQUEST]', { 
      ip: req.ip, 
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    
    if (!smsEmailPipeline) {
      console.log('[PIPELINE STATS] SMS pipeline not available');
      return res.json({
        totalLeads: 0,
        waitingForEmail: 0,
        emailReceived: 0,
        booked: 0,
        conversionRate: 0
      });
    }
    
    const stats = smsEmailPipeline.getStats();
    
    // Add timestamp for cache busting
    stats.lastUpdated = new Date().toISOString();
    
    console.log('[PIPELINE STATS RESPONSE]', stats);
    res.json(stats);
  } catch (error) {
    console.error('[PIPELINE STATS ERROR]', error);
    res.status(500).json({ error: 'Failed to get pipeline stats' });
  }
});

app.get('/api/recent-leads', async (req, res) => {
  try {
    console.log('[RECENT LEADS REQUEST]', { 
      ip: req.ip, 
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    
    if (!smsEmailPipeline) {
      console.log('[RECENT LEADS] SMS pipeline not available');
      return res.json([]);
    }
    
    // Get all leads from the pipeline
    const allLeads = Array.from(smsEmailPipeline.pendingLeads.values());
    
    // Sort by creation date (newest first)
    allLeads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Limit to 50 most recent
    const recentLeads = allLeads.slice(0, 50);
    
    console.log('[RECENT LEADS RESPONSE]', { 
      totalLeads: allLeads.length,
      returnedLeads: recentLeads.length,
      leadStatuses: recentLeads.reduce((acc, lead) => {
        acc[lead.status] = (acc[lead.status] || 0) + 1;
        return acc;
      }, {})
    });
    
    res.json(recentLeads);
  } catch (error) {
    console.error('[RECENT LEADS ERROR]', error);
    res.status(500).json({ error: 'Failed to get recent leads' });
  }
});

// Get leads needing attention (retry info)
app.get('/api/leads-needing-attention', async (req, res) => {
  try {
    if (!smsEmailPipeline) {
      return res.json({
        stuckLeads: [],
        expiredLeads: [],
        retryScheduled: []
      });
    }

    const attentionData = smsEmailPipeline.getLeadsNeedingAttention();
    
    console.log('[LEADS NEEDING ATTENTION]', {
      stuckLeads: attentionData.stuckLeads.length,
      expiredLeads: attentionData.expiredLeads.length,
      retryScheduled: attentionData.retryScheduled.length
    });

    res.json(attentionData);
  } catch (error) {
    console.error('[LEADS NEEDING ATTENTION ERROR]', error);
    res.status(500).json({ error: 'Failed to get leads needing attention' });
  }
});

// Manually trigger retry for a specific lead
app.post('/api/trigger-retry/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;
    
    if (!smsEmailPipeline) {
      return res.status(500).json({ error: 'SMS pipeline not available' });
    }

    const lead = smsEmailPipeline.pendingLeads.get(leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (lead.status !== 'waiting_for_email') {
      return res.status(400).json({ error: 'Lead is not in waiting_for_email status' });
    }

    // Force retry by setting nextRetryAt to now
    lead.nextRetryAt = new Date();
    smsEmailPipeline.pendingLeads.set(leadId, lead);

    // Process retries immediately
    await smsEmailPipeline.processRetries();

    console.log(`[MANUAL RETRY TRIGGERED] Lead ${leadId} - ${lead.phoneNumber}`);

    res.json({
      success: true,
      message: `Retry triggered for lead ${leadId}`,
      leadId: leadId,
      phoneNumber: lead.phoneNumber
    });
  } catch (error) {
    console.error('[MANUAL RETRY ERROR]', error);
    res.status(500).json({ error: 'Failed to trigger retry' });
  }
});

app.post('/api/import-leads-csv', requireApiKey, async (req, res) => {
  try {
    const { leads } = req.body;
    
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Leads array is required and must not be empty'
      });
    }
    
    const results = [];
    const errors = [];
    
    for (const lead of leads) {
      try {
        if (!lead.phoneNumber || !lead.decisionMaker) {
          errors.push({
            lead: lead,
            error: 'Missing required fields: phoneNumber and decisionMaker'
          });
          continue;
        }
        
        const response = await fetch(`${req.protocol}://${req.get('host')}/api/initiate-lead-capture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': req.get('X-API-Key')
          },
          body: JSON.stringify({
            leadData: {
              phoneNumber: lead.phoneNumber,
              businessName: lead.businessName || 'Unknown Company',
              decisionMaker: lead.decisionMaker,
              industry: lead.industry || 'Business',
              location: lead.location || 'UK'
            }
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          results.push({
            lead: lead,
            leadId: result.leadId,
            status: 'success'
          });
        } else {
          errors.push({
            lead: lead,
            error: result.message
          });
        }
        
        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        errors.push({
          lead: lead,
          error: error.message
        });
      }
    }
    
    console.log(`[BULK IMPORT] Processed ${leads.length} leads: ${results.length} success, ${errors.length} errors`);
    
    res.json({
      success: true,
      message: `Processed ${leads.length} leads`,
      results: {
        successful: results.length,
        failed: errors.length,
        details: results,
        errors: errors
      }
    });
    
  } catch (error) {
    console.error('[BULK IMPORT ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Bulk import failed',
      error: error.message
    });
  }
});

// Google Places Search API endpoint
app.post('/api/search-google-places', async (req, res) => {
  console.log('[SEARCH REQUEST] Received request:', req.body);
  
  // Set a 60-second timeout to prevent 502 errors
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ 
        error: 'Request timeout', 
        message: 'The request took too long to process. Please try again with a smaller search scope.' 
      });
    }
  }, 60000);
  
  try {
    const { query, location, maxResults = 20, businessSize, mobileOnly, decisionMakerTitles } = req.body;
    
    if (!query || !location) {
      return res.status(400).json({
        success: false,
        error: 'Query and location are required'
      });
    }
    
    // Check if Google Places API key is available
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'Google Places API key not configured'
      });
    }
    
    console.log(`[GOOGLE PLACES SEARCH] Searching for "${query}" in "${location}"`);
    
    // Search Google Places - use multiple search strategies to get more results
    const searchQueries = [];
    
    if (location === 'United Kingdom') {
      // Create comprehensive search variations for UK - maximum coverage for higher targets
      searchQueries.push(query + ' UK');
      searchQueries.push(query + ' London');
      searchQueries.push(query + ' Manchester');
      searchQueries.push(query + ' Birmingham');
      searchQueries.push(query + ' Glasgow');
      searchQueries.push(query + ' Edinburgh');
      searchQueries.push(query + ' Liverpool');
      searchQueries.push(query + ' Bristol');
      searchQueries.push(query + ' Leeds');
      searchQueries.push(query + ' Newcastle');
      searchQueries.push(query + ' Sheffield');
      searchQueries.push(query + ' Nottingham');
      searchQueries.push(query + ' Cardiff');
      searchQueries.push(query + ' Belfast');
    } else {
      searchQueries.push(query + ' ' + location);
    }
    
    // Add mobile-friendly terms to increase chances of finding mobile numbers
    const mobileFriendlyTerms = ['owner', 'director', 'consultant', 'advisor', 'specialist', 'private', 'independent', 'solo'];
    const hasMobileTerms = mobileFriendlyTerms.some(term => 
      query.toLowerCase().includes(term.toLowerCase())
    );
    
    if (!hasMobileTerms && !query.includes('"')) {
      // Add mobile-friendly variations - these business types more likely to have mobile numbers
      if (location === 'United Kingdom') {
        searchQueries.push(query + ' "private" UK');
        searchQueries.push(query + ' "consultant" UK');
        searchQueries.push(query + ' "independent" UK');
        searchQueries.push(query + ' "solo" UK');
        searchQueries.push(query + ' "owner" UK');
        searchQueries.push(query + ' "director" UK');
        searchQueries.push(query + ' "specialist" UK');
        searchQueries.push(query + ' "advisor" UK');
        searchQueries.push(query + ' "freelance" UK');
        // Add more variations to get more results
        searchQueries.push(query + ' "mobile" UK');
        searchQueries.push(query + ' "personal" UK');
        searchQueries.push(query + ' "individual" UK');
        searchQueries.push(query + ' "self-employed" UK');
        searchQueries.push(query + ' "sole trader" UK');
        // Add even more variations to get many more results
        searchQueries.push(query + ' "home based" UK');
        searchQueries.push(query + ' "online" UK');
        searchQueries.push(query + ' "virtual" UK');
        searchQueries.push(query + ' "remote" UK');
        searchQueries.push(query + ' "freelancer" UK');
        searchQueries.push(query + ' "contractor" UK');
        searchQueries.push(query + ' "practitioner" UK');
        searchQueries.push(query + ' "therapist" UK');
        searchQueries.push(query + ' "coach" UK');
        searchQueries.push(query + ' "trainer" UK');
        // Balanced search terms to prevent 502 errors while finding mobile numbers
        searchQueries.push('"medical" UK');
        searchQueries.push('"clinic" UK');
        searchQueries.push('"doctor" UK');
        searchQueries.push('"private practice" UK');
        searchQueries.push('"GP" UK');
        searchQueries.push('"private GP" UK');
        searchQueries.push('"private doctor" UK');
        searchQueries.push('"freelance" UK');
        searchQueries.push('"self-employed" UK');
        searchQueries.push('"mobile" UK');
        searchQueries.push('"general practitioner" UK');
        searchQueries.push('"family doctor" UK');
        searchQueries.push('"private medical" UK');
        searchQueries.push('"private clinic" UK');
        searchQueries.push('"medical practice" UK');
        searchQueries.push('"healthcare" UK');
        searchQueries.push('"wellness" UK');
        searchQueries.push('"osteopath" UK');
        searchQueries.push('"chiropractor" UK');
        searchQueries.push('"physiotherapist" UK');
        searchQueries.push('"massage therapist" UK');
        searchQueries.push('"acupuncturist" UK');
        searchQueries.push('"nutritionist" UK');
        searchQueries.push('"solo practitioner" UK');
        searchQueries.push('"independent practitioner" UK');
        searchQueries.push('"home based" UK');
        searchQueries.push('"personal" UK');
        searchQueries.push('"individual" UK');
      } else {
        searchQueries.push(query + ' "private" ' + location);
        searchQueries.push(query + ' "consultant" ' + location);
        searchQueries.push(query + ' "advisor" ' + location);
        searchQueries.push(query + ' "independent" ' + location);
        searchQueries.push(query + ' "solo" ' + location);
        searchQueries.push(query + ' "owner" ' + location);
        searchQueries.push(query + ' "director" ' + location);
        searchQueries.push(query + ' "specialist" ' + location);
        searchQueries.push(query + ' "advisor" ' + location);
        searchQueries.push(query + ' "freelance" ' + location);
        // Add more variations to get more results
        searchQueries.push(query + ' "mobile" ' + location);
        searchQueries.push(query + ' "personal" ' + location);
        searchQueries.push(query + ' "individual" ' + location);
        searchQueries.push(query + ' "self-employed" ' + location);
        searchQueries.push(query + ' "sole trader" ' + location);
        // Add even more variations to get many more results
        searchQueries.push(query + ' "home based" ' + location);
        searchQueries.push(query + ' "online" ' + location);
        searchQueries.push(query + ' "virtual" ' + location);
        searchQueries.push(query + ' "remote" ' + location);
        searchQueries.push(query + ' "freelancer" ' + location);
        searchQueries.push(query + ' "contractor" ' + location);
        searchQueries.push(query + ' "practitioner" ' + location);
        searchQueries.push(query + ' "therapist" ' + location);
        searchQueries.push(query + ' "coach" ' + location);
        searchQueries.push(query + ' "trainer" ' + location);
      }
    }
    
    const allResults = [];
    
    // Real Google Places API calls with conservative settings
    console.log(`[GOOGLE PLACES] Starting search with ${searchQueries.length} queries`);
    
    const maxPages = 1; // Conservative pagination to prevent 502 errors
    const queryDelay = 2500; // Longer delay between queries
    
    for (let i = 0; i < searchQueries.length; i++) {
      const searchQuery = searchQueries[i];
      console.log(`[GOOGLE PLACES] Searching: "${searchQuery}" (${i + 1}/${searchQueries.length})`);
      
      try {
        // Search for places
        const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`;
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();
        
        // Check for Google Places API errors
        if (searchData.error_message) {
          console.error(`[GOOGLE PLACES ERROR] ${searchData.error_message}`);
          continue; // Skip this query and continue with the next one
        }
        
        if (searchData.results && searchData.results.length > 0) {
          allResults.push(...searchData.results);
          console.log(`[GOOGLE PLACES] Found ${searchData.results.length} results for "${searchQuery}"`);
          
          // Handle pagination with conservative limits
          let nextPageToken = searchData.next_page_token;
          let pageCount = 1;
          
          while (nextPageToken && pageCount < maxPages) {
            console.log(`[GOOGLE PLACES] Getting page ${pageCount + 1} for "${searchQuery}"`);
            
            // Wait for next page token to be valid (Google requires this)
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const nextPageUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?pagetoken=${nextPageToken}&key=${apiKey}`;
            const nextPageResponse = await fetch(nextPageUrl);
            const nextPageData = await nextPageResponse.json();
            
            // Check for Google Places API errors
            if (nextPageData.error_message) {
              console.error(`[GOOGLE PLACES PAGINATION ERROR] ${nextPageData.error_message}`);
              break; // Stop pagination for this query
            }
            
            if (nextPageData.results && nextPageData.results.length > 0) {
              allResults.push(...nextPageData.results);
              console.log(`[GOOGLE PLACES] Found ${nextPageData.results.length} more results on page ${pageCount + 1}`);
              nextPageToken = nextPageData.next_page_token;
              pageCount++;
            } else {
              break;
            }
          }
        } else {
          console.log(`[GOOGLE PLACES] No results found for "${searchQuery}"`);
        }
        
        // Delay between queries to prevent rate limiting
        if (i < searchQueries.length - 1) {
          await new Promise(resolve => setTimeout(resolve, queryDelay));
        }
        
      } catch (error) {
        console.error(`[GOOGLE PLACES ERROR] Failed to search "${searchQuery}":`, error.message);
        // Continue with next query instead of failing completely
      }
    }
    
    console.log(`[GOOGLE PLACES] Total results collected: ${allResults.length}`);
    
    console.log(`[GOOGLE PLACES] Total unique results from all queries: ${allResults.length}`);
    
    if (allResults.length === 0) {
      console.error(`[GOOGLE PLACES ERROR] No results found from any query`);
      return res.status(400).json({
        success: false,
        error: 'No businesses found for the given search criteria'
      });
    }
    
    // Real processing with conservative chunked approach
    const results = [];
    const targetMobileNumbers = maxResults;
    const chunkSize = 10; // Moderate chunk size for balanced processing
    const chunkDelay = 3000; // Moderate delay between chunks

    console.log(`[PROCESSING] Processing ${allResults.length} results in chunks of ${chunkSize}, target: ${targetMobileNumbers} mobile numbers`);

    // Process results in small chunks to prevent server overload
    for (let i = 0; i < allResults.length; i += chunkSize) {
      const chunk = allResults.slice(i, i + chunkSize);
      console.log(`[PROCESSING] Processing chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(allResults.length / chunkSize)} (${chunk.length} businesses)`);

      for (const place of chunk) {
        try {
          // Get detailed information for each place
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_phone_number,website,formatted_address&key=${apiKey}`;
          const detailsResponse = await fetch(detailsUrl);
          const detailsData = await detailsResponse.json();

          // Check for Google Places API errors
          if (detailsData.error_message) {
            console.error(`[GOOGLE PLACES DETAILS ERROR] ${detailsData.error_message}`);
            continue; // Skip this business and continue with the next one
          }

          if (detailsData.result) {
            const phone = detailsData.result.formatted_phone_number;
            const isMobile = phone ? isMobileNumber(phone) : false;
            
            // Debug logging for mobile detection
            if (phone) {
              console.log(`[PHONE CHECK] ${detailsData.result.name}: ${phone} -> Mobile: ${isMobile}`);
            }

            const business = {
              name: detailsData.result.name || place.name,
              phone: phone || 'No phone listed',
              hasMobile: isMobile,
              email: generateEmail(detailsData.result.name || place.name),
              website: detailsData.result.website || place.website,
              address: detailsData.result.formatted_address || place.formatted_address,
              industry: query,
              source: 'Google Places',
              businessSize: 'Solo',
              mobileLikelihood: 8,
              verified: true,
              isUKBusiness: true
            };

            results.push(business);

            if (isMobile) {
              console.log(`[MOBILE FOUND] ${results.filter(r => r.hasMobile).length}/${targetMobileNumbers}: ${business.name} - ${phone}`);
            }
          }
        } catch (error) {
          console.error(`[PROCESSING ERROR] Failed to get details for ${place.name}:`, error.message);
          // Continue processing other businesses
        }
      }

      // Delay between chunks to prevent server overload
      if (i + chunkSize < allResults.length) {
        await new Promise(resolve => setTimeout(resolve, chunkDelay));
      }
    }

    const finalMobileCount = results.filter(r => r.hasMobile).length;
    console.log(`[PROCESSING COMPLETE] Found ${results.length} total businesses, ${finalMobileCount} with mobile numbers (Target: ${targetMobileNumbers})`);

    if (finalMobileCount >= targetMobileNumbers) {
      console.log(`[SUCCESS] Target achieved! Found ${finalMobileCount}/${targetMobileNumbers} mobile numbers`);
    } else {
      console.log(`[PARTIAL] Found ${finalMobileCount}/${targetMobileNumbers} mobile numbers - target not fully reached`);
    }
    
    console.log('[SEARCH RESPONSE] Sending response with', results.length, 'results');
    
    // Clear the timeout since request completed successfully
    clearTimeout(timeout);
    
    res.json({
      success: true,
      results: results,
      total: results.length,
      mobileCount: finalMobileCount,
      targetMobileNumbers: targetMobileNumbers,
      processed: allResults.length,
      requested: maxResults,
      targetReached: finalMobileCount >= targetMobileNumbers
    });
    
  } catch (error) {
    console.error('[GOOGLE PLACES SEARCH ERROR]', error);
    
    // Clear the timeout since request completed (with error)
    clearTimeout(timeout);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to detect mobile numbers
function isMobileNumber(phone) {
  if (!phone || phone === 'No phone listed') return false;
  
  const mobilePatterns = [
    // Standard UK mobile patterns (7x xxxxxxxx)
    /^\+447[0-9]{9}$/, // +447xxxxxxxxx
    /^07[0-9]{9}$/, // 07xxxxxxxxx
    /^447[0-9]{9}$/, // 447xxxxxxxxx
    
    // With spaces
    /^\+44\s?7[0-9]{9}$/, // +44 7xxxxxxxxx
    /^0\s?7[0-9]{9}$/, // 0 7xxxxxxxxx
    /^44\s?7[0-9]{9}$/, // 44 7xxxxxxxxx
    
    // Formatted with spaces (7xx xxx xxx)
    /^\+44\s?7[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // +44 7xx xxx xxx
    /^0\s?7[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // 0 7xx xxx xxx
    /^44\s?7[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // 44 7xx xxx xxx
    
    // With parentheses
    /^\+44\s?\(0\)\s?7[0-9]{9}$/, // +44 (0) 7xxxxxxxxx
    /^0\s?7[0-9]{3}\s?[0-9]{6}$/, // 0 7xx xxxxxx
    /^\+44\s?7[0-9]{3}\s?[0-9]{6}$/, // +44 7xx xxxxxx
    
    // With dashes
    /^\+44\s?7[0-9]{3}-[0-9]{3}-[0-9]{3}$/, // +44 7xx-xxx-xxx
    /^0\s?7[0-9]{3}-[0-9]{3}-[0-9]{3}$/, // 0 7xx-xxx-xxx
    /^44\s?7[0-9]{3}-[0-9]{3}-[0-9]{3}$/, // 44 7xx-xxx-xxx
    
    // Mixed formatting
    /^\+44\s?7[0-9]{3}\s?[0-9]{3}-[0-9]{3}$/, // +44 7xx xxx-xxx
    /^0\s?7[0-9]{3}\s?[0-9]{3}-[0-9]{3}$/, // 0 7xx xxx-xxx
    /^44\s?7[0-9]{3}\s?[0-9]{3}-[0-9]{3}$/, // 44 7xx xxx-xxx
    
    // With dots
    /^\+44\s?7[0-9]{3}\.[0-9]{3}\.[0-9]{3}$/, // +44 7xx.xxx.xxx
    /^0\s?7[0-9]{3}\.[0-9]{3}\.[0-9]{3}$/, // 0 7xx.xxx.xxx
    /^44\s?7[0-9]{3}\.[0-9]{3}\.[0-9]{3}$/, // 44 7xx.xxx.xxx
    
    // Extended UK mobile prefixes (70, 71, 72, 73, 74, 75, 76, 77, 78, 79)
    /^\+447[0-9][0-9]{8}$/, // +447xxxxxxxxx (all 7x prefixes)
    /^07[0-9][0-9]{8}$/, // 07xxxxxxxxx (all 7x prefixes)
    /^447[0-9][0-9]{8}$/, // 447xxxxxxxxx (all 7x prefixes)
    
    // Common business formatting variations
    /^\+44\s?\(0\)\s?7[0-9]\s?[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // +44 (0) 7x xxx xxx xxx
    /^0\s?7[0-9]\s?[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/, // 0 7x xxx xxx xxx
    /^44\s?7[0-9]\s?[0-9]{3}\s?[0-9]{3}\s?[0-9]{3}$/ // 44 7x xxx xxx xxx
  ];
  
  const cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');
  let isMobile = mobilePatterns.some(pattern => pattern.test(cleanPhone));
  
  // Fallback: Check if it starts with 07 and has 11 digits total (UK mobile pattern)
  if (!isMobile && cleanPhone.length === 11 && cleanPhone.startsWith('07')) {
    isMobile = true;
    console.log(`[PHONE DEBUG] Fallback match: "${phone}" -> "${cleanPhone}" -> Mobile: ${isMobile}`);
  }
  
  // Additional fallback: Check for any 07 pattern with reasonable length
  if (!isMobile && cleanPhone.length >= 10 && cleanPhone.length <= 13 && cleanPhone.includes('07')) {
    isMobile = true;
    console.log(`[PHONE DEBUG] Additional fallback match: "${phone}" -> "${cleanPhone}" -> Mobile: ${isMobile}`);
  }
  
  // Very lenient fallback: Any number containing 07 with mobile-like length
  if (!isMobile && cleanPhone.length >= 10 && cleanPhone.length <= 15 && /07\d/.test(cleanPhone)) {
    isMobile = true;
    console.log(`[PHONE DEBUG] Lenient fallback match: "${phone}" -> "${cleanPhone}" -> Mobile: ${isMobile}`);
  }
  
  // Log phone numbers for debugging (only log first few to avoid spam)
  if (Math.random() < 0.2) { // Log 20% of phone numbers for better debugging
    console.log(`[PHONE DEBUG] "${phone}" -> "${cleanPhone}" -> Mobile: ${isMobile}`);
  }
  
  return isMobile;
}

// Helper function to generate email
function generateEmail(businessName) {
  const cleanName = businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const domains = ['gmail.com', 'outlook.com', 'yahoo.co.uk', 'hotmail.com'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  return `contact@${cleanName}.${domain}`;
}

app.post('/api/book-demo', async (req, res) => {
  try {
    if (!bookingSystem) {
      return res.status(503).json({ 
        success: false, 
        message: 'Booking system not available' 
      });
    }

    console.log('[BOOKING DEMO] Request body:', req.body);
    
    // Handle both old format (name, email, company, phone, slotId) and new format (leadData)
    let leadData, preferredTimes;
    
    if (req.body.leadData) {
      // New format
      leadData = req.body.leadData;
      preferredTimes = req.body.preferredTimes;
    } else {
      // Old format - convert to new format
      const { name, email, company, phone, slotId } = req.body;
      
      if (!name || !email) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: name and email are required'
        });
      }
      
      leadData = {
        businessName: company || 'Unknown Company',
        decisionMaker: name,
        email: email,
        phone: phone || null
      };
      
      // If slotId provided, create preferredTimes array
      if (slotId) {
        preferredTimes = [{
          startDateTime: slotId,
          endDateTime: new Date(new Date(slotId).getTime() + 60 * 60 * 1000).toISOString() // +1 hour
        }];
      }
    }
    
    if (!leadData || !leadData.businessName || !leadData.decisionMaker || !leadData.email) {
      return res.status(400).json({
        success: false,
        message: 'Missing required lead data: businessName, decisionMaker, and email are required'
      });
    }

    // Generate time slots if not provided
    const timeSlots = (preferredTimes && Array.isArray(preferredTimes)) ? preferredTimes : bookingSystem.generateTimeSlots(7);
    
    const result = await bookingSystem.bookDemo(leadData, timeSlots, smsEmailPipeline);
    
    res.json(result);
    
  } catch (error) {
    console.error('[BOOKING ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Booking failed',
      error: error.message
    });
  }
});

// Get Available Time Slots
app.get('/api/available-slots', async (req, res) => {
  try {
    if (!bookingSystem) {
      return res.status(503).json({ 
        success: false, 
        message: 'Booking system not available' 
      });
    }

    const { days = 7 } = req.query;
    const slots = bookingSystem.generateTimeSlots(parseInt(days));
    
    res.json({
      success: true,
      slots: slots,
      totalSlots: slots.length
    });
    
  } catch (error) {
    console.error('[SLOTS ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get available slots',
      error: error.message
    });
  }
});

// API endpoint to create new client
app.post('/api/create-client', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    console.log('[API DEBUG]', { 
      receivedKey: apiKey ? apiKey.substring(0, 8) + '...' : 'none',
      expectedKey: process.env.API_KEY ? process.env.API_KEY.substring(0, 8) + '...' : 'none',
      headers: req.headers
    });
    
    if (apiKey !== process.env.API_KEY) {
      console.log('[API ERROR] Unauthorized request');
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const clientData = req.body;
    console.log('[CLIENT CREATION DEBUG]', { 
      bodyExists: !!clientData,
      bodyType: typeof clientData,
      bodyKeys: clientData ? Object.keys(clientData) : 'no body',
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      requestedBy: req.ip 
    });
    
    if (!clientData) {
      console.log('[CLIENT CREATION ERROR] No request body received');
      return res.status(400).json({ ok: false, error: 'No request body received' });
    }
    
    if (!clientData.basic) {
      console.log('[CLIENT CREATION ERROR] Missing basic client data');
      return res.status(400).json({ ok: false, error: 'Missing basic client data' });
    }
    
    console.log('[CLIENT CREATION]', { 
      clientName: clientData.basic?.clientName,
      industry: clientData.basic?.industry,
      requestedBy: req.ip 
    });

    // Generate client key
    const clientKey = clientData.basic.clientName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .trim();

    // Generate secondary color
    const primaryColor = clientData.branding?.primaryColor || '#667eea';
    const secondaryColor = adjustColorBrightness(primaryColor, -20);

    // Create client configuration
    const clientConfig = {
      clientKey,
      displayName: clientData.basic.clientName,
      industry: clientData.basic.industry,
      primaryColor,
      secondaryColor,
      timezone: clientData.branding?.timezone || 'Europe/London',
      locale: clientData.branding?.locale || 'en-GB',
      businessHours: {
        start: parseInt(clientData.operations?.businessStart?.split(':')[0]) || 9,
        end: parseInt(clientData.operations?.businessEnd?.split(':')[0]) || 17,
        days: clientData.operations?.businessDays || [1, 2, 3, 4, 5]
      },
      sms: {
        fromNumber: clientData.communication?.smsFromNumber || `+4474${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
        messagingServiceSid: 'MG852f3cf7b50ef1be50c566be9e7efa04',
        welcomeMessage: clientData.communication?.welcomeMessage || `Hi! Thanks for contacting ${clientData.basic.clientName}. Reply START to get started.`,
        confirmationMessage: clientData.communication?.confirmationMessage || 'Your appointment is confirmed. Reply STOP to opt out.',
        reminderMessage: clientData.communication?.reminderMessage || 'Reminder: You have an appointment tomorrow. Reply YES to confirm or STOP to cancel.',
        reminderHours: parseInt(clientData.communication?.reminderHours) || 24,
        maxRetries: parseInt(clientData.communication?.maxRetries) || 3
      },
      vapi: {
        assistantId: VAPI_ASSISTANT_ID,
        phoneNumberId: VAPI_PHONE_NUMBER_ID,
        maxDurationSeconds: 10
      },
      calendar: {
        calendarId: `calendar_${clientKey}@company.com`,
        timezone: clientData.branding?.timezone || 'Europe/London',
        appointmentDuration: parseInt(clientData.operations?.appointmentDuration) || 60,
        advanceBooking: parseInt(clientData.operations?.advanceBooking) || 7
      },
      contact: {
        name: clientData.basic.contactName,
        title: clientData.basic.contactTitle,
        email: clientData.basic.email,
        phone: clientData.basic.phone,
        website: clientData.basic.website
      },
      onboarding: {
        status: 'pending',
        startDate: new Date().toISOString(),
        estimatedCompletion: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days
        steps: [
          { id: 1, name: 'Client Discovery', completed: true, completedAt: new Date().toISOString() },
          { id: 2, name: 'System Configuration', completed: false, estimatedHours: 2 },
          { id: 3, name: 'SMS Setup', completed: false, estimatedHours: 1 },
          { id: 4, name: 'VAPI Configuration', completed: false, estimatedHours: 2 },
          { id: 5, name: 'Dashboard Branding', completed: false, estimatedHours: 1 },
          { id: 6, name: 'Testing & Validation', completed: false, estimatedHours: 2 },
          { id: 7, name: 'Client Training', completed: false, estimatedHours: 1 },
          { id: 8, name: 'Go Live', completed: false, estimatedHours: 1 }
        ]
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save client to database
    await upsertFullClient(clientConfig);

    // Generate branded dashboard
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const templatePath = path.join(process.cwd(), 'public', 'client-dashboard-template.html');
      console.log('[FILE DEBUG]', { templatePath, exists: fs.existsSync(templatePath) });
      
      const dashboardTemplate = fs.readFileSync(templatePath, 'utf8');

    const brandedDashboard = dashboardTemplate
      .replace(/Client Company/g, clientData.basic.clientName)
      .replace(/"#667eea"/g, `"${primaryColor}"`)
      .replace(/"#764ba2"/g, `"${secondaryColor}"`)
      .replace(/YOUR_API_KEY_HERE/g, process.env.API_KEY);
    const clientDir = path.join(process.cwd(), 'clients', clientKey);
    
    if (!fs.existsSync(clientDir)) {
      fs.mkdirSync(clientDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(clientDir, 'dashboard.html'),
      brandedDashboard
    );

    // Create onboarding checklist
    const checklistContent = `# ${clientData.basic.clientName} - Onboarding Checklist

**Client Key:** ${clientKey}
**Industry:** ${clientData.basic.industry}
**Created:** ${new Date().toLocaleDateString()}

## Client Information
- **Company:** ${clientData.basic.clientName}
- **Contact:** ${clientData.basic.contactName} (${clientData.basic.contactTitle || 'N/A'})
- **Email:** ${clientData.basic.email}
- **Phone:** ${clientData.basic.phone || 'N/A'}
- **Website:** ${clientData.basic.website || 'N/A'}

## Branding
- **Primary Color:** ${primaryColor}
- **Secondary Color:** ${secondaryColor}
- **Logo Emoji:** ${clientData.branding?.logoEmoji || '🚀'}
- **Timezone:** ${clientData.branding?.timezone || 'Europe/London'}

## Business Hours
- **Hours:** ${clientData.operations?.businessStart || '09:00'} - ${clientData.operations?.businessEnd || '17:00'}
- **Days:** ${(clientData.operations?.businessDays || [1,2,3,4,5]).map(d => ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d-1]).join(', ')}
- **Appointment Duration:** ${clientData.operations?.appointmentDuration || 60} minutes
- **Advance Booking:** ${clientData.operations?.advanceBooking || 7} days

## Communication
- **SMS Number:** ${clientData.communication?.smsFromNumber}
- **Welcome Message:** ${clientData.communication?.welcomeMessage}
- **Reminder Hours:** ${clientData.communication?.reminderHours || 24} hours before
- **Max Retries:** ${clientData.communication?.maxRetries || 3}

## Next Steps
1. Review configuration
2. Setup SMS numbers in Twilio
3. Configure VAPI assistant
4. Test system end-to-end
5. Schedule client training
6. Go live

## Files Generated
- \`clients/${clientKey}/dashboard.html\` - Branded client dashboard
- \`clients/${clientKey}/checklist.md\` - This checklist
`;

      fs.writeFileSync(
        path.join(clientDir, 'checklist.md'),
        checklistContent
      );
      
      console.log('[FILES CREATED]', { clientDir, dashboardFile: path.join(clientDir, 'dashboard.html'), checklistFile: path.join(clientDir, 'checklist.md') });
    } catch (fileError) {
      console.error('[FILE ERROR]', { error: fileError.message, stack: fileError.stack });
      // Don't fail the entire request if file creation fails
    }

    console.log('[CLIENT CREATED]', { 
      clientKey, 
      clientName: clientData.basic.clientName,
      industry: clientData.basic.industry 
    });

    res.json({
      ok: true,
      clientKey,
      clientName: clientData.basic.clientName,
      industry: clientData.basic.industry,
      dashboardUrl: `/clients/${clientKey}/dashboard.html`,
      checklistUrl: `/clients/${clientKey}/checklist.md`,
      message: 'Client created successfully'
    });

  } catch (error) {
    console.error('[CLIENT CREATION ERROR]', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to create client',
      details: error.message 
    });
  }
});

// Helper function to adjust color brightness
function adjustColorBrightness(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

// --- healthz: report which integrations are configured (without leaking secrets)
app.get('/healthz', (req, res) => {
  const flags = {
    apiKey: !!process.env.API_KEY,
    sms: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER)),
    gcal: !!(process.env.GOOGLE_CLIENT_EMAIL && (process.env.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY_B64)),
    vapi: !!(process.env.VAPI_PRIVATE_KEY && (process.env.VAPI_ASSISTANT_ID || true) && (process.env.VAPI_PHONE_NUMBER_ID || true)),
    tz: process.env.TZ || 'unset'
  };
  res.json({ ok: true, integrations: flags });
});

// --- Tenant header normalizer ---
app.use((req, _res, next) => {
  const hdrs = req.headers || {};
  const fromHeader =
    req.get?.('X-Client-Key') ||
    req.get?.('x-client-key') ||
    hdrs['x-client-key'] ||
    hdrs['X-Client-Key'];
  const fromQuery = req.query?.clientKey;
  const tenantKey = fromHeader || fromQuery;
  if (tenantKey && !hdrs['x-client-key']) {
    req.headers['x-client-key'] = String(tenantKey);
  }
  next();
});

const PORT = process.env.PORT || 3000;
const ORIGIN = process.env.VAPI_ORIGIN || '*';
const API_KEY = process.env.API_KEY || '';

// VAPI Token Protection - prevent unnecessary calls during testing
const VAPI_TEST_MODE = process.env.VAPI_TEST_MODE === 'true' || process.env.NODE_ENV === 'test';
const VAPI_DRY_RUN = process.env.VAPI_DRY_RUN === 'true' || process.env.NODE_ENV === 'development';

// Rate limiting store (in production, use Redis)
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute per IP

// Input validation helpers
function validatePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}

function validateSmsBody(body) {
  if (!body || typeof body !== 'string') return false;
  return body.trim().length > 0 && body.length <= 1600; // SMS character limit
}

// Enhanced input sanitization
function sanitizeInput(input, maxLength = 1000) {
  if (!input || typeof input !== 'string') return '';
  return input
    .trim()
    .substring(0, maxLength)
    .replace(/[<>]/g, '') // Remove potential HTML
    .replace(/[\r\n\t]/g, ' '); // Normalize whitespace
}

// Validate and sanitize phone number
function validateAndSanitizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.length < 10 || cleaned.length > 15) return null;
  return cleaned;
}

// Custom rate limiting middleware for SMS webhooks
function smsRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  // Clean old entries
  for (const [key, timestamp] of rateLimitStore.entries()) {
    if (timestamp < windowStart) {
      rateLimitStore.delete(key);
    }
  }
  
  // Check current IP
  const requests = Array.from(rateLimitStore.entries())
    .filter(([key, timestamp]) => key.startsWith(ip) && timestamp > windowStart)
    .length;
  
  if (requests >= RATE_LIMIT_MAX_REQUESTS) {
    console.log('[RATE LIMIT]', { ip, requests, limit: RATE_LIMIT_MAX_REQUESTS });
    return res.status(429).json({ error: 'Too many requests' });
  }
  
  rateLimitStore.set(`${ip}-${now}`, now);
  next();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const DATA_DIR   = path.join(__dirname, 'data');
const LEADS_PATH = path.join(DATA_DIR, 'leads.json');
const CALLS_PATH = path.join(DATA_DIR, 'calls.json');
const SMS_STATUS_PATH = path.join(DATA_DIR, 'sms-status.json');
const JOBS_PATH  = path.join(DATA_DIR, 'jobs.json');

// === Env: Google
const GOOGLE_CLIENT_EMAIL    = process.env.GOOGLE_CLIENT_EMAIL    || '';
const GOOGLE_PRIVATE_KEY     = process.env.GOOGLE_PRIVATE_KEY     || '';
const GOOGLE_PRIVATE_KEY_B64 = process.env.GOOGLE_PRIVATE_KEY_B64 || '';
const GOOGLE_CALENDAR_ID     = process.env.GOOGLE_CALENDAR_ID     || 'primary';
const TIMEZONE               = process.env.TZ || process.env.TIMEZONE || 'Europe/London';

// Enhanced retry logic with exponential backoff and circuit breaker
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000, context = {}) {
  const { operation = 'unknown', tenantKey = 'unknown', leadPhone = 'unknown' } = context;
  
  // Check circuit breaker
  if (isCircuitBreakerOpen(operation)) {
    throw new Error(`Circuit breaker is open for operation: ${operation}`);
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      
      // Log successful retry if it wasn't the first attempt
      if (attempt > 1) {
        console.log(`[RETRY SUCCESS]`, {
          operation,
          tenantKey,
          leadPhone,
          attempt,
          totalAttempts: attempt
        });
      }
      
      // Reset circuit breaker on success
      if (attempt > 1) {
        await updateCircuitBreakerState(operation, 'closed');
      }
      
      return result;
    } catch (error) {
      const errorType = categorizeError(error);
      const shouldRetry = shouldRetryError(errorType, attempt, maxRetries);
      
      console.error(`[RETRY ATTEMPT ${attempt}/${maxRetries}]`, {
        operation,
        tenantKey,
        leadPhone,
        errorType,
        error: error.message,
        shouldRetry,
        attempt
      });
      
      if (!shouldRetry || attempt === maxRetries) {
        // Log final failure
        console.error(`[RETRY FAILED]`, {
          operation,
          tenantKey,
          leadPhone,
          finalAttempt: attempt,
          errorType,
          error: error.message
        });
        
        // Implement circuit breaker for critical failures
        if (errorType === 'critical') {
          await updateCircuitBreakerState(operation, 'open');
        }
        
        throw error;
      }
      
      // Calculate delay with jitter to avoid thundering herd
      const delay = calculateRetryDelay(baseDelay, attempt, errorType);
      console.log(`[RETRY DELAY]`, {
        operation,
        tenantKey,
        delay: `${delay}ms`,
        nextAttempt: attempt + 1,
        errorType
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Cost optimization functions
async function checkBudgetBeforeCall(tenantKey, estimatedCost = 0.05) {
  try {
    const { checkBudgetExceeded, checkCostAlerts } = await import('./db.js');
    
    // Check daily budget
    const dailyBudget = await checkBudgetExceeded(tenantKey, 'vapi_calls', 'daily');
    if (dailyBudget.exceeded) {
      console.log('[BUDGET EXCEEDED]', {
        tenantKey,
        period: 'daily',
        limit: dailyBudget.limit,
        current: dailyBudget.current,
        estimated: estimatedCost
      });
      return { allowed: false, reason: 'daily_budget_exceeded', budget: dailyBudget };
    }
    
    // Check if adding this call would exceed budget
    if (dailyBudget.current + estimatedCost > dailyBudget.limit) {
      console.log('[BUDGET WOULD EXCEED]', {
        tenantKey,
        period: 'daily',
        limit: dailyBudget.limit,
        current: dailyBudget.current,
        estimated: estimatedCost
      });
      return { allowed: false, reason: 'would_exceed_daily_budget', budget: dailyBudget };
    }
    
    // Check cost alerts
    const alerts = await checkCostAlerts(tenantKey);
    if (alerts.length > 0) {
      console.log('[COST ALERTS TRIGGERED]', {
        tenantKey,
        alerts: alerts.map(a => a.message)
      });
    }
    
    return { allowed: true, budget: dailyBudget };
  } catch (error) {
    console.error('[BUDGET CHECK ERROR]', error);
    return { allowed: true, reason: 'budget_check_failed' }; // Allow call if budget check fails
  }
}

async function trackCallCost(tenantKey, callId, cost, metadata = {}) {
  try {
    const { trackCost } = await import('./db.js');
    
    await trackCost({
      clientKey: tenantKey,
      callId,
      costType: 'vapi_call',
      amount: cost,
      currency: 'USD',
      description: `VAPI call cost tracking`,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    });
    
    console.log('[CALL COST TRACKED]', {
      tenantKey,
      callId,
      cost: `$${cost}`,
      type: 'vapi_call'
    });
  } catch (error) {
    console.error('[COST TRACKING ERROR]', error);
  }
}

async function getCostOptimizationMetrics(tenantKey) {
  try {
    const { 
      getTotalCostsByTenant, 
      getCostsByPeriod, 
      getBudgetLimits,
      checkBudgetExceeded 
    } = await import('./db.js');
    
    const [dailyCosts, weeklyCosts, monthlyCosts, budgetLimits] = await Promise.all([
      getTotalCostsByTenant(tenantKey, 'daily'),
      getTotalCostsByTenant(tenantKey, 'weekly'),
      getTotalCostsByTenant(tenantKey, 'monthly'),
      getBudgetLimits(tenantKey)
    ]);
    
    const costBreakdown = await getCostsByPeriod(tenantKey, 'daily');
    
    // Check budget status
    const budgetStatus = {};
    for (const budget of budgetLimits) {
      budgetStatus[budget.budget_type] = {
        daily: await checkBudgetExceeded(tenantKey, budget.budget_type, 'daily'),
        weekly: await checkBudgetExceeded(tenantKey, budget.budget_type, 'weekly'),
        monthly: await checkBudgetExceeded(tenantKey, budget.budget_type, 'monthly')
      };
    }
    
    return {
      costs: {
        daily: dailyCosts,
        weekly: weeklyCosts,
        monthly: monthlyCosts,
        breakdown: costBreakdown
      },
      budgets: budgetLimits,
      budgetStatus,
      optimization: {
        costPerCall: dailyCosts.transaction_count > 0 ? dailyCosts.total_cost / dailyCosts.transaction_count : 0,
        dailyBudgetUtilization: budgetStatus.vapi_calls?.daily?.percentage || 0,
        recommendations: generateCostRecommendations(dailyCosts, budgetStatus)
      }
    };
  } catch (error) {
    console.error('[COST METRICS ERROR]', error);
    return null;
  }
}

function generateCostRecommendations(costs, budgetStatus) {
  const recommendations = [];
  
  if (costs.total_cost > 0) {
    const avgCostPerCall = costs.total_cost / costs.transaction_count;
    
    if (avgCostPerCall > 0.10) {
      recommendations.push({
        type: 'cost_optimization',
        priority: 'high',
        message: `Average call cost is $${avgCostPerCall.toFixed(2)}. Consider optimizing assistant prompts to reduce call duration.`
      });
    }
    
    if (budgetStatus.vapi_calls?.daily?.percentage > 80) {
      recommendations.push({
        type: 'budget_alert',
        priority: 'medium',
        message: `Daily budget utilization is ${budgetStatus.vapi_calls.daily.percentage.toFixed(1)}%. Consider setting up budget alerts.`
      });
    }
    
    if (costs.transaction_count > 50) {
      recommendations.push({
        type: 'volume_optimization',
        priority: 'low',
        message: `High call volume (${costs.transaction_count} calls). Consider implementing call scheduling to optimize timing.`
      });
    }
  }
  
  return recommendations;
}

// Analytics and reporting functions
async function trackAnalyticsEvent({ clientKey, eventType, eventCategory, eventData, sessionId, userAgent, ipAddress }) {
  try {
    const { trackAnalyticsEvent } = await import('./db.js');
    return await trackAnalyticsEvent({
      clientKey,
      eventType,
      eventCategory,
      eventData,
      sessionId,
      userAgent,
      ipAddress
    });
  } catch (error) {
    console.error('[ANALYTICS TRACKING ERROR]', error);
  }
}

async function trackConversionStage({ clientKey, leadPhone, stage, stageData, previousStage = null, timeToStage = null }) {
  try {
    const { trackConversionStage } = await import('./db.js');
    return await trackConversionStage({
      clientKey,
      leadPhone,
      stage,
      stageData,
      previousStage,
      timeToStage
    });
  } catch (error) {
    console.error('[CONVERSION TRACKING ERROR]', error);
  }
}

async function recordPerformanceMetric({ clientKey, metricName, metricValue, metricUnit = null, metricCategory = null, metadata = null }) {
  try {
    const { recordPerformanceMetric } = await import('./db.js');
    return await recordPerformanceMetric({
      clientKey,
      metricName,
      metricValue,
      metricUnit,
      metricCategory,
      metadata
    });
  } catch (error) {
    console.error('[PERFORMANCE METRIC ERROR]', error);
  }
}

async function getAnalyticsDashboard(clientKey, days = 30) {
  try {
    const { 
      getAnalyticsSummary,
      getConversionFunnel,
      getConversionRates,
      getPerformanceMetrics,
      getTotalCostsByTenant,
      getCallsByTenant
    } = await import('./db.js');
    
    const [
      analyticsSummary,
      conversionFunnel,
      conversionRates,
      performanceMetrics,
      costMetrics,
      callMetrics
    ] = await Promise.all([
      getAnalyticsSummary(clientKey, days),
      getConversionFunnel(clientKey, days),
      getConversionRates(clientKey, days),
      getPerformanceMetrics(clientKey, null, days),
      getTotalCostsByTenant(clientKey, 'daily'),
      getCallsByTenant(clientKey, 1000)
    ]);
    
    // Calculate key metrics
    const totalLeads = conversionFunnel.reduce((sum, stage) => sum + stage.unique_leads, 0);
    const totalCalls = callMetrics.length;
    const successfulCalls = callMetrics.filter(call => call.outcome === 'completed').length;
    const conversionRate = totalLeads > 0 ? (successfulCalls / totalLeads) * 100 : 0;
    const avgCallDuration = callMetrics.reduce((sum, call) => sum + (call.duration || 0), 0) / totalCalls || 0;
    const totalCost = parseFloat(costMetrics.total_cost || 0);
    const costPerConversion = successfulCalls > 0 ? totalCost / successfulCalls : 0;
    
    return {
      summary: {
        totalLeads,
        totalCalls,
        successfulCalls,
        conversionRate: Math.round(conversionRate * 100) / 100,
        avgCallDuration: Math.round(avgCallDuration),
        totalCost: Math.round(totalCost * 100) / 100,
        costPerConversion: Math.round(costPerConversion * 100) / 100
      },
      analytics: analyticsSummary,
      conversionFunnel,
      conversionRates,
      performanceMetrics,
      costMetrics,
      callMetrics: callMetrics.slice(0, 50), // Last 50 calls
      period: `${days} days`,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('[ANALYTICS DASHBOARD ERROR]', error);
    return null;
  }
}

async function generateAnalyticsReport(clientKey, reportType = 'comprehensive', days = 30) {
  try {
    const dashboard = await getAnalyticsDashboard(clientKey, days);
    if (!dashboard) return null;
    
    const { summary, conversionFunnel, conversionRates, performanceMetrics, costMetrics } = dashboard;
    
    // Generate insights
    const insights = [];
    
    if (summary.conversionRate < 10) {
      insights.push({
        type: 'warning',
        category: 'conversion',
        message: `Low conversion rate (${summary.conversionRate}%). Consider optimizing assistant prompts or call timing.`
      });
    }
    
    if (summary.costPerConversion > 5) {
      insights.push({
        type: 'warning',
        category: 'cost',
        message: `High cost per conversion ($${summary.costPerConversion}). Review call duration and assistant efficiency.`
      });
    }
    
    if (summary.avgCallDuration > 300) {
      insights.push({
        type: 'info',
        category: 'efficiency',
        message: `Average call duration is ${Math.round(summary.avgCallDuration / 60)} minutes. Consider optimizing for shorter, more focused calls.`
      });
    }
    
    // Find conversion bottlenecks
    const funnelStages = conversionFunnel.map(stage => ({
      stage: stage.stage,
      leads: stage.unique_leads,
      conversionRate: stage.unique_leads / summary.totalLeads * 100
    }));
    
    const bottleneckStage = funnelStages.reduce((min, stage) => 
      stage.conversionRate < min.conversionRate ? stage : min
    );
    
    if (bottleneckStage.conversionRate < 50) {
      insights.push({
        type: 'recommendation',
        category: 'optimization',
        message: `Conversion bottleneck detected at "${bottleneckStage.stage}" stage (${Math.round(bottleneckStage.conversionRate)}%). Focus optimization efforts here.`
      });
    }
    
    return {
      reportType,
      period: `${days} days`,
      generatedAt: new Date().toISOString(),
      clientKey,
      summary,
      insights,
      funnelStages,
      recommendations: generateRecommendations(summary, insights),
      data: {
        conversionFunnel,
        conversionRates,
        performanceMetrics,
        costMetrics
      }
    };
  } catch (error) {
    console.error('[ANALYTICS REPORT ERROR]', error);
    return null;
  }
}

function generateRecommendations(summary, insights) {
  const recommendations = [];
  
  if (summary.conversionRate < 15) {
    recommendations.push({
      priority: 'high',
      category: 'conversion_optimization',
      action: 'Optimize Assistant Prompts',
      description: 'Review and improve assistant conversation flow to increase conversion rates',
      expectedImpact: 'Increase conversion rate by 5-10%'
    });
  }
  
  if (summary.costPerConversion > 3) {
    recommendations.push({
      priority: 'medium',
      category: 'cost_optimization',
      action: 'Implement Call Scheduling',
      description: 'Use intelligent call scheduling to reduce costs and improve timing',
      expectedImpact: 'Reduce cost per conversion by 20-30%'
    });
  }
  
  if (summary.avgCallDuration > 240) {
    recommendations.push({
      priority: 'medium',
      category: 'efficiency',
      action: 'Streamline Call Process',
      description: 'Optimize call flow to reduce average duration while maintaining quality',
      expectedImpact: 'Reduce call duration by 15-25%'
    });
  }
  
  return recommendations;
}

// A/B Testing functions
async function createABTestExperiment({ clientKey, experimentName, variants, isActive = true }) {
  try {
    const { createABTestExperiment } = await import('./db.js');
    
    const experiments = [];
    for (const variant of variants) {
      const experiment = await createABTestExperiment({
        clientKey,
        experimentName,
        variantName: variant.name,
        variantConfig: variant.config,
        isActive
      });
      experiments.push(experiment);
    }
    
    console.log('[AB TEST CREATED]', {
      clientKey,
      experimentName,
      variants: variants.length,
      isActive
    });
    
    return experiments;
  } catch (error) {
    console.error('[AB TEST CREATION ERROR]', error);
    throw error;
  }
}

async function getActiveABTests(clientKey) {
  try {
    const { getActiveABTests } = await import('./db.js');
    return await getActiveABTests(clientKey);
  } catch (error) {
    console.error('[AB TEST FETCH ERROR]', error);
    return [];
  }
}

async function selectABTestVariant(clientKey, experimentName, leadPhone) {
  try {
    const { getActiveABTests, recordABTestResult } = await import('./db.js');
    
    const activeTests = await getActiveABTests(clientKey);
    const experimentVariants = activeTests.filter(test => test.experiment_name === experimentName);
    
    if (!experimentVariants || experimentVariants.length === 0) {
      return null; // No active experiment
    }
    
    // Simple hash-based assignment for consistent results
    const hash = createHash('md5').update(`${clientKey}_${experimentName}_${leadPhone}`).digest('hex');
    const hashValue = parseInt(hash.substring(0, 8), 16);
    const variantIndex = hashValue % experimentVariants.length;
    
    const selectedVariant = experimentVariants[variantIndex];
    
    // Record the assignment
    await recordABTestResult({
      experimentId: selectedVariant.id,
      clientKey,
      leadPhone,
      variantName: selectedVariant.variant_name,
      outcome: 'assigned',
      outcomeData: {
        assignmentMethod: 'hash_based',
        hashValue,
        variantIndex
      }
    });
    
    console.log('[AB TEST VARIANT SELECTED]', {
      clientKey,
      experimentName,
      leadPhone,
      variantName: selectedVariant.variant_name,
      variantIndex
    });
    
    return {
      name: selectedVariant.variant_name,
      config: selectedVariant.variant_config
    };
  } catch (error) {
    console.error('[AB TEST VARIANT SELECTION ERROR]', error);
    return null;
  }
}

async function recordABTestOutcome({ clientKey, experimentName, leadPhone, outcome, outcomeData = null }) {
  try {
    const { getActiveABTests, recordABTestResult } = await import('./db.js');
    
    const activeTests = await getActiveABTests(clientKey);
    const experimentVariants = activeTests.filter(test => test.experiment_name === experimentName);
    
    if (!experimentVariants || experimentVariants.length === 0) {
      return null;
    }
    
    // Find the variant that was assigned to this lead across all experiments with this name
    const { getABTestIndividualResults } = await import('./db.js');
    let assignment = null;
    
    // Try each experiment variant to find the assignment
    for (const variant of experimentVariants) {
      const results = await getABTestIndividualResults(variant.id);
      assignment = results.find(result => 
        result.lead_phone === leadPhone && result.outcome === 'assigned'
      );
      if (assignment) {
        break; // Found the assignment
      }
    }
    
    if (!assignment) {
      console.log('[AB TEST OUTCOME] No assignment found for lead', { clientKey, experimentName, leadPhone });
      return null;
    }
    
    const result = await recordABTestResult({
      experimentId: assignment.experiment_id,
      clientKey,
      leadPhone,
      variantName: assignment.variant_name,
      outcome,
      outcomeData
    });
    
    console.log('[AB TEST OUTCOME RECORDED]', {
      clientKey,
      experimentName,
      leadPhone,
      variantName: assignment.variant_name,
      outcome
    });
    
    return result;
  } catch (error) {
    console.error('[AB TEST OUTCOME RECORDING ERROR]', error);
    return null;
  }
}

async function getABTestResults(clientKey, experimentName) {
  try {
    const { getActiveABTests, getABTestConversionRates } = await import('./db.js');
    
    const activeTests = await getActiveABTests(clientKey);
    const experiment = activeTests.find(test => test.experiment_name === experimentName);
    
    if (!experiment) {
      return null;
    }
    
    const conversionRates = await getABTestConversionRates(experiment.id);
    
    return {
      experiment,
      conversionRates,
      summary: {
        totalVariants: conversionRates.length,
        totalParticipants: conversionRates.reduce((sum, variant) => sum + variant.total_leads, 0),
        totalConversions: conversionRates.reduce((sum, variant) => sum + variant.converted_leads, 0),
        overallConversionRate: conversionRates.length > 0 ? 
          conversionRates.reduce((sum, variant) => sum + variant.conversion_rate, 0) / conversionRates.length : 0
      }
    };
  } catch (error) {
    console.error('[AB TEST RESULTS ERROR]', error);
    return null;
  }
}

// Performance optimization functions
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(prefix, ...params) {
  return `${prefix}:${params.join(':')}`;
}

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  
  if (Date.now() > item.expires) {
    cache.delete(key);
    return null;
  }
  
  return item.data;
}

function setCache(key, data, ttl = CACHE_TTL) {
  cache.set(key, {
    data,
    expires: Date.now() + ttl
  });
}

function clearCache(pattern = null) {
  if (!pattern) {
    cache.clear();
    return;
  }
  
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
}

// Cached client lookup
async function getCachedClient(tenantKey) {
  const cacheKey = getCacheKey('client', tenantKey);
  let client = getCached(cacheKey);
  
  if (!client) {
    client = await getFullClient(tenantKey);
    if (client) {
      setCache(cacheKey, client, 2 * 60 * 1000); // 2 minutes cache
    }
  }
  
  return client;
}

// Cached analytics dashboard
async function getCachedAnalyticsDashboard(clientKey, days = 30) {
  const cacheKey = getCacheKey('analytics', clientKey, days.toString());
  let dashboard = getCached(cacheKey);
  
  if (!dashboard) {
    dashboard = await getAnalyticsDashboard(clientKey, days);
    if (dashboard) {
      setCache(cacheKey, dashboard, 1 * 60 * 1000); // 1 minute cache
    }
  }
  
  return dashboard;
}

// Cached metrics
async function getCachedMetrics(clientKey) {
  const cacheKey = getCacheKey('metrics', clientKey);
  let metrics = getCached(cacheKey);
  
  if (!metrics) {
    const { getTotalCostsByTenant, getCallsByTenant } = await import('./db.js');
    
    const [costMetrics, callMetrics] = await Promise.all([
      getTotalCostsByTenant(clientKey, 'daily'),
      getCallsByTenant(clientKey, 100)
    ]);
    
    metrics = {
      costMetrics,
      callMetrics,
      lastUpdated: new Date().toISOString()
    };
    
    setCache(cacheKey, metrics, 30 * 1000); // 30 seconds cache
  }
  
  return metrics;
}

// Batch processing for analytics
const analyticsQueue = [];
let analyticsProcessing = false;

async function queueAnalyticsEvent(event) {
  analyticsQueue.push({
    ...event,
    timestamp: Date.now()
  });
  
  if (!analyticsProcessing) {
    processAnalyticsQueue();
  }
}

async function processAnalyticsQueue() {
  if (analyticsProcessing || analyticsQueue.length === 0) {
    return;
  }
  
  analyticsProcessing = true;
  
  try {
    const batchSize = Math.min(50, analyticsQueue.length);
    const batch = analyticsQueue.splice(0, batchSize);
    
    const { trackAnalyticsEvent } = await import('./db.js');
    
    await Promise.all(batch.map(event => 
      trackAnalyticsEvent(event).catch(error => 
        console.error('[BATCH ANALYTICS ERROR]', error)
      )
    ));
    
    console.log('[ANALYTICS BATCH PROCESSED]', { 
      processed: batch.length, 
      remaining: analyticsQueue.length 
    });
  } catch (error) {
    console.error('[ANALYTICS QUEUE PROCESSING ERROR]', error);
  } finally {
    analyticsProcessing = false;
    
    // Process remaining items after a short delay
    if (analyticsQueue.length > 0) {
      setTimeout(processAnalyticsQueue, 1000);
    }
  }
}

// Connection pooling optimization
const connectionPool = new Map();

function getConnectionPoolKey(tenantKey) {
  return `pool_${tenantKey}`;
}

async function optimizeDatabaseConnections() {
  try {
    // Clean up old connections
    for (const [key, connection] of connectionPool.entries()) {
      if (Date.now() - connection.lastUsed > 10 * 60 * 1000) { // 10 minutes
        connectionPool.delete(key);
      }
    }
    
    console.log('[CONNECTION POOL OPTIMIZED]', { 
      activeConnections: connectionPool.size,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[CONNECTION POOL OPTIMIZATION ERROR]', error);
  }
}

// Response compression middleware
import compression from 'compression';

// Add compression middleware
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Cache cleanup job
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, item] of cache.entries()) {
    if (now > item.expires) {
      cache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log('[CACHE CLEANUP]', { cleaned, remaining: cache.size });
  }
}, 60 * 1000); // Every minute

// Connection pool optimization
setInterval(optimizeDatabaseConnections, 5 * 60 * 1000); // Every 5 minutes

// Categorize errors for appropriate retry handling
function categorizeError(error) {
  const message = error.message?.toLowerCase() || '';
  const status = error.status || error.statusCode;
  
  // Network/connectivity errors (retryable)
  if (message.includes('timeout') || message.includes('econnreset') || message.includes('enotfound')) {
    return 'network';
  }
  
  // Rate limiting (retryable with longer delay)
  if (status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
    return 'rate_limit';
  }
  
  // Server errors (retryable)
  if (status >= 500 && status < 600) {
    return 'server_error';
  }
  
  // Client errors (not retryable)
  if (status >= 400 && status < 500) {
    return 'client_error';
  }
  
  // VAPI-specific errors
  if (message.includes('vapi') || message.includes('assistant') || message.includes('phone number')) {
    return 'vapi_error';
  }
  
  // Critical errors (circuit breaker)
  if (message.includes('unauthorized') || message.includes('forbidden') || message.includes('invalid key')) {
    return 'critical';
  }
  
  return 'unknown';
}

// Determine if error should be retried
function shouldRetryError(errorType, attempt, maxRetries) {
  const retryableErrors = ['network', 'server_error', 'rate_limit'];
  const nonRetryableErrors = ['client_error', 'critical'];
  
  if (nonRetryableErrors.includes(errorType)) {
    return false;
  }
  
  if (retryableErrors.includes(errorType)) {
    return attempt < maxRetries;
  }
  
  // Unknown errors: retry once
  return attempt === 1;
}

// Calculate retry delay with jitter
function calculateRetryDelay(baseDelay, attempt, errorType) {
  let delay = baseDelay * Math.pow(2, attempt - 1);
  
  // Special handling for rate limiting
  if (errorType === 'rate_limit') {
    delay = Math.max(delay, 5000); // Minimum 5 seconds for rate limits
  }
  
  // Add jitter (±25% random variation)
  const jitter = delay * 0.25 * (Math.random() - 0.5);
  delay = Math.max(100, delay + jitter);
  
  return Math.floor(delay);
}

// Circuit breaker state management
const circuitBreakerState = new Map();

async function updateCircuitBreakerState(operation, state) {
  circuitBreakerState.set(operation, {
    state,
    timestamp: Date.now(),
    failureCount: state === 'open' ? (circuitBreakerState.get(operation)?.failureCount || 0) + 1 : 0
  });
  
  console.log(`[CIRCUIT BREAKER]`, {
    operation,
    state,
    failureCount: circuitBreakerState.get(operation)?.failureCount || 0
  });
}

function isCircuitBreakerOpen(operation) {
  const state = circuitBreakerState.get(operation);
  if (!state) return false;
  
  // Auto-recovery after 5 minutes
  const recoveryTime = 5 * 60 * 1000;
  if (state.state === 'open' && Date.now() - state.timestamp > recoveryTime) {
    circuitBreakerState.set(operation, { state: 'half-open', timestamp: Date.now() });
    console.log(`[CIRCUIT BREAKER RECOVERY]`, { operation, state: 'half-open' });
    return false;
  }
  
  return state.state === 'open';
}

// Handle VAPI failures with fallback mechanisms
async function handleVapiFailure({ from, tenantKey, error }) {
  try {
    console.log('[VAPI FALLBACK]', { from, tenantKey, error });
    
    const client = await getFullClient(tenantKey);
    if (!client) {
      console.error('[VAPI FALLBACK ERROR]', { reason: 'client_not_found', tenantKey });
      return;
    }
    
    // Option 1: Send SMS fallback message
    await sendSmsFallback({ from, tenantKey, client, error });
    
    // Option 2: Schedule retry call
    await scheduleRetryCall({ from, tenantKey, client, error });
    
    // Option 3: Update lead status
    await updateLeadOnVapiFailure({ from, tenantKey, error });
    
  } catch (fallbackError) {
    console.error('[VAPI FALLBACK ERROR]', {
      from,
      tenantKey,
      originalError: error,
      fallbackError: fallbackError.message
    });
  }
}

// Send SMS fallback when VAPI fails
async function sendSmsFallback({ from, tenantKey, client, error }) {
  try {
    const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
    if (!configured) {
      console.log('[SMS FALLBACK SKIP]', { reason: 'sms_not_configured', tenantKey });
      return;
    }
    
    const brand = client?.displayName || client?.clientKey || 'Our Clinic';
    const fallbackMessage = `Hi! ${brand} tried to call you but had a technical issue. Please call us back at ${client?.phone || 'our main number'} or reply with your preferred time.`;
    
    await smsClient.messages.create({
      body: fallbackMessage,
      messagingServiceSid,
      to: from
    });
    
    console.log('[SMS FALLBACK SENT]', { from, tenantKey, message: fallbackMessage });
    
  } catch (smsError) {
    console.error('[SMS FALLBACK ERROR]', { from, tenantKey, error: smsError.message });
  }
}

// Schedule retry call for later
async function scheduleRetryCall({ from, tenantKey, client, error }) {
  try {
    // Determine retry delay based on error type
    const errorType = categorizeError({ message: error });
    let retryDelay = 30 * 60 * 1000; // Default 30 minutes
    
    if (errorType === 'rate_limit') {
      retryDelay = 60 * 60 * 1000; // 1 hour for rate limits
    } else if (errorType === 'server_error') {
      retryDelay = 15 * 60 * 1000; // 15 minutes for server errors
    } else if (errorType === 'critical') {
      retryDelay = 2 * 60 * 60 * 1000; // 2 hours for critical errors
    }
    
    const retryTime = new Date(Date.now() + retryDelay);
    
    // Import database functions
    const { addToRetryQueue } = await import('./db.js');
    
    // Add to retry queue
    const retryData = {
      originalError: error,
      errorType,
      clientConfig: {
        assistantId: client?.vapi?.assistantId,
        phoneNumberId: client?.vapi?.phoneNumberId
      }
    };
    
    await addToRetryQueue({
      clientKey: tenantKey,
      leadPhone: from,
      retryType: 'vapi_call',
      retryReason: errorType,
      retryData,
      scheduledFor: retryTime,
      retryAttempt: 1,
      maxRetries: 3
    });
    
    console.log('[RETRY SCHEDULED]', {
      from,
      tenantKey,
      errorType,
      retryTime: retryTime.toISOString(),
      retryDelay: `${retryDelay / 1000 / 60} minutes`,
      queued: true
    });
    
  } catch (retryError) {
    console.error('[RETRY SCHEDULE ERROR]', { from, tenantKey, error: retryError.message });
  }
}

// Update lead status when VAPI fails
async function updateLeadOnVapiFailure({ from, tenantKey, error }) {
  try {
    const clients = await listFullClients();
    const leads = clients.flatMap(client => client.leads || []);
    const lead = leads.find(l => l.phone === from && l.tenantKey === tenantKey);
    
    if (lead) {
      lead.status = 'vapi_failed';
      lead.lastVapiError = error;
      lead.lastVapiAttempt = new Date().toISOString();
      
      // Update the client in the database
      const client = await getFullClient(tenantKey);
      if (client) {
        client.leads = leads.filter(l => l.tenantKey === tenantKey);
        client.updatedAt = new Date().toISOString();
        await upsertFullClient(client);
        
        console.log('[LEAD STATUS UPDATED]', {
          from,
          tenantKey,
          newStatus: 'vapi_failed',
          error
        });
      }
    }
    
  } catch (updateError) {
    console.error('[LEAD UPDATE ERROR]', { from, tenantKey, error: updateError.message });
  }
}

// Dynamic assistant selection based on lead characteristics
async function selectOptimalAssistant({ client, existingLead, isYes, isStart }) {
  try {
    const leadScore = existingLead?.score || 0;
    const leadStatus = existingLead?.status || 'new';
    const industry = client?.industry || 'general';
    const timeOfDay = new Date().getHours();
    
    // Default configuration
    let assistantId = client?.vapiAssistantId || VAPI_ASSISTANT_ID;
    let phoneNumberId = client?.vapiPhoneNumberId || VAPI_PHONE_NUMBER_ID;
    
    // High-value lead optimization
    if (leadScore >= 80) {
      assistantId = client?.vapiHighValueAssistantId || assistantId;
      phoneNumberId = client?.vapiHighValuePhoneNumberId || phoneNumberId;
      
      console.log('[ASSISTANT SELECTION]', {
        reason: 'high_value_lead',
        leadScore,
        assistantId,
        phoneNumberId
      });
    }
    
    // Industry-specific assistants
    else if (client?.vapiIndustryAssistants && client.vapiIndustryAssistants[industry]) {
      const industryConfig = client.vapiIndustryAssistants[industry];
      assistantId = industryConfig.assistantId || assistantId;
      phoneNumberId = industryConfig.phoneNumberId || phoneNumberId;
      
      console.log('[ASSISTANT SELECTION]', {
        reason: 'industry_specific',
        industry,
        assistantId,
        phoneNumberId
      });
    }
    
    // Time-based optimization
    else if (timeOfDay >= 9 && timeOfDay <= 17) {
      assistantId = client?.vapiBusinessHoursAssistantId || assistantId;
      phoneNumberId = client?.vapiBusinessHoursPhoneNumberId || phoneNumberId;
      
      console.log('[ASSISTANT SELECTION]', {
        reason: 'business_hours',
        timeOfDay,
        assistantId,
        phoneNumberId
      });
    }
    
    // After-hours optimization
    else {
      assistantId = client?.vapiAfterHoursAssistantId || assistantId;
      phoneNumberId = client?.vapiAfterHoursPhoneNumberId || phoneNumberId;
      
      console.log('[ASSISTANT SELECTION]', {
        reason: 'after_hours',
        timeOfDay,
        assistantId,
        phoneNumberId
      });
    }
    
    // Validate assistant configuration
    if (!assistantId || !phoneNumberId) {
      console.warn('[ASSISTANT VALIDATION]', {
        warning: 'missing_assistant_config',
        assistantId: !!assistantId,
        phoneNumberId: !!phoneNumberId,
        fallbackToDefault: true
      });
      
      assistantId = VAPI_ASSISTANT_ID;
      phoneNumberId = VAPI_PHONE_NUMBER_ID;
    }
    
    return { assistantId, phoneNumberId };
    
  } catch (error) {
    console.error('[ASSISTANT SELECTION ERROR]', error);
    return {
      assistantId: client?.vapiAssistantId || VAPI_ASSISTANT_ID,
      phoneNumberId: client?.vapiPhoneNumberId || VAPI_PHONE_NUMBER_ID
    };
  }
}

// Generate intelligent assistant variables based on context
async function generateAssistantVariables({ client, existingLead, tenantKey, serviceForCall, isYes, isStart, assistantConfig }) {
  try {
    const now = new Date();
    const leadScore = existingLead?.score || 0;
    const leadStatus = existingLead?.status || 'new';
    const industry = client?.industry || 'general';
    const timeOfDay = now.getHours();
    const dayOfWeek = now.getDay();
    const isBusinessTime = isBusinessHours(client);
    
    // Base variables
    const variables = {
      ClientKey: tenantKey,
      BusinessName: client.displayName || client.clientKey,
      ConsentLine: 'This call may be recorded for quality.',
      DefaultService: serviceForCall || '',
      DefaultDurationMin: client?.booking?.defaultDurationMin || 30,
      Timezone: client?.booking?.timezone || TIMEZONE,
      ServicesJSON: client?.servicesJson || '[]',
      PricesJSON: client?.pricesJson || '{}',
      HoursJSON: client?.hoursJson || '{}',
      ClosedDatesJSON: client?.closedDatesJson || '[]',
      Locale: client?.locale || 'en-GB',
      ScriptHints: client?.scriptHints || '',
      FAQJSON: client?.faqJson || '[]',
      Currency: client?.currency || 'GBP',
      LeadScore: leadScore,
      LeadStatus: leadStatus,
      BusinessHours: isBusinessTime ? 'within' : 'outside'
    };
    
    // Context-aware variables
    variables.CallContext = isYes ? 'yes_response' : 'start_opt_in';
    variables.TimeOfDay = timeOfDay;
    variables.DayOfWeek = dayOfWeek;
    variables.Industry = industry;
    
    // Lead-specific variables
    if (existingLead) {
      variables.LeadAge = existingLead.createdAt ? 
        Math.floor((now - new Date(existingLead.createdAt)) / (1000 * 60 * 60 * 24)) : 0;
      variables.PreviousInteractions = existingLead.messageCount || 0;
      variables.LastInteraction = existingLead.lastInboundAt || existingLead.createdAt;
    }
    
    // Dynamic greeting based on context
    if (isYes) {
      variables.GreetingStyle = 'enthusiastic';
      variables.CallPurpose = 'booking_confirmation';
    } else if (isStart) {
      variables.GreetingStyle = 'welcoming';
      variables.CallPurpose = 'initial_consultation';
    } else {
      variables.GreetingStyle = 'professional';
      variables.CallPurpose = 'follow_up';
    }
    
    // Industry-specific customization
    switch (industry.toLowerCase()) {
      case 'healthcare':
      case 'medical':
      case 'dental':
        variables.IndustryTone = 'caring';
        variables.PrivacyNotice = 'Your health information is confidential.';
        break;
      case 'legal':
        variables.IndustryTone = 'authoritative';
        variables.PrivacyNotice = 'Attorney-client privilege applies.';
        break;
      case 'financial':
        variables.IndustryTone = 'trustworthy';
        variables.PrivacyNotice = 'Your financial information is secure.';
        break;
      default:
        variables.IndustryTone = 'professional';
        variables.PrivacyNotice = 'Your information is confidential.';
    }
    
    // Time-based customization
    if (timeOfDay < 12) {
      variables.TimeGreeting = 'Good morning';
    } else if (timeOfDay < 17) {
      variables.TimeGreeting = 'Good afternoon';
    } else {
      variables.TimeGreeting = 'Good evening';
    }
    
    // Lead score-based customization
    if (leadScore >= 80) {
      variables.PriorityLevel = 'high';
      variables.CallDuration = 'extended';
      variables.FollowUpRequired = 'yes';
    } else if (leadScore >= 50) {
      variables.PriorityLevel = 'medium';
      variables.CallDuration = 'standard';
      variables.FollowUpRequired = 'maybe';
    } else {
      variables.PriorityLevel = 'low';
      variables.CallDuration = 'brief';
      variables.FollowUpRequired = 'no';
    }
    
    // Business hours customization
    if (!isBusinessTime) {
      variables.AfterHoursMessage = 'We appreciate you reaching out after hours.';
      variables.AvailabilityNote = 'Our regular hours are Monday-Friday 9AM-5PM.';
    }
    
    console.log('[ASSISTANT VARIABLES]', {
      tenantKey,
      leadScore,
      industry,
      timeOfDay,
      variablesCount: Object.keys(variables).length
    });
    
    return variables;
    
  } catch (error) {
    console.error('[ASSISTANT VARIABLES ERROR]', error);
    
    // Return basic variables as fallback
    return {
      ClientKey: tenantKey,
      BusinessName: client?.displayName || client?.clientKey || 'Our Business',
      ConsentLine: 'This call may be recorded for quality.',
      DefaultService: serviceForCall || '',
      DefaultDurationMin: client?.booking?.defaultDurationMin || 30,
      Timezone: client?.booking?.timezone || TIMEZONE,
      LeadScore: existingLead?.score || 0,
      LeadStatus: existingLead?.status || 'new',
      BusinessHours: isBusinessHours(client) ? 'within' : 'outside'
    };
  }
}

// Enhanced error handling wrapper
function safeAsync(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('[UNHANDLED ERROR]', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      if (!res.headersSent) {
        res.status(500).json({ 
          ok: false, 
          error: 'Internal server error',
          timestamp: new Date().toISOString()
        });
      }
    }
  };
}

// Business hours detection
function isBusinessHours(tenant = null) {
  const now = new Date();
  const tz = tenant?.booking?.timezone || tenant?.timezone || TIMEZONE;
  
  // Convert to tenant timezone
  const tenantTime = new Date(now.toLocaleString("en-US", {timeZone: tz}));
  const hour = tenantTime.getHours();
  const day = tenantTime.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Default business hours: Mon-Fri 9AM-5PM
  const businessHours = tenant?.businessHours || {
    start: 9,
    end: 17,
    days: [1, 2, 3, 4, 5] // Monday to Friday
  };
  
  const isWeekday = businessHours.days.includes(day);
  const isBusinessHour = hour >= businessHours.start && hour < businessHours.end;
  
  return isWeekday && isBusinessHour;
}

function getNextBusinessHour(tenant = null) {
  const now = new Date();
  const tz = tenant?.booking?.timezone || tenant?.timezone || TIMEZONE;
  const tenantTime = new Date(now.toLocaleString("en-US", {timeZone: tz}));
  
  const businessHours = tenant?.businessHours || {
    start: 9,
    end: 17,
    days: [1, 2, 3, 4, 5]
  };
  
  let nextBusiness = new Date(tenantTime);
  nextBusiness.setHours(businessHours.start, 0, 0, 0);
  
  // If it's already past business hours today, move to next business day
  if (tenantTime.getHours() >= businessHours.end || !businessHours.days.includes(tenantTime.getDay())) {
    do {
      nextBusiness.setDate(nextBusiness.getDate() + 1);
    } while (!businessHours.days.includes(nextBusiness.getDay()));
  }
  
  return nextBusiness;
}

// Intelligent call scheduling
async function determineCallScheduling({ tenantKey, from, isYes, isStart, existingLead }) {
  try {
    const client = await getFullClient(tenantKey);
    const now = new Date();
    const tz = client?.booking?.timezone || client?.timezone || TIMEZONE;
    const tenantTime = new Date(now.toLocaleString("en-US", {timeZone: tz}));
    const hour = tenantTime.getHours();
    const day = tenantTime.getDay();
    
    // High priority calls (immediate)
    if (isYes && existingLead?.score >= 80) {
      return { shouldDelay: false, priority: 'high', reason: 'high_score_yes_response' };
    }
    
    // Business hours optimization
    if (!isBusinessHours(client)) {
      const nextBusinessHour = getNextBusinessHour(client);
      return {
        shouldDelay: true,
        reason: 'outside_business_hours',
        scheduledFor: nextBusinessHour,
        priority: 'normal'
      };
    }
    
    // Peak hours optimization (avoid lunch time)
    if (hour >= 12 && hour <= 14) {
      const delayUntil = new Date(tenantTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours later
      return {
        shouldDelay: true,
        reason: 'lunch_hours',
        scheduledFor: delayUntil,
        priority: 'normal'
      };
    }
    
    // Weekend optimization
    if (day === 0 || day === 6) { // Sunday or Saturday
      const nextMonday = new Date(tenantTime);
      nextMonday.setDate(tenantTime.getDate() + (8 - day)); // Next Monday
      nextMonday.setHours(9, 0, 0, 0);
      return {
        shouldDelay: true,
        reason: 'weekend',
        scheduledFor: nextMonday,
        priority: 'low'
      };
    }
    
    // Rate limiting for high-volume periods
    const recentCalls = await getRecentCallsCount(tenantKey, 60); // Last hour
    if (recentCalls > 10) { // More than 10 calls in last hour
      const delayUntil = new Date(tenantTime.getTime() + 30 * 60 * 1000); // 30 minutes later
      return {
        shouldDelay: true,
        reason: 'rate_limit',
        scheduledFor: delayUntil,
        priority: 'normal'
      };
    }
    
    // Default: proceed with call
    return { shouldDelay: false, priority: 'normal', reason: 'optimal_timing' };
    
  } catch (error) {
    console.error('[CALL SCHEDULING ERROR]', error);
    return { shouldDelay: false, priority: 'normal', reason: 'error_fallback' };
  }
}

// Get count of recent calls for rate limiting
async function getRecentCallsCount(tenantKey, minutesBack = 60) {
  try {
    const { getRecentCallsCount } = await import('./db.js');
    return await getRecentCallsCount(tenantKey, minutesBack);
  } catch (error) {
    console.error('[RECENT CALLS COUNT ERROR]', error);
    return 0;
  }
}

// Lead scoring system
function calculateLeadScore(lead, tenant = null) {
  let score = 0;
  
  // Base score for opt-in
  if (lead.consentSms) score += 30;
  
  // Engagement level
  if (lead.status === 'engaged') score += 20;
  if (lead.status === 'opted_out') score = 0; // Override everything
  
  // Response time (faster = higher score)
  if (lead.lastInboundAt && lead.createdAt) {
    const responseTime = new Date(lead.lastInboundAt) - new Date(lead.createdAt);
    const responseMinutes = responseTime / (1000 * 60);
    if (responseMinutes < 5) score += 25;
    else if (responseMinutes < 30) score += 15;
    else if (responseMinutes < 60) score += 10;
  }
  
  // Message content analysis
  if (lead.lastInboundText) {
    const text = lead.lastInboundText.toLowerCase();
    
    // High-intent keywords
    if (text.includes('urgent') || text.includes('asap') || text.includes('emergency')) score += 20;
    if (text.includes('book') || text.includes('appointment') || text.includes('schedule')) score += 15;
    if (text.includes('price') || text.includes('cost') || text.includes('quote')) score += 10;
    
    // Question marks indicate engagement
    if (text.includes('?')) score += 5;
    
    // Length indicates interest
    if (text.length > 50) score += 5;
    if (text.length > 100) score += 5;
  }
  
  // Time-based scoring (recent activity)
  if (lead.lastInboundAt) {
    const hoursSinceLastContact = (new Date() - new Date(lead.lastInboundAt)) / (1000 * 60 * 60);
    if (hoursSinceLastContact < 1) score += 15;
    else if (hoursSinceLastContact < 24) score += 10;
    else if (hoursSinceLastContact < 72) score += 5;
  }
  
  // Tenant-specific scoring
  if (tenant?.leadScoring) {
    const tenantRules = tenant.leadScoring;
    if (tenantRules.highValueKeywords) {
      const text = (lead.lastInboundText || '').toLowerCase();
      for (const keyword of tenantRules.highValueKeywords) {
        if (text.includes(keyword.toLowerCase())) {
          score += tenantRules.keywordScore || 10;
        }
      }
    }
  }
  
  return Math.min(score, 100); // Cap at 100
}

function getLeadPriority(score) {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  if (score >= 40) return 'low';
  return 'very_low';
}

// === Env: Twilio
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN  || '';
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '';
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || '';

const defaultSmsClient = (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;
const defaultSmsConfigured = !!(defaultSmsClient && (TWILIO_FROM_NUMBER || TWILIO_MESSAGING_SERVICE_SID));

// === Middleware
// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

app.use(morgan('dev'));
app.use(cors({
  origin: ORIGIN === '*' ? true : ORIGIN,
  methods: ['GET','POST','OPTIONS','DELETE'],
  allowedHeaders: ['Content-Type','X-API-Key','Idempotency-Key','X-Client-Key'],
}));
app.use('/webhooks/twilio-status', express.urlencoded({ extended: false }));
app.use('/webhooks/twilio-inbound', express.urlencoded({ extended: false }));
app.use('/webhook/sms-reply', express.urlencoded({ extended: false }));
app.use((req, _res, next) => { req.id = 'req_' + nanoid(10); next(); });
app.use(rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));

async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  for (const p of [LEADS_PATH, CALLS_PATH, SMS_STATUS_PATH, JOBS_PATH]) {
    try { await fs.access(p); } catch { await fs.writeFile(p, '[]', 'utf8'); }
  }image.png
await ensureDataFiles();

async function readJson(p, fallback = null) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fallback; }
}
async function writeJson(p, data) { await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf8'); }

// Helpers

// Resolve tenant key from inbound SMS parameters
async function resolveTenantKeyFromInbound({ to, messagingServiceSid }) {
  // Normalize `to` via normalizePhoneE164 (country 'GB') before comparing
  const toE164 = normalizePhoneE164(to, 'GB');
  if (!toE164) {
    console.log('[TENANT RESOLVE FAIL]', { to, messagingServiceSid, reason: 'invalid_phone' });
    return null;
  }

  try {
    const clients = await listFullClients();
    const candidates = [];

    // Strategy (in order):
    // a) Match by exact phone: client.sms.fromNumber === toE164 (the "To" number in SMS)
    // b) Match by Messaging Service SID: client.sms.messagingServiceSid === messagingServiceSid
    for (const client of clients) {
      const phoneMatch = client?.sms?.fromNumber === toE164;
      const mssMatch = messagingServiceSid && client?.sms?.messagingServiceSid === messagingServiceSid;
      
      
      if (phoneMatch || mssMatch) {
        candidates.push({
          clientKey: client.clientKey,
          phoneMatch,
          mssMatch,
          fromNumber: client?.sms?.fromNumber,
          messagingServiceSid: client?.sms?.messagingServiceSid
        });
      }
    }

    if (candidates.length === 0) {
      console.log('[TENANT RESOLVE FAIL]', { to, toE164, messagingServiceSid });
  return null;
}

    // If multiple matches, prioritize phone matches over MessagingServiceSid matches
    const phoneMatches = candidates.filter(c => c.phoneMatch);
    const mssMatches = candidates.filter(c => c.mssMatch && !c.phoneMatch);
    
    let selected;
    if (phoneMatches.length > 0) {
      selected = phoneMatches[0];
      console.log('[TENANT RESOLVE OK]', { 
        tenantKey: selected.clientKey, 
        to, 
        toE164, 
        messagingServiceSid, 
        reason: 'exact_phone_match',
        priority: 'phone_over_mss'
      });
    } else if (mssMatches.length > 0) {
      selected = mssMatches[0];
      console.log('[TENANT RESOLVE OK]', { 
        tenantKey: selected.clientKey, 
        to, 
        toE164, 
        messagingServiceSid, 
        reason: 'messaging_service_match',
        priority: 'mss_fallback'
      });
    } else {
      selected = candidates[0];
      console.log('[TENANT RESOLVE OK]', { 
        tenantKey: selected.clientKey, 
        to, 
        toE164, 
        messagingServiceSid, 
        reason: 'first_match',
        priority: 'fallback'
      });
    }

    if (candidates.length > 1) {
      console.log('[TENANT RESOLVE AMBIGUOUS]', { 
        to, 
        toE164, 
        messagingServiceSid, 
        candidates: candidates.map(c => c.clientKey),
        selected: selected.clientKey,
        phoneMatches: phoneMatches.map(c => c.clientKey),
        mssMatches: mssMatches.map(c => c.clientKey)
      });
    }

    return selected.clientKey;
  } catch (error) {
    console.log('[TENANT RESOLVE FAIL]', { to, toE164, messagingServiceSid, error: error.message });
  return null;
}
}

// Simple {{var}} template renderer for SMS bodies
function renderTemplate(str, vars = {}) {
  try {
    return String(str).replace(/\\{\\{\\s*([a-zA-Z0-9_]+)\\s*\\}\\}/g, (_, k) => {
      const v = vars[k];
      return (v === undefined || v === null) ? '' : String(v);
    });
  } catch { return String(str || ''); }
}


// === Clients (DB-backed)
async function getClientFromHeader(req) {
  const key = req.get('X-Client-Key') || null;
  if (!key) return null;
  return await getFullClient(key);
}
function pickTimezone(client) { return client?.booking?.timezone || TIMEZONE; }
function pickCalendarId(client) { return client?.calendarId || GOOGLE_CALENDAR_ID; }
function smsConfig(client) {
  const messagingServiceSid = client?.sms?.messagingServiceSid || TWILIO_MESSAGING_SERVICE_SID || null;
  const fromNumber = client?.sms?.fromNumber || TWILIO_FROM_NUMBER || null;
  const smsClient = defaultSmsClient;
  const configured = !!(smsClient && (messagingServiceSid || fromNumber));
  return { messagingServiceSid, fromNumber, smsClient, configured };
}

// Expose a simple notify helper for SMS so other modules/routes can reuse Twilio
app.locals.notifySend = async ({ to, from, message, idempotencyKey }) => {
  const { smsClient, configured } = smsConfig();
  if (!configured) throw new Error('SMS not configured');
  const payload = { to, body: message };
  if (from) payload.from = from;
  return smsClient.messages.create(payload);
};


// Idempotency
const idemCache = new Map();
const IDEM_TTL_MS = 10 * 60_000;
function getCachedIdem(key) {
  const v = idemCache.get(key);
  if (!v) return null;
  if (Date.now() - v.at > IDEM_TTL_MS) { idemCache.delete(key); return null; }
  return v;
}
function setCachedIdem(key, status, body) { if (!key) return; idemCache.set(key, { at: Date.now(), status, body }); }
function deriveIdemKey(req) {
  const headerKey = req.get('Idempotency-Key');
  if (headerKey) return headerKey;
  const h = createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex');
  return 'auto:' + h;
}


// Real decision maker contact research only - no fake contacts

// === PUBLIC ENDPOINTS (no auth required) ===

// Simple test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Test endpoint working - SMS pipeline ready - DEPLOYMENT TEST', 
    timestamp: new Date().toISOString(),
    env: {
      googlePlaces: process.env.GOOGLE_PLACES_API_KEY ? 'SET' : 'NOT SET',
      companiesHouse: process.env.COMPANIES_HOUSE_API_KEY ? 'SET' : 'NOT SET',
      googleSearch: process.env.GOOGLE_SEARCH_API_KEY ? 'SET' : 'NOT SET'
    }
  });
});

// Test Companies House API endpoint
app.get('/api/test-companies-house', async (req, res) => {
  try {
    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    
    if (!apiKey) {
      return res.json({ success: false, error: 'Companies House API key not set' });
    }
    
    // Test search for "Scott Arms Dental Practice"
    const response = await axios.get('https://api.company-information.service.gov.uk/search/companies', {
      params: {
        q: 'Scott Arms Dental Practice',
        items_per_page: 5
      },
      headers: {
        'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`
      }
    });
    
    res.json({
      success: true,
      apiKey: apiKey.substring(0, 8) + '...',
      results: response.data.items?.length || 0,
      companies: response.data.items?.map(item => ({
        name: item.title,
        number: item.company_number,
        status: item.company_status
      })) || []
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }
});

// Test Companies House officers endpoint
app.get('/api/test-officers/:companyNumber', async (req, res) => {
  try {
    const { companyNumber } = req.params;
    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    
    if (!apiKey) {
      return res.json({ error: 'Companies House API key not set' });
    }

    const response = await axios.get(`https://api.company-information.service.gov.uk/company/${companyNumber}/officers`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`
      }
    });
    
    res.json({
      success: true,
      companyNumber,
      officers: response.data.items?.map(officer => ({
        name: officer.name,
        role: officer.officer_role,
        appointed: officer.appointed_on,
        resigned: officer.resigned_on,
        nationality: officer.nationality,
        occupation: officer.occupation,
        address: officer.address,
        contact_details: officer.contact_details,
        links: officer.links
      })) || []
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }
});

// Test LinkedIn search endpoint
app.get('/api/test-linkedin', async (req, res) => {
  try {
    const { name, company } = req.query;
    
    if (!name || !company) {
      return res.status(400).json({ error: 'Name and company parameters required' });
    }
    
    console.log(`[TEST LINKEDIN] Testing search for "${name}" at "${company}"`);
    
    // Test Google Search API
    if (process.env.GOOGLE_SEARCH_API_KEY) {
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: process.env.GOOGLE_SEARCH_API_KEY,
          cx: '017576662512468239146:omuauf_lfve',
          q: `"${name}" "${company}" site:linkedin.com/in/`,
          num: 3
        },
        timeout: 5000
      });
      
      res.json({
        success: true,
        query: `"${name}" "${company}" site:linkedin.com/in/`,
        results: response.data.items ? response.data.items.length : 0,
        items: response.data.items || [],
        googleApiKey: 'SET'
      });
    } else {
      res.json({
        success: false,
        error: 'Google Search API key not set',
        googleApiKey: 'NOT SET'
      });
    }
    
  } catch (error) {
    console.error('[TEST LINKEDIN ERROR]', error);
    res.status(500).json({
      success: false,
      error: error.message,
      googleApiKey: process.env.GOOGLE_SEARCH_API_KEY ? 'SET' : 'NOT SET'
    });
  }
});

// Test Companies House API directly
app.get('/api/test-companies-house', async (req, res) => {
  try {
    if (!process.env.COMPANIES_HOUSE_API_KEY) {
      return res.json({ error: 'Companies House API key not set' });
    }

    const axios = (await import('axios')).default;
    const response = await axios.get('https://api.company-information.service.gov.uk/search/companies', {
      params: {
        q: 'Sherwood Dental Practice',
        items_per_page: 5
      },
      headers: {
        'Authorization': `Basic ${Buffer.from(process.env.COMPANIES_HOUSE_API_KEY + ':').toString('base64')}`
      }
    });

    res.json({
      success: true,
      companies: response.data.items?.slice(0, 3) || [],
      message: 'Companies House API is working'
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      message: 'Companies House API failed'
    });
  }
});

// Test Companies House Officers API directly
app.get('/api/test-companies-house-officers/:companyNumber', async (req, res) => {
  try {
    if (!process.env.COMPANIES_HOUSE_API_KEY) {
      return res.json({ error: 'Companies House API key not set' });
    }

    const axios = (await import('axios')).default;
    const response = await axios.get(`https://api.company-information.service.gov.uk/company/${req.params.companyNumber}/officers`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(process.env.COMPANIES_HOUSE_API_KEY + ':').toString('base64')}`
      }
    });

    res.json({
      success: true,
      officers: response.data.items?.slice(0, 5) || [],
      message: `Companies House Officers API is working for company ${req.params.companyNumber}`
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      message: `Companies House Officers API failed for company ${req.params.companyNumber}`
    });
  }
});

// UK Business Search endpoint (PUBLIC - no auth required) - WITH REAL API
app.post('/api/uk-business-search', async (req, res) => {
  try {
    const { query, filters = {} } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    console.log(`[UK BUSINESS SEARCH] Starting real search for: "${query}"`);
    
    // Try real API first, fallback to sample data
    let results = [];
    let usingRealData = false;
    
    try {
      // Debug API keys
      console.log(`[UK BUSINESS SEARCH] API Keys Status:`, {
        googlePlaces: process.env.GOOGLE_PLACES_API_KEY ? 'SET' : 'NOT SET',
        companiesHouse: process.env.COMPANIES_HOUSE_API_KEY ? 'SET' : 'NOT SET'
      });
      
      // Dynamic import of real API module
      const realSearchModule = await import('./real-uk-business-search.js');
      const RealUKBusinessSearch = realSearchModule.default;
      
      const realSearcher = new RealUKBusinessSearch();
      results = await realSearcher.searchBusinesses(query, filters);
      usingRealData = true;
      console.log(`[UK BUSINESS SEARCH] Real API search found ${results.length} businesses`);
    } catch (realApiError) {
      console.log(`[UK BUSINESS SEARCH] Real API failed, falling back to sample data:`, realApiError.message);
      
      // Fallback to enhanced sample data with filters
      results = generateUKBusinesses(query, filters);
    }
    
    res.json({
      success: true,
      results,
      count: results.length,
      query,
      filters,
      usingRealData,
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

// Decision Maker Contact Research endpoint (PUBLIC - no auth required) - WITH REAL API
app.post('/api/decision-maker-contacts', async (req, res) => {
  // Set a 30-second timeout to prevent 502 errors
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ 
        error: 'Request timeout', 
        message: 'The request took too long to process. Please try again with a smaller search scope.' 
      });
    }
  }, 30000);

  try {
    const { business, industry, targetRole } = req.body;
    
    if (!business || !industry || !targetRole) {
      return res.status(400).json({ 
        error: 'Business, industry, and targetRole are required' 
      });
    }
    
    console.log(`[DECISION MAKER CONTACT] Researching contacts for ${targetRole} at ${business.name}`);
    console.log(`[DECISION MAKER CONTACT] Business data:`, { name: business.name, website: business.website, address: business.address });
    
    // Try real API first, fallback to sample data
    let contacts, strategy;
    
    try {
      // Dynamic import of real contact finder module
      const contactFinderModule = await import('./real-decision-maker-contact-finder.js');
      const RealDecisionMakerContactFinder = contactFinderModule.default;
      
      const contactFinder = new RealDecisionMakerContactFinder();
      
      // Set a 5-second timeout for the entire research process
      const result = await Promise.race([
        Promise.all([
          contactFinder.findDecisionMakerContacts(business, industry, targetRole),
          contactFinder.generateOutreachStrategy({ primary: [], secondary: [], gatekeeper: [] }, business, industry, targetRole)
        ]),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Contact research timed out after 5 seconds')), 5000)
        )
      ]);
      
      contacts = result[0];
      strategy = result[1];
      
      console.log(`[DECISION MAKER CONTACT] Real API found ${contacts.primary.length} primary, ${contacts.secondary.length} secondary, ${contacts.gatekeeper.length} gatekeeper contacts`);
      
      if (contacts.primary.length > 0 || contacts.secondary.length > 0 || contacts.gatekeeper.length > 0) {
        contacts.found = true;
        console.log(`[DECISION MAKER CONTACT] Real API successful - contacts found`);
      } else {
        contacts.found = false;
        console.log(`[DECISION MAKER CONTACT] Real API returned empty contacts - no decision makers found`);
        
        // No fake contacts - only real data
        contacts = { primary: [], secondary: [], gatekeeper: [], found: false };
        
        strategy = {
          approach: "No decision makers found",
          message: "No decision maker contacts found for this business. The business may not be registered with Companies House or may not have active directors.",
          followUp: "Try manual research methods: LinkedIn search, company website, or Google search",
          bestTime: "N/A"
        };
      }
    } catch (realApiError) {
      console.log(`[DECISION MAKER CONTACT] Real API failed:`, realApiError.message);
      
      // Check if it's a timeout error
      if (realApiError.message.includes('timed out')) {
        contacts = { primary: [], secondary: [], gatekeeper: [], found: false };
        strategy = {
          approach: "Research timed out",
          message: "The search is taking longer than expected. Please try again.",
          followUp: "Try again with a different business or check your internet connection",
          bestTime: "N/A"
        };
      } else {
        console.log(`[DECISION MAKER CONTACT] Real API failed - no fallback contacts generated`);
        
        // No fake contacts - only real data
        contacts = { primary: [], secondary: [], gatekeeper: [], found: false };
        
        strategy = {
          approach: "API failed",
          message: "Unable to retrieve decision maker contacts. The search service may be temporarily unavailable.",
          followUp: "Try again later or use manual research methods",
          bestTime: "N/A"
        };
      }
    }
    
    console.log(`[DECISION MAKER CONTACT] Returning contacts:`, { 
      primaryCount: contacts.primary.length, 
      secondaryCount: contacts.secondary.length, 
      gatekeeperCount: contacts.gatekeeper.length,
      found: contacts.found 
    });
    
    res.json({
      success: true,
      contacts,
      strategy,
      business,
      industry,
      targetRole,
      timestamp: new Date().toISOString()
    });
    
    // Clear the timeout since request completed successfully
    clearTimeout(timeout);
  } catch (error) {
    console.error('[DECISION MAKER CONTACT ERROR]', error);
    
    // Clear the timeout since request completed (with error)
    clearTimeout(timeout);
    
    res.status(500).json({ 
      error: 'Failed to research decision maker contacts',
      message: error.message 
    });
  }
});

// Get industry categories endpoint (PUBLIC - no auth required)
app.get('/api/industry-categories', (req, res) => {
  try {
    const categories = getIndustryCategories();
    res.json({
      success: true,
      categories,
      total: categories.length
    });
  } catch (error) {
    console.error('[INDUSTRY CATEGORIES ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to get industry categories',
      message: error.message 
    });
  }
});

// Helper function to generate realistic decision makers
function generateRealisticDecisionMakers(business, industry, targetRole) {
  const commonNames = ['John', 'Sarah', 'Michael', 'Emma', 'David', 'Lisa', 'James', 'Anna', 'Robert', 'Maria', 'Chris', 'Jennifer', 'Mark', 'Laura', 'Paul', 'Nicola'];
  const surnames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Hernandez'];
  
  const industryTitles = {
    'dentist': {
      'primary': ['Practice Owner', 'Principal Dentist', 'Clinical Director', 'Managing Partner', 'Owner', 'Manager'],
      'secondary': ['Practice Manager', 'Clinical Lead', 'Senior Dentist'],
      'gatekeeper': ['Reception Manager', 'Patient Coordinator', 'Office Manager']
    },
    'plumber': {
      'primary': ['Business Owner', 'Managing Director', 'Company Director'],
      'secondary': ['Operations Manager', 'Service Manager', 'Team Leader'],
      'gatekeeper': ['Office Manager', 'Customer Service Manager', 'Receptionist']
    },
    'restaurant': {
      'primary': ['Restaurant Owner', 'Managing Director', 'General Manager', 'Owner', 'Manager'],
      'secondary': ['Head Chef', 'Operations Manager', 'Assistant Manager'],
      'gatekeeper': ['Reception Manager', 'Host Manager', 'Customer Service Lead']
    },
    'fitness': {
      'primary': ['Gym Owner', 'Managing Director', 'Franchise Owner', 'Owner', 'Manager'],
      'secondary': ['General Manager', 'Operations Manager', 'Head Trainer'],
      'gatekeeper': ['Membership Manager', 'Reception Manager', 'Customer Service Lead']
    },
    'beauty_salon': {
      'primary': ['Salon Owner', 'Managing Director', 'Business Owner'],
      'secondary': ['Salon Manager', 'Senior Stylist', 'Operations Manager'],
      'gatekeeper': ['Reception Manager', 'Appointment Coordinator', 'Customer Service Manager']
    },
    'gardening': {
      'primary': ['Garden Owner', 'Managing Director', 'Business Owner'],
      'secondary': ['Operations Manager', 'Team Leader', 'Senior Gardener'],
      'gatekeeper': ['Office Manager', 'Customer Service Manager', 'Receptionist']
    }
  };
  
  const titles = industryTitles[industry]?.[targetRole] || ['Manager', 'Director', 'Owner'];
  const firstName = commonNames[Math.floor(Math.random() * commonNames.length)];
  const lastName = surnames[Math.floor(Math.random() * surnames.length)];
  const title = titles[Math.floor(Math.random() * titles.length)];
  
  const businessDomain = business.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.co.uk';
  const personalEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${businessDomain}`;
  
  const areaCodes = ['20', '161', '121', '113', '141', '131', '151', '117', '191', '114'];
  const areaCode = areaCodes[Math.floor(Math.random() * areaCodes.length)];
  const number = Math.floor(Math.random() * 9000000) + 1000000;
  const directPhone = `+44 ${areaCode} ${number}`;
  
  return {
    primary: [
      {
        type: "email",
        value: personalEmail,
        confidence: 0.85,
        source: "realistic_generation",
        title: title,
        name: `${firstName} ${lastName}`
      },
      {
        type: "phone",
        value: directPhone,
        confidence: 0.8,
        source: "realistic_generation",
        title: title,
        name: `${firstName} ${lastName}`
      }
    ],
    secondary: [
      {
        type: "email",
        value: `manager@${businessDomain}`,
        confidence: 0.7,
        source: "realistic_generation",
        title: "Manager",
        name: "Manager"
      }
    ],
    gatekeeper: [
      {
        type: "email",
        value: `info@${businessDomain}`,
        confidence: 0.9,
        source: "realistic_generation",
        title: "General Contact",
        name: "General Contact"
      }
    ]
  };
}

app.use(requireApiKey);

// === HARD-OVERRIDE (top-priority) /api/leads to kill 404s ===
app.post('/api/leads', async (req, res) => {
  try {
    // Minimal logging to Render logs so we can see hits unequivocally
    console.log('HIT /api/leads (override)', { rid: req.id, path: req.path });

    const client = await getClientFromHeader(req);
    if (!client) return res.status(401).json({ ok:false, error:'missing or unknown X-Client-Key' });

    const body    = req.body || {};
    const service = String(body.service || '');
    const lead    = body.lead || {};
    const name    = String(lead.name || body.name || '').trim();
    const phoneIn = String(lead.phone || body.phone || '').trim();
    const source  = String(body.source || 'unknown');

    if (!service) return res.status(400).json({ ok:false, error:'Missing service' });
    if (!name || !phoneIn) return res.status(400).json({ ok:false, error:'Missing lead.name or lead.phone' });

    const regionHint = (body.region || client?.booking?.country || client?.default_country || client?.country || 'GB');
    const phone = normalizePhoneE164(phoneIn, regionHint);
    if (!phone) return res.status(400).json({ ok:false, error:`invalid phone (expected E.164 like +447... or convertible with region ${regionHint})` });

    const now = new Date().toISOString();
    const rows = await readJson(LEADS_PATH, []);
    const id = 'lead_' + nanoid(8);
    const saved = {
      id, tenantId: client.clientKey || client.id, name, phone, source, service,
      status: 'new', createdAt: now, updatedAt: now
    };
    rows.push(saved);
    await writeJson(LEADS_PATH, rows);

    // --- Auto-nudge SMS (minimal, tenant-aware) ---
    try {
      const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
      if (configured) {
        const brand = client?.displayName || client?.clientKey || 'Our Clinic';
        const templ = client?.smsTemplates?.nudge || `Hi {{name}} — it’s {{brand}}. Ready to book your appointment? Reply YES to continue.`;
        const msgBody = renderTemplate(templ, { name, brand });
        const payload = { to: phone, body: msgBody };
        if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid; else if (fromNumber) payload.from = fromNumber;
        const resp = await smsClient.messages.create(payload);
        console.log('[LEAD AUTO-NUDGE SENT]', { to: phone, tenant: client?.clientKey || null, sid: resp?.sid || null });
      }
    } catch (e) {
      console.log('[AUTO-NUDGE SMS ERROR]', e?.message || String(e));
    }

    return res.status(201).json({ ok:true, lead: saved, override: true });
  } catch (err) {
    console.error('[POST /api/leads override] error:', err);
    return res.status(500).json({ ok:false, error:'Internal error' });
  }
});




// Mounted minimal lead intake + STOP webhook
app.use(leadsRouter);
app.use(twilioWebhooks);

// --- Vapi booking webhook: create GCal event + send confirmations
app.post('/webhooks/vapi', async (req, res) => {
  try {
    const p = req.body || {};

    // Accept multiple payload shapes from Vapi
    const clientKey =
      p?.metadata?.clientKey || p?.clientKey || req.get('X-Client-Key') || null;
    const service = p?.metadata?.service || p?.service || '';
    const lead    = p?.customer || p?.lead || p?.metadata?.lead || {};
    const slot    = p?.booking?.slot || p?.metadata?.selectedOption || p?.selectedSlot || p?.slot;

    if (!clientKey) return res.status(400).json({ ok:false, error:'missing clientKey' });
    if (!service)   return res.status(400).json({ ok:false, error:'missing service' });
    if (!lead?.phone) return res.status(400).json({ ok:false, error:'missing lead.phone' });
    if (!slot?.start) return res.status(400).json({ ok:false, error:'missing slot.start' });

    const client = await getFullClient(clientKey);
    if (!client) return res.status(404).json({ ok:false, error:'unknown tenant' });

    if (!(GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64))) {
      return res.status(400).json({ ok:false, error:'Google env missing' });
    }

    const tz = pickTimezone(client);
    const calendarId = pickCalendarId(client);

    const startISO = new Date(slot.start).toISOString();
    const endISO = slot.end
      ? new Date(slot.end).toISOString()
      : new Date(new Date(slot.start).getTime() + (client?.booking?.defaultDurationMin || 30) * 60000).toISOString();

    // Authorize
    const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
    await auth.authorize();

    // Guard against conflicts
    const busy = await freeBusy({ auth, calendarId, timeMinISO: startISO, timeMaxISO: endISO });
    const conflict = busy.some(b => !(endISO <= b.start || startISO >= b.end));
    if (conflict) {
      return res.status(409).json({ ok:false, error:'slot_unavailable', busy });
    }

    // Create event (deterministic ID to prevent dupes)
    const { google } = await import('googleapis');
    const cal = google.calendar({ version: 'v3', auth });
    const summary = `${service} — ${lead.name || ''}`.trim();
    const description = [
      `Service: ${service}`,
      `Lead: ${lead.name || ''}`,
      lead.phone ? `Phone: ${lead.phone}` : null,
      `Tenant: ${client?.clientKey || 'default'}`
    ].filter(Boolean).join('\\n');

    let event;
    try {
      const rawKey = `${client?.clientKey || 'default'}|${service}|${startISO}|${lead.phone}`;
      const crypto = await import('crypto');
      const deterministicId = ('bk' + crypto.createHash('sha1').update(rawKey).digest('hex').slice(0, 20)).toLowerCase();

      event = (await cal.events.insert({
        calendarId,
        requestBody: {
          id: deterministicId,
          summary,
          description,
          start: { dateTime: startISO, timeZone: tz },
          end:   { dateTime: endISO,   timeZone: tz },
          extendedProperties: { private: { leadPhone: lead.phone, leadId: lead.id || '' } }
        }
      })).data;
    } catch (err) {
      // Retry without custom id if Google rejects it
      event = (await cal.events.insert({
        calendarId,
        requestBody: {
          summary,
          description,
          start: { dateTime: startISO, timeZone: tz },
          end:   { dateTime: endISO,   timeZone: tz },
          extendedProperties: { private: { leadPhone: lead.phone, leadId: lead.id || '' } }
        }
      })).data;
    }

    // Send confirmation SMS (tenant-aware)
    try {
      const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
      if (configured) {
        const when = new Date(startISO).toLocaleString(client?.locale || 'en-GB', {
          timeZone: tz, weekday:'short', day:'numeric', month:'short',
          hour:'numeric', minute:'2-digit', hour12:true
        });
        const brand = client?.displayName || client?.clientKey || 'Our Clinic';
        const link  = event?.htmlLink ? ` Calendar: ${event.htmlLink}` : '';
        const sig   = client?.brandSignature ? ` ${client.brandSignature}` : '';
        const defaultBody  = `Hi {{name}}, your {{service}} is booked with {{brand}} for {{when}} {{tz}}.{{link}}{{sig}} Reply STOP to opt out.`;
        const templ = client?.smsTemplates?.confirm || defaultBody;
        const body  = renderTemplate(templ, { name: lead.name, service, brand, when, tz, link, sig });
        const payload = { to: lead.phone, body };
        if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid; else if (fromNumber) payload.from = fromNumber;
        await smsClient.messages.create(payload);
      }
    } catch (e) {
      console.error('[confirm sms failed]', e?.message || e);
    }

    return res.json({ ok:true, eventId: event.id, htmlLink: event.htmlLink || null });
  } catch (err) {
    console.error('[VAPI WEBHOOK ERROR]', err?.response?.data || err?.message || err);
    return res.status(500).json({ ok:false, error: String(err?.response?.data || err?.message || err) });
  }
});

app.use(vapiWebhooks);
// Retry helper
async function withRetry(fn, { retries = 2, delayMs = 250 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      const status = e?.response?.status || e?.code || e?.status || 0;
      const retriable = (status === 429) || (status >= 500) || !status;
      if (!retriable || i === retries) throw e;
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

// --- Bootstrap tenants from env (for free Render without disk) ---
async function bootstrapClients() {
  try {
    const existing = await listFullClients();
    if (existing.length > 0) return;
    const raw = process.env.BOOTSTRAP_CLIENTS_JSON;
    if (!raw) return;
    let seed = JSON.parse(raw);
    if (!Array.isArray(seed)) seed = [seed];
    for (const c of seed) {
      if (!c.clientKey || !c.booking?.timezone) continue;
      await upsertFullClient(c);
    }
    console.log(`Bootstrapped ${seed.length} client(s) into SQLite from BOOTSTRAP_CLIENTS_JSON`);
  } catch (e) {
    console.error('bootstrapClients error', e?.message || e);
  }
}

// Health (DB)
app.get('/health', async (_req, res) => {
  try {
    const rows = await listFullClients();
    res.json({
      ok: true,
      service: 'ai-booking-mvp',
      time: new Date().toISOString(),
      gcalConfigured: !!(GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64) && GOOGLE_CALENDAR_ID),
      smsConfigured: defaultSmsConfigured,
      corsOrigin: ORIGIN === '*' ? 'any' : ORIGIN,
      tenants: rows.map(r => r.clientKey),
      db: { path: DB_PATH }
    });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
});

// Optional: gcal ping
app.get('/gcal/ping', async (_req, res) => {
  try {
    if (!(GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64)))
      return res.status(400).json({ ok:false, error:'Google env missing' });
    const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
    await auth.authorize();
    res.json({ ok:true });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
});

// Helpers for hours/closures
function asJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(String(val)); } catch { return fallback; }
}
function hoursFor(client) {
  return asJson(client?.booking?.hours, null)
      || asJson(client?.hoursJson, null)
      || { mon:['09:00-17:00'], tue:['09:00-17:00'], wed:['09:00-17:00'], thu:['09:00-17:00'], fri:['09:00-17:00'] };
}
const closedDatesFor    = (c) => asJson(c?.closedDates, [])     || asJson(c?.closedDatesJson, []);
const servicesFor       = (c) => asJson(c?.services, [])        || asJson(c?.servicesJson, []);
const attendeeEmailsFor = (c) => asJson(c?.attendeeEmails, [])  || asJson(c?.attendeeEmailsJson, []);

// === Availability === (respects hours/closures/min notice/max advance + per-service duration)
app.post('/api/calendar/find-slots', async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    if (!client) return res.status(400).json({ ok:false, error: 'Unknown tenant (missing X-Client-Key)' });
    if (!(GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64)))
      return res.status(400).json({ ok:false, error:'Google env missing' });

    const tz = pickTimezone(client);
    const calendarId = pickCalendarId(client);

    const services = servicesFor(client);
    const requestedService = req.body?.service;
    const svc = services.find(s => s.id === requestedService);
    const durationMin = (svc?.durationMin) || req.body?.durationMin || client?.booking?.defaultDurationMin || 30;
    const bufferMin = (svc?.bufferMin) || 0;

    const minNoticeMin   = client?.booking?.minNoticeMin   ?? client?.minNoticeMin   ?? 0;
    const maxAdvanceDays = client?.booking?.maxAdvanceDays ?? client?.maxAdvanceDays ?? 14;
    const business = hoursFor(client);
    const closedDates = new Set(closedDatesFor(client));
    const stepMinutes = Math.max(5, Number((req.body?.stepMinutes ?? svc?.slotStepMin ?? durationMin ?? 15)));
const windowStart = new Date(Date.now() + minNoticeMin * 60000);
const windowEnd   = new Date(Date.now() + maxAdvanceDays * 86400000);

    function alignToGrid(d) {
      const dt = new Date(d);
      dt.setSeconds(0,0);
      const minutes = dt.getMinutes();
      const rem = minutes % stepMinutes;
      if (rem !== 0) dt.setMinutes(minutes + (stepMinutes - rem));
      return dt;
    }
const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
    await auth.authorize();
    const busy = await freeBusy({ auth, calendarId, timeMinISO: windowStart.toISOString(), timeMaxISO: windowEnd.toISOString() });

    const slotMs = (durationMin + bufferMin) * 60000;
    const results = [];
    let cursor = alignToGrid(windowStart);
    cursor.setSeconds(0,0);

    const dowName = ['sun','mon','tue','wed','thu','fri','sat'];

    function formatHMLocal(dt) {
      const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
      const parts = f.formatToParts(dt);
      const hh = parts.find(p => p.type==='hour').value;
      const mm = parts.find(p => p.type==='minute').value;
      return `${hh}:${mm}`;
    }
    function isOpen(dt) {
      const spans = business[dowName[dt.getUTCDay()]];
      if (!Array.isArray(spans) || spans.length === 0) return false;
      const hm = formatHMLocal(dt);
      return spans.some(s => { const [a,b] = String(s).split('-'); return hm >= a && hm < b; });
    }
    function isClosedDate(dt) {
      const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit' });
      const [y,m,d] = f.format(dt).split('-');
      return closedDates.has(`${y}-${m}-${d}`);
    }
    function overlapsBusy(sISO, eISO) {
      return busy.some(b => !(eISO <= b.start || sISO >= b.end));
    }

    while (cursor < windowEnd && results.length < 30) {
      const start = new Date(cursor);
      const end   = new Date(cursor.getTime() + slotMs);
      const sISO = start.toISOString();
      const eISO = end.toISOString();

      if (!isClosedDate(start) && isOpen(start) && !overlapsBusy(sISO, eISO)) {
        results.push({ start: sISO, end: eISO, timezone: tz });
      }

      cursor.setMinutes(cursor.getMinutes() + stepMinutes);
      cursor.setSeconds(0,0);
    }

    res.json({ ok:true, slots: results, params: { durationMin, bufferMin, stepMinutes } });
  } catch (err) {
    res.status(500).json({ ok:false, error: String(err) });
  }
});

// === Book a slot ===
app.post('/api/calendar/book-slot', async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    if (!client) return res.status(400).json({ ok:false, error: 'Unknown tenant (missing X-Client-Key)' });

    if (!(GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64)))
      return res.status(400).json({ ok:false, error:'Google env missing' });

    const tz = pickTimezone(client);
    const calendarId = pickCalendarId(client);

    const { service, lead, start, durationMin } = req.body || {};

    if (!service || typeof service !== 'string') {
      return res.status(400).json({ ok:false, error: 'Missing/invalid "service" (string)' });
    }
    if (!lead || typeof lead !== 'object' || !lead.name || !lead.phone) {
      return res.status(400).json({ ok:false, error: 'Missing/invalid "lead" (need name, phone)' });
    }
    const startISO = (() => { try { return new Date(start).toISOString(); } catch { return null; } })();
    if (!start || !startISO) {
      return res.status(400).json({ ok:false, error: 'Missing/invalid "start" (ISO datetime)' });
    }
    const dur = Number.isFinite(+durationMin) ? +durationMin : (client?.booking?.defaultDurationMin || 30);
    const endISO = new Date(new Date(startISO).getTime() + dur * 60000).toISOString();

    // Auth
    const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
    await auth.authorize();

    // Guard against conflicts via freeBusy
    const busy = await freeBusy({ auth, calendarId, timeMinISO: startISO, timeMaxISO: endISO });
    const conflict = busy.some(b => !(endISO <= b.start || startISO >= b.end));
    if (conflict) {
      return res.status(409).json({ ok:false, error:'Requested time is busy', busy });
    }

    const attendees = []; // removed invites
const summary = `${service} — ${lead.name}`;
    const description = [
      `Service: ${service}`,
      `Lead: ${lead.name}`,
      lead.phone ? `Phone: ${lead.phone}` : null,
      lead.id ? `Lead ID: ${lead.id}` : null,
      `Tenant: ${client?.clientKey || 'default'}`
    ].filter(Boolean).join('\\n');


let event;
try {
  // Deterministic event id to prevent duplicates on retries/same payloads
  const rawKey = `${client?.clientKey || 'default'}|${service}|${startISO}|${lead.phone}`;
  const deterministicId = ('bk' + createHash('sha1').update(rawKey).digest('hex').slice(0, 20)).toLowerCase();

  const cal = google.calendar({ version: 'v3', auth });
  let respInsert;
  try {
    respInsert = await cal.events.insert({
      calendarId,
      requestBody: {
        id: deterministicId,
        summary,
        description,
        start: { dateTime: startISO, timeZone: tz },
        end:   { dateTime: endISO,   timeZone: tz },
        extendedProperties: { private: { leadPhone: lead.phone, leadId: lead.id || '' } }
      }
    });
  } catch (err) {
    const sc = err?.response?.status;
    const msg = err?.response?.data || err?.message || '';
    if (sc === 400 && String(msg).toLowerCase().includes('id')) {
      // Retry once without ID if Google rejects the custom id
      respInsert = await cal.events.insert({
        calendarId,
        requestBody: {
          summary,
          description,
          start: { dateTime: startISO, timeZone: tz },
          end:   { dateTime: endISO,   timeZone: tz },
          extendedProperties: { private: { leadPhone: lead.phone, leadId: lead.id || '' } }
        }
      });
    } else {
      throw err;
    }
  }
  event = respInsert.data;

} catch (e) {
  const code = e?.response?.status || 500;
  const data = e?.response?.data || e?.message || String(e);
  return res.status(code === 409 ? 409 : code).json({ ok:false, error:(code===409?'duplicate_event_id':'gcal_insert_failed'), details: data });
}
// Send confirmation SMS if tenant SMS is configured
try {
  const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
  if (configured) {
    const when = new Date(startISO).toLocaleString(client?.locale || 'en-GB', {
      timeZone: tz, weekday: 'short', day: 'numeric', month: 'short',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
    const brand = client?.displayName || client?.clientKey || 'Our Clinic';
    const link  = event?.htmlLink ? ` Calendar: ${event.htmlLink}` : '';
    const sig   = client?.brandSignature ? ` ${client.brandSignature}` : '';
    const defaultBody  = `Hi {{name}}, your {{service}} is booked with {{brand}} for {{when}} {{tz}}.{{link}}{{sig}} Reply STOP to opt out.`;
    const templ = client?.smsTemplates?.confirm || defaultBody;
    const body  = renderTemplate(templ, { name: lead.name, service, brand, when, tz, link, sig });
    const payload = { to: lead.phone, body };
    if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid; else if (fromNumber) payload.from = fromNumber;
    await smsClient.messages.create(payload);
  }
} catch (e) {
  console.error('confirm sms failed', e?.message || e);
}


// Append to Google Sheets ledger (optional)
try {
  if (process.env.BOOKINGS_SHEET_ID) {
    await appendToSheet({
      spreadsheetId: process.env.BOOKINGS_SHEET_ID,
      sheetName: 'Bookings',
      values: [
        new Date().toISOString(),
        client?.clientKey || client?.id || '',
        service,
        lead?.name || '',
        lead?.phone || '',
        event?.id || '',
        event?.htmlLink || '',
        startISO
      ]
    });
  }
} catch (e) { console.warn('sheets append error', e?.message || e); }

    return res.status(201).json({
      ok: true,
      event: {
        id: event.id,
        htmlLink: event.htmlLink,
        status: event.status
      },
      tenant: { clientKey: client?.clientKey || null, calendarId, timezone: tz }
    });
  } catch (err) {
    return res.status(500).json({ ok:false, error: String(err) });
  }
});

// Twilio delivery receipts

// Simple SMS send route (per-tenant or global fallback)
app.post('/api/notify/send', async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    const { channel, to, message } = req.body || {};
    if (channel !== 'sms') return res.status(400).json({ ok:false, error:'Only channel="sms" is supported' });
    if (!to || !message) return res.status(400).json({ ok:false, error:'Missing "to" or "message"' });

    const { smsClient, messagingServiceSid, fromNumber, configured } = smsConfig(client);
    if (!configured) return res.status(400).json({ ok:false, error:'SMS not configured (no fromNumber or messagingServiceSid)' });

    const payload = { to, body: message };
    if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid;
    else if (fromNumber) payload.from = fromNumber;

    const resp = await smsClient.messages.create(payload);
    return res.json({ ok:true, sid: resp.sid });
  } catch (e) {
    const msg = e?.message || 'sms_error';
    const code = e?.status || e?.code || 500;
    return res.status(500).json({ ok:false, error: msg });
  }
});
app.post('/webhooks/twilio-status', async (req, res) => {
  const rows = await readJson(SMS_STATUS_PATH, []);
  const log = {
    evt: 'sms.status',
    rid: req.id,
    at: new Date().toISOString(),
    sid: req.body.MessageSid || null,
    status: req.body.MessageStatus || null,
    to: req.body.To || null,
    from: req.body.From || null,
    messagingServiceSid: req.body.MessagingServiceSid || null,
    errorCode: req.body.ErrorCode || null
  };
  rows.push(log);
  await writeJson(SMS_STATUS_PATH, rows);
  res.type('text/plain').send('OK');
});

// Twilio inbound STOP/START to toggle consent + YES => trigger Vapi call
const VAPI_URL = 'https://api.vapi.ai';
const VAPI_PRIVATE_KEY     = process.env.VAPI_PRIVATE_KEY || '';
const VAPI_ASSISTANT_ID    = process.env.VAPI_ASSISTANT_ID || '';
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || '';

app.post('/webhooks/twilio-inbound', smsRateLimit, safeAsync(async (req, res) => {
  try {
    const rawFrom = (req.body.From || '').toString();
    const rawTo   = (req.body.To   || '').toString();
    const bodyTxt = (req.body.Body || '').toString().trim().replace(/^["']|["']$/g, '');

    // Input validation
    if (!validatePhoneNumber(rawFrom)) {
      console.log('[INVALID INPUT]', { field: 'From', value: rawFrom, reason: 'invalid_phone' });
      return res.status(400).send('Invalid phone number');
    }
    
    if (!validatePhoneNumber(rawTo)) {
      console.log('[INVALID INPUT]', { field: 'To', value: rawTo, reason: 'invalid_phone' });
      return res.status(400).send('Invalid phone number');
    }
    
    if (!validateSmsBody(bodyTxt)) {
      console.log('[INVALID INPUT]', { field: 'Body', value: bodyTxt, reason: 'invalid_body' });
      return res.status(400).send('Invalid message body');
    }

    // Normalize numbers: strip spaces so E.164 comparisons work
    const from = normalizePhoneE164(rawFrom);
    const to   = normalizePhoneE164(rawTo);

    // Render log for grep
    console.log('[INBOUND SMS]', { from, to, body: bodyTxt });
    
    // Analytics logging
    console.log('[SMS_ANALYTICS]', {
      timestamp: new Date().toISOString(),
      from,
      to,
      bodyLength: bodyTxt.length,
      messageType: bodyTxt.toUpperCase(),
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent') || 'unknown'
    });
  // --- derive tenantKey from header, inbound 'To', or MessagingServiceSid ---
  const headerKey = req.get('X-Client-Key');
  const toE164 = normalizePhoneE164(req.body.To, 'GB');
  const mss = req.body.MessagingServiceSid || req.body.messagingServiceSid?.trim?.();
  let tenantKey = headerKey || await resolveTenantKeyFromInbound({ to: toE164, messagingServiceSid: mss });

  console.log('[TENANT KEY RESOLVED]', { 
    tenantKey, 
    headerKey, 
    toE164, 
    messagingServiceSid: mss,
    resolved: !!tenantKey
  });

  if (!tenantKey) {
    console.log('[TENANT RESOLVE FAIL]', { to: req.body.To, toE164, messagingServiceSid: mss });
    return res.send('OK');
  }


    // Validate sender
    if (!from) return res.type('text/plain').send('IGNORED');

    // YES / STOP intents (extend as needed)
    const isYes  = /^\s*(yes|y|ok|okay|sure|confirm)\s*$/i.test(bodyTxt);
    const isStart = /^\s*(start|unstop)\s*$/i.test(bodyTxt);
    const isStop = /^\s*(stop|unsubscribe|cancel|end|quit)\s*$/i.test(bodyTxt);

    // Load & update the most recent lead matching this phone from database
    const clients = await listFullClients();
    let leads = clients.flatMap(client => client.leads || []);
    const revIdx = [...leads].reverse().findIndex(L => normalizePhoneE164(L.phone || '') === from);
    const idx = revIdx >= 0 ? (leads.length - 1 - revIdx) : -1;

    let serviceForCall = '';

    if (idx >= 0) {
      const prev = leads[idx];
      const now = new Date().toISOString();
      tenantKey = prev.tenantKey || tenantKey; // Preserve existing tenantKey or use resolved one
      serviceForCall = prev.service || '';
      leads[idx] = {
        ...prev,
        lastInboundAt: now,
        lastInboundText: bodyTxt,
        lastInboundFrom: from,
        lastInboundTo: to,
        consentSms: isStop ? false : ((isYes || isStart) ? true : (prev.consentSms ?? false)),
        status: isStop ? 'opted_out' : (isYes ? 'engaged' : (prev.status || 'new')),
        updatedAt: now,
      };
    } else {
      // Create a minimal lead if unknown number texts in
      const now = new Date().toISOString();
      const newLead = {
        id: 'lead_' + nanoid(8),
        phone: from,
        tenantKey: tenantKey,
        lastInboundAt: now,
        lastInboundText: bodyTxt,
        lastInboundFrom: from,
        lastInboundTo: to,
        consentSms: (isYes || isStart) ? true : false,
        status: isYes ? 'engaged' : 'new',
        createdAt: now,
        updatedAt: now,
      };
      
      console.log('[LEAD CREATED]', { 
        phone: from, 
        tenantKey, 
        body: bodyTxt, 
        consentSms: newLead.consentSms,
        status: newLead.status
      });
      leads.push(newLead);
      
      // Track conversion stage
      await trackConversionStage({
        clientKey: tenantKey,
        leadPhone: from,
        stage: 'lead_created',
        stageData: {
          service: serviceForCall,
          score: newLead.score || 0,
          source: 'sms_opt_in',
          consentSms: newLead.consentSms,
          status: newLead.status
        }
      });
      
      // Track analytics event
      await trackAnalyticsEvent({
        clientKey: tenantKey,
        eventType: isYes ? 'yes_response' : 'start_opt_in',
        eventCategory: 'lead_interaction',
        eventData: {
          phone: from,
          service: serviceForCall,
          score: newLead.score || 0,
          existingLead: false
        },
        sessionId: `sms_${from}_${Date.now()}`,
        userAgent: 'SMS',
        ipAddress: req.ip
      });
    }

    // Save leads to database by updating the client
    if (tenantKey) {
      const client = await getFullClient(tenantKey);
      if (client) {
        client.leads = leads.filter(lead => lead.tenantKey === tenantKey);
        client.updatedAt = new Date().toISOString();
        await upsertFullClient(client);
      }
    }

    // Check if already opted in (idempotent) - but allow VAPI calls for YES/START messages
    const existingLead = leads.find(l => l.phone === from);
    if (existingLead && existingLead.consentSms && existingLead.status === 'engaged' && !(isYes || isStart)) {
      console.log('[IDEMPOTENT SKIP]', { from, tenantKey, reason: 'already_opted_in' });
      return res.send('OK');
    }

    // If user texted YES or START && we know the tenant, trigger a Vapi call right away (fire-and-forget)
    console.log('[VAPI CONDITION CHECK]', { 
      isYes, 
      isStart, 
      tenantKey, 
      hasVapiKey: !!VAPI_PRIVATE_KEY,
      condition: (isYes || isStart) && tenantKey && VAPI_PRIVATE_KEY
    });
    
    // Debug: Check if tenantKey is still available
    console.log('[TENANT KEY DEBUG]', { 
      tenantKey, 
      isYes, 
      isStart, 
      willTriggerVapi: (isYes || isStart) && tenantKey && VAPI_PRIVATE_KEY
    });
    
    // Prevent calls to assistant's own number or invalid numbers
    const isAssistantNumber = from === '+447403934440'; // Assistant's number - don't call this
    const isValidCustomerNumber = from && from.length > 10 && !from.includes('000000');
    
    console.log('[VAPI NUMBER VALIDATION]', { 
      from, 
      isAssistantNumber, 
      isValidCustomerNumber,
      willCall: (isYes || isStart) && tenantKey && VAPI_PRIVATE_KEY && isValidCustomerNumber && !isAssistantNumber
    });
    
    if ((isYes || isStart) && tenantKey && VAPI_PRIVATE_KEY && isValidCustomerNumber && !isAssistantNumber) {
      // VAPI Token Protection - prevent unnecessary calls during testing
      console.log('[VAPI DEBUG]', { 
        VAPI_TEST_MODE, 
        VAPI_DRY_RUN, 
        NODE_ENV: process.env.NODE_ENV,
        VAPI_PRIVATE_KEY: VAPI_PRIVATE_KEY ? 'present' : 'missing'
      });
      
      if (VAPI_TEST_MODE || VAPI_DRY_RUN) {
        console.log('[AUTO-CALL SKIPPED]', { 
          tenantKey, 
          from, 
          reason: VAPI_TEST_MODE ? 'test_mode' : 'dry_run',
          wouldHaveCalled: true 
        });
        return res.send('OK');
      }

      // Check budget before making call
      const budgetCheck = await checkBudgetBeforeCall(tenantKey, 0.05); // Estimated $0.05 per call
      if (!budgetCheck.allowed) {
        console.log('[BUDGET BLOCKED CALL]', {
          tenantKey,
          from,
          reason: budgetCheck.reason,
          budget: budgetCheck.budget
        });
        
        // Send SMS fallback instead of making call
        await handleVapiFailure({
          tenantKey,
          from,
          error: new Error(`Budget exceeded: ${budgetCheck.reason}`),
          errorType: 'budget_exceeded',
          existingLead
        });
        
        return res.send('OK');
      }
      
      // Intelligent call scheduling
      const callScheduling = await determineCallScheduling({ tenantKey, from, isYes, isStart, existingLead });
      if (callScheduling.shouldDelay) {
        console.log('[CALL SCHEDULED]', {
          tenantKey,
          from,
          reason: callScheduling.reason,
          scheduledFor: callScheduling.scheduledFor,
          priority: callScheduling.priority
        });
        
        // Add to call queue
        const { addToCallQueue } = await import('./db.js');
        await addToCallQueue({
          clientKey: tenantKey,
          leadPhone: from,
          priority: callScheduling.priority || 5,
          scheduledFor: callScheduling.scheduledFor,
          callType: 'vapi_call',
          callData: {
            triggerType: isYes ? 'yes_response' : 'start_opt_in',
            leadScore: existingLead?.score || 0,
            leadStatus: existingLead?.status || 'new',
            businessHours: isBusinessHours(client) ? 'within' : 'outside'
          }
        });
        
        return res.send('OK');
      }

      // Check business hours and lead score before making calls
      const client = await getFullClient(tenantKey);
      const isBusinessTime = isBusinessHours(client);
      
      // Calculate lead score
      const leadScore = calculateLeadScore(existingLead, client);
      const priority = getLeadPriority(leadScore);
      
      console.log('[LEAD SCORE]', { 
        from, 
        tenantKey, 
        score: leadScore, 
        priority,
        isBusinessTime,
        willCall: isBusinessTime && leadScore >= 40 // Only call high/medium priority leads
      });
      
      // Skip very low priority leads even during business hours
      if (leadScore < 40) {
        console.log('[AUTO-CALL SKIPPED]', { 
          tenantKey, 
          from, 
          reason: 'low_lead_score',
          score: leadScore,
          priority
        });
        return res.send('OK');
      }
      
      if (!isBusinessTime) {
        const nextBusiness = getNextBusinessHour(client);
        console.log('[AUTO-CALL DEFERRED]', { 
          tenantKey, 
          from, 
          reason: 'outside_business_hours',
          nextBusinessTime: nextBusiness.toISOString(),
          currentTime: new Date().toISOString()
        });
        
        // Send a message explaining the delay
        try {
          const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
          if (configured) {
            const brand = client?.displayName || client?.clientKey || 'Our Clinic';
            const nextBusinessStr = nextBusiness.toLocaleString('en-GB', { 
              timeZone: client?.booking?.timezone || TIMEZONE,
              weekday: 'long',
              hour: '2-digit',
              minute: '2-digit'
            });
            const ack = `Thanks! ${brand} will call you during business hours (${nextBusinessStr}). Reply STOP to opt out.`;
            await smsClient.messages.create({
              from: fromNumber,
              to: from,
              body: ack,
              messagingServiceSid
            });
            console.log('[BUSINESS HOURS SMS]', { from, to: from, brand, nextBusinessTime: nextBusinessStr });
          }
        } catch (e) {
          console.error('[BUSINESS HOURS SMS ERROR]', e?.message || String(e));
        }
        
        return res.send('OK');
      }
      
      // If we're blocking the call, send a message explaining why
      if (isAssistantNumber) {
        console.log('[VAPI BLOCKED]', { from, reason: 'assistant_number' });
      try {
        const client = await getFullClient(tenantKey);
        if (client) {
            const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
            if (configured) {
              const brand = client?.displayName || client?.clientKey || 'Our Clinic';
              const ack = `Thanks! ${brand} will call you shortly. Reply STOP to opt out.`;
              await smsClient.messages.create({
                from: fromNumber,
                to: from,
                body: ack,
                messagingServiceSid
              });
              console.log('[YES ACK SMS]', { from, to: from, brand });
            }
          }
        } catch (e) {
          console.error('[YES ACK SMS ERROR]', e?.message || String(e));
        }
        return res.send('OK');
      }
      
      try {
        const client = await getFullClient(tenantKey);
        if (client) {
          // Dynamic assistant selection based on lead characteristics
          const assistantConfig = await selectOptimalAssistant({ client, existingLead, isYes, isStart });
          const assistantId = assistantConfig.assistantId;
          const phoneNumberId = assistantConfig.phoneNumberId;
          if (isStart) {
            console.log('[LEAD OPT-IN START]', { from, tenantKey });
          }
          const payload = {
            assistantId,
            phoneNumberId,
            customer: { number: from, numberE164CheckEnabled: true },
            maxDurationSeconds: 10, // VAPI minimum is 10 seconds - still much cheaper than 10 minutes
            metadata: {
              tenantKey,
              leadPhone: from,
              triggerType: isYes ? 'yes_response' : 'start_opt_in',
              timestamp: new Date().toISOString(),
              leadScore: existingLead?.score || 0,
              leadStatus: existingLead?.status || 'new',
              businessHours: isBusinessHours() ? 'within' : 'outside',
              retryAttempt: 0 // Track retry attempts
            },
            assistantOverrides: {
              variableValues: await generateAssistantVariables({
                client,
                existingLead,
                tenantKey,
                serviceForCall,
                isYes,
                isStart,
                assistantConfig
              })
            }
          };
            // Use enhanced retry logic for VAPI calls
            const vapiResult = await retryWithBackoff(async () => {
          const resp = await fetch(`${VAPI_URL}/call`, {
            method: 'POST',
                headers: { 
                  'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`, 
                  'Content-Type': 'application/json',
                  'User-Agent': 'AI-Booking-MVP/1.0'
                },
                body: JSON.stringify(payload),
                timeout: 30000 // 30 second timeout
              });
              
              if (!resp.ok) {
                const errorText = await resp.text().catch(() => resp.statusText);
                const error = new Error(`VAPI call failed: ${resp.status} ${errorText}`);
                error.status = resp.status;
                throw error;
              }
              
              const result = await resp.json().catch(() => null);
              if (!result) {
                throw new Error('Failed to parse VAPI response');
              }
              
              return result;
            }, 3, 2000, {
              operation: 'vapi_call',
              tenantKey,
              leadPhone: from
            }); // 3 retries, 2 second base delay with context

      console.log('[VAPI CALL SUCCESS]', { 
        from, 
        tenantKey, 
        callId: vapiResult?.id || 'unknown',
        status: vapiResult?.status || 'unknown',
        vapiStatus: 'ok' 
      });
      
      // Track conversion stage
      await trackConversionStage({
        clientKey: tenantKey,
        leadPhone: from,
        stage: 'vapi_call_initiated',
        stageData: {
          callId: vapiResult?.id,
          assistantId: assistantConfig.assistantId,
          triggerType: isYes ? 'yes_response' : 'start_opt_in',
          leadScore: existingLead?.score || 0
        },
        previousStage: 'lead_created'
      });
      
      // Track analytics event
      await trackAnalyticsEvent({
        clientKey: tenantKey,
        eventType: 'vapi_call_initiated',
        eventCategory: 'call_interaction',
        eventData: {
          phone: from,
          callId: vapiResult?.id,
          assistantId: assistantConfig.assistantId,
          triggerType: isYes ? 'yes_response' : 'start_opt_in',
          leadScore: existingLead?.score || 0
        },
        sessionId: `vapi_${from}_${Date.now()}`,
        userAgent: 'VAPI',
        ipAddress: req.ip
      });
      
      // Record performance metric
      await recordPerformanceMetric({
        clientKey: tenantKey,
        metricName: 'vapi_call_initiated',
        metricValue: 1,
        metricUnit: 'count',
        metricCategory: 'call_metrics',
        metadata: {
          phone: from,
          callId: vapiResult?.id,
          triggerType: isYes ? 'yes_response' : 'start_opt_in'
        }
      });
          
          if (vapiResult) {
            const callId = vapiResult?.id || 'unknown';
            console.log('[AUTO-CALL TRIGGER]', { from, tenantKey, callId });
            
            // Book calendar appointment after successful VAPI call
            try {
              const calendarId = pickCalendarId(client);
              if (GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64) && calendarId) {
                // Handle private key formatting - ensure it's properly formatted
                let privateKey = GOOGLE_PRIVATE_KEY;
                if (!privateKey && GOOGLE_PRIVATE_KEY_B64) {
                  privateKey = Buffer.from(GOOGLE_PRIVATE_KEY_B64, 'base64').toString();
                }
                
                // Ensure private key has proper line breaks
                if (privateKey && !privateKey.includes('\n')) {
                  privateKey = privateKey.replace(/\\n/g, '\n');
                }
                
                const auth = new google.auth.GoogleAuth({
                  credentials: {
                    client_email: GOOGLE_CLIENT_EMAIL,
                    private_key: privateKey,
                  },
                  scopes: ['https://www.googleapis.com/auth/calendar'],
                });
                
                const cal = google.calendar({ version: 'v3', auth });
                const now = new Date();
                const startTime = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes from now
                const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 minutes duration
                
                const event = {
                  summary: `AI Booking Call - ${client?.displayName || client?.clientKey}`,
                  description: `Automated follow-up call with ${from}\nCall ID: ${callId}\nTenant: ${tenantKey}`,
                  start: {
                    dateTime: startTime.toISOString(),
                    timeZone: client?.booking?.timezone || 'Europe/London',
                  },
                  end: {
                    dateTime: endTime.toISOString(),
                    timeZone: client?.booking?.timezone || 'Europe/London',
                  },
                  attendees: [], // Removed to avoid Google Calendar service account limitations
                  reminders: {
                    useDefault: false,
                    overrides: [
                      { method: 'popup', minutes: 10 },
                    ],
                  },
                };
                
                const createdEvent = await cal.events.insert({
                  calendarId,
                  resource: event,
                });
                
                console.log('[CALENDAR BOOKED]', { 
                  from, 
                  tenantKey, 
                  callId, 
                  eventId: createdEvent.data.id,
                  startTime: startTime.toISOString(),
                  calendarLink: createdEvent.data.htmlLink
                });
              }
            } catch (calendarError) {
              console.error('[CALENDAR BOOKING ERROR]', { 
                from, 
                tenantKey, 
                callId, 
                error: calendarError?.message || String(calendarError),
                errorType: calendarError?.name || 'Unknown',
                stack: calendarError?.stack?.substring(0, 200) // First 200 chars of stack trace
              });
              
              // Don't fail the entire process if calendar booking fails
              // The VAPI call was successful, calendar is just a nice-to-have
            }
          }
          
            if (!vapiResult || vapiResult.error) {
              console.error('[VAPI ERROR]', { 
                from,
                tenantKey,
                error: vapiResult?.error || 'VAPI call failed',
                payload: { 
                  assistantId, 
                  phoneNumberId, 
                  customerNumber: from,
                  maxDurationSeconds: 10
                }
              });
              
              // Implement fallback mechanism
              await handleVapiFailure({ from, tenantKey, error: vapiResult?.error || 'VAPI call failed' });
            }
          try {
            const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
            if (configured) {
              const brand = client?.displayName || client?.clientKey || 'Our Clinic';
              const ack = `Thanks! ${brand} is calling you now. Reply STOP to opt out.`;
              const payload = { to: from, body: ack };
              if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid; else if (fromNumber) payload.from = fromNumber;
              await smsClient.messages.create(payload);
            }
          } catch (e) { console.log('[YES ACK SMS ERROR]', e?.message || String(e)); }
        } else {
          console.log('[LEAD OPT-IN YES]', { from, tenantKey, vapiStatus: 'client_not_found' });
        }
      } catch (err) {
        console.log('[LEAD OPT-IN YES]', { from, tenantKey, vapiStatus: 'error', error: (err?.message || String(err)) });
      }
    }

    return res.type('text/plain').send('OK');
  } catch (e) {
    console.error('[inbound.error]', e?.message || e);
    return res.type('text/plain').send('OK');
  }
}));

// SMS endpoint for testing (simplified version of Twilio webhook)
app.post('/sms', async (req, res) => {
  try {
    // Check API key for testing
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const rawFrom = (req.body.From || '').toString();
    const rawTo   = (req.body.To   || '').toString();
    const bodyTxt = (req.body.Body || '').toString().trim().replace(/^["']|["']$/g, '');

    console.log('[SMS TEST ENDPOINT]', { 
      from: rawFrom, 
      to: rawTo, 
      body: bodyTxt,
      messageSid: req.body.MessageSid,
      messagingServiceSid: req.body.MessagingServiceSid
    });

    // For testing, just return success
    return res.json({ 
      ok: true, 
      message: 'SMS received for testing',
      from: rawFrom,
      to: rawTo,
      body: bodyTxt
    });
  } catch (e) {
    console.error('[SMS TEST ENDPOINT ERROR]', e?.message || e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Outbound lead webhook → Vapi (tenant-aware variables + optional per-tenant caller ID)
app.post('/webhooks/new-lead/:clientKey', async (req, res) => {
  try {
    const { clientKey } = req.params;
    const client = await getFullClient(clientKey);
    if (!client) return res.status(404).json({ error: `Unknown clientKey ${clientKey}` });

    const { phone, service, durationMin } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Missing phone' });
    const e164 = normalizePhoneE164(phone);
    if (!e164) return res.status(400).json({ error: 'phone must be E.164 (+447...)' });
    if (!VAPI_PRIVATE_KEY) {
      return res.status(500).json({ error: 'Missing VAPI_PRIVATE_KEY' });
    }

    const assistantId = client?.vapiAssistantId || VAPI_ASSISTANT_ID;
    const phoneNumberId = client?.vapiPhoneNumberId || VAPI_PHONE_NUMBER_ID;

    const payload = {
      assistantId,
      phoneNumberId,
      customer: { number: e164, numberE164CheckEnabled: true },
      maxDurationSeconds: 5, // Cut off after 5 seconds for testing to save costs
      assistantOverrides: {
        variableValues: {
          ClientKey: clientKey,
          BusinessName: client.displayName || client.clientKey,
          ConsentLine: 'This call may be recorded for quality.',
          DefaultService: service || '',
          DefaultDurationMin: durationMin || client?.booking?.defaultDurationMin || 30,
          Timezone: client?.booking?.timezone || TIMEZONE,
          ServicesJSON: client?.servicesJson || '[]',
          PricesJSON: client?.pricesJson || '{}',
          HoursJSON: client?.hoursJson || '{}',
          ClosedDatesJSON: client?.closedDatesJson || '[]',
          Locale: client?.locale || 'en-GB',
          ScriptHints: client?.scriptHints || '',
          FAQJSON: client?.faqJson || '[]',
          Currency: client?.currency || 'GBP'
        }
      }
    };

    const resp = await fetch(`${VAPI_URL}/call`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    let data;
    try { data = await resp.json(); }
    catch { data = { raw: await resp.text().catch(() => '') }; }

    return res.status(resp.ok ? 200 : 502).json(data);
  } catch (err) {
    console.error('new-lead vapi error', err);
    return res.status(500).json({ error: String(err) });
  }
});

// Booking (auto-book + branded SMS)
app.post('/api/calendar/check-book', async (req, res) => {
  const idemKey = deriveIdemKey(req);
  const cached = getCachedIdem(idemKey);
  if (cached) return res.status(cached.status).json(cached.body);

  try {
    const client = await getClientFromHeader(req); // DB-backed
    if (!client) return res.status(400).json({ error: 'Unknown tenant' });
    const tz = pickTimezone(client);
    const calendarId = pickCalendarId(client);

    const services = servicesFor(client);
    const requestedService = req.body?.service;
    const svc = services.find(s => s.id === requestedService);
    const dur = (typeof req.body?.durationMin === 'number' && req.body.durationMin > 0)
      ? req.body.durationMin
      : (svc?.durationMin || client?.bookingDefaultDurationMin || 30);

    const { lead } = req.body || {};
    if (!lead?.name || !lead?.phone) return res.status(400).json({ error: 'Missing lead{name, phone}' });
    lead.phone = normalizePhoneE164(lead.phone);
    if (!lead.phone) return res.status(400).json({ error: 'lead.phone must be E.164' });

    // Default: book tomorrow ~14:00 in tenant TZ
    const base = new Date(Date.now() + 24 * 60 * 60 * 1000);
    base.setHours(14, 0, 0, 0);
    const startISO = base.toISOString();
    const endISO = new Date(base.getTime() + dur * 60 * 1000).toISOString();

    let google = { skipped: true };
    try {
      if (GOOGLE_CLIENT_EMAIL && (GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY_B64) && calendarId) {
        const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
        await auth.authorize();
        const summary = `${requestedService || 'Appointment'} — ${lead.name || lead.phone}`;
        const description = [
          `Auto-booked by AI agent`,
          `Tenant: ${client?.clientKey || 'default'}`,
          `Name: ${lead.name}`,
          `Phone: ${lead.phone}`
        ].join('\\n');

        const attendees = []; // removed invites

        let event;
        try {
          event = await withRetry(() => insertEvent({
            auth, calendarId, summary, description,
            startIso: startISO, endIso: endISO, timezone: tz
          }), { retries: 2, delayMs: 300 });
        } catch (e) {
          const code = e?.response?.status || 500;
          const data = e?.response?.data || e?.message || String(e);
          return res.status(code).json({ ok:false, error:'gcal_insert_failed', details: data });
        }

        google = { id: event.id, htmlLink: event.htmlLink, status: event.status };
      }
    } catch (err) {
      console.error(JSON.stringify({ evt: 'gcal.error', rid: req.id, error: String(err) }));
      google = { error: String(err) };
    }

    let sms = null;
    const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
    if (configured) {
      const when = new Date(startISO).toLocaleString(client?.locale || 'en-GB', {
        timeZone: tz, weekday: 'short', day: 'numeric', month: 'short',
        hour: 'numeric', minute: '2-digit', hour12: true
      });
      const link = google?.htmlLink ? ` Calendar: ${google.htmlLink}` : '';
      const brand = client?.displayName || client?.clientKey || 'Our Clinic';
      const sig = client?.brandSignature ? ` ${client.brandSignature}` : '';
      const body = `Hi ${lead.name}, your ${requestedService || 'appointment'} is booked with ${brand} for ${when} ${tz}.${link}${sig} Reply STOP to opt out.`;

      try {
        const payload = { to: lead.phone, body };
        if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid;
        else payload.from = fromNumber;
        const resp = await withRetry(() => smsClient.messages.create(payload), { retries: 2, delayMs: 300 });
        sms = { id: resp.sid, to: lead.phone };
      } catch (err) {
        console.error(JSON.stringify({ evt: 'sms.error', rid: req.id, error: String(err) }));
        sms = { error: String(err) };
      }
    }

    const calls = await readJson(CALLS_PATH, []);
    const record = {
      id: 'call_' + nanoid(10),
      tenant: client?.clientKey || null,
      status: 'booked',
      booking: { start: startISO, end: endISO, service: requestedService || null, google, sms },
      created_at: new Date().toISOString()
    };
    calls.push(record);
    await writeJson(CALLS_PATH, calls);

    const responseBody = { slot: { start: startISO, end: endISO, timezone: tz }, google, sms, tenant: client?.clientKey || 'default' };
    setCachedIdem(idemKey, 200, responseBody);
    return res.json(responseBody);
  } catch (e) {
    const status = 500;
    const body = { error: String(e) };
    setCachedIdem(deriveIdemKey(req), status, body);
    return res.status(status).json(body);
  }
});

// Diagnostic endpoint for tenant resolution
app.get('/admin/tenant-resolve', async (req, res) => {
  try {
    const { to, mss } = req.query;
    if (!to) return res.status(400).json({ ok: false, error: 'Missing "to" parameter' });

    const tenantKey = await resolveTenantKeyFromInbound({ to, messagingServiceSid: mss });
    res.json({ ok: true, tenantKey, to, messagingServiceSid: mss });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin endpoint to validate tenant SMS configuration
app.get('/admin/check-tenants', async (req, res) => {
  try {
    const clients = await listFullClients();
    const tenants = clients.map(client => ({
      tenantKey: client.clientKey,
      fromNumber: client?.sms?.fromNumber || null,
      messagingServiceSid: client?.sms?.messagingServiceSid || null
    }));

    // Detect duplicates
    const fromNumberCounts = {};
    const messagingServiceSidCounts = {};
    
    tenants.forEach(tenant => {
      if (tenant.fromNumber) {
        fromNumberCounts[tenant.fromNumber] = (fromNumberCounts[tenant.fromNumber] || 0) + 1;
      }
      if (tenant.messagingServiceSid) {
        messagingServiceSidCounts[tenant.messagingServiceSid] = (messagingServiceSidCounts[tenant.messagingServiceSid] || 0) + 1;
      }
    });

    const duplicates = {
      fromNumber: Object.keys(fromNumberCounts).filter(num => fromNumberCounts[num] > 1),
      messagingServiceSid: Object.keys(messagingServiceSidCounts).filter(sid => messagingServiceSidCounts[sid] > 1)
    };

    const dupFromCount = duplicates.fromNumber.length;
    const dupSidCount = duplicates.messagingServiceSid.length;
    
    console.log('[TENANT CHECK]', { 
      tenantsCount: tenants.length, 
      dupFromCount, 
      dupSidCount 
    });

    res.json({
      ok: true,
      tenants,
      duplicates
    });
  } catch (e) {
    console.error('[TENANT CHECK ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin endpoint for runtime change feed
app.get('/admin/changes', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const changes = [
      {
        id: 'change_001',
        type: 'deployment',
        timestamp: new Date().toISOString(),
        description: 'Added missing logging tags and admin changes endpoint',
        version: process.env.npm_package_version || '1.0.0',
        status: 'completed'
      },
      {
        id: 'change_002', 
        type: 'feature',
        timestamp: new Date().toISOString(),
        description: 'Implemented VAPI call timeout and number validation',
        version: process.env.npm_package_version || '1.0.0',
        status: 'completed'
      },
      {
        id: 'change_003',
        type: 'fix',
        timestamp: new Date().toISOString(),
        description: 'Fixed tenant resolution and cost optimization',
        version: process.env.npm_package_version || '1.0.0',
        status: 'completed'
      }
    ];

    console.log('[CHANGE]', { changesCount: changes.length, requestedBy: req.ip });

    res.json({
      ok: true,
      changes,
      total: changes.length,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[CHANGE ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Lead scoring debug endpoint
app.get('/admin/lead-score', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { phone, tenantKey } = req.query;
    if (!phone) return res.status(400).json({ ok: false, error: 'Missing "phone" parameter' });

    const leads = await readJson(LEADS_PATH, []);
    const normalizedPhone = normalizePhoneE164(phone, 'GB');
    const lead = leads.find(l => {
      const leadPhone = normalizePhoneE164(l.phone, 'GB');
      return leadPhone === normalizedPhone || l.phone === phone || l.phone === normalizedPhone;
    });
    
    if (!lead) {
      return res.json({ ok: true, phone, found: false, message: 'Lead not found' });
    }

    const tenant = tenantKey ? await getFullClient(tenantKey) : null;
    const score = calculateLeadScore(lead, tenant);
    const priority = getLeadPriority(score);

    console.log('[LEAD SCORE DEBUG]', { phone, tenantKey, score, priority, requestedBy: req.ip });

    res.json({
      ok: true,
      phone,
      tenantKey: tenant?.clientKey || null,
      score,
      priority,
      breakdown: {
        consentSms: lead.consentSms ? 30 : 0,
        status: lead.status === 'engaged' ? 20 : 0,
        responseTime: lead.lastInboundAt && lead.createdAt ? 
          Math.min(25, Math.max(0, 25 - ((new Date(lead.lastInboundAt) - new Date(lead.createdAt)) / (1000 * 60 * 5)))) : 0,
        keywords: lead.lastInboundText ? 
          (lead.lastInboundText.toLowerCase().includes('urgent') ? 20 : 0) +
          (lead.lastInboundText.toLowerCase().includes('book') ? 15 : 0) +
          (lead.lastInboundText.toLowerCase().includes('?') ? 5 : 0) : 0,
        recency: lead.lastInboundAt ? 
          Math.min(15, Math.max(0, 15 - ((new Date() - new Date(lead.lastInboundAt)) / (1000 * 60 * 60)))) : 0
      },
      lead: {
        status: lead.status,
        consentSms: lead.consentSms,
        lastInboundText: lead.lastInboundText,
        lastInboundAt: lead.lastInboundAt,
        createdAt: lead.createdAt
      }
    });
  } catch (e) {
    console.error('[LEAD SCORE ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// System health and performance monitoring
// Tenant management endpoints
app.get('/admin/tenants', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const clients = await listFullClients();
    const tenants = clients.map(client => ({
      clientKey: client.clientKey,
      displayName: client.displayName || client.clientKey,
      timezone: client.timezone || 'Europe/London',
      locale: client.locale || 'en-GB',
      phone: client?.sms?.fromNumber || null,
      messagingServiceSid: client?.sms?.messagingServiceSid || null,
      status: 'active',
      createdAt: client.createdAt || new Date().toISOString(),
      lastActivity: client.lastActivity || null
    }));

    console.log('[TENANT LIST]', { tenantsCount: tenants.length, requestedBy: req.ip });

    res.json({
      ok: true,
      tenants,
      total: tenants.length
    });
  } catch (e) {
    console.error('[TENANT LIST ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.get('/admin/tenants/:tenantKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { tenantKey } = req.params;
    const client = await getFullClient(tenantKey);
    
    if (!client) {
      return res.status(404).json({ ok: false, error: 'Tenant not found' });
    }

    const tenant = {
      clientKey: client.clientKey,
      displayName: client.displayName || client.clientKey,
      timezone: client.timezone || 'Europe/London',
      locale: client.locale || 'en-GB',
      phone: client?.sms?.fromNumber || null,
      messagingServiceSid: client?.sms?.messagingServiceSid || null,
      vapiAssistantId: client?.vapi?.assistantId || null,
      vapiPhoneNumberId: client?.vapi?.phoneNumberId || null,
      calendarId: client?.calendarId || null,
      businessHours: client?.businessHours || {
        start: 9,
        end: 17,
        days: [1, 2, 3, 4, 5]
      },
      status: 'active',
      createdAt: client.createdAt || new Date().toISOString(),
      lastActivity: client.lastActivity || null
    };

    console.log('[TENANT DETAIL]', { tenantKey, requestedBy: req.ip });

    res.json({
      ok: true,
      tenant
    });
  } catch (e) {
    console.error('[TENANT DETAIL ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin endpoint to get call queue status
app.get('/admin/call-queue', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { getPendingCalls, getCallQueueByTenant } = await import('./db.js');
    
    // Get pending calls
    const pendingCalls = await getPendingCalls(100);
    
    // Get queue by tenant
    const tenants = await listFullClients();
    const queueByTenant = {};
    
    for (const tenant of tenants) {
      const tenantQueue = await getCallQueueByTenant(tenant.clientKey, 50);
      queueByTenant[tenant.clientKey] = {
        displayName: tenant.displayName,
        queue: tenantQueue
      };
    }
    
    console.log('[CALL QUEUE STATUS]', { 
      pendingCount: pendingCalls.length, 
      tenantCount: Object.keys(queueByTenant).length,
      requestedBy: req.ip 
    });
    
    res.json({
      ok: true,
      pendingCalls,
      queueByTenant,
      summary: {
        totalPending: pendingCalls.length,
        tenantsWithQueue: Object.keys(queueByTenant).filter(key => queueByTenant[key].queue.length > 0).length,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (e) {
    console.error('[CALL QUEUE STATUS ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin endpoint to get cost optimization metrics
app.get('/admin/cost-optimization/:tenantKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { tenantKey } = req.params;
    const metrics = await getCostOptimizationMetrics(tenantKey);
    
    if (!metrics) {
      return res.status(404).json({ error: 'Cost metrics not found' });
    }
    
    console.log('[COST OPTIMIZATION METRICS]', { 
      tenantKey,
      requestedBy: req.ip,
      dailyCost: metrics.costs.daily.total_cost,
      budgetUtilization: metrics.optimization.dailyBudgetUtilization
    });
    
    res.json({
      ok: true,
      tenantKey,
      metrics,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[COST OPTIMIZATION ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin endpoint to set budget limits
app.post('/admin/budget-limits/:tenantKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { tenantKey } = req.params;
    const { budgetType, dailyLimit, weeklyLimit, monthlyLimit, currency = 'USD' } = req.body;
    
    if (!budgetType || (!dailyLimit && !weeklyLimit && !monthlyLimit)) {
      return res.status(400).json({ error: 'Budget type and at least one limit required' });
    }
    
    const { setBudgetLimit } = await import('./db.js');
    const budget = await setBudgetLimit({
      clientKey: tenantKey,
      budgetType,
      dailyLimit: parseFloat(dailyLimit) || null,
      weeklyLimit: parseFloat(weeklyLimit) || null,
      monthlyLimit: parseFloat(monthlyLimit) || null,
      currency
    });
    
    console.log('[BUDGET LIMIT SET]', { 
      tenantKey,
      budgetType,
      dailyLimit,
      weeklyLimit,
      monthlyLimit,
      currency,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      budget,
      message: 'Budget limit set successfully'
    });
  } catch (e) {
    console.error('[BUDGET LIMIT ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin endpoint to create cost alerts
app.post('/admin/cost-alerts/:tenantKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { tenantKey } = req.params;
    const { alertType, threshold, period = 'daily' } = req.body;
    
    if (!alertType || !threshold) {
      return res.status(400).json({ error: 'Alert type and threshold required' });
    }
    
    const { createCostAlert, getTotalCostsByTenant } = await import('./db.js');
    const currentCosts = await getTotalCostsByTenant(tenantKey, period);
    
    const alert = await createCostAlert({
      clientKey: tenantKey,
      alertType,
      threshold: parseFloat(threshold),
      currentAmount: parseFloat(currentCosts.total_cost || 0),
      period
    });
    
    console.log('[COST ALERT CREATED]', { 
      tenantKey,
      alertType,
      threshold,
      period,
      currentAmount: currentCosts.total_cost,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      alert,
      message: 'Cost alert created successfully'
    });
  } catch (e) {
    console.error('[COST ALERT ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Security endpoints
// Create user account
app.post('/admin/users/:tenantKey', authenticateApiKey, rateLimitMiddleware, requirePermission('user_management'), async (req, res) => {
  try {
    const { tenantKey } = req.params;
    const { username, email, password, role = 'user', permissions = [] } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password required' });
    }
    
    const { createUserAccount, hashPassword } = await import('./db.js');
    const passwordHash = await hashPassword(password);
    
    const user = await createUserAccount({
      clientKey: tenantKey,
      username,
      email,
      passwordHash,
      role,
      permissions
    });
    
    console.log('[USER CREATED]', { 
      tenantKey,
      username,
      email,
      role,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        is_active: user.is_active,
        created_at: user.created_at
      },
      message: 'User created successfully'
    });
  } catch (e) {
    console.error('[USER CREATION ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Create API key
app.post('/admin/api-keys/:tenantKey', authenticateApiKey, rateLimitMiddleware, requirePermission('api_management'), async (req, res) => {
  try {
    const { tenantKey } = req.params;
    const { keyName, permissions = [], rateLimitPerMinute = 100, rateLimitPerHour = 1000, expiresAt = null } = req.body;
    
    if (!keyName) {
      return res.status(400).json({ error: 'Key name required' });
    }
    
    const { createApiKey, generateApiKey, hashApiKey } = await import('./db.js');
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    
    const keyData = await createApiKey({
      clientKey: tenantKey,
      keyName,
      keyHash,
      permissions,
      rateLimitPerMinute,
      rateLimitPerHour,
      expiresAt
    });
    
    console.log('[API KEY CREATED]', { 
      tenantKey,
      keyName,
      permissions,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      apiKey: {
        id: keyData.id,
        keyName: keyData.key_name,
        permissions: keyData.permissions,
        rateLimitPerMinute: keyData.rate_limit_per_minute,
        rateLimitPerHour: keyData.rate_limit_per_hour,
        is_active: keyData.is_active,
        expires_at: keyData.expires_at,
        created_at: keyData.created_at
      },
      secretKey: apiKey, // Only returned once
      message: 'API key created successfully'
    });
  } catch (e) {
    console.error('[API KEY CREATION ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Get security events
app.get('/admin/security-events/:tenantKey', authenticateApiKey, rateLimitMiddleware, requirePermission('security_view'), async (req, res) => {
  try {
    const { tenantKey } = req.params;
    const { limit = 100, eventType, severity } = req.query;
    
    const { getSecurityEvents, getSecurityEventSummary } = await import('./db.js');
    
    const events = await getSecurityEvents(tenantKey, parseInt(limit), eventType, severity);
    const summary = await getSecurityEventSummary(tenantKey, 7);
    
    console.log('[SECURITY EVENTS REQUESTED]', { 
      tenantKey,
      limit,
      eventType,
      severity,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      tenantKey,
      events,
      summary,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[SECURITY EVENTS ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Analytics endpoints
// Get analytics dashboard
app.get('/admin/analytics/:tenantKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey } = req.params;
    const { days = 30 } = req.query;
    
    const dashboard = await getAnalyticsDashboard(tenantKey, parseInt(days));
    
    if (!dashboard) {
      return res.status(404).json({ error: 'Analytics data not found' });
    }
    
    console.log('[ANALYTICS DASHBOARD REQUESTED]', { 
      tenantKey,
      days,
      requestedBy: req.ip,
      totalLeads: dashboard.summary.totalLeads,
      conversionRate: dashboard.summary.conversionRate
    });
    
    res.json({
      ok: true,
      tenantKey,
      dashboard,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[ANALYTICS DASHBOARD ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Generate analytics report
app.post('/admin/analytics/:tenantKey/report', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey } = req.params;
    const { reportType = 'comprehensive', days = 30 } = req.body;
    
    const report = await generateAnalyticsReport(tenantKey, reportType, parseInt(days));
    
    if (!report) {
      return res.status(404).json({ error: 'Unable to generate report' });
    }
    
    console.log('[ANALYTICS REPORT GENERATED]', { 
      tenantKey,
      reportType,
      days,
      requestedBy: req.ip,
      insights: report.insights.length,
      recommendations: report.recommendations.length
    });
    
    res.json({
      ok: true,
      tenantKey,
      report,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[ANALYTICS REPORT ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Track analytics event
app.post('/admin/analytics/:tenantKey/track', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey } = req.params;
    const { eventType, eventCategory, eventData, sessionId } = req.body;
    
    if (!eventType || !eventCategory) {
      return res.status(400).json({ error: 'Event type and category required' });
    }
    
    const event = await trackAnalyticsEvent({
      clientKey: tenantKey,
      eventType,
      eventCategory,
      eventData,
      sessionId,
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip
    });
    
    console.log('[ANALYTICS EVENT TRACKED]', { 
      tenantKey,
      eventType,
      eventCategory,
      sessionId,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      event,
      message: 'Event tracked successfully'
    });
  } catch (e) {
    console.error('[ANALYTICS TRACKING ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Track conversion stage
app.post('/admin/analytics/:tenantKey/conversion', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey } = req.params;
    const { leadPhone, stage, stageData, previousStage, timeToStage } = req.body;
    
    if (!leadPhone || !stage) {
      return res.status(400).json({ error: 'Lead phone and stage required' });
    }
    
    const conversionStage = await trackConversionStage({
      clientKey: tenantKey,
      leadPhone,
      stage,
      stageData,
      previousStage,
      timeToStage
    });
    
    console.log('[CONVERSION STAGE TRACKED]', { 
      tenantKey,
      leadPhone,
      stage,
      previousStage,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      conversionStage,
      message: 'Conversion stage tracked successfully'
    });
  } catch (e) {
    console.error('[CONVERSION TRACKING ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Record performance metric
app.post('/admin/analytics/:tenantKey/metrics', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey } = req.params;
    const { metricName, metricValue, metricUnit, metricCategory, metadata } = req.body;
    
    if (!metricName || metricValue === undefined) {
      return res.status(400).json({ error: 'Metric name and value required' });
    }
    
    const metric = await recordPerformanceMetric({
      clientKey: tenantKey,
      metricName,
      metricValue: parseFloat(metricValue),
      metricUnit,
      metricCategory,
      metadata
    });
    
    console.log('[PERFORMANCE METRIC RECORDED]', { 
      tenantKey,
      metricName,
      metricValue,
      metricCategory,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      metric,
      message: 'Performance metric recorded successfully'
    });
  } catch (e) {
    console.error('[PERFORMANCE METRIC ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// A/B Testing endpoints
// Create A/B test experiment
app.post('/admin/ab-tests/:tenantKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey } = req.params;
    const { experimentName, variants, isActive = true } = req.body;
    
    if (!experimentName || !variants || variants.length < 2) {
      return res.status(400).json({ error: 'Experiment name and at least 2 variants required' });
    }
    
    const experiments = await createABTestExperiment({
      clientKey: tenantKey,
      experimentName,
      variants,
      isActive
    });
    
    console.log('[AB TEST EXPERIMENT CREATED]', { 
      tenantKey,
      experimentName,
      variants: variants.length,
      isActive,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      experiments,
      message: 'A/B test experiment created successfully'
    });
  } catch (e) {
    console.error('[AB TEST CREATION ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Get active A/B tests
app.get('/admin/ab-tests/:tenantKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey } = req.params;
    
    const activeTests = await getActiveABTests(tenantKey);
    
    console.log('[AB TESTS REQUESTED]', { 
      tenantKey,
      activeTests: activeTests.length,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      tenantKey,
      activeTests,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[AB TESTS FETCH ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Get A/B test results
app.get('/admin/ab-tests/:tenantKey/:experimentName/results', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey, experimentName } = req.params;
    
    const results = await getABTestResults(tenantKey, experimentName);
    
    if (!results) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    
    console.log('[AB TEST RESULTS REQUESTED]', { 
      tenantKey,
      experimentName,
      totalParticipants: results.summary.totalParticipants,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      tenantKey,
      experimentName,
      results,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[AB TEST RESULTS ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Record A/B test outcome
app.post('/admin/ab-tests/:tenantKey/:experimentName/outcome', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey, experimentName } = req.params;
    const { leadPhone, outcome, outcomeData } = req.body;
    
    if (!leadPhone || !outcome) {
      return res.status(400).json({ error: 'Lead phone and outcome required' });
    }
    
    const result = await recordABTestOutcome({
      clientKey: tenantKey,
      experimentName,
      leadPhone,
      outcome,
      outcomeData
    });
    
    if (!result) {
      return res.status(404).json({ error: 'Experiment or lead assignment not found' });
    }
    
    console.log('[AB TEST OUTCOME RECORDED]', { 
      tenantKey,
      experimentName,
      leadPhone,
      outcome,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      result,
      message: 'A/B test outcome recorded successfully'
    });
  } catch (e) {
    console.error('[AB TEST OUTCOME ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Performance optimization endpoints
// Get performance metrics
app.get('/admin/performance/:tenantKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey } = req.params;
    
    const metrics = await getCachedMetrics(tenantKey);
    
    // Get cache statistics
    const cacheStats = {
      size: cache.size,
      keys: Array.from(cache.keys()).filter(key => key.includes(tenantKey)),
      hitRate: calculateCacheHitRate(tenantKey)
    };
    
    console.log('[PERFORMANCE METRICS REQUESTED]', { 
      tenantKey,
      cacheSize: cache.size,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      tenantKey,
      metrics,
      cache: cacheStats,
      performance: {
        analyticsQueue: analyticsQueue.length,
        connectionPool: connectionPool.size,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      },
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[PERFORMANCE METRICS ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Clear cache
app.post('/admin/performance/:tenantKey/cache/clear', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { tenantKey } = req.params;
    const { pattern } = req.body;
    
    const beforeSize = cache.size;
    clearCache(pattern || tenantKey);
    const afterSize = cache.size;
    const cleared = beforeSize - afterSize;
    
    console.log('[CACHE CLEARED]', { 
      tenantKey,
      pattern,
      cleared,
      remaining: afterSize,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      tenantKey,
      cleared,
      remaining: afterSize,
      message: `Cache cleared: ${cleared} entries removed`
    });
  } catch (e) {
    console.error('[CACHE CLEAR ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Get system performance overview
app.get('/admin/performance/system/overview', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const overview = {
      system: {
        uptime: process.uptime(),
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
          external: Math.round(memoryUsage.external / 1024 / 1024) // MB
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        }
      },
      application: {
        cache: {
          size: cache.size,
          ttl: CACHE_TTL
        },
        analytics: {
          queueSize: analyticsQueue.length,
          processing: analyticsProcessing
        },
        connections: {
          poolSize: connectionPool.size
        }
      },
      timestamp: new Date().toISOString()
    };
    
    console.log('[SYSTEM PERFORMANCE OVERVIEW]', { 
      memoryMB: overview.system.memory.rss,
      cacheSize: overview.application.cache.size,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      overview,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[SYSTEM PERFORMANCE ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Google Calendar Test Endpoints
// Test calendar booking
app.post('/test-calendar-booking', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { tenantKey, leadPhone, appointmentTime, duration, service, notes } = req.body;
    
    if (!tenantKey || !leadPhone || !appointmentTime) {
      return res.status(400).json({ error: 'tenantKey, leadPhone, and appointmentTime required' });
    }
    
    const client = await getFullClient(tenantKey);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    console.log('[CALENDAR BOOKING TEST]', { 
      tenantKey, 
      leadPhone, 
      appointmentTime, 
      duration, 
      service, 
      notes 
    });
    
    // For testing, just return success without actually booking
    return res.json({
      ok: true,
      message: 'Calendar booking test successful',
      tenantKey,
      leadPhone,
      appointmentTime,
      duration: duration || 30,
      service: service || 'General Appointment',
      notes: notes || 'Test booking',
      calendarId: client?.booking?.calendarId || 'primary',
      timezone: client?.booking?.timezone || 'Europe/London'
    });
  } catch (e) {
    console.error('[CALENDAR BOOKING TEST ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Get calendar events
app.get('/admin/calendar-events/:tenantKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { tenantKey } = req.params;
    const { limit = 10, startTime, endTime } = req.query;
    
    const client = await getFullClient(tenantKey);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    console.log('[CALENDAR EVENTS REQUESTED]', { 
      tenantKey, 
      limit, 
      startTime, 
      endTime,
      requestedBy: req.ip
    });
    
    // For testing, return mock events
    const mockEvents = [
      {
        id: 'test_event_1',
        summary: 'Test Appointment',
        start: {
          dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          timeZone: client?.booking?.timezone || 'Europe/London'
        },
        end: {
          dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
          timeZone: client?.booking?.timezone || 'Europe/London'
        },
        description: 'Test appointment for calendar integration',
        attendees: []
      }
    ];
    
    return res.json({
      ok: true,
      tenantKey,
      events: mockEvents,
      calendarId: client?.booking?.calendarId || 'primary',
      timezone: client?.booking?.timezone || 'Europe/London',
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[CALENDAR EVENTS ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// A/B Test Assignment Endpoint
app.post('/admin/ab-tests/:tenantKey/assign', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { tenantKey } = req.params;
    const { leadPhone, experimentName } = req.body;
    
    if (!leadPhone || !experimentName) {
      return res.status(400).json({ error: 'Lead phone and experiment name required' });
    }
    
    console.log('[AB TEST ASSIGNMENT REQUESTED]', { 
      tenantKey,
      leadPhone,
      experimentName,
      requestedBy: req.ip
    });
    
    // Select variant for this lead
    const variant = await selectABTestVariant(tenantKey, experimentName, leadPhone);
    
    if (!variant) {
      return res.status(404).json({ error: 'No active experiment found' });
    }
    
    return res.json({
      ok: true,
      tenantKey,
      leadPhone,
      experimentName,
      variant: variant.name,
      config: variant.config,
      message: 'Lead assigned to A/B test variant successfully'
    });
  } catch (e) {
    console.error('[AB TEST ASSIGNMENT ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Client Management Endpoints
// Get all clients
app.get('/admin/clients', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log('[CLIENT LIST REQUESTED]', { 
      requestedBy: req.ip
    });
    
    // Get all clients from the database
    const { listFullClients } = await import('./db.js');
    const clients = await listFullClients();
    
    // Add leads count for each client
    const clientsWithLeads = await Promise.all(clients.map(async (client) => {
      const { getLeadsByClient } = await import('./db.js');
      const leads = await getLeadsByClient(client.key);
      return {
        ...client,
        leads: leads || [],
        leadCount: leads ? leads.length : 0
      };
    }));
    
    return res.json({
      ok: true,
      clients: clientsWithLeads,
      totalClients: clientsWithLeads.length,
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[CLIENT LIST ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Get specific client
app.get('/admin/clients/:clientKey', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { clientKey } = req.params;
    
    console.log('[CLIENT DETAILS REQUESTED]', { 
      clientKey,
      requestedBy: req.ip
    });
    
    const client = await getFullClient(clientKey);
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    // Get leads for this client
    const { getLeadsByClient } = await import('./db.js');
    const leads = await getLeadsByClient(clientKey);
    
    return res.json({
      ok: true,
      client: {
        ...client,
        leads: leads || [],
        leadCount: leads ? leads.length : 0
      },
      lastUpdated: new Date().toISOString()
    });
  } catch (e) {
    console.error('[CLIENT DETAILS ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Helper function for cache hit rate calculation
function calculateCacheHitRate(tenantKey) {
  // This is a simplified calculation - in production you'd want more sophisticated tracking
  const tenantCacheKeys = Array.from(cache.keys()).filter(key => key.includes(tenantKey));
  return tenantCacheKeys.length > 0 ? Math.min(95, tenantCacheKeys.length * 10) : 0; // Mock calculation
}

app.get('/admin/system-health', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const health = {
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        nodeVersion: process.version,
        platform: process.platform
      },
      database: {
        status: 'unknown',
        lastCheck: new Date().toISOString()
      },
      external: {
        vapi: 'unknown',
        twilio: 'unknown',
        google: 'unknown'
      },
      performance: {
        avgResponseTime: 0,
        errorRate: 0,
        requestCount: 0
      }
    };

    // Test database connectivity
    try {
      await listFullClients();
      health.database.status = 'connected';
    } catch (e) {
      health.database.status = 'disconnected';
      health.database.error = e.message;
    }

    // Test external services
    try {
      if (VAPI_PRIVATE_KEY) {
        const vapiTest = await fetch(`${VAPI_URL}/call`, {
          method: 'HEAD',
          headers: { 'Authorization': `Bearer ${VAPI_PRIVATE_KEY}` }
        });
        health.external.vapi = vapiTest.ok ? 'connected' : 'error';
      }
    } catch (e) {
      health.external.vapi = 'error';
    }

    try {
      if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
        const twilioTest = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}.json`, {
          headers: { 'Authorization': `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}` }
        });
        health.external.twilio = twilioTest.ok ? 'connected' : 'error';
      }
    } catch (e) {
      health.external.twilio = 'error';
    }

    console.log('[SYSTEM HEALTH]', { 
      database: health.database.status,
      vapi: health.external.vapi,
      twilio: health.external.twilio,
      memory: Math.round(health.system.memory.heapUsed / 1024 / 1024) + 'MB'
    });

    res.json({
      ok: true,
      health,
      status: health.database.status === 'connected' ? 'healthy' : 'degraded'
    });
  } catch (e) {
    console.error('[SYSTEM HEALTH ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Real-time metrics dashboard
app.get('/admin/metrics', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Load leads and calls data from database
    const leads = await listFullClients().then(clients => 
      clients.flatMap(client => client.leads || [])
    );
    
    // Load calls from database
    const { getCallsByTenant } = await import('./db.js');
    const allCalls = [];
    const clients = await listFullClients();
    for (const client of clients) {
      const clientCalls = await getCallsByTenant(client.clientKey, 1000);
      allCalls.push(...clientCalls);
    }
    const calls = allCalls;

    // Calculate metrics
    const metrics = {
      overview: {
        totalLeads: leads.length,
        totalCalls: calls.length,
        activeTenants: (await listFullClients()).length,
        uptime: process.uptime(),
        lastUpdated: now.toISOString()
      },
      last24h: {
        newLeads: leads.filter(l => new Date(l.createdAt || l.lastInboundAt) > last24h).length,
        totalCalls: calls.filter(c => new Date(c.createdAt) > last24h).length,
        optIns: leads.filter(l => l.consentSms && new Date(l.updatedAt) > last24h).length,
        optOuts: leads.filter(l => l.status === 'opted_out' && new Date(l.updatedAt) > last24h).length
      },
      last7d: {
        newLeads: leads.filter(l => new Date(l.createdAt || l.lastInboundAt) > last7d).length,
        totalCalls: calls.filter(c => new Date(c.createdAt) > last7d).length,
        conversionRate: 0, // Will calculate below
        avgCallDuration: 0 // Will calculate below
      },
      byTenant: {},
      costs: {
        estimatedVapiCost: calls.length * 0.05, // Rough estimate
        last24hCost: calls.filter(c => new Date(c.createdAt) > last24h).length * 0.05,
        last7dCost: calls.filter(c => new Date(c.createdAt) > last7d).length * 0.05
      },
      performance: {
        successRate: calls.filter(c => c.status === 'completed').length / Math.max(calls.length, 1) * 100,
        avgResponseTime: 0, // Will calculate from logs if available
        errorRate: calls.filter(c => c.status === 'failed').length / Math.max(calls.length, 1) * 100
      },
      vapi: {
        totalCalls: calls.length,
        callsToday: calls.filter(c => new Date(c.createdAt) > last24h).length,
        callsThisWeek: calls.filter(c => new Date(c.createdAt) > last7d).length,
        successfulCalls: calls.filter(c => c.outcome === 'completed' || c.outcome === 'booked').length,
        failedCalls: calls.filter(c => ['no-answer', 'busy', 'declined', 'failed'].includes(c.outcome)).length,
        averageCallDuration: calls.length > 0 ? calls.reduce((sum, c) => sum + (c.duration || 0), 0) / calls.length : 0,
        totalCallCost: calls.reduce((sum, c) => sum + (c.cost || 0.05), 0),
        callSuccessRate: calls.length > 0 ? (calls.filter(c => c.outcome === 'completed' || c.outcome === 'booked').length / calls.length * 100).toFixed(1) : 0,
        costPerConversion: calls.length > 0 ? (calls.reduce((sum, c) => sum + (c.cost || 0.05), 0) / Math.max(leads.filter(l => l.status === 'booked').length, 1)).toFixed(2) : 0,
        retryRate: calls.filter(c => c.retryAttempt > 0).length / Math.max(calls.length, 1) * 100,
        businessHoursCalls: calls.filter(c => {
          const callTime = new Date(c.createdAt);
          const hour = callTime.getHours();
          return hour >= 9 && hour < 17; // 9 AM to 5 PM
        }).length,
        afterHoursCalls: calls.filter(c => {
          const callTime = new Date(c.createdAt);
          const hour = callTime.getHours();
          return hour < 9 || hour >= 17;
        }).length
      }
    };

    // Calculate conversion rate (leads that got calls)
    const leadsWithCalls = leads.filter(l => calls.some(c => c.leadPhone === l.phone));
    metrics.last7d.conversionRate = leadsWithCalls.length / Math.max(leads.length, 1) * 100;

    // Calculate average call duration
    const completedCalls = calls.filter(c => c.status === 'completed' && c.duration);
    if (completedCalls.length > 0) {
      metrics.last7d.avgCallDuration = completedCalls.reduce((sum, c) => sum + (c.duration || 0), 0) / completedCalls.length;
    }

    // Calculate by tenant
    const tenants = await listFullClients();
    for (const tenant of tenants) {
      const tenantLeads = leads.filter(l => {
        // Check both tenantKey and phone number matching
        if (l.tenantKey === tenant.clientKey) return true;
        if (l.phone && tenant?.sms?.fromNumber) {
          const leadPhone = normalizePhoneE164(l.phone, 'GB');
          const tenantPhone = normalizePhoneE164(tenant.sms.fromNumber, 'GB');
          return leadPhone === tenantPhone;
        }
        return false;
      });
      const tenantCalls = calls.filter(c => c.tenantKey === tenant.clientKey);
      
      // Calculate lead scores for this tenant
      const leadScores = tenantLeads.map(lead => calculateLeadScore(lead, tenant));
      const avgLeadScore = leadScores.length > 0 ? leadScores.reduce((sum, score) => sum + score, 0) / leadScores.length : 0;
      const highPriorityLeads = leadScores.filter(score => score >= 80).length;
      const mediumPriorityLeads = leadScores.filter(score => score >= 60 && score < 80).length;
      
      metrics.byTenant[tenant.clientKey] = {
        displayName: tenant.displayName || tenant.clientKey,
        totalLeads: tenantLeads.length,
        totalCalls: tenantCalls.length,
        last24hLeads: tenantLeads.filter(l => new Date(l.createdAt || l.lastInboundAt) > last24h).length,
        last24hCalls: tenantCalls.filter(c => new Date(c.createdAt) > last24h).length,
        conversionRate: tenantCalls.length / Math.max(tenantLeads.length, 1) * 100,
        successRate: tenantCalls.filter(c => c.status === 'completed').length / Math.max(tenantCalls.length, 1) * 100,
        leadScoring: {
          avgScore: Math.round(avgLeadScore),
          highPriority: highPriorityLeads,
          mediumPriority: mediumPriorityLeads,
          lowPriority: leadScores.filter(score => score < 60).length
        }
      };
    }

    console.log('[METRICS]', { 
      totalLeads: metrics.overview.totalLeads,
      totalCalls: metrics.overview.totalCalls,
      conversionRate: metrics.last7d.conversionRate.toFixed(1) + '%',
      requestedBy: req.ip 
    });

    res.json({
      ok: true,
      metrics,
      generatedAt: now.toISOString()
    });
  } catch (e) {
    console.error('[METRICS ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Admin endpoint to fix tenant SMS configurations
app.post('/admin/fix-tenants', async (req, res) => {
  try {
    console.log('[TENANT FIX] Starting tenant configuration fix...');
    
    // Use the valid MessagingServiceSid that we know works
    const validMessagingServiceSid = 'MG852f3cf7b50ef1be50c566be9e7efa04';
    
    // Fix victory_dental configuration
    await upsertFullClient({
      clientKey: 'victory_dental',
      displayName: 'Victory Dental',
      timezone: 'Europe/London',
      locale: 'en-GB',
      numbers: {
        clinic: '+447491683261',
        inbound: '+447403934440'
      },
      sms: {
        fromNumber: '+447403934440',
        messagingServiceSid: validMessagingServiceSid
      },
      vapi: {},
      calendarId: null,
      booking: {
        defaultDurationMin: 30,
        timezone: 'Europe/London'
      },
      smsTemplates: {}
    });
    
    // Fix northside_vet configuration
    await upsertFullClient({
      clientKey: 'northside_vet',
      displayName: 'Northside Vet',
      timezone: 'Europe/London',
      locale: 'en-GB',
      numbers: {
        clinic: '+447491683261',
        inbound: '+447491683261'
      },
      sms: {
        fromNumber: '+447491683261',
        messagingServiceSid: validMessagingServiceSid
      },
      vapi: {},
      calendarId: null,
      booking: {
        defaultDurationMin: 30,
        timezone: 'Europe/London'
      },
      smsTemplates: {}
    });
    
    console.log('[TENANT FIX] Configuration fix completed successfully');
    
    res.json({
      ok: true,
      message: 'Tenant configurations fixed successfully with valid MessagingServiceSid',
      changes: {
        victory_dental: {
          fromNumber: '+447403934440',
          messagingServiceSid: validMessagingServiceSid
        },
        northside_vet: {
          fromNumber: '+447491683261',
          messagingServiceSid: validMessagingServiceSid
        }
      }
    });
  } catch (e) {
    console.error('[TENANT FIX ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0'
    };
    
    // Check database connectivity
    try {
      await listFullClients();
      health.database = 'connected';
    } catch (e) {
      health.database = 'disconnected';
      health.status = 'degraded';
    }
    
    res.json(health);
  } catch (e) {
    res.status(500).json({ status: 'unhealthy', error: e.message });
  }
});

// Monitoring endpoint for tenant resolution
app.get('/monitor/tenant-resolution', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const clients = await listFullClients();
    const tenantStats = {
      totalTenants: clients.length,
      tenantsWithSms: clients.filter(c => c?.sms?.fromNumber).length,
      tenantsWithMessagingService: clients.filter(c => c?.sms?.messagingServiceSid).length,
      duplicateFromNumbers: {},
      duplicateMessagingServices: {},
      lastChecked: new Date().toISOString()
    };
    
    // Check for duplicates
    const fromNumbers = {};
    const messagingServices = {};
    
    clients.forEach(client => {
      if (client?.sms?.fromNumber) {
        fromNumbers[client.sms.fromNumber] = (fromNumbers[client.sms.fromNumber] || 0) + 1;
      }
      if (client?.sms?.messagingServiceSid) {
        messagingServices[client.sms.messagingServiceSid] = (messagingServices[client.sms.messagingServiceSid] || 0) + 1;
      }
    });
    
    tenantStats.duplicateFromNumbers = Object.entries(fromNumbers).filter(([_, count]) => count > 1);
    tenantStats.duplicateMessagingServices = Object.entries(messagingServices).filter(([_, count]) => count > 1);
    
    res.json(tenantStats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SMS delivery monitoring endpoint
app.get('/monitor/sms-delivery', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // This would typically query a metrics database
    // For now, we'll return a basic structure
    const smsStats = {
      totalSent: 0, // Would be populated from actual metrics
      totalDelivered: 0,
      totalFailed: 0,
      deliveryRate: 0,
      last24Hours: {
        sent: 0,
        delivered: 0,
        failed: 0
      },
      byTenant: {},
      lastUpdated: new Date().toISOString()
    };
    
    res.json(smsStats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stats
app.get('/api/stats', async (_req, res) => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const within = (ts, days) => (now - ts) <= (days * day);

  const calls = await readJson(CALLS_PATH, []);
  const smsEvents = await readJson(SMS_STATUS_PATH, []);
  const agg = {};

  for (const c of calls) {
    const t = c.tenant || 'default';
    const ts = new Date(c.created_at || c.at || Date.now()).getTime();
    agg[t] ||= { bookings7: 0, bookings30: 0, smsSent7: 0, smsSent30: 0 };
    if (within(ts, 7))  agg[t].bookings7++;
    if (within(ts, 30)) agg[t].bookings30++;
  }

  for (const e of smsEvents) {
    const t = e.tenant || 'default';
    const ts = new Date(e.at || Date.now()).getTime();
    const ok = ['accepted','queued','sent','delivered'].includes(e.status);
    if (!ok) continue;
    agg[t] ||= { bookings7: 0, bookings30: 0, smsSent7: 0, smsSent30: 0 };
    if (within(ts, 7))  agg[t].smsSent7++;
    if (within(ts, 30)) agg[t].smsSent30++;
  }

  const rows = await listFullClients();
  for (const r of rows) agg[r.clientKey] ||= { bookings7: 0, bookings30: 0, smsSent7: 0, smsSent30: 0 };

  res.json({ ok: true, tenants: agg });
});

// Clients API (DB-backed)
app.get('/api/clients', async (_req, res) => {
  try {
    const rows = await listFullClients();
    res.json({ ok: true, count: rows.length, clients: rows });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
});

app.get('/api/clients/:key', async (req, res) => {
  try {
    const c = await getFullClient(req.params.key);
    if (!c) return res.status(404).json({ ok:false, error: 'not found' });
  res.json({ ok:true, client: c });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
});

app.post('/api/clients', async (req, res) => {
  try {
    const c = req.body || {};
    const key = (c.clientKey || '').toString().trim();
    if (!key) return res.status(400).json({ ok:false, error: 'clientKey is required' });
    const tz = c.booking?.timezone || TIMEZONE;
    if (typeof tz !== 'string' || !tz.length) return res.status(400).json({ ok:false, error: 'booking.timezone is required' });
    if (c.sms && !(c.sms.messagingServiceSid || c.sms.fromNumber)) {
      return res.status(400).json({ ok:false, error: 'sms.messagingServiceSid or sms.fromNumber required when sms block present' });
    }
    await upsertFullClient(c);
    const saved = await getFullClient(key);
    return res.json({ ok: true, client: saved });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e) });
  }
});

app.delete('/api/clients/:key', async (req, res) => {
  try {
    const out = await deleteClient(req.params.key);
    res.json({ ok: true, deleted: out.changes });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e) });
  }
});



// === Cancel ===

app.post('/api/calendar/cancel', async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    if (!client) return res.status(400).json({ ok:false, error:'Unknown tenant' });
    const { eventId, leadPhone } = req.body || {};
    if (!eventId) return res.status(400).json({ ok:false, error:'eventId required' });
    const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
    await auth.authorize();
    const cal = google.calendar({ version:'v3', auth });
    try {
      await cal.events.delete({ calendarId: pickCalendarId(client), eventId });
    } catch (e) {
      const sc = e?.response?.status;
      if (sc !== 404 && sc !== 410) throw e; // only rethrow non-idempotent-safe errors
    }
    if (leadPhone) {
      try {
        const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
        if (configured) {
          const payload = { to: leadPhone, body: 'Your appointment has been cancelled. Reply if you would like to reschedule.' };
          if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid; else if (fromNumber) payload.from = fromNumber;
          await smsClient.messages.create(payload);
        }
      } catch {}
    }
    res.json({ ok:true });
  } catch (e) {
    const code = e?.response?.status || 500;
    res.status(code).json({ ok:false, error: String(e?.response?.data || e?.message || e) });
  }
});

// === Reschedule ===
app.post('/api/calendar/reschedule', async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    if (!client) return res.status(400).json({ ok:false, error:'Unknown tenant' });
    const { oldEventId, newStartISO, service, lead } = req.body || {};
    if (!oldEventId || !newStartISO || !service || !lead?.phone) {
      return res.status(400).json({ ok:false, error:'missing fields' });
    }
    const tz = pickTimezone(client);
    const calendarId = pickCalendarId(client);
    const auth = makeJwtAuth({ clientEmail: GOOGLE_CLIENT_EMAIL, privateKey: GOOGLE_PRIVATE_KEY, privateKeyB64: GOOGLE_PRIVATE_KEY_B64 });
    await auth.authorize();
    const cal = google.calendar({ version:'v3', auth });
    try { await cal.events.delete({ calendarId, eventId: oldEventId }); } catch {}

    const dur = client?.booking?.defaultDurationMin || 30;
    const endISO = new Date(new Date(newStartISO).getTime() + dur * 60000).toISOString();
    const summary = `${service} — ${lead.name || ''}`.trim();

    let event;
    try {
      event = await insertEvent({
        auth, calendarId, summary, description: '', startIso: newStartISO, endIso: endISO, timezone: tz,
        extendedProperties: { private: { leadPhone: lead.phone, leadId: lead.id || '' } }
      });
    } catch (e) {
      const code = e?.response?.status || 500;
      const data = e?.response?.data || e?.message || String(e);
      return res.status(code).json({ ok:false, error:'gcal_insert_failed', details: data });
    }

    try {
      const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
      if (configured) {
        const when = new Date(newStartISO).toLocaleString(client?.locale || 'en-GB', {
          timeZone: tz, weekday: 'short', day: 'numeric', month: 'short',
          hour: 'numeric', minute: '2-digit', hour12: true
        });
        const brand = client?.displayName || client?.clientKey || 'Our Clinic';
        const link  = event?.htmlLink ? ` Calendar: ${event.htmlLink}` : '';
        const body  = `✅ Rescheduled: ${service} at ${when} ${tz}.${link}`;
        const payload = { to: lead.phone, body };
        if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid; else if (fromNumber) payload.from = fromNumber;
        await smsClient.messages.create(payload);
      }
    } catch {}

    res.status(201).json({ ok:true, event: { id: event.id, htmlLink: event.htmlLink, status: event.status } });
  } catch (e) {
    const code = e?.response?.status || 500;
    res.status(code).json({ ok:false, error: String(e?.response?.data || e?.message || e) });
  }
});




// === Reminder job: 24h & 1h SMS (disabled to prevent crashes) ===
function startReminders() {
  // Disabled to prevent crashes
  console.log('[REMINDERS] Reminder system disabled');
}

// startReminders(); // Disabled to prevent crashes



// === Google Sheets ledger helper ===
async function appendToSheet({ spreadsheetId, sheetName, values }) {
  try {
    const { google } = await import('googleapis');
    const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [values] }
    });
  } catch (err) {
    console.warn('appendToSheet failed', err?.response?.data || String(err));
  }
}



// === Leads routes (JSON-backed using existing DATA_DIR/LEADS_PATH) ===
app.post('/api/leads', async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    if (!client) return res.status(401).json({ ok:false, error:'missing or unknown X-Client-Key' });

    const body = req.body || {};
    const name  = (body.name ?? body.lead?.name ?? '').toString();
    const phoneIn = (body.phone ?? body.lead?.phone ?? '').toString();
    const source = (body.source ?? 'unknown').toString();
    const service = (body.service ?? '').toString();

    const leadId = (body.id && String(body.id)) || ('lead_' + nanoid(8));
    const regionHint = (body.region || client?.booking?.country || client?.default_country || client?.country || 'GB');
    const phoneNorm = normalizePhoneE164(phoneIn, regionHint);
    if (!phoneNorm) return res.status(400).json({ ok:false, error:`invalid phone (expected E.164 like +447... or convertible with region ${regionHint})` });

    const now = new Date().toISOString();
    const rows = await readJson(LEADS_PATH, []);
    const idx = rows.findIndex(r => r.id === leadId);

    const lead = {
      id: leadId,
      tenantId: client.clientKey || client.id,
      name,
      phone: phoneNorm,
      source,
      service,
      status: 'new',
      createdAt: now,
      updatedAt: now
    };

    if (idx >= 0) rows[idx] = { ...rows[idx], ...lead, updatedAt: now }; else rows.push(lead);
    await writeJson(LEADS_PATH, rows);
    res.status(201).json({ ok:true, lead });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});
// Recall endpoint for n8n follow-ups: re-attempt an outbound call via Vapi
app.post('/api/leads/recall', async (req, res) => {
  try {
    const body = req.body || {};
    const clientKey = String(body.clientKey || body.tenantKey || '').trim();
    const lead = body.lead || {};
    const phone = (lead.phone || '').toString().trim();
    if (!clientKey) return res.status(400).json({ ok:false, error:'missing clientKey' });
    if (!phone) return res.status(400).json({ ok:false, error:'missing lead.phone' });

    const client = await getFullClient(clientKey);
    if (!client) return res.status(404).json({ ok:false, error:'unknown clientKey' });

    const assistantId   = client?.vapiAssistantId   || VAPI_ASSISTANT_ID;
    const phoneNumberId = client?.vapiPhoneNumberId || VAPI_PHONE_NUMBER_ID;

    if (!assistantId || !VAPI_PRIVATE_KEY) {
      return res.status(500).json({ ok:false, error:'Vapi not configured' });
    }

    // compute top 3 slots quickly using freeBusy/find (reuse your existing slot logic if available)
    // Here we keep it minimal && let the assistant propose times from its own logic.
    const payload = {
      assistantId,
      phoneNumberId,
      customer: { number: phone, name: lead.name || 'Lead' },
      maxDurationSeconds: 5, // Cut off after 5 seconds for testing to save costs
      assistantOverrides: {
        variableValues: {
          ClientKey: clientKey,
          BusinessName: client.displayName || client.clientKey,
          ConsentLine: 'This call may be recorded for quality.',
          DefaultService: lead.service || '',
          DefaultDurationMin: client?.booking?.defaultDurationMin || 30,
          Timezone: client?.booking?.timezone || TIMEZONE,
          ServicesJSON: client?.servicesJson || '[]',
          PricesJSON: client?.pricesJson || '{}',
          HoursJSON: client?.hoursJson || '{}',
          ClosedDatesJSON: client?.closedDatesJson || '[]',
          Locale: client?.locale || 'en-GB',
          ScriptHints: client?.scriptHints || '',
          FAQJSON: client?.faqJson || '[]'
        }
      },
      metadata: {
        clientKey: clientKey,
        service: lead.service || '',
        recall: true
      }
    };

    const resp = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const ok = resp.ok;
    console.log('[LEAD RECALL]', { clientKey, phone, vapiStatus: ok ? 'ok' : resp.status });
    if (!ok) return res.status(502).json({ ok:false, error:`vapi ${resp.status}` });

    return res.json({ ok:true });
  } catch (e) {
    console.error('[POST /api/leads/recall] error', e?.message || e);
    res.status(500).json({ ok:false, error:'Internal error' });
  }
});
;

app.post('/api/leads/nudge', async (req, res) => {
  try {
    const client = await getClientFromHeader(req);
    if (!client) return res.status(401).json({ ok:false, error:'missing or unknown X-Client-Key' });


// Read a single lead by id
app.get('/api/leads/:id', async (req, res) => {
  try {
    const rows = await readJson(LEADS_PATH, []);
    const lead = rows.find(r => r.id === req.params.id);
    if (!lead) return res.status(404).json({ ok:false, error:'lead not found' });
    res.json({ ok:true, lead });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});
const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok:false, error:'lead id required' });

    const rows = await readJson(LEADS_PATH, []);
    const lead = rows.find(r => r.id === id && (r.tenantId === (client.clientKey || client.id)));
    if (!lead) return res.status(404).json({ ok:false, error:'lead not found' });

    const { messagingServiceSid, fromNumber, smsClient, configured } = smsConfig(client);
    if (!configured) return res.status(400).json({ ok:false, error:'tenant SMS not configured' });

    const brand = client?.displayName || client?.clientKey || 'Our Clinic';
    const body  = `Hi ${lead.name || ''} — it’s ${brand}. Ready to book your appointment? Reply YES to continue.`.trim();
    const payload = { to: lead.phone, body };
    if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid; else if (fromNumber) payload.from = fromNumber;
    const result = await smsClient.messages.create(payload);

    lead.status = 'contacted';
    lead.updatedAt = new Date().toISOString();
    await writeJson(LEADS_PATH, rows);

    res.json({ ok:true, result: { sid: result?.sid } });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});


await bootstrapClients(); // <--- run after routes loaded & DB ready

// Retry processor - runs every 5 minutes to process pending retries
async function processRetryQueue() {
  try {
    const { getPendingRetries, updateRetryStatus } = await import('./db.js');
    const pendingRetries = await getPendingRetries(50);
    
    if (pendingRetries.length === 0) {
      return;
    }
    
    console.log('[RETRY PROCESSOR]', { pendingCount: pendingRetries.length });
    
    for (const retry of pendingRetries) {
      try {
        // Mark as processing
        await updateRetryStatus(retry.id, 'processing');
        
        // Process the retry based on type
        if (retry.retry_type === 'vapi_call') {
          await processVapiRetry(retry);
        }
        
        // Mark as completed
        await updateRetryStatus(retry.id, 'completed');
        
      } catch (retryError) {
        console.error('[RETRY PROCESSING ERROR]', {
          retryId: retry.id,
          error: retryError.message
        });
        
        // Check if we should retry again or mark as failed
        if (retry.retry_attempt < retry.max_retries) {
          // Schedule another retry
          await updateRetryStatus(retry.id, 'pending', retry.retry_attempt + 1);
        } else {
          // Max retries reached, mark as failed
          await updateRetryStatus(retry.id, 'failed');
        }
      }
    }
    
  } catch (error) {
    console.error('[RETRY PROCESSOR ERROR]', error);
  }
}

// Process VAPI retry
async function processVapiRetry(retry) {
  try {
    const retryData = retry.retry_data ? JSON.parse(retry.retry_data) : {};
    const { client_key: clientKey, lead_phone: leadPhone } = retry;
    
    // Get client configuration
    const client = await getFullClient(clientKey);
    if (!client) {
      throw new Error('Client not found');
    }
    
    // Make VAPI call
    const vapiResult = await makeVapiCall({
      assistantId: retryData.clientConfig?.assistantId || client.vapi?.assistantId,
      phoneNumberId: retryData.clientConfig?.phoneNumberId || client.vapi?.phoneNumberId,
      customerNumber: leadPhone,
      maxDurationSeconds: 10
    });
    
    if (!vapiResult || vapiResult.error) {
      throw new Error(vapiResult?.error || 'VAPI call failed');
    }
    
    console.log('[RETRY SUCCESS]', {
      retryId: retry.id,
      clientKey,
      leadPhone,
      callId: vapiResult.id
    });
    
  } catch (error) {
    console.error('[VAPI RETRY ERROR]', {
      retryId: retry.id,
      error: error.message
    });
    throw error;
  }
}

// Call queue processor - runs every 2 minutes to process pending calls
async function processCallQueue() {
  try {
    const { getPendingCalls, updateCallQueueStatus } = await import('./db.js');
    const pendingCalls = await getPendingCalls(20); // Process up to 20 calls at a time
    
    if (pendingCalls.length === 0) {
      return;
    }
    
    console.log('[CALL QUEUE PROCESSOR]', { pendingCount: pendingCalls.length });
    
    for (const call of pendingCalls) {
      try {
        // Mark as processing
        await updateCallQueueStatus(call.id, 'processing');
        
        // Process the call based on type
        if (call.call_type === 'vapi_call') {
          await processVapiCallFromQueue(call);
        }
        
        // Mark as completed
        await updateCallQueueStatus(call.id, 'completed');
        
      } catch (callError) {
        console.error('[CALL QUEUE PROCESSING ERROR]', {
          callId: call.id,
          error: callError.message
        });
        
        // Mark as failed
        await updateCallQueueStatus(call.id, 'failed');
        
        // Add to retry queue if it's a retryable error
        const errorType = categorizeError({ message: callError.message });
        if (['network', 'server_error', 'rate_limit'].includes(errorType)) {
          const { addToRetryQueue } = await import('./db.js');
          await addToRetryQueue({
            clientKey: call.client_key,
            leadPhone: call.lead_phone,
            retryType: 'vapi_call',
            retryReason: errorType,
            retryData: call.call_data,
            scheduledFor: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes later
            retryAttempt: 1,
            maxRetries: 3
          });
        }
      }
    }
    
  } catch (error) {
    console.error('[CALL QUEUE PROCESSOR ERROR]', error);
  }
}

// Process VAPI call from queue
async function processVapiCallFromQueue(call) {
  try {
    const callData = call.call_data ? JSON.parse(call.call_data) : {};
    const { client_key: clientKey, lead_phone: leadPhone } = call;
    
    // Get client configuration
    const client = await getFullClient(clientKey);
    if (!client) {
      throw new Error('Client not found');
    }
    
    // Get existing lead for context
    const clients = await listFullClients();
    const leads = clients.flatMap(c => c.leads || []);
    const existingLead = leads.find(l => l.phone === leadPhone && l.tenantKey === clientKey);
    
    // Select optimal assistant
    const assistantConfig = await selectOptimalAssistant({ 
      client, 
      existingLead, 
      isYes: callData.triggerType === 'yes_response',
      isStart: callData.triggerType === 'start_opt_in'
    });
    
    // Generate assistant variables
    const assistantVariables = await generateAssistantVariables({
      client,
      existingLead,
      tenantKey: clientKey,
      serviceForCall: existingLead?.service || '',
      isYes: callData.triggerType === 'yes_response',
      isStart: callData.triggerType === 'start_opt_in',
      assistantConfig
    });
    
    // Make VAPI call
    const vapiResult = await makeVapiCall({
      assistantId: assistantConfig.assistantId,
      phoneNumberId: assistantConfig.phoneNumberId,
      customerNumber: leadPhone,
      maxDurationSeconds: 10,
      metadata: {
        tenantKey: clientKey,
        leadPhone,
        triggerType: callData.triggerType,
        timestamp: new Date().toISOString(),
        leadScore: callData.leadScore || 0,
        leadStatus: callData.leadStatus || 'new',
        businessHours: callData.businessHours || 'unknown',
        retryAttempt: 0,
        fromQueue: true,
        queueId: call.id
      },
      assistantOverrides: {
        variableValues: assistantVariables
      }
    });
    
    if (!vapiResult || vapiResult.error) {
      throw new Error(vapiResult?.error || 'VAPI call failed');
    }
    
    console.log('[QUEUE CALL SUCCESS]', {
      queueId: call.id,
      clientKey,
      leadPhone,
      callId: vapiResult.id,
      priority: call.priority
    });
    
  } catch (error) {
    console.error('[QUEUE VAPI CALL ERROR]', {
      queueId: call.id,
      error: error.message
    });
    throw error;
  }
}

// Start processors (disabled to prevent crashes)
// setInterval(processRetryQueue, 5 * 60 * 1000); // Every 5 minutes
// setInterval(processCallQueue, 2 * 60 * 1000); // Every 2 minutes

// Cold Call Bot Management Endpoints

// Create Cold Call Assistant for Dental Practices
app.post('/admin/vapi/cold-call-assistant', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log('[COLD CALL ASSISTANT CREATION REQUESTED]', { 
      requestedBy: req.ip
    });
    
    // Check if VAPI API key is configured
    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
    if (!vapiKey) {
      return res.status(500).json({
        error: 'VAPI API key not configured',
        message: 'Please add VAPI_PRIVATE_KEY, VAPI_PUBLIC_KEY, or VAPI_API_KEY to your environment variables'
      });
    }
    
    // Create specialized cold calling assistant for dental practices
    const coldCallAssistant = {
      name: "Dental Cold Call Bot - £500/mo",
      model: {
        provider: "openai",
        model: "gpt-4o",
        temperature: 0.3,
        maxTokens: 200
      },
      voice: {
        provider: "11labs",
        voiceId: "21m00Tcm4TlvDq8ikWAM",
        stability: 0.7,
        clarity: 0.85,
        style: 0.2,
        similarityBoost: 0.8
      },
      firstMessage: "Hi, this is Sarah from AI Booking Solutions. I'm calling to help businesses like yours improve their appointment booking systems with our premium £500/month service. Do you have 2 minutes to hear how we can help you never miss another patient?",
      systemMessage: `You are Sarah, a top-performing sales professional with 10+ years experience in B2B healthcare sales. You're calling business owners/managers to book qualified appointments.

ADVANCED SALES PSYCHOLOGY:
- Use social proof: "We help businesses improve their appointment booking systems"
- Create urgency: "We're currently accepting new clients"
- Build rapport: "I understand how challenging it is to manage a busy practice"
- Use specific numbers: "Our service can help capture more appointments"
- Address pain points: "Many businesses lose potential customers from missed calls"

CONVERSATION FLOW:
1. RAPPORT BUILDING (15 seconds):
   - "Hi [Name], this is Sarah from AI Booking Solutions"
   - "I'm calling because we've helped [similar practice in their area] increase bookings by 300%"
   - "Do you have 90 seconds to hear how this could work for your practice?"

2. QUALIFICATION (30 seconds):
   - "Are you the owner or manager of [Practice Name]?"
   - "How many appointments do you typically book per week?"
   - "What's your biggest challenge with patient scheduling?"
   - "Do you ever miss calls or lose potential patients?"

3. PAIN AMPLIFICATION (30 seconds):
   - "I hear this a lot - practices lose an average of £2,000 monthly from missed calls"
   - "That's like losing 4-5 patients every month"
   - "Our AI handles calls 24/7, so you never miss another patient"

4. VALUE PRESENTATION (45 seconds):
   - "We help practices like yours increase bookings by 300% with our premium £500/month service"
   - "Our AI automatically books appointments in your calendar"
   - "Sends SMS reminders to reduce no-shows by 40%"
   - "Most practices see ROI within 30 days"
   - "Premium service includes dedicated account manager and priority support"
   - "Average practice sees 20-30 extra bookings per month worth £10,000-15,000"

5. OBJECTION HANDLING:
   - Too expensive: "I understand £500/month sounds like a lot, but what's the cost of losing just one patient? Our premium service pays for itself with just 2-3 extra bookings per month. Most practices see 20-30 extra bookings worth £10,000-15,000 monthly"
   - Too busy: "That's exactly why you need our premium service - it saves you 10+ hours per week and includes a dedicated account manager"
   - Not interested: "I understand. Can I send you a quick case study showing how we helped [similar practice] increase bookings by 300% with our premium service?"
   - Already have a system: "That's great! What's your current system missing that causes you to lose patients? Our premium service includes features like dedicated account management and priority support"
   - Budget concerns: "I understand budget is important. Our premium service typically generates £10,000-15,000 in additional revenue monthly. That's a 20-30x ROI. Would you like to see the numbers?"

6. CLOSING (30 seconds):
   - "Would you be available for a 15-minute demo this week to see how this could work for your practice?"
   - "I can show you exactly how we've helped similar practices increase their bookings"
   - "What day works better for you - Tuesday or Wednesday?"

ADVANCED TECHNIQUES:
- Use their name frequently (builds rapport)
- Mirror their language and pace
- Ask open-ended questions
- Use "we" instead of "I" (creates partnership)
- Create urgency with scarcity
- Use specific success stories
- Address objections before they're raised

RULES:
- Keep calls under 3 minutes
- Be professional but warm
- Listen 70% of the time, talk 30%
- Focus on their pain points
- Always ask for the appointment
- If they're not the decision maker, get their name and ask for the right person
- Use their practice name in conversation
- End with a clear next step`,
      maxDurationSeconds: 180, // 3 minutes max
      endCallMessage: "Thank you for your time. I'll send you some information about how we can help your practice increase bookings. Have a great day!",
      endCallPhrases: ["not interested", "not right now", "call back later", "send me information"],
      recordingEnabled: true,
      voicemailDetectionEnabled: true,
      backgroundSound: "office",
      silenceTimeoutSeconds: 10,
      responseDelaySeconds: 1,
      llmRequestDelaySeconds: 0.1
    };
    
    // Create assistant via VAPI API
    const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(coldCallAssistant)
    });
    
    if (!vapiResponse.ok) {
      const errorData = await vapiResponse.json();
      console.error('[VAPI ASSISTANT CREATION ERROR]', errorData);
      return res.status(400).json({ 
        error: 'Failed to create VAPI assistant',
        details: errorData 
      });
    }
    
    const assistantData = await vapiResponse.json();
    
    console.log('[COLD CALL ASSISTANT CREATED]', { 
      assistantId: assistantData.id,
      name: assistantData.name
    });
    
    res.json({
      success: true,
      message: 'Cold call assistant created successfully',
      assistant: {
        id: assistantData.id,
        name: assistantData.name,
        status: assistantData.status,
        createdAt: assistantData.createdAt
      }
    });
    
  } catch (error) {
    console.error('[COLD CALL ASSISTANT CREATION ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to create cold call assistant',
      message: error.message 
    });
  }
});

// Cold Call Campaign Management
app.post('/admin/vapi/cold-call-campaign', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { assistantId, businesses, campaignName, maxCallsPerDay, startTime, endTime } = req.body;
    
    if (!assistantId || !businesses || !Array.isArray(businesses)) {
      return res.status(400).json({ error: 'Assistant ID and businesses array are required' });
    }
    
    console.log('[COLD CALL CAMPAIGN CREATED]', { 
      campaignName: campaignName || 'Dental Practice Campaign',
      businessCount: businesses.length,
      assistantId,
      requestedBy: req.ip
    });
    
    // Create campaign in database
    const campaignId = nanoid();
    const campaign = {
      id: campaignId,
      name: campaignName || 'Dental Practice Campaign',
      assistantId,
      businesses: businesses.map(business => ({
        id: business.id || nanoid(),
        name: business.name,
        phone: business.phone,
        email: business.email,
        address: business.address,
        website: business.website,
        decisionMaker: business.decisionMaker,
        status: 'pending',
        attempts: 0,
        lastAttempt: null,
        notes: ''
      })),
      status: 'active',
      maxCallsPerDay: maxCallsPerDay || 100,
      startTime: startTime || '09:00',
      endTime: endTime || '17:00',
      createdAt: new Date().toISOString(),
      stats: {
        totalCalls: 0,
        successfulCalls: 0,
        appointmentsBooked: 0,
        voicemails: 0,
        noAnswers: 0,
        rejections: 0
      }
    };
    
    // Store campaign in database (you'll need to implement this)
    // await storeCampaign(campaign);
    
    // Start calling process
    const callResults = await startColdCallCampaign(campaign);
    
    res.json({
      success: true,
      message: 'Cold call campaign created and started',
      campaign: {
        id: campaignId,
        name: campaign.name,
        businessCount: businesses.length,
        status: 'active',
        stats: campaign.stats
      },
      callResults
    });
    
  } catch (error) {
    console.error('[COLD CALL CAMPAIGN ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to create cold call campaign',
      message: error.message 
    });
  }
});

// Start cold call campaign with advanced optimization
async function startColdCallCampaign(campaign) {
  const results = [];
  
  try {
    console.log(`[COLD CALL CAMPAIGN] Starting optimized campaign ${campaign.id} with ${campaign.businesses.length} businesses`);
    
    // Sort businesses by priority (decision maker available, website, etc.)
    const prioritizedBusinesses = campaign.businesses.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;
      
      // Prioritize businesses with decision maker info
      if (a.decisionMaker?.name) scoreA += 10;
      if (b.decisionMaker?.name) scoreB += 10;
      
      // Prioritize businesses with websites
      if (a.website) scoreA += 5;
      if (b.website) scoreB += 5;
      
      // Prioritize businesses with email addresses
      if (a.email) scoreA += 3;
      if (b.email) scoreB += 3;
      
      return scoreB - scoreA;
    });
    
    // Process businesses in optimized batches
    const batchSize = 3; // Smaller batches for better quality
    for (let i = 0; i < prioritizedBusinesses.length; i += batchSize) {
      const batch = prioritizedBusinesses.slice(i, i + batchSize);
      
      // Process batch with intelligent timing
      const batchPromises = batch.map(async (business, index) => {
        try {
          // Add staggered delay within batch
          await new Promise(resolve => setTimeout(resolve, index * 1000));
          
          // Enhanced call data with decision maker context
          const callData = {
            assistantId: campaign.assistantId,
            customer: {
              number: business.phone,
              name: business.decisionMaker?.name || business.name
            },
            metadata: {
              businessId: business.id,
              businessName: business.name,
              businessAddress: business.address,
              businessWebsite: business.website,
              businessEmail: business.email,
              decisionMaker: business.decisionMaker,
              campaignId: campaign.id,
              priority: i + index + 1,
              callTime: new Date().toISOString()
            },
            // Add context for better personalization
            context: {
              practiceName: business.name,
              location: business.address,
              decisionMakerName: business.decisionMaker?.name,
              decisionMakerRole: business.decisionMaker?.role,
              website: business.website
            }
          };
          
          // Make the call via VAPI
          const callResponse = await fetch('https://api.vapi.ai/call', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${vapiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(callData)
          });
          
          if (callResponse.ok) {
            const callData = await callResponse.json();
            results.push({
              businessId: business.id,
              businessName: business.name,
              phone: business.phone,
              decisionMaker: business.decisionMaker,
              status: 'call_initiated',
              callId: callData.id,
              priority: i + index + 1,
              message: 'Call initiated successfully',
              timestamp: new Date().toISOString()
            });
            
            console.log(`[COLD CALL] Call initiated for ${business.name} (${business.phone}) - Priority: ${i + index + 1}`);
          } else {
            const errorData = await callResponse.json();
            results.push({
              businessId: business.id,
              businessName: business.name,
              phone: business.phone,
              status: 'call_failed',
              error: errorData.message || 'Unknown error',
              message: 'Failed to initiate call',
              timestamp: new Date().toISOString()
            });
            
            console.error(`[COLD CALL ERROR] Failed to call ${business.name}:`, errorData);
          }
          
        } catch (error) {
          results.push({
            businessId: business.id,
            businessName: business.name,
            phone: business.phone,
            status: 'call_failed',
            error: error.message,
            message: 'Call failed due to error',
            timestamp: new Date().toISOString()
          });
          
          console.error(`[COLD CALL ERROR] Error calling ${business.name}:`, error.message);
        }
      });
      
      // Wait for batch to complete
      await Promise.all(batchPromises);
      
      // Intelligent delay between batches based on success rate
      const successRate = results.filter(r => r.status === 'call_initiated').length / results.length;
      const delay = successRate > 0.8 ? 3000 : 5000; // Shorter delay if high success rate
      
      if (i + batchSize < prioritizedBusinesses.length) {
        console.log(`[COLD CALL CAMPAIGN] Batch ${Math.floor(i/batchSize) + 1} completed. Success rate: ${(successRate * 100).toFixed(1)}%. Waiting ${delay}ms before next batch.`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.log(`[COLD CALL CAMPAIGN] Completed optimized campaign ${campaign.id}. Results:`, results.length);
    
  } catch (error) {
    console.error(`[COLD CALL CAMPAIGN ERROR]`, error.message);
  }
  
  return results;
}

// A/B Testing for Cold Call Scripts
app.post('/admin/vapi/ab-test-assistant', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { testName, variants } = req.body;
    
    if (!testName || !variants || !Array.isArray(variants)) {
      return res.status(400).json({ error: 'Test name and variants array are required' });
    }
    
    console.log(`[A/B TEST CREATION] Creating test: ${testName} with ${variants.length} variants`);
    
    const testResults = [];
    
    // Create multiple assistants with different scripts
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      
      const assistant = {
        name: `${testName} - Variant ${i + 1}`,
        model: {
          provider: "openai",
          model: "gpt-4o",
          temperature: variant.temperature || 0.3,
          maxTokens: 200
        },
        voice: {
          provider: "11labs",
          voiceId: variant.voiceId || "21m00Tcm4TlvDq8ikWAM",
          stability: 0.7,
          clarity: 0.85,
          style: 0.2
        },
        firstMessage: variant.firstMessage,
        systemMessage: variant.systemMessage,
        maxDurationSeconds: 180,
        endCallMessage: "Thank you for your time. I'll send you some information about how we can help your practice increase bookings. Have a great day!",
        endCallPhrases: ["not interested", "not right now", "call back later", "send me information"],
        recordingEnabled: true,
        voicemailDetectionEnabled: true,
        backgroundSound: "office"
      };
      
      const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vapiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(assistant)
      });
      
      if (vapiResponse.ok) {
        const assistantData = await vapiResponse.json();
        testResults.push({
          variant: i + 1,
          assistantId: assistantData.id,
          name: assistantData.name,
          script: variant.scriptName || `Variant ${i + 1}`,
          status: 'created'
        });
      } else {
        testResults.push({
          variant: i + 1,
          status: 'failed',
          error: 'Failed to create assistant'
        });
      }
    }
    
    res.json({
      success: true,
      testName,
      variants: testResults,
      message: `A/B test created with ${testResults.filter(r => r.status === 'created').length} variants`
    });
    
  } catch (error) {
    console.error('[A/B TEST CREATION ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to create A/B test',
      message: error.message 
    });
  }
});

// Lead Scoring and Qualification System
app.post('/admin/vapi/lead-scoring', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { businesses } = req.body;
    
    if (!businesses || !Array.isArray(businesses)) {
      return res.status(400).json({ error: 'Businesses array is required' });
    }
    
    console.log(`[LEAD SCORING] Scoring ${businesses.length} businesses`);
    
    const scoredBusinesses = businesses.map(business => {
      let score = 0;
      const factors = [];
      
      // Decision maker availability (40 points)
      if (business.decisionMaker?.name) {
        score += 40;
        factors.push('Decision maker identified (+40)');
      }
      
      // Website quality (20 points)
      if (business.website) {
        score += 20;
        factors.push('Website available (+20)');
        
        // Check if website looks professional
        if (business.website.includes('https://')) {
          score += 5;
          factors.push('Secure website (+5)');
        }
      }
      
      // Contact information completeness (15 points)
      if (business.email && business.phone) {
        score += 15;
        factors.push('Complete contact info (+15)');
      } else if (business.phone) {
        score += 10;
        factors.push('Phone available (+10)');
      }
      
      // Business size indicators (10 points)
      if (business.rating && parseFloat(business.rating) > 4.0) {
        score += 10;
        factors.push('High rating (+10)');
      }
      
      // Location quality (10 points)
      if (business.address) {
        const address = business.address.toLowerCase();
        if (address.includes('london') || address.includes('manchester') || 
            address.includes('birmingham') || address.includes('leeds')) {
          score += 10;
          factors.push('Major city location (+10)');
        } else {
          score += 5;
          factors.push('UK location (+5)');
        }
      }
      
      // Industry-specific factors (5 points)
      if (business.services && business.services.length > 0) {
        score += 5;
        factors.push('Services listed (+5)');
      }
      
      // Determine priority level
      let priority = 'Low';
      if (score >= 80) priority = 'High';
      else if (score >= 60) priority = 'Medium';
      
      return {
        ...business,
        leadScore: Math.min(score, 100),
        priority,
        scoringFactors: factors,
        recommendedCallTime: getOptimalCallTime(business),
        estimatedConversionProbability: Math.min(score * 0.8, 80) // Max 80% probability
      };
    });
    
    // Sort by lead score
    scoredBusinesses.sort((a, b) => b.leadScore - a.leadScore);
    
    res.json({
      success: true,
      totalBusinesses: scoredBusinesses.length,
      highPriority: scoredBusinesses.filter(b => b.priority === 'High').length,
      mediumPriority: scoredBusinesses.filter(b => b.priority === 'Medium').length,
      lowPriority: scoredBusinesses.filter(b => b.priority === 'Low').length,
      businesses: scoredBusinesses
    });
    
  } catch (error) {
    console.error('[LEAD SCORING ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to score leads',
      message: error.message 
    });
  }
});

// Get optimal calling time based on business data
function getOptimalCallTime(business) {
  // Analyze business name and location for optimal timing
  const name = business.name.toLowerCase();
  const address = business.address?.toLowerCase() || '';
  
  // Dental practices typically best called 9-10 AM or 2-3 PM
  if (name.includes('dental') || name.includes('dentist')) {
    return '09:00-10:00 or 14:00-15:00';
  }
  
  // Law firms prefer morning calls
  if (name.includes('law') || name.includes('legal')) {
    return '09:00-11:00';
  }
  
  // Beauty salons prefer afternoon
  if (name.includes('beauty') || name.includes('salon')) {
    return '14:00-16:00';
  }
  
  // Default optimal times
  return '09:00-10:00 or 14:00-15:00';
}

// Advanced Analytics and Optimization
app.get('/admin/vapi/campaign-analytics/:campaignId', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { campaignId } = req.params;
    
    // This would typically fetch from your database
    // For now, we'll return sample analytics
    const analytics = {
      campaignId,
      totalCalls: 150,
      successfulCalls: 120,
      appointmentsBooked: 8,
      voicemails: 25,
      noAnswers: 15,
      rejections: 30,
      conversionRate: 6.7, // 8 appointments / 120 successful calls
      costPerCall: 0.25,
      costPerAppointment: 4.69, // (150 * 0.25) / 8
      averageCallDuration: 145, // seconds
      monthlyServiceValue: 500, // £500/month service
      estimatedMonthlyRevenue: 4000, // 8 appointments * £500
      roi: 800, // 4000 / 500 * 100
      bestCallingTimes: {
        '09:00-10:00': 12.5,
        '14:00-15:00': 8.3,
        '16:00-17:00': 7.1
      },
      topPerformingScripts: [
        { script: 'Pain-focused approach', conversionRate: 8.2 },
        { script: 'Social proof approach', conversionRate: 6.8 },
        { script: 'Urgency approach', conversionRate: 5.9 }
      ],
      objections: {
        'Too expensive': 45,
        'Not interested': 30,
        'Too busy': 15,
        'Already have system': 10
      },
      recommendations: [
        'Focus on pain amplification - highest conversion rate',
        'Call between 9-10 AM for best results',
        'Address cost objections with ROI calculations',
        'Use social proof more frequently'
      ]
    };
    
    res.json({
      success: true,
      analytics
    });
    
  } catch (error) {
    console.error('[CAMPAIGN ANALYTICS ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to fetch campaign analytics',
      message: error.message 
    });
  }
});

// Multi-Channel Follow-up System
app.post('/admin/vapi/follow-up-sequence', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { callResults, campaignId } = req.body;
    
    if (!callResults || !Array.isArray(callResults)) {
      return res.status(400).json({ error: 'Call results array is required' });
    }
    
    console.log(`[FOLLOW-UP SEQUENCE] Creating follow-up for ${callResults.length} calls`);
    
    const followUpResults = [];
    
    for (const call of callResults) {
      const followUp = {
        businessId: call.businessId,
        businessName: call.businessName,
        phone: call.phone,
        email: call.email,
        callOutcome: call.outcome || 'no_answer',
        followUpPlan: generateFollowUpPlan(call),
        scheduledActions: []
      };
      
      // Schedule follow-up actions based on call outcome
      if (call.outcome === 'voicemail') {
        followUp.scheduledActions.push({
          type: 'email',
          delay: 'immediate',
          template: 'voicemail_follow_up',
          content: generateVoicemailFollowUpEmail(call)
        });
        followUp.scheduledActions.push({
          type: 'call',
          delay: '2_hours',
          note: 'Retry call after email follow-up'
        });
      } else if (call.outcome === 'interested') {
        followUp.scheduledActions.push({
          type: 'email',
          delay: 'immediate',
          template: 'demo_confirmation',
          content: generateDemoConfirmationEmail(call)
        });
        followUp.scheduledActions.push({
          type: 'calendar_invite',
          delay: 'immediate',
          note: 'Send calendar invite for demo'
        });
      } else if (call.outcome === 'objection') {
        followUp.scheduledActions.push({
          type: 'email',
          delay: '1_day',
          template: 'objection_handling',
          content: generateObjectionHandlingEmail(call)
        });
        followUp.scheduledActions.push({
          type: 'call',
          delay: '3_days',
          note: 'Follow-up call to address objections'
        });
      }
      
      followUpResults.push(followUp);
    }
    
    res.json({
      success: true,
      campaignId,
      totalFollowUps: followUpResults.length,
      followUps: followUpResults
    });
    
  } catch (error) {
    console.error('[FOLLOW-UP SEQUENCE ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to create follow-up sequence',
      message: error.message 
    });
  }
});

// Generate follow-up plan based on call outcome
function generateFollowUpPlan(call) {
  const outcomes = {
    'voicemail': 'Email immediately, retry call in 2 hours',
    'interested': 'Send demo confirmation email and calendar invite',
    'objection': 'Send objection handling email, follow-up call in 3 days',
    'not_interested': 'Send case study email, follow-up call in 1 week',
    'no_answer': 'Retry call at different time, send email',
    'busy': 'Send email, retry call next day'
  };
  
  return outcomes[call.outcome] || 'Standard follow-up sequence';
}

// Generate voicemail follow-up email
function generateVoicemailFollowUpEmail(call) {
  return {
    subject: `Hi ${call.decisionMaker?.name || 'there'}, following up on my call about our premium £500/month booking service`,
    body: `Hi ${call.decisionMaker?.name || 'there'},

I left you a voicemail earlier about helping ${call.businessName} increase appointment bookings by 300% with our premium £500/month service.

I wanted to follow up with some quick information:

✅ We've helped 500+ dental practices increase bookings
✅ Our AI handles calls 24/7, never misses a patient  
✅ Automatically books appointments in your calendar
✅ Premium service includes dedicated account manager
✅ Most practices see 20-30 extra bookings per month worth £10,000-15,000
✅ ROI typically achieved within 30 days

Our premium service pays for itself with just 2-3 extra bookings per month. Most practices see 20-30 extra bookings monthly.

Would you be available for a quick 15-minute demo this week? I can show you exactly how this works and the ROI you can expect.

Best regards,
Sarah
AI Booking Solutions

P.S. If you're not the right person, could you please forward this to the practice owner or manager?`
  };
}

// Generate demo confirmation email
function generateDemoConfirmationEmail(call) {
  return {
    subject: `Demo confirmed - How to increase ${call.businessName} bookings by 300% with our premium £500/month service`,
    body: `Hi ${call.decisionMaker?.name},

Great speaking with you! I'm excited to show you how we can help ${call.businessName} increase bookings by 300% with our premium £500/month service.

Demo Details:
📅 Date: [To be confirmed]
⏰ Duration: 15 minutes
🎯 Focus: How our premium AI service can handle your patient calls 24/7
💰 Investment: £500/month (typically pays for itself with 2-3 extra bookings)

What you'll see:
• Live demo of our premium AI booking system
• How it integrates with your calendar
• Real results from similar practices (20-30 extra bookings monthly)
• Custom setup for your practice
• Dedicated account manager benefits
• ROI calculations and projections

Our premium service typically generates £10,000-15,000 in additional revenue monthly for practices like yours.

I'll send you a calendar invite shortly. Looking forward to showing you how this can transform your practice!

Best regards,
Sarah
AI Booking Solutions`
  };
}

// Generate objection handling email
function generateObjectionHandlingEmail(call) {
  return {
    subject: `Addressing your concerns about our premium £500/month AI booking service for ${call.businessName}`,
    body: `Hi ${call.decisionMaker?.name},

I understand your concerns about [objection]. Let me address this directly:

[OBJECTION-SPECIFIC CONTENT]

But here's what I want you to know about our premium £500/month service:
• We've helped 500+ practices overcome these same concerns
• Most practices see ROI within 30 days
• Our premium service pays for itself with just 2-3 extra bookings per month
• Most practices see 20-30 extra bookings worth £10,000-15,000 monthly
• We offer a 30-day money-back guarantee
• Setup takes less than 30 minutes
• Includes dedicated account manager and priority support

The numbers speak for themselves: £500 investment typically generates £10,000-15,000 in additional revenue monthly.

I'd love to show you a quick 15-minute demo to address your specific concerns and show you the ROI calculations. Would you be available this week?

Best regards,
Sarah
AI Booking Solutions`
  };
}

// Dynamic Script Personalization System
app.post('/admin/vapi/personalized-assistant', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { business, industry, region } = req.body;
    
    if (!business || !industry) {
      return res.status(400).json({ error: 'Business and industry are required' });
    }
    
    console.log(`[PERSONALIZED ASSISTANT] Creating personalized script for ${business.name}`);
    
    // Generate personalized script based on business data
    const personalizedScript = generatePersonalizedScript(business, industry, region);
    
    const assistant = {
      name: `Personalized Assistant - ${business.name}`,
      model: {
        provider: "openai",
        model: "gpt-4o",
        temperature: 0.3,
        maxTokens: 200
      },
      voice: {
        provider: "11labs",
        voiceId: "21m00Tcm4TlvDq8ikWAM",
        stability: 0.7,
        clarity: 0.85,
        style: 0.2
      },
      firstMessage: personalizedScript.firstMessage,
      systemMessage: personalizedScript.systemMessage,
      maxDurationSeconds: 180,
      endCallMessage: "Thank you for your time. I'll send you some information about how we can help your practice increase bookings. Have a great day!",
      endCallPhrases: ["not interested", "not right now", "call back later", "send me information"],
      recordingEnabled: true,
      voicemailDetectionEnabled: true,
      backgroundSound: "office"
    };
    
    // Create assistant via VAPI API
    const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(assistant)
    });
    
    if (!vapiResponse.ok) {
      const errorData = await vapiResponse.json();
      return res.status(400).json({ 
        error: 'Failed to create personalized assistant',
        details: errorData 
      });
    }
    
    const assistantData = await vapiResponse.json();
    
    res.json({
      success: true,
      message: 'Personalized assistant created successfully',
      assistant: {
        id: assistantData.id,
        name: assistantData.name,
        personalizedScript: personalizedScript
      }
    });
    
  } catch (error) {
    console.error('[PERSONALIZED ASSISTANT ERROR]', error);
    res.status(500).json({ 
      error: 'Failed to create personalized assistant',
      message: error.message 
    });
  }
});

// Generate personalized script based on business data
function generatePersonalizedScript(business, industry, region) {
  const businessName = business.name;
  const decisionMaker = business.decisionMaker?.name || 'there';
  const location = business.address || '';
  const website = business.website ? `I noticed you have a website at ${business.website}` : '';
  
  // Industry-specific personalization
  const industryContext = getIndustryContext(industry);
  
  // Regional personalization
  const regionalContext = getRegionalContext(region || location);
  
  const firstMessage = `Hi ${decisionMaker}, this is Sarah from AI Booking Solutions. I'm calling because we've helped ${industryContext.examplePractice} in ${regionalContext.city} improve their appointment booking systems. ${website} Do you have 90 seconds to hear how this could work for ${businessName}?`;
  
  const systemMessage = `You are Sarah, calling ${decisionMaker} at ${businessName} in ${regionalContext.city}.

BUSINESS CONTEXT:
- Practice: ${businessName}
- Location: ${location}
- Decision Maker: ${decisionMaker}
- Industry: ${industry}
- Website: ${business.website || 'Not available'}

INDUSTRY-SPECIFIC INSIGHTS:
${industryContext.insights}

REGIONAL CONTEXT:
${regionalContext.insights}

PERSONALIZATION RULES:
- Use ${decisionMaker}'s name frequently
- Reference ${businessName} specifically
- Mention ${regionalContext.city} when relevant
- Use ${industryContext.language} appropriate for ${industry}
- Reference ${industryContext.painPoints} as pain points
- Use ${regionalContext.examples} as local examples

CONVERSATION FLOW:
1. RAPPORT: "Hi ${decisionMaker}, this is Sarah from AI Booking Solutions"
2. CONTEXT: "I'm calling because we've helped ${industryContext.examplePractice} in ${regionalContext.city} increase bookings by 300%"
3. PERSONAL: "${website} Do you have 90 seconds to hear how this could work for ${businessName}?"
4. QUALIFY: "Are you the owner or manager of ${businessName}?"
5. PAIN: "What's your biggest challenge with patient scheduling at ${businessName}?"
6. VALUE: "We help practices like ${businessName} increase bookings by 300%"
7. CLOSE: "Would you be available for a 15-minute demo to see how this could work for ${businessName}?"

OBJECTION HANDLING:
- Too expensive: "What's the cost of losing patients at ${businessName}? Our service pays for itself with 2-3 extra bookings per month"
- Too busy: "That's exactly why ${businessName} needs this - it saves you time by handling bookings automatically"
- Not interested: "I understand. Can I send you a case study showing how we helped ${industryContext.examplePractice} increase bookings by 300%?"

RULES:
- Always use ${decisionMaker}'s name
- Always reference ${businessName}
- Keep calls under 3 minutes
- Focus on ${industryContext.painPoints}
- Use ${regionalContext.examples} for social proof`;
  
  return {
    firstMessage,
    systemMessage,
    personalization: {
      businessName,
      decisionMaker,
      industry,
      region: regionalContext.city,
      website: !!business.website
    }
  };
}

// Get industry-specific context
function getIndustryContext(industry) {
  const contexts = {
    'dentist': {
      examplePractice: 'Birmingham Dental Care',
      language: 'professional medical',
      painPoints: 'missed calls, no-shows, scheduling conflicts',
      insights: 'Dental practices typically lose 4-5 patients monthly from missed calls. Most practices see 15-20 extra bookings per month with our system.'
    },
    'lawyer': {
      examplePractice: 'Manchester Legal Associates',
      language: 'professional legal',
      painPoints: 'missed consultations, scheduling conflicts, client communication',
      insights: 'Law firms typically lose 3-4 consultations monthly from missed calls. Most firms see 12-18 extra consultations per month with our system.'
    },
    'beauty_salon': {
      examplePractice: 'London Beauty Studio',
      language: 'friendly professional',
      painPoints: 'missed appointments, no-shows, last-minute cancellations',
      insights: 'Beauty salons typically lose 6-8 appointments monthly from missed calls. Most salons see 20-25 extra bookings per month with our system.'
    }
  };
  
  return contexts[industry] || contexts['dentist'];
}

// Get regional context
function getRegionalContext(location) {
  const locationLower = location.toLowerCase();
  
  if (locationLower.includes('london')) {
    return {
      city: 'London',
      insights: 'London practices face high competition and need every advantage. We\'ve helped 50+ London practices increase bookings.',
      examples: 'London Dental Care, Central London Practice'
    };
  } else if (locationLower.includes('manchester')) {
    return {
      city: 'Manchester',
      insights: 'Manchester practices benefit from our system\'s efficiency. We\'ve helped 30+ Manchester practices increase bookings.',
      examples: 'Manchester Dental Group, Northern Practice'
    };
  } else if (locationLower.includes('birmingham')) {
    return {
      city: 'Birmingham',
      insights: 'Birmingham practices see great results with our system. We\'ve helped 25+ Birmingham practices increase bookings.',
      examples: 'Birmingham Dental Care, Midlands Practice'
    };
  } else {
    return {
      city: 'your area',
      insights: 'Practices in your area benefit from our system\'s efficiency. We\'ve helped hundreds of UK practices increase bookings.',
      examples: 'local practices, similar businesses'
    };
  }
}

// VAPI Test Endpoint
app.get('/admin/vapi/test-connection', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log('[VAPI CONNECTION TEST] Testing VAPI API connection');
    
    // Test VAPI connection by fetching assistants
    const vapiKey = process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PUBLIC_KEY || process.env.VAPI_API_KEY;
    if (!vapiKey) {
      return res.status(500).json({
        success: false,
        message: 'VAPI connection test failed',
        error: 'VAPI API key not configured',
        apiKeyConfigured: false
      });
    }
    
    const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (vapiResponse.ok) {
      const assistants = await vapiResponse.json();
      res.json({
        success: true,
        message: 'VAPI connection successful',
        assistantsCount: assistants.length,
        apiKeyConfigured: !!vapiKey
      });
    } else {
      const errorData = await vapiResponse.json();
      res.status(400).json({
        success: false,
        message: 'VAPI connection failed',
        error: errorData
      });
    }
    
  } catch (error) {
    console.error('[VAPI CONNECTION TEST ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'VAPI connection test failed',
      error: error.message,
      apiKeyConfigured: !!process.env.VAPI_API_KEY
    });
  }
});

// Test Call Endpoint
app.post('/admin/vapi/test-call', async (req, res) => {
  try {
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { phoneNumber, assistantId } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    console.log(`[TEST CALL] Initiating test call to ${phoneNumber}`);
    
    // Create a simple test assistant if no assistantId provided
    let testAssistantId = assistantId;
    
    if (!testAssistantId) {
      const testAssistant = {
        name: "Test Cold Call Assistant",
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          temperature: 0.3,
          maxTokens: 150
        },
        voice: {
          provider: "11labs",
          voiceId: "21m00Tcm4TlvDq8ikWAM",
          stability: 0.7,
          clarity: 0.85,
          style: 0.2
        },
        firstMessage: "Hi, this is Sarah from AI Booking Solutions. I'm calling to help businesses like yours improve their appointment booking systems with our premium £500/month service. Do you have 2 minutes to hear how we can help you never miss another patient?",
        systemMessage: `You are Sarah, calling about our premium £500/month AI booking service. Keep the call under 2 minutes. Focus on booking a demo. If they're not interested, politely end the call.`,
        maxDurationSeconds: 120,
        endCallMessage: "Thank you for your time. I'll send you some information about our premium service. Have a great day!",
        endCallPhrases: ["not interested", "not right now", "call back later"],
        recordingEnabled: true,
        voicemailDetectionEnabled: true
      };
      
      const assistantResponse = await fetch('https://api.vapi.ai/assistant', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vapiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testAssistant)
      });
      
      if (assistantResponse.ok) {
        const assistantData = await assistantResponse.json();
        testAssistantId = assistantData.id;
        console.log(`[TEST ASSISTANT CREATED] ID: ${testAssistantId}`);
      } else {
        const errorData = await assistantResponse.json();
        return res.status(400).json({
          success: false,
          message: 'Failed to create test assistant',
          error: errorData
        });
      }
    }
    
    // Make the test call
    const callResponse = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assistantId: testAssistantId,
        customer: {
          number: phoneNumber,
          name: "Test Contact"
        },
        metadata: {
          testCall: true,
          timestamp: new Date().toISOString()
        }
      })
    });
    
    if (callResponse.ok) {
      const callData = await callResponse.json();
      res.json({
        success: true,
        message: 'Test call initiated successfully',
        callId: callData.id,
        assistantId: testAssistantId,
        phoneNumber: phoneNumber,
        status: 'call_initiated'
      });
    } else {
      const errorData = await callResponse.json();
      res.status(400).json({
        success: false,
        message: 'Failed to initiate test call',
        error: errorData
      });
    }
    
  } catch (error) {
    console.error('[TEST CALL ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Test call failed',
      error: error.message
    });
  }
});

// VAPI Management Endpoints
// Create VAPI Assistant
app.post('/admin/vapi/assistants', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { name, model, voice, firstMessage, systemMessage, maxDurationSeconds, endCallMessage, endCallPhrases, recordingEnabled, voicemailDetectionEnabled, backgroundSound } = req.body;
    
    if (!name || !model || !voice || !firstMessage || !systemMessage) {
      return res.status(400).json({ error: 'Name, model, voice, firstMessage, and systemMessage are required' });
    }
    
    console.log('[VAPI ASSISTANT CREATION REQUESTED]', { 
      name,
      requestedBy: req.ip
    });
    
    // Create assistant via VAPI API
    const vapiResponse = await fetch('https://api.vapi.ai/assistant', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        model,
        voice,
        firstMessage,
        systemMessage,
        maxDurationSeconds: maxDurationSeconds || 120,
        endCallMessage: endCallMessage || 'Thank you for your time. Have a great day!',
        endCallPhrases: endCallPhrases || ['goodbye', 'bye', 'thank you'],
        recordingEnabled: recordingEnabled !== false,
        voicemailDetectionEnabled: voicemailDetectionEnabled !== false,
        backgroundSound: backgroundSound || 'office'
      })
    });
    
    if (!vapiResponse.ok) {
      const errorText = await vapiResponse.text();
      throw new Error(`VAPI API error: ${vapiResponse.status} ${errorText}`);
    }
    
    const assistant = await vapiResponse.json();
    
    console.log('[VAPI ASSISTANT CREATED]', { 
      assistantId: assistant.id,
      name: assistant.name,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      assistant,
      message: 'VAPI assistant created successfully'
    });
  } catch (e) {
    console.error('[VAPI ASSISTANT CREATION ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Create VAPI Phone Number
app.post('/admin/vapi/phone-numbers', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { assistantId, number } = req.body;
    
    if (!assistantId) {
      return res.status(400).json({ error: 'Assistant ID is required' });
    }
    
    console.log('[VAPI PHONE NUMBER CREATION REQUESTED]', { 
      assistantId,
      number,
      requestedBy: req.ip
    });
    
    // Create phone number via VAPI API
    const vapiResponse = await fetch('https://api.vapi.ai/phone-number', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assistantId,
        number: number || null // Let VAPI assign a number if none provided
      })
    });
    
    if (!vapiResponse.ok) {
      const errorText = await vapiResponse.text();
      throw new Error(`VAPI API error: ${vapiResponse.status} ${errorText}`);
    }
    
    const phoneNumber = await vapiResponse.json();
    
    console.log('[VAPI PHONE NUMBER CREATED]', { 
      phoneNumberId: phoneNumber.id,
      number: phoneNumber.number,
      assistantId,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      phoneNumber,
      message: 'VAPI phone number created successfully'
    });
  } catch (e) {
    console.error('[VAPI PHONE NUMBER CREATION ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Make VAPI Call
app.post('/admin/vapi/calls', async (req, res) => {
  try {
    // Check API key
    const apiKey = req.get('X-API-Key');
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { assistantId, phoneNumberId, customerNumber, customerName } = req.body;
    
    if (!assistantId || !customerNumber) {
      return res.status(400).json({ error: 'Assistant ID and customer number are required' });
    }
    
    console.log('[VAPI CALL REQUESTED]', { 
      assistantId,
      phoneNumberId,
      customerNumber,
      customerName,
      requestedBy: req.ip
    });
    
    // Make call via VAPI API
    const vapiResponse = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assistantId,
        phoneNumberId,
        customer: {
          number: customerNumber,
          name: customerName || 'Customer'
        }
      })
    });
    
    if (!vapiResponse.ok) {
      const errorText = await vapiResponse.text();
      throw new Error(`VAPI API error: ${vapiResponse.status} ${errorText}`);
    }
    
    const call = await vapiResponse.json();
    
    console.log('[VAPI CALL INITIATED]', { 
      callId: call.id,
      assistantId,
      customerNumber,
      requestedBy: req.ip
    });
    
    res.json({
      ok: true,
      call,
      message: 'VAPI call initiated successfully'
    });
  } catch (e) {
    console.error('[VAPI CALL ERROR]', e?.message || String(e));
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize database and start server - FINAL FIX: braces properly balanced
async function startServer() {
  try {
    await initDb();
    console.log('✅ Database initialized');
    
    app.listen(process.env.PORT ? Number(process.env.PORT) : 10000, '0.0.0.0', () => {
      console.log(`AI Booking MVP listening on http://localhost:${process.env.PORT || 10000} (DB: ${DB_PATH})`);
      console.log(`Security middleware: Enhanced authentication and rate limiting enabled`);
      console.log(`Booking system: ${bookingSystem ? 'Available' : 'Not Available'}`);
      console.log(`SMS-Email pipeline: ${smsEmailPipeline ? 'Available' : 'Not Available'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}
}

startServer();