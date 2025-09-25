// Simplified server for testing
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';

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
    message: 'Simple server is working',
    timestamp: new Date().toISOString()
  });
});

// Mock booking system endpoints
app.get('/api/available-slots', (req, res) => {
  const slots = [
    { id: '1', date: '2024-01-15', time: '09:00', available: true },
    { id: '2', date: '2024-01-15', time: '10:00', available: true },
    { id: '3', date: '2024-01-15', time: '11:00', available: true }
  ];
  
  res.json({
    success: true,
    slots: slots,
    totalSlots: slots.length
  });
});

app.post('/api/book-demo', (req, res) => {
  const { leadData, preferredTimes } = req.body;
  
  res.json({
    success: true,
    message: 'Demo booking successful (mock)',
    bookingId: 'mock-' + Date.now(),
    leadData: leadData,
    preferredTimes: preferredTimes
  });
});

// Mock VAPI endpoints
app.post('/mock-call', (req, res) => {
  res.json({
    success: true,
    message: 'Mock call initiated (simplified server)',
    callId: 'mock-' + Date.now()
  });
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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Simple server running on port ${PORT}`);
  console.log(`✅ Test endpoint: http://localhost:${PORT}/api/test`);
});
