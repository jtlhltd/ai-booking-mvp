/**
 * Admin API: follow-up sequences, executions, and analytics.
 * Mounted at /api/admin — paths here are /follow-ups/*.
 */
import { Router } from 'express';

/**
 * @param {{ query: (sql: string, params?: any[]) => Promise<{ rows?: any[] }> }} deps
 */
export function createAdminFollowUpsRouter(deps) {
  const { query } = deps || {};
  const router = Router();

  router.get('/follow-ups/sequences', async (req, res) => {
    try {
      const { clientKey } = req.query;

      const sequences = await query(
        `
      SELECT
        fs.*,
        COUNT(fe.id) as execution_count,
        COUNT(CASE WHEN fe.status = 'completed' THEN 1 END) as completed_count
      FROM follow_up_sequences fs
      LEFT JOIN follow_up_executions fe ON fs.id = fe.sequence_id
      WHERE fs.client_key = $1 OR $1 IS NULL
      GROUP BY fs.id
      ORDER BY fs.priority DESC, fs.created_at ASC
    `,
        [clientKey]
      );

      res.json(
        sequences.rows.map((seq) => ({
          id: seq.id,
          name: seq.name,
          description: seq.description,
          triggerType: seq.trigger_type,
          triggerConditions: seq.trigger_conditions,
          isActive: seq.is_active,
          priority: seq.priority,
          clientKey: seq.client_key,
          executionCount: parseInt(seq.execution_count) || 0,
          completedCount: parseInt(seq.completed_count) || 0,
          completionRate:
            seq.execution_count > 0
              ? ((parseInt(seq.completed_count) / parseInt(seq.execution_count)) * 100).toFixed(1)
              : 0,
          createdAt: seq.created_at,
          updatedAt: seq.updated_at
        }))
      );
    } catch (error) {
      console.error('Error getting follow-up sequences:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/follow-ups/sequences', async (req, res) => {
    try {
      const { name, description, triggerType, triggerConditions, priority = 0, clientKey = 'default' } = req.body;

      if (!name || !triggerType) {
        return res.status(400).json({ error: 'Name and trigger type are required' });
      }

      const result = await query(
        `
      INSERT INTO follow_up_sequences
      (name, description, trigger_type, trigger_conditions, priority, client_key)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
        [name, description, triggerType, triggerConditions, priority, clientKey]
      );

      res.json({
        success: true,
        sequence: result.rows[0],
        message: 'Follow-up sequence created successfully'
      });
    } catch (error) {
      console.error('Error creating follow-up sequence:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/follow-ups/sequences/:sequenceId/steps', async (req, res) => {
    try {
      const { sequenceId } = req.params;

      const steps = await query(
        `
      SELECT * FROM follow_up_steps
      WHERE sequence_id = $1
      ORDER BY step_order ASC
    `,
        [sequenceId]
      );

      res.json(
        steps.rows.map((step) => ({
          id: step.id,
          sequenceId: step.sequence_id,
          stepOrder: step.step_order,
          stepType: step.step_type,
          delayHours: step.delay_hours,
          delayDays: step.delay_days,
          subject: step.subject,
          content: step.content,
          templateVariables: step.template_variables,
          conditions: step.conditions,
          isActive: step.is_active,
          createdAt: step.created_at
        }))
      );
    } catch (error) {
      console.error('Error getting sequence steps:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/follow-ups/sequences/:sequenceId/steps', async (req, res) => {
    try {
      const { sequenceId } = req.params;
      const {
        stepOrder,
        stepType,
        delayHours = 0,
        delayDays = 0,
        subject,
        content,
        templateVariables = {},
        conditions = {}
      } = req.body;

      if (!stepOrder || !stepType || !content) {
        return res.status(400).json({ error: 'Step order, type, and content are required' });
      }

      const result = await query(
        `
      INSERT INTO follow_up_steps
      (sequence_id, step_order, step_type, delay_hours, delay_days, subject, content, template_variables, conditions)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `,
        [sequenceId, stepOrder, stepType, delayHours, delayDays, subject, content, templateVariables, conditions]
      );

      res.json({
        success: true,
        step: result.rows[0],
        message: 'Follow-up step created successfully'
      });
    } catch (error) {
      console.error('Error creating follow-up step:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/follow-ups/executions', async (req, res) => {
    try {
      const { clientKey, status, limit = 50 } = req.query;

      let queryStr = `
      SELECT
        fe.*,
        fs.name as sequence_name,
        l.name as lead_name,
        l.phone as lead_phone,
        l.email as lead_email,
        t.display_name as client_name
      FROM follow_up_executions fe
      JOIN follow_up_sequences fs ON fe.sequence_id = fs.id
      JOIN leads l ON fe.lead_id = l.id
      JOIN tenants t ON fe.client_key = t.client_key
      WHERE 1=1
    `;
      const params = [];
      let paramCount = 0;

      if (clientKey) {
        queryStr += ` AND fe.client_key = $${++paramCount}`;
        params.push(clientKey);
      }

      if (status) {
        queryStr += ` AND fe.status = $${++paramCount}`;
        params.push(status);
      }

      queryStr += ` ORDER BY fe.started_at DESC LIMIT $${++paramCount}`;
      params.push(limit);

      const executions = await query(queryStr, params);

      res.json(
        executions.rows.map((exec) => ({
          id: exec.id,
          sequenceId: exec.sequence_id,
          sequenceName: exec.sequence_name,
          leadId: exec.lead_id,
          leadName: exec.lead_name,
          leadPhone: exec.lead_phone,
          leadEmail: exec.lead_email,
          clientKey: exec.client_key,
          clientName: exec.client_name,
          triggerData: exec.trigger_data,
          status: exec.status,
          currentStep: exec.current_step,
          startedAt: exec.started_at,
          completedAt: exec.completed_at,
          lastExecutedAt: exec.last_executed_at,
          executionData: exec.execution_data,
          createdAt: exec.created_at
        }))
      );
    } catch (error) {
      console.error('Error getting follow-up executions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/follow-ups/trigger', async (req, res) => {
    try {
      const { leadId, clientKey, triggerType, triggerData = {} } = req.body;

      if (!leadId || !triggerType) {
        return res.status(400).json({ error: 'Lead ID and trigger type are required' });
      }

      const result = await query(
        `
      SELECT trigger_follow_up_sequence($1, $2, $3, $4) as execution_id
    `,
        [leadId, clientKey || 'default', triggerType, JSON.stringify(triggerData)]
      );

      const executionId = result.rows[0].execution_id;

      if (executionId) {
        res.json({
          success: true,
          executionId,
          message: 'Follow-up sequence triggered successfully'
        });
      } else {
        res.json({
          success: false,
          message: 'No matching sequence found or sequence already active'
        });
      }
    } catch (error) {
      console.error('Error triggering follow-up sequence:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/follow-ups/process', async (req, res) => {
    try {
      const result = await query('SELECT process_pending_follow_up_steps() as processed_count');
      const processedCount = result.rows[0].processed_count;

      res.json({
        success: true,
        processedCount,
        message: `Processed ${processedCount} pending follow-up steps`
      });
    } catch (error) {
      console.error('Error processing follow-up steps:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/follow-ups/analytics', async (req, res) => {
    try {
      const { clientKey, daysBack = 30 } = req.query;

      const analyticsResult = await query(
        `
      SELECT get_follow_up_analytics($1, $2) as analytics
    `,
        [clientKey || 'default', daysBack]
      );

      const analytics = analyticsResult.rows[0].analytics;

      const detailedAnalytics = await query(
        `
      SELECT
        fs.name as sequence_name,
        COUNT(fe.id) as total_executions,
        COUNT(CASE WHEN fe.status = 'completed' THEN 1 END) as completed_executions,
        COUNT(fse.id) as total_steps,
        COUNT(CASE WHEN fse.status = 'sent' THEN 1 END) as sent_steps,
        COUNT(CASE WHEN fse.status = 'failed' THEN 1 END) as failed_steps,
        AVG(CASE WHEN fe.completed_at IS NOT NULL THEN EXTRACT(EPOCH FROM (fe.completed_at - fe.started_at))/3600 END) as avg_completion_hours
      FROM follow_up_sequences fs
      LEFT JOIN follow_up_executions fe ON fs.id = fe.sequence_id
      LEFT JOIN follow_up_step_executions fse ON fe.id = fse.execution_id
      WHERE fs.client_key = $1
      AND fe.created_at >= NOW() - INTERVAL '1 day' * $2
      GROUP BY fs.id, fs.name
      ORDER BY total_executions DESC
    `,
        [clientKey || 'default', daysBack]
      );

      res.json({
        overview: {
          totalSequences: parseInt(analytics.total_sequences) || 0,
          activeExecutions: parseInt(analytics.active_executions) || 0,
          completedExecutions: parseInt(analytics.completed_executions) || 0,
          totalStepsSent: parseInt(analytics.total_steps_sent) || 0,
          totalStepsFailed: parseInt(analytics.total_steps_failed) || 0,
          avgCompletionRate: parseFloat(analytics.avg_completion_rate) || 0,
          avgResponseRate: parseFloat(analytics.avg_response_rate) || 0
        },
        sequencePerformance: detailedAnalytics.rows.map((row) => ({
          sequenceName: row.sequence_name,
          totalExecutions: parseInt(row.total_executions) || 0,
          completedExecutions: parseInt(row.completed_executions) || 0,
          totalSteps: parseInt(row.total_steps) || 0,
          sentSteps: parseInt(row.sent_steps) || 0,
          failedSteps: parseInt(row.failed_steps) || 0,
          completionRate:
            row.total_executions > 0
              ? ((parseInt(row.completed_executions) / parseInt(row.total_executions)) * 100).toFixed(1)
              : 0,
          avgCompletionHours: parseFloat(row.avg_completion_hours) || 0
        }))
      });
    } catch (error) {
      console.error('Error getting follow-up analytics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

