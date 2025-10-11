// Test script to verify Node.js version and database setup
console.log('🔍 Testing Node.js version and database setup...');
console.log(`Node.js version: ${process.version}`);

// Test database initialization
import { init } from './src/db.js';

try {
  console.log('🔍 Testing database initialization...');
  const dbType = await init();
  console.log(`✅ Database initialized successfully: ${dbType}`);
  console.log('✅ All tests passed!');
} catch (error) {
  console.error('❌ Database test failed:', error.message);
  process.exit(1);
}
