#!/usr/bin/env node

/**
 * Admin Hub Setup Script
 * 
 * This script helps you set up and test the Admin Hub
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🎯 Admin Hub Setup Script');
console.log('========================\n');

// Check if Admin Hub files exist
const adminHubFile = path.join(__dirname, 'public', 'admin-hub.html');
const serverFile = path.join(__dirname, 'server.js');

console.log('📁 Checking files...');

if (!fs.existsSync(adminHubFile)) {
  console.error('❌ Admin Hub HTML file not found:', adminHubFile);
  process.exit(1);
}

if (!fs.existsSync(serverFile)) {
  console.error('❌ Server file not found:', serverFile);
  process.exit(1);
}

console.log('✅ Admin Hub HTML file found');
console.log('✅ Server file found');

// Check if API endpoints are in server.js
const serverContent = fs.readFileSync(serverFile, 'utf8');

const requiredEndpoints = [
  '/api/admin/business-stats',
  '/api/admin/recent-activity',
  '/api/admin/clients',
  '/api/admin/calls',
  '/api/admin/analytics',
  '/api/admin/system-health'
];

console.log('\n🔌 Checking API endpoints...');

let missingEndpoints = [];
requiredEndpoints.forEach(endpoint => {
  if (serverContent.includes(endpoint)) {
    console.log(`✅ ${endpoint}`);
  } else {
    console.log(`❌ ${endpoint}`);
    missingEndpoints.push(endpoint);
  }
});

if (missingEndpoints.length > 0) {
  console.log('\n⚠️  Missing endpoints detected. Please ensure all Admin Hub API endpoints are added to server.js');
  process.exit(1);
}

console.log('\n✅ All API endpoints found');

// Check environment variables
console.log('\n🔑 Checking environment variables...');

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, 'utf8');
  
  const requiredVars = ['API_KEY', 'DATABASE_URL'];
  requiredVars.forEach(varName => {
    if (envContent.includes(varName)) {
      console.log(`✅ ${varName}`);
    } else {
      console.log(`❌ ${varName} - Required for Admin Hub authentication`);
    }
  });
} else {
  console.log('⚠️  .env file not found - make sure to set API_KEY for Admin Hub access');
}

console.log('\n🚀 Setup Complete!');
console.log('\n📋 Next Steps:');
console.log('1. Start your server: npm start');
console.log('2. Open Admin Hub: http://localhost:3000/admin-hub');
console.log('3. Use your API_KEY in the browser console or add it to the HTML file');
console.log('\n💡 Tip: Add this to your browser console to set the API key:');
console.log('   localStorage.setItem("admin_api_key", "your_api_key_here")');

console.log('\n🎯 Admin Hub Features:');
console.log('• 📊 Business Overview - Revenue, clients, calls, conversion rates');
console.log('• 👥 Client Management - All clients with performance metrics');
console.log('• 📞 Call Management - Live calls, queue, recent activity');
console.log('• 📈 Analytics - Conversion funnels, peak hours, client performance');
console.log('• ⚙️ System Health - Server status, errors, performance');
console.log('• 🔧 Quick Actions - Create client, import leads, view reports');

console.log('\n✨ Your unified business CRM is ready!');
