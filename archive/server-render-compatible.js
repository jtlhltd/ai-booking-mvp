// Render-compatible server with optimized dependencies
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import { createHash, randomBytes } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Basic routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'landing-page.html'));
});

app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Render-compatible server is working',
    timestamp: new Date().toISOString(),
    nodeVersion: process.version
  });
});

// Initialize services with error handling
let bookingSystem = null;
let smsEmailPipeline = null;

async function initializeServices() {
  try {
    // Try to initialize booking system
    try {
      const { BookingSystem } = await import('./booking-system.js');
      bookingSystem = new BookingSystem();
      console.log('✅ Booking system initialized');
    } catch (error) {
      console.log('⚠️ Booking system not available:', error.message);
    }

    // Try to initialize SMS-Email pipeline
    try {
      const { SMSEmailPipeline } = await import('./sms-email-pipeline.js');
      smsEmailPipeline = new SMSEmailPipeline();
      console.log('✅ SMS-Email pipeline initialized');
    } catch (error) {
      console.log('⚠️ SMS-Email pipeline not available:', error.message);
    }
  } catch (error) {
    console.error('❌ Service initialization error:', error.message);
  }
}

// Booking system endpoints
app.get('/api/available-slots', async (req, res) => {
  try {
    if (!bookingSystem) {
      // Return mock slots if booking system not available
      const slots = [
        { id: '1', date: '2024-01-15', time: '09:00', available: true },
        { id: '2', date: '2024-01-15', time: '10:00', available: true },
        { id: '3', date: '2024-01-15', time: '11:00', available: true }
      ];
      
      return res.json({
        success: true,
        slots: slots,
        totalSlots: slots.length,
        message: 'Using mock slots - booking system not available'
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
      message: 'Failed to get time slots',
      error: error.message
    });
  }
});

app.post('/api/book-demo', async (req, res) => {
  try {
    if (!bookingSystem) {
      return res.json({
        success: true,
        message: 'Demo booking successful (mock)',
        bookingId: 'mock-' + Date.now(),
        leadData: req.body.leadData,
        preferredTimes: req.body.preferredTimes
      });
    }

    const { leadData, preferredTimes } = req.body;
    
    if (!leadData || !leadData.businessName || !leadData.decisionMaker || !leadData.email) {
      return res.status(400).json({
        success: false,
        message: 'Missing required lead data'
      });
    }

    const timeSlots = preferredTimes || bookingSystem.generateTimeSlots(7);
    const result = await bookingSystem.bookDemo(leadData, timeSlots);
    
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

// SMS-Email pipeline endpoints
app.post('/api/initiate-lead-capture', async (req, res) => {
  try {
    if (!smsEmailPipeline) {
      return res.json({
        success: true,
        message: 'Lead capture initiated (mock)',
        leadId: 'mock-' + Date.now()
      });
    }

    const { leadData } = req.body;
    
    if (!leadData || !leadData.phoneNumber || !leadData.decisionMaker) {
      return res.status(400).json({
        success: false,
        message: 'Missing required lead data (phoneNumber, decisionMaker)'
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

app.get('/api/pipeline-stats', async (req, res) => {
  try {
    if (!smsEmailPipeline) {
      return res.json({
        success: true,
        stats: {
          totalLeads: 0,
          pendingLeads: 0,
          completedLeads: 0,
          message: 'SMS-Email pipeline not available'
        }
      });
    }

    const stats = smsEmailPipeline.getStats();
    res.json({
      success: true,
      stats: stats
    });
  } catch (error) {
    console.error('[PIPELINE STATS ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pipeline stats',
      error: error.message
    });
  }
});

// Mock VAPI endpoints
app.post('/mock-call', (req, res) => {
  res.json({
    success: true,
    message: 'Mock call initiated (render-compatible server)',
    callId: 'mock-' + Date.now()
  });
});

// UK Business Search endpoints (mock for now)
app.get('/api/uk-business-search', async (req, res) => {
  try {
    const { query, industry, location } = req.query;
    
    // Return mock data for now
    const mockBusinesses = [
      {
        id: '1',
        name: 'Sample Dental Practice',
        industry: 'Dental',
        location: 'London',
        phone: '+44 20 1234 5678',
        email: 'info@sampledental.com',
        leadScore: 85
      },
      {
        id: '2',
        name: 'Example Medical Clinic',
        industry: 'Medical',
        location: 'Manchester',
        phone: '+44 161 234 5678',
        email: 'contact@examplemedical.com',
        leadScore: 72
      }
    ];
    
    res.json({
      success: true,
      businesses: mockBusinesses,
      totalResults: mockBusinesses.length,
      message: 'Using mock data - real search not available'
    });
  } catch (error) {
    console.error('[BUSINESS SEARCH ERROR]', error);
    res.status(500).json({
      success: false,
      message: 'Business search failed',
      error: error.message
    });
  }
});

// Error handling
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: error.message
  });
});

// Start server
async function startServer() {
  try {
    await initializeServices();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Render-compatible server running on port ${PORT}`);
      console.log(`✅ Node version: ${process.version}`);
      console.log(`✅ Booking system: ${bookingSystem ? 'Available' : 'Not available'}`);
      console.log(`✅ SMS-Email pipeline: ${smsEmailPipeline ? 'Available' : 'Not available'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
