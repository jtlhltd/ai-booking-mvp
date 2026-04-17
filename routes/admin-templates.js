/**
 * Admin API: reusable templates (follow-up + reporting).
 * Mounted at /api/admin — paths here are /follow-ups/templates and /reports/templates.
 */
import { Router } from 'express';
import { query } from '../db.js';

export function createAdminTemplatesRouter() {
  const router = Router();

  // Follow-up templates
  router.get('/follow-ups/templates', async (req, res) => {
    try {
      const { clientKey, templateType } = req.query;

      let queryStr = `
      SELECT * FROM follow_up_templates
      WHERE is_active = true
    `;
      const params = [];
      let paramCount = 0;

      if (clientKey) {
        queryStr += ` AND client_key = $${++paramCount}`;
        params.push(clientKey);
      }

      if (templateType) {
        queryStr += ` AND template_type = $${++paramCount}`;
        params.push(templateType);
      }

      queryStr += ` ORDER BY usage_count DESC, created_at DESC`;

      const templates = await query(queryStr, params);

      res.json(
        templates.rows.map((template) => ({
          id: template.id,
          name: template.name,
          templateType: template.template_type,
          subject: template.subject,
          content: template.content,
          variables: template.variables,
          clientKey: template.client_key,
          usageCount: template.usage_count,
          successRate: parseFloat(template.success_rate) || 0,
          createdAt: template.created_at,
          updatedAt: template.updated_at
        }))
      );
    } catch (error) {
      console.error('Error getting follow-up templates:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/follow-ups/templates', async (req, res) => {
    try {
      const {
        name,
        templateType,
        subject,
        content,
        variables = {},
        clientKey = 'default'
      } = req.body;

      if (!name || !templateType || !content) {
        return res.status(400).json({ error: 'Name, type, and content are required' });
      }

      const result = await query(
        `
      INSERT INTO follow_up_templates
      (name, template_type, subject, content, variables, client_key)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
        [name, templateType, subject, content, variables, clientKey]
      );

      res.json({
        success: true,
        template: result.rows[0],
        message: 'Follow-up template created successfully'
      });
    } catch (error) {
      console.error('Error creating follow-up template:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Report templates
  router.get('/reports/templates', async (req, res) => {
    try {
      const { category, templateType } = req.query;

      let queryStr = `
      SELECT * FROM report_templates
      WHERE 1=1
    `;
      const params = [];
      let paramCount = 0;

      if (category) {
        queryStr += ` AND category = $${++paramCount}`;
        params.push(category);
      }

      if (templateType) {
        queryStr += ` AND template_type = $${++paramCount}`;
        params.push(templateType);
      }

      queryStr += ` ORDER BY usage_count DESC, created_at DESC`;

      const templates = await query(queryStr, params);

      res.json(
        templates.rows.map((template) => ({
          id: template.id,
          name: template.name,
          description: template.description,
          templateType: template.template_type,
          category: template.category,
          config: template.config,
          isSystem: template.is_system,
          usageCount: template.usage_count,
          createdBy: template.created_by,
          createdAt: template.created_at,
          updatedAt: template.updated_at
        }))
      );
    } catch (error) {
      console.error('Error getting report templates:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/reports/templates', async (req, res) => {
    try {
      const { name, description, templateType, category, config = {}, createdBy = 'admin' } = req.body;

      if (!name || !templateType || !category) {
        return res.status(400).json({ error: 'Name, type, and category are required' });
      }

      const result = await query(
        `
      INSERT INTO report_templates
      (name, description, template_type, category, config, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
        [name, description, templateType, category, config, createdBy]
      );

      res.json({
        success: true,
        template: result.rows[0],
        message: 'Report template created successfully'
      });
    } catch (error) {
      console.error('Error creating report template:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

