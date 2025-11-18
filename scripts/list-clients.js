#!/usr/bin/env node

/**
 * List Clients Script
 * 
 * Lists all clients (from database or local files).
 * 
 * Usage: node scripts/list-clients.js [--detailed]
 */

import 'dotenv/config';
import { init, listFullClients } from '../db.js';
import fs from 'fs';
import path from 'path';

const detailed = process.argv.includes('--detailed') || process.argv.includes('-d');

// Initialize database
let dbConnected = false;
try {
  await init();
  dbConnected = true;
} catch (error) {
  console.warn('⚠️  Database not connected, checking local files only\n');
}

/**
 * List all clients
 */
async function listClients() {
  console.log('\n📋 Client List\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const clients = [];
  
  // Load from database
  if (dbConnected) {
    try {
      const dbClients = await listFullClients();
      clients.push(...dbClients.map(c => ({ ...c, source: 'database' })));
    } catch (error) {
      console.warn(`⚠️  Could not load from database: ${error.message}\n`);
    }
  }
  
  // Load from local files
  const demosDir = path.join(process.cwd(), 'demos');
  if (fs.existsSync(demosDir)) {
    const files = fs.readdirSync(demosDir);
    const clientFiles = files.filter(f => f.startsWith('.client-') && f.endsWith('.json'));
    
    for (const file of clientFiles) {
      try {
        const filePath = path.join(demosDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const client = JSON.parse(content);
        const clientKey = file.replace('.client-', '').replace('.json', '');
        
        // Check if already loaded from database
        if (!clients.find(c => c.clientKey === clientKey)) {
          clients.push({ ...client, source: 'file' });
        }
      } catch (error) {
        console.warn(`⚠️  Could not read ${file}: ${error.message}`);
      }
    }
  }
  
  if (clients.length === 0) {
    console.log('No clients found.\n');
    return;
  }
  
  // Sort by creation date or name
  clients.sort((a, b) => {
    const aDate = a.createdAt || 0;
    const bDate = b.createdAt || 0;
    return bDate - aDate;
  });
  
  console.log(`Found ${clients.length} client(s):\n`);
  
  if (detailed) {
    clients.forEach((client, index) => {
      console.log(`${index + 1}. ${client.displayName || client.name || client.clientKey}`);
      console.log(`   Key: ${client.clientKey}`);
      console.log(`   Industry: ${client.industry || '—'}`);
      console.log(`   Services: ${Array.isArray(client.services) ? client.services.join(', ') : (client.services || '—')}`);
      console.log(`   Location: ${client.location || '—'}`);
      console.log(`   Assistant ID: ${client.vapi?.assistantId || client.vapi_json?.assistantId || '—'}`);
      console.log(`   Source: ${client.source || 'unknown'}`);
      console.log(`   Dashboard: ${process.env.PUBLIC_BASE_URL || process.env.BASE_URL || 'https://ai-booking-mvp.onrender.com'}/client-dashboard.html?client=${client.clientKey}`);
      console.log('');
    });
  } else {
    clients.forEach((client, index) => {
      const assistantId = client.vapi?.assistantId || client.vapi_json?.assistantId;
      const assistantStatus = assistantId ? '✅' : '⚠️ ';
      console.log(`${index + 1}. ${assistantStatus} ${client.displayName || client.name || client.clientKey}`);
      console.log(`   Key: ${client.clientKey}`);
      if (client.industry) {
        console.log(`   Industry: ${client.industry}`);
      }
      console.log('');
    });
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`Use "node scripts/show-client.js <clientKey>" for details\n`);
}

await listClients();

