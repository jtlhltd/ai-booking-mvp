// lib/migration-runner.js
// Automated database migration runner

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run all pending database migrations
 * @returns {Promise<Object>} - Migration result
 */
export async function runMigrations() {
  try {
    console.log('[MIGRATIONS] Starting migration check...');
    
    // Create migrations tracking table if not exists
    await query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    // Get already applied migrations
    const appliedResult = await query('SELECT name FROM migrations ORDER BY applied_at');
    const appliedNames = new Set(appliedResult.rows.map(r => r.name));
    
    console.log(`[MIGRATIONS] ${appliedNames.size} migrations already applied`);
    
    // Read migration files from migrations/ directory
    const migrationDir = path.join(process.cwd(), 'migrations');
    
    // Check if migrations directory exists
    try {
      await fs.access(migrationDir);
    } catch (error) {
      console.log('[MIGRATIONS] No migrations directory found - skipping');
      return { applied: 0, skipped: 0, total: 0 };
    }
    
    const files = await fs.readdir(migrationDir);
    const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();
    
    console.log(`[MIGRATIONS] Found ${sqlFiles.length} migration files`);
    
    let applied = 0;
    let skipped = 0;
    
    for (const file of sqlFiles) {
      if (appliedNames.has(file)) {
        skipped++;
        console.log(`[MIGRATIONS] ⏭️  Skipping ${file} (already applied)`);
        continue;
      }
      
      try {
        console.log(`[MIGRATIONS] 🔄 Running ${file}...`);
        
        // Read migration file
        const filePath = path.join(migrationDir, file);
        const sql = await fs.readFile(filePath, 'utf-8');
        
        // Execute migration (split by semicolon for multiple statements)
        const statements = sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith('--'));
        
        console.log(`[MIGRATIONS] Executing ${statements.length} statements from ${file}`);
        
        for (let i = 0; i < statements.length; i++) {
          const statement = statements[i];
          console.log(`[MIGRATIONS] Statement ${i + 1}/${statements.length}: ${statement.substring(0, 100)}...`);
          try {
            await query(statement);
          } catch (stmtError) {
            console.error(`[MIGRATIONS] ❌ Statement ${i + 1} failed:`, statement.substring(0, 200));
            throw stmtError;
          }
        }
        
        // Mark as applied
        await query('INSERT INTO migrations (name) VALUES ($1)', [file]);
        
        applied++;
        console.log(`[MIGRATIONS] ✅ ${file} applied successfully`);
        
      } catch (error) {
        console.error(`[MIGRATIONS] ❌ Failed to apply ${file}:`, error.message);
        console.error('[MIGRATIONS] Migration stopped at first error');
        throw error; // Stop on first error
      }
    }
    
    console.log(`[MIGRATIONS] Complete: ${applied} applied, ${skipped} skipped, ${sqlFiles.length} total`);
    
    return {
      applied,
      skipped,
      total: sqlFiles.length,
      success: true
    };
    
  } catch (error) {
    console.error('[MIGRATIONS] Error running migrations:', error);
    return {
      applied: 0,
      skipped: 0,
      total: 0,
      success: false,
      error: error.message
    };
  }
}

/**
 * Get migration status
 * @returns {Promise<Object>} - Status of all migrations
 */
export async function getMigrationStatus() {
  try {
    const appliedResult = await query(`
      SELECT name, applied_at 
      FROM migrations 
      ORDER BY applied_at DESC
    `);
    
    const migrationDir = path.join(process.cwd(), 'migrations');
    const files = await fs.readdir(migrationDir);
    const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();
    
    const appliedNames = new Set(appliedResult.rows.map(r => r.name));
    
    const status = sqlFiles.map(file => ({
      name: file,
      applied: appliedNames.has(file),
      appliedAt: appliedResult.rows.find(r => r.name === file)?.applied_at || null
    }));
    
    return {
      total: sqlFiles.length,
      applied: appliedResult.rows.length,
      pending: sqlFiles.length - appliedResult.rows.length,
      migrations: status
    };
    
  } catch (error) {
    console.error('[MIGRATION STATUS] Error:', error);
    return { error: error.message };
  }
}

export default {
  runMigrations,
  getMigrationStatus
};

