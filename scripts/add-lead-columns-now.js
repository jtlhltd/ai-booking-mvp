// scripts/add-lead-columns-now.js
// Quick script to add missing lead columns to database
// Run with: node scripts/add-lead-columns-now.js

import { query } from '../db.js';

async function addMissingColumns() {
  console.log('🔧 Adding missing lead columns...\n');

  const columns = [
    {
      name: 'email',
      sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT;`,
      index: `CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);`
    },
    {
      name: 'tags',
      sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags TEXT;`,
      index: `CREATE INDEX IF NOT EXISTS idx_leads_tags ON leads(tags);`
    },
    {
      name: 'score',
      sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 50;`,
      index: `CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score);`
    },
    {
      name: 'custom_fields',
      sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;`,
      index: null // JSONB columns don't need separate index
    },
    {
      name: 'last_contacted_at',
      sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;`,
      index: `CREATE INDEX IF NOT EXISTS idx_leads_last_contacted ON leads(last_contacted_at);`
    },
    {
      name: 'updated_at',
      sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`,
      index: null
    }
  ];

  try {
    // Check current columns
    console.log('📊 Checking current leads table structure...');
    const currentColumns = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'leads'
      ORDER BY column_name;
    `);

    console.log(`\nCurrent columns (${currentColumns.rows.length}):`);
    currentColumns.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });

    // Add missing columns
    console.log('\n🔨 Adding missing columns...\n');
    let added = 0;
    let skipped = 0;

    for (const col of columns) {
      try {
        // Check if column exists
        const exists = currentColumns.rows.some(c => c.column_name === col.name);
        
        if (exists) {
          console.log(`⏭️  Column '${col.name}' already exists, skipping...`);
          skipped++;
        } else {
          await query(col.sql);
          console.log(`✅ Added column '${col.name}'`);
          added++;

          // Add index if specified
          if (col.index) {
            try {
              await query(col.index);
              console.log(`   ✅ Added index for '${col.name}'`);
            } catch (idxError) {
              console.log(`   ⚠️  Index for '${col.name}' may already exist: ${idxError.message}`);
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error adding column '${col.name}':`, error.message);
      }
    }

    // Verify final structure
    console.log('\n📊 Verifying final structure...');
    const finalColumns = await query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'leads'
      ORDER BY column_name;
    `);

    console.log(`\n✅ Final columns (${finalColumns.rows.length}):`);
    finalColumns.rows.forEach(col => {
      const defaultVal = col.column_default ? ` (default: ${col.column_default.substring(0, 30)}...)` : '';
      console.log(`  - ${col.column_name} (${col.data_type})${defaultVal}`);
    });

    console.log(`\n🎉 Done! Added ${added} columns, skipped ${skipped} existing columns.`);

    // Check indexes
    console.log('\n📇 Checking indexes...');
    const indexes = await query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'leads'
      ORDER BY indexname;
    `);

    console.log(`\nIndexes (${indexes.rows.length}):`);
    indexes.rows.forEach(idx => {
      console.log(`  - ${idx.indexname}`);
    });

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
addMissingColumns()
  .then(() => {
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

