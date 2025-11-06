// scripts/verify-migrations.js
// Verify which migrations have run and which tables/columns exist

import { query } from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function verifyMigrations() {
  console.log('🔍 Verifying database migrations...\n');

  try {
    // Check if we can connect to database
    try {
      await query('SELECT 1');
      console.log('✅ Database connection successful\n');
    } catch (error) {
      console.log('⚠️  Database connection issue (may be using fallback):', error.message);
      console.log('   This is normal for local development without DATABASE_URL set\n');
    }

    // List all migration files
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && !f.endsWith('.disabled'))
      .sort();

    console.log(`📁 Found ${migrationFiles.length} migration files:\n`);
    migrationFiles.forEach((file, idx) => {
      console.log(`  ${idx + 1}. ${file}`);
    });

    // Check key tables
    console.log('\n📊 Checking key tables...\n');
    
    const keyTables = [
      'leads',
      'appointments',
      'messages',
      'inbound_calls',
      'customer_profiles',
      'business_info',
      'business_faqs',
      'appointment_reminders',
      'retry_queue',
      'calls'
    ];

    for (const table of keyTables) {
      try {
        const result = await query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = $1
          ORDER BY ordinal_position;
        `, [table]);

        if (result.rows.length > 0) {
          console.log(`✅ ${table} (${result.rows.length} columns)`);
          // Show key columns
          const keyCols = result.rows
            .filter(c => ['email', 'tags', 'score', 'custom_fields', 'last_contacted_at'].includes(c.column_name))
            .map(c => c.column_name);
          if (keyCols.length > 0) {
            console.log(`   Key columns: ${keyCols.join(', ')}`);
          }
        } else {
          console.log(`❌ ${table} - Table not found`);
        }
      } catch (error) {
        // Table might not exist - that's okay
        if (error.message.includes('does not exist') || error.message.includes('relation')) {
          console.log(`❌ ${table} - Table does not exist`);
        } else {
          console.log(`⚠️  ${table} - Error checking: ${error.message}`);
        }
      }
    }

    // Check leads table columns specifically
    console.log('\n📋 Checking leads table columns...\n');
    try {
      const leadsCols = await query(`
        SELECT column_name, data_type, column_default
        FROM information_schema.columns 
        WHERE table_name = 'leads'
        ORDER BY column_name;
      `);

      if (leadsCols.rows.length > 0) {
        console.log(`Leads table has ${leadsCols.rows.length} columns:\n`);
        leadsCols.rows.forEach(col => {
          const defaultVal = col.column_default ? ` (default: ${col.column_default.substring(0, 20)}...)` : '';
          console.log(`  - ${col.column_name.padEnd(20)} ${col.data_type}${defaultVal}`);
        });

        // Check for missing columns
        const requiredCols = ['email', 'tags', 'score', 'custom_fields', 'last_contacted_at', 'updated_at'];
        const existingCols = leadsCols.rows.map(c => c.column_name);
        const missingCols = requiredCols.filter(c => !existingCols.includes(c));

        if (missingCols.length > 0) {
          console.log(`\n⚠️  Missing columns: ${missingCols.join(', ')}`);
          console.log('   Run: node scripts/add-lead-columns-now.js');
        } else {
          console.log('\n✅ All required columns present!');
        }
      } else {
        console.log('⚠️  Leads table not found or empty');
      }
    } catch (error) {
      console.log('⚠️  Could not check leads table:', error.message);
    }

    console.log('\n✅ Migration verification complete!\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
  }
}

verifyMigrations()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

