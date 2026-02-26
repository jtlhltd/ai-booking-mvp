// run-migration.js
// Run database migrations for Postgres (used by Render)
import 'dotenv/config';
import { init } from './db.js';
import { runMigrations } from './lib/migration-runner.js';

async function main() {
  console.log('🔄 Starting database migrations for Render...');
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }
  
  try {
    await init();
    // Use the migration runner which handles all migrations
    const result = await runMigrations();
    
    console.log('🎉 Migration complete!');
    console.log(`   Applied: ${result.applied}`);
    console.log(`   Skipped: ${result.skipped}`);
    console.log(`   Total: ${result.total}`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

