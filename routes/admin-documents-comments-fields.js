/**
 * Admin API: documents, comments, custom fields.
 * Mounted at /api/admin.
 */
import { Router } from 'express';
import { query } from '../db.js';

export function createAdminDocumentsCommentsFieldsRouter() {
  const router = Router();

  router.get('/documents', async (req, res) => {
    try {
      const { clientKey, leadId, documentType } = req.query;

      let sql = `
      SELECT 
        d.*,
        c.display_name as client_name,
        l.name as lead_name
      FROM documents d
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

      if (leadId) {
        sql += ` AND d.lead_id = $${paramCount++}`;
        params.push(leadId);
      }

      if (documentType) {
        sql += ` AND d.document_type = $${paramCount++}`;
        params.push(documentType);
      }

      sql += ` ORDER BY d.created_at DESC`;

      const documents = await query(sql, params);

      res.json(documents.rows || []);
    } catch (error) {
      console.error('Error getting documents:', error);
      res.json([]);
    }
  });

  router.post('/documents', async (req, res) => {
    try {
      const { filename, fileUrl, clientKey, leadId, documentType, notes } = req.body;

      const result = await query(
        `
      INSERT INTO documents (filename, file_url, client_key, lead_id, document_type, notes, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `,
        [filename, fileUrl, clientKey, leadId, documentType || 'general', notes]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error creating document:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/documents/:documentId', async (req, res) => {
    try {
      const { documentId } = req.params;

      await query(`DELETE FROM documents WHERE id = $1`, [documentId]);

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting document:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/comments', async (req, res) => {
    try {
      const { clientKey, leadId, taskId, dealId } = req.query;

      let sql = `
      SELECT 
        c.*,
        u.username as author_name,
        l.name as lead_name
      FROM comments c
      LEFT JOIN user_accounts u ON c.author_id = u.id
      LEFT JOIN leads l ON c.lead_id = l.id
      WHERE 1=1
    `;

      const params = [];
      let paramCount = 1;

      if (clientKey) {
        sql += ` AND c.client_key = $${paramCount++}`;
        params.push(clientKey);
      }

      if (leadId) {
        sql += ` AND c.lead_id = $${paramCount++}`;
        params.push(leadId);
      }

      if (taskId) {
        sql += ` AND c.task_id = $${paramCount++}`;
        params.push(taskId);
      }

      if (dealId) {
        sql += ` AND c.deal_id = $${paramCount++}`;
        params.push(dealId);
      }

      sql += ` ORDER BY c.created_at ASC`;

      const comments = await query(sql, params);

      res.json(comments.rows || []);
    } catch (error) {
      console.error('Error getting comments:', error);
      res.json([]);
    }
  });

  router.post('/comments', async (req, res) => {
    try {
      const { text, clientKey, leadId, taskId, dealId, mentions, authorId } = req.body;

      const result = await query(
        `
      INSERT INTO comments (text, client_key, lead_id, task_id, deal_id, mentions, author_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `,
        [text, clientKey, leadId, taskId, dealId, JSON.stringify(mentions || []), authorId]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error creating comment:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/comments/:commentId', async (req, res) => {
    try {
      const { commentId } = req.params;
      const { text, mentions } = req.body;

      const result = await query(
        `
      UPDATE comments 
      SET text = $1, mentions = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `,
        [text, JSON.stringify(mentions || []), commentId]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating comment:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/comments/:commentId', async (req, res) => {
    try {
      const { commentId } = req.params;

      await query(`DELETE FROM comments WHERE id = $1`, [commentId]);

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting comment:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/custom-fields', async (req, res) => {
    try {
      const { clientKey, entityType } = req.query;

      let sql = `
      SELECT * FROM custom_fields
      WHERE 1=1
    `;

      const params = [];
      let paramCount = 1;

      if (clientKey) {
        sql += ` AND client_key = $${paramCount++}`;
        params.push(clientKey);
      }

      if (entityType) {
        sql += ` AND entity_type = $${paramCount++}`;
        params.push(entityType);
      }

      sql += ` ORDER BY display_order ASC`;

      const fields = await query(sql, params);

      res.json(fields.rows || []);
    } catch (error) {
      console.error('Error getting custom fields:', error);
      res.json([]);
    }
  });

  router.post('/custom-fields', async (req, res) => {
    try {
      const {
        name,
        fieldType,
        entityType,
        clientKey,
        options,
        isRequired,
        defaultValue,
        displayOrder
      } = req.body;

      const result = await query(
        `
      INSERT INTO custom_fields (
        name, field_type, entity_type, client_key, options, 
        is_required, default_value, display_order, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `,
        [
          name,
          fieldType,
          entityType,
          clientKey,
          JSON.stringify(options || []),
          isRequired || false,
          defaultValue,
          displayOrder || 0
        ]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error creating custom field:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/custom-fields/:fieldId', async (req, res) => {
    try {
      const { fieldId } = req.params;
      const updates = req.body;

      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.entries(updates).forEach(([key, value]) => {
        if (key === 'options') {
          fields.push(`${key} = $${paramCount++}`);
          values.push(JSON.stringify(value));
        } else {
          fields.push(`${key} = $${paramCount++}`);
          values.push(value);
        }
      });

      values.push(fieldId);

      const result = await query(
        `
      UPDATE custom_fields 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `,
        values
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating custom field:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/custom-fields/:fieldId', async (req, res) => {
    try {
      const { fieldId } = req.params;

      await query(`DELETE FROM custom_fields WHERE id = $1`, [fieldId]);

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting custom field:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
