// Minimal server to test basic functionality
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Basic route
app.get('/', (req, res) => {
  res.json({ 
    status: 'Minimal server running', 
    timestamp: new Date().toISOString(),
    message: 'This is a minimal test server'
  });
});

// Test route
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Minimal API test endpoint working',
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`✅ Minimal server running on port ${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
});