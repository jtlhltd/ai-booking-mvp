/**
 * Admin API: users, audit logs, notifications, system metrics/health, workflows.
 * Mounted at /api/admin.
 */
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db.js';

async function checkDatabaseHealth() {
  try {
    await query('SELECT 1');
    return 'healthy';
  } catch {
    return 'unhealthy';
  }
}

/**
 * @param {{ io: import('socket.io').Server }} opts
 */
export function createAdminOperationsRouter({ io }) {
  const router = Router();

  router.get('/users', async (req, res) => {
    try {
      const users = await query(`
      SELECT * FROM user_accounts 
      ORDER BY created_at DESC
    `);

      res.json(users.rows || []);
    } catch (error) {
      console.error('Error getting users:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/users', async (req, res) => {
    try {
      const { username, email, role, password } = req.body;

      if (!username || !email || !role) {
        return res.status(400).json({ error: 'Username, email, and role are required' });
      }

      const hashedPassword = await bcrypt.hash(password || 'defaultpassword', 10);

      const result = await query(
        `
      INSERT INTO user_accounts (username, email, role, password_hash, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `,
        [username, email, role, hashedPassword]
      );

      res.json({ success: true, user: result.rows[0] });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/audit-logs', async (req, res) => {
    try {
      const { limit = 100, offset = 0, action, userId } = req.query;

      let queryStr = `
      SELECT al.*, ua.username 
      FROM audit_logs al
      LEFT JOIN user_accounts ua ON al.user_id = ua.id
      WHERE 1=1
    `;
      const params = [];
      let paramCount = 0;

      if (action) {
        paramCount++;
        queryStr += ` AND al.action = $${paramCount}`;
        params.push(action);
      }

      if (userId) {
        paramCount++;
        queryStr += ` AND al.user_id = $${paramCount}`;
        params.push(userId);
      }

      queryStr += ` ORDER BY al.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      params.push(parseInt(limit), parseInt(offset));

      const logs = await query(queryStr, params);

      res.json({
        logs: logs.rows || [],
        total: logs.rows?.length || 0,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      console.error('Error getting audit logs:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/notifications', async (req, res) => {
    try {
      const notifications = await query(`
      SELECT * FROM notifications 
      WHERE is_read = false
      ORDER BY created_at DESC
      LIMIT 50
    `);

      res.json(notifications.rows || []);
    } catch (error) {
      console.error('Error getting notifications:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/notifications/:id/read', async (req, res) => {
    try {
      const { id } = req.params;

      await query(
        `
      UPDATE notifications 
      SET is_read = true, read_at = NOW()
      WHERE id = $1
    `,
        [id]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/system/metrics', async (req, res) => {
    try {
      const metrics = {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        cpu: process.cpuUsage(),
        timestamp: new Date().toISOString()
      };

      res.json(metrics);
    } catch (error) {
      console.error('Error getting system metrics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/system/health-check', async (req, res) => {
    try {
      const clientCount = io?.engine?.clientsCount ?? 0;
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: await checkDatabaseHealth(),
          websocket: clientCount > 0 ? 'connected' : 'disconnected',
          api: 'operational'
        },
        metrics: {
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime(),
          activeConnections: clientCount
        }
      };

      res.json(health);
    } catch (error) {
      console.error('Error performing health check:', error);
      res.status(500).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  router.get('/workflows', async (req, res) => {
    try {
      const workflows = await query(`
      SELECT 
        w.*,
        COUNT(DISTINCT e.id) as execution_count,
        MAX(e.executed_at) as last_executed
      FROM workflows w
      LEFT JOIN workflow_executions e ON w.id = e.workflow_id
      GROUP BY w.id
      ORDER BY w.created_at DESC
    `);

      res.json(workflows.rows || []);
    } catch (error) {
      console.error('Error getting workflows:', error);
      res.json([]);
    }
  });

  router.post('/workflows', async (req, res) => {
    try {
      const { name, trigger, actions, is_active } = req.body;

      const result = await query(
        `
      INSERT INTO workflows (name, trigger_type, trigger_config, actions, is_active, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `,
        [name, trigger.type, JSON.stringify(trigger.config), JSON.stringify(actions), is_active !== false]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error creating workflow:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
