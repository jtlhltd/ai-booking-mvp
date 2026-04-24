import { Router } from 'express';

export function createPortalPagesRouter() {
  const router = Router();

  router.get('/dashboard/:clientKey', (_req, res) => {
    res.sendFile('public/dashboard-v2.html', { root: '.' });
  });

  router.get('/lead-import.html', (_req, res) => {
    res.sendFile('public/lead-import.html', { root: '.' });
  });

  router.get('/leads', (_req, res) => {
    res.sendFile('public/leads.html', { root: '.' });
  });

  router.get('/lead-testing-dashboard', (_req, res) => {
    res.sendFile('public/leads.html', { root: '.' });
  });

  router.get('/settings/:clientKey', (_req, res) => {
    res.sendFile('public/settings.html', { root: '.' });
  });

  router.get('/privacy.html', (_req, res) => {
    res.sendFile('public/privacy.html', { root: '.' });
  });

  router.get('/privacy', (_req, res) => {
    res.sendFile('public/privacy.html', { root: '.' });
  });

  router.get('/zapier-docs.html', (_req, res) => {
    res.sendFile('public/zapier-docs.html', { root: '.' });
  });

  router.get('/zapier', (_req, res) => {
    res.sendFile('public/zapier-docs.html', { root: '.' });
  });

  // Complete setup endpoint - adds missing columns to make system 100%
  router.get('/complete-setup', async (_req, res) => {
    try {
      console.log('[COMPLETE-SETUP] Running final database setup...');

      const { query } = await import('../db.js');
      const results = [];

      try {
        await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT`);
        results.push('✅ Added email column');
      } catch (e) {
        results.push(`⚠️ Email column: ${e.message}`);
      }

      try {
        await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags TEXT`);
        results.push('✅ Added tags column');
      } catch (e) {
        results.push(`⚠️ Tags column: ${e.message}`);
      }

      try {
        await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 50`);
        results.push('✅ Added score column');
      } catch (e) {
        results.push(`⚠️ Score column: ${e.message}`);
      }

      try {
        await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb`);
        results.push('✅ Added custom_fields column');
      } catch (e) {
        results.push(`⚠️ Custom fields column: ${e.message}`);
      }

      try {
        await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ`);
        results.push('✅ Added last_contacted_at column');
      } catch (e) {
        results.push(`⚠️ Last contacted column: ${e.message}`);
      }

      try {
        await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
        results.push('✅ Added updated_at column');
      } catch (e) {
        results.push(`⚠️ Updated at column: ${e.message}`);
      }

      try {
        await query(`CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email)`);
        results.push('✅ Created email index');
      } catch (e) {
        results.push(`⚠️ Email index: ${e.message}`);
      }

      try {
        await query(`CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC)`);
        results.push('✅ Created score index');
      } catch (e) {
        results.push(`⚠️ Score index: ${e.message}`);
      }

      try {
        await query(`CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source)`);
        results.push('✅ Created source index');
      } catch (e) {
        results.push(`⚠️ Source index: ${e.message}`);
      }

      try {
        await query(`CREATE INDEX IF NOT EXISTS idx_leads_last_contacted ON leads(last_contacted_at)`);
        results.push('✅ Created last_contacted index');
      } catch (e) {
        results.push(`⚠️ Last contacted index: ${e.message}`);
      }

      try {
        await query(`CREATE INDEX IF NOT EXISTS idx_leads_updated ON leads(updated_at DESC)`);
        results.push('✅ Created updated_at index');
      } catch (e) {
        results.push(`⚠️ Updated at index: ${e.message}`);
      }

      const verification = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'leads' 
      ORDER BY ordinal_position
    `);

      console.log('[COMPLETE-SETUP] ✅ Setup complete!');

      res.json({
        success: true,
        message: 'Database setup complete! All features unlocked.',
        results,
        columns: verification.rows,
      });
    } catch (error) {
      console.error('[COMPLETE-SETUP] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Setup failed',
        details: error.message,
      });
    }
  });

  return router;
}

