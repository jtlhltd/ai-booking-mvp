// Test server startup to isolate 502 error
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Test booking system import
console.log('Testing booking system import...');
try {
  const { BookingSystem } = await import('./booking-system.js');
  console.log('✅ Booking system imported successfully');
  
  // Test initialization
  const bookingSystem = new BookingSystem();
  console.log('✅ Booking system created successfully');
  
  await bookingSystem.initializeServices();
  console.log('✅ Booking system initialized successfully');
  
} catch (error) {
  console.error('❌ Booking system error:', error.message);
  console.error('Stack:', error.stack);
}

// Basic route
app.get('/', (req, res) => {
  res.json({ status: 'Server running', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`✅ Test server running on port ${PORT}`);
});
