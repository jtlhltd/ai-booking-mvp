/**
 * Admin API: social profiles/posts monitoring.
 * Mounted at /api/admin — paths here are /social/*.
 */
import { Router } from 'express';

/**
 * @param {{ query: (sql: string, params?: any[]) => Promise<{ rows?: any[] }> }} deps
 */
export function createAdminSocialRouter(deps) {
  const { query } = deps || {};
  const router = Router();

  router.get('/social/profiles', async (req, res) => {
    try {
      const { clientKey, leadId, platform } = req.query;

      let sql = `
      SELECT
        p.*,
        c.display_name as client_name,
        l.name as lead_name
      FROM social_profiles p
      LEFT JOIN tenants c ON p.client_key = c.client_key
      LEFT JOIN leads l ON p.lead_id = l.id
      WHERE 1=1
    `;

      const params = [];
      let paramCount = 1;

      if (clientKey) {
        sql += ` AND p.client_key = $${paramCount++}`;
        params.push(clientKey);
      }

      if (leadId) {
        sql += ` AND p.lead_id = $${paramCount++}`;
        params.push(leadId);
      }

      if (platform) {
        sql += ` AND p.platform = $${paramCount++}`;
        params.push(platform);
      }

      sql += ` ORDER BY p.last_updated DESC`;

      const profiles = await query(sql, params);
      res.json(profiles.rows || []);
    } catch (error) {
      console.error('Error getting social profiles:', error);
      res.json([]);
    }
  });

  router.post('/social/profiles', async (req, res) => {
    try {
      const { platform, handle, url, clientKey, leadId, metadata } = req.body;

      const result = await query(
        `
      INSERT INTO social_profiles (
        platform, handle, url, client_key, lead_id, metadata, created_at, last_updated
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
    `,
        [platform, handle, url, clientKey, leadId, JSON.stringify(metadata || {})]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error creating social profile:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/social/posts', async (req, res) => {
    try {
      const { clientKey, leadId, platform, limit = 50 } = req.query;

      let sql = `
      SELECT
        p.*,
        c.display_name as client_name,
        l.name as lead_name
      FROM social_posts p
      LEFT JOIN tenants c ON p.client_key = c.client_key
      LEFT JOIN leads l ON p.lead_id = l.id
      WHERE 1=1
    `;

      const params = [];
      let paramCount = 1;

      if (clientKey) {
        sql += ` AND p.client_key = $${paramCount++}`;
        params.push(clientKey);
      }

      if (leadId) {
        sql += ` AND p.lead_id = $${paramCount++}`;
        params.push(leadId);
      }

      if (platform) {
        sql += ` AND p.platform = $${paramCount++}`;
        params.push(platform);
      }

      sql += ` ORDER BY p.posted_at DESC LIMIT $${paramCount++}`;
      params.push(parseInt(limit));

      const posts = await query(sql, params);
      res.json(posts.rows || []);
    } catch (error) {
      console.error('Error getting social posts:', error);
      res.json([]);
    }
  });

  router.post('/social/monitor', async (req, res) => {
    try {
      const { keywords, platforms, clientKey } = req.body;

      // Stubbed integration; preserve existing behavior.
      console.log('Monitoring social media:', { keywords, platforms, clientKey });

      res.json({
        success: true,
        message: 'Social media monitoring started',
        keywords,
        platforms
      });
    } catch (error) {
      console.error('Error starting social monitoring:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/social/sentiment', async (req, res) => {
    try {
      const { clientKey, days = 30 } = req.query;

      let sql = `
      SELECT
        sentiment,
        COUNT(*) as count,
        AVG(sentiment_score) as avg_score
      FROM social_posts
      WHERE posted_at >= NOW() - INTERVAL '${parseInt(days)} days'
    `;

      const params = [];
      if (clientKey) {
        sql += ` AND client_key = $1`;
        params.push(clientKey);
      }

      sql += ` GROUP BY sentiment ORDER BY count DESC`;

      const sentiment = await query(sql, params);

      res.json({
        sentiment: sentiment.rows,
        period: `${days} days`
      });
    } catch (error) {
      console.error('Error getting sentiment:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

