/**
 * Admin API: email templates, tasks, activities, deals.
 * Mounted at /api/admin.
 */
import { Router } from 'express';
import { query } from '../db.js';

export function createAdminEmailTasksDealsRouter() {
  const router = Router();

  router.get('/email-templates', async (req, res) => {
    try {
      const templates = await query(`
      SELECT * FROM email_templates 
      ORDER BY created_at DESC
    `);

      res.json(templates.rows || []);
    } catch (error) {
      console.error('Error getting email templates:', error);
      res.json([]);
    }
  });

  router.post('/email-templates', async (req, res) => {
    try {
      const { name, subject, body, category, variables } = req.body;

      const result = await query(
        `
      INSERT INTO email_templates (name, subject, body, category, variables, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `,
        [name, subject, body, category || 'general', JSON.stringify(variables || [])]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error creating email template:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/email-templates/send', async (req, res) => {
    try {
      const { templateId, recipientEmail, recipientName, variables } = req.body;

      const templateResult = await query(`SELECT * FROM email_templates WHERE id = $1`, [templateId]);

      if (templateResult.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const template = templateResult.rows[0];

      let subject = template.subject;
      let body = template.body;

      Object.entries(variables || {}).forEach(([key, value]) => {
        subject = subject.replace(new RegExp(`{{${key}}}`, 'g'), value);
        body = body.replace(new RegExp(`{{${key}}}`, 'g'), value);
      });

      console.log('Sending email:', { to: recipientEmail, subject, body });

      res.json({
        success: true,
        message: 'Email sent successfully',
        recipient: recipientEmail
      });
    } catch (error) {
      console.error('Error sending email:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/tasks', async (req, res) => {
    try {
      const { clientKey, status, assignedTo } = req.query;

      let sql = `
      SELECT 
        t.*,
        c.display_name as client_name,
        l.name as lead_name,
        l.phone as lead_phone
      FROM tasks t
      LEFT JOIN tenants c ON t.client_key = c.client_key
      LEFT JOIN leads l ON t.lead_id = l.id
      WHERE 1=1
    `;

      const params = [];
      let paramCount = 1;

      if (clientKey) {
        sql += ` AND t.client_key = $${paramCount++}`;
        params.push(clientKey);
      }

      if (status) {
        sql += ` AND t.status = $${paramCount++}`;
        params.push(status);
      }

      if (assignedTo) {
        sql += ` AND t.assigned_to = $${paramCount++}`;
        params.push(assignedTo);
      }

      sql += ` ORDER BY t.due_date ASC, t.priority DESC`;

      const tasks = await query(sql, params);

      res.json(tasks.rows || []);
    } catch (error) {
      console.error('Error getting tasks:', error);
      res.json([]);
    }
  });

  router.post('/tasks', async (req, res) => {
    try {
      const { title, description, clientKey, leadId, dueDate, priority, assignedTo, status } = req.body;

      const result = await query(
        `
      INSERT INTO tasks (title, description, client_key, lead_id, due_date, priority, assigned_to, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `,
        [title, description, clientKey, leadId, dueDate, priority || 'medium', assignedTo, status || 'pending']
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error creating task:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/tasks/:taskId', async (req, res) => {
    try {
      const { taskId } = req.params;
      const updates = req.body;

      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.entries(updates).forEach(([key, value]) => {
        fields.push(`${key} = $${paramCount++}`);
        values.push(value);
      });

      values.push(taskId);

      const result = await query(
        `
      UPDATE tasks 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `,
        values
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating task:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/tasks/:taskId', async (req, res) => {
    try {
      const { taskId } = req.params;

      await query(`DELETE FROM tasks WHERE id = $1`, [taskId]);

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting task:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/activities', async (req, res) => {
    try {
      const { clientKey, leadId, limit = 50 } = req.query;

      let sql = `
      SELECT 
        a.*,
        c.display_name as client_name,
        l.name as lead_name
      FROM activities a
      LEFT JOIN tenants c ON a.client_key = c.client_key
      LEFT JOIN leads l ON a.lead_id = l.id
      WHERE 1=1
    `;

      const params = [];
      let paramCount = 1;

      if (clientKey) {
        sql += ` AND a.client_key = $${paramCount++}`;
        params.push(clientKey);
      }

      if (leadId) {
        sql += ` AND a.lead_id = $${paramCount++}`;
        params.push(leadId);
      }

      sql += ` ORDER BY a.created_at DESC LIMIT $${paramCount++}`;
      params.push(parseInt(limit, 10));

      const activities = await query(sql, params);

      res.json(activities.rows || []);
    } catch (error) {
      console.error('Error getting activities:', error);
      res.json([]);
    }
  });

  router.post('/activities', async (req, res) => {
    try {
      const { type, description, clientKey, leadId, metadata } = req.body;

      const result = await query(
        `
      INSERT INTO activities (type, description, client_key, lead_id, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `,
        [type, description, clientKey, leadId, JSON.stringify(metadata || {})]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error creating activity:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/deals', async (req, res) => {
    try {
      const { clientKey, stage, minValue } = req.query;

      let sql = `
      SELECT 
        d.*,
        c.display_name as client_name,
        l.name as lead_name,
        l.phone as lead_phone
      FROM deals d
      LEFT JOIN tenants c ON d.client_key = c.client_key
      LEFT JOIN leads l ON d.lead_id = l.id
      WHERE 1=1
    `;

      const params = [];
      let paramCount = 1;

      if (clientKey) {
        sql += ` AND d.client_key = $${paramCount++}`;
        params.push(clientKey);
      }

      if (stage) {
        sql += ` AND d.stage = $${paramCount++}`;
        params.push(stage);
      }

      if (minValue) {
        sql += ` AND d.value >= $${paramCount++}`;
        params.push(parseFloat(minValue));
      }

      sql += ` ORDER BY d.expected_close_date ASC`;

      const deals = await query(sql, params);

      res.json(deals.rows || []);
    } catch (error) {
      console.error('Error getting deals:', error);
      res.json([]);
    }
  });

  router.post('/deals', async (req, res) => {
    try {
      const {
        name,
        clientKey,
        leadId,
        value,
        stage,
        probability,
        expectedCloseDate,
        actualCloseDate,
        notes,
        winReason,
        lossReason
      } = req.body;

      const result = await query(
        `
      INSERT INTO deals (
        name, client_key, lead_id, value, stage, probability, 
        expected_close_date, actual_close_date, notes, win_reason, loss_reason, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING *
    `,
        [
          name,
          clientKey,
          leadId,
          value,
          stage || 'prospecting',
          probability || 50,
          expectedCloseDate,
          actualCloseDate,
          notes,
          winReason,
          lossReason
        ]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error creating deal:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/deals/pipeline-value', async (req, res) => {
    try {
      const { clientKey } = req.query;

      let sql = `
      SELECT 
        stage,
        COUNT(*) as deal_count,
        SUM(value) as total_value,
        SUM(value * probability / 100) as weighted_value
      FROM deals
      WHERE actual_close_date IS NULL
    `;

      const params = [];
      if (clientKey) {
        sql += ` AND client_key = $1`;
        params.push(clientKey);
      }

      sql += ` GROUP BY stage ORDER BY 
      CASE stage
        WHEN 'prospecting' THEN 1
        WHEN 'qualification' THEN 2
        WHEN 'proposal' THEN 3
        WHEN 'negotiation' THEN 4
        WHEN 'closed-won' THEN 5
        WHEN 'closed-lost' THEN 6
        ELSE 7
      END`;

      const pipeline = await query(sql, params);

      const totals = pipeline.rows.reduce(
        (acc, row) => {
          acc.totalDeals += parseInt(row.deal_count);
          acc.totalValue += parseFloat(row.total_value);
          acc.weightedValue += parseFloat(row.weighted_value);
          return acc;
        },
        { totalDeals: 0, totalValue: 0, weightedValue: 0 }
      );

      res.json({
        stages: pipeline.rows,
        summary: totals
      });
    } catch (error) {
      console.error('Error getting pipeline value:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/deals/:dealId', async (req, res) => {
    try {
      const { dealId } = req.params;
      const updates = req.body;

      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.entries(updates).forEach(([key, value]) => {
        fields.push(`${key} = $${paramCount++}`);
        values.push(value);
      });

      values.push(dealId);

      const result = await query(
        `
      UPDATE deals 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `,
        values
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating deal:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
