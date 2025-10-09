// run-migration.js
// Run database migrations for Postgres
import 'dotenv/config';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

async function runMigrations() {
  console.log('🔄 Starting database migrations...');
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    // Read migration file
    const migrationFile = path.join(process.cwd(), 'migrations', '001_add_call_quality_fields.sql');
    const migrationSQL = fs.readFileSync(migrationFile, 'utf8');
    
    console.log('📄 Running migration: 001_add_call_quality_fields.sql');
    
    // Run migration
    await pool.query(migrationSQL);
    
    console.log('✅ Migration successful!');
    console.log('✅ Added columns: transcript, sentiment, quality_score, etc.');
    console.log('✅ Created quality_alerts table');
    
    // Verify columns exist
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'calls' 
        AND column_name IN ('transcript', 'sentiment', 'quality_score')
      ORDER BY column_name
    `);
    
    console.log('✅ Verified columns:', result.rows.map(r => r.column_name).join(', '));
    
    await pool.end();
    console.log('🎉 Migration complete!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    await pool.end();
    process.exit(1);
  }
}

runMigrations();

