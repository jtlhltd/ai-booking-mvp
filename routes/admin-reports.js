/**
 * Admin API: reporting endpoints.
 * Mounted at /api/admin — paths here are /reports*.
 */
import { Router } from 'express';

/**
 * @param {{ query: (sql: string, params?: any[]) => Promise<{ rows?: any[] }> }} deps
 */
export function createAdminReportsRouter(deps) {
  const { query } = deps || {};
  const router = Router();

  router.get('/reports', async (req, res) => {
    try {
      const { clientKey, category, reportType } = req.query;

      let queryStr = `
      SELECT
        r.*,
        COUNT(re.id) as execution_count,
        COUNT(CASE WHEN re.status = 'completed' THEN 1 END) as successful_executions,
        MAX(re.last_run_at) as last_execution
      FROM reports r
      LEFT JOIN report_executions re ON r.id = re.report_id
      WHERE 1=1
    `;
      const params = [];
      let paramCount = 0;

      if (clientKey) {
        queryStr += ` AND r.client_key = $${++paramCount}`;
        params.push(clientKey);
      }

      if (category) {
        queryStr += ` AND r.category = $${++paramCount}`;
        params.push(category);
      }

      if (reportType) {
        queryStr += ` AND r.report_type = $${++paramCount}`;
        params.push(reportType);
      }

      queryStr += ` GROUP BY r.id ORDER BY r.created_at DESC`;

      const reports = await query(queryStr, params);

      res.json(
        reports.rows.map((report) => ({
          id: report.id,
          name: report.name,
          description: report.description,
          reportType: report.report_type,
          category: report.category,
          config: report.config,
          filters: report.filters,
          chartConfig: report.chart_config,
          isPublic: report.is_public,
          isScheduled: report.is_scheduled,
          scheduleConfig: report.schedule_config,
          clientKey: report.client_key,
          createdBy: report.created_by,
          executionCount: parseInt(report.execution_count) || 0,
          successfulExecutions: parseInt(report.successful_executions) || 0,
          lastRunAt: report.last_run_at,
          lastExecution: report.last_execution,
          createdAt: report.created_at,
          updatedAt: report.updated_at
        }))
      );
    } catch (error) {
      console.error('Error getting reports:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/reports', async (req, res) => {
    try {
      const {
        name,
        description,
        reportType,
        category,
        config = {},
        filters = {},
        chartConfig = {},
        isPublic = false,
        isScheduled = false,
        scheduleConfig = {},
        clientKey = 'default',
        createdBy = 'admin'
      } = req.body;

      if (!name || !reportType || !category) {
        return res.status(400).json({ error: 'Name, type, and category are required' });
      }

      const result = await query(
        `
      INSERT INTO reports
      (name, description, report_type, category, config, filters, chart_config, is_public, is_scheduled, schedule_config, client_key, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `,
        [name, description, reportType, category, config, filters, chartConfig, isPublic, isScheduled, scheduleConfig, clientKey, createdBy]
      );

      res.json({
        success: true,
        report: result.rows[0],
        message: 'Report created successfully'
      });
    } catch (error) {
      console.error('Error creating report:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/reports/:reportId/execute', async (req, res) => {
    try {
      const { reportId } = req.params;
      const { startDate, endDate, filters = {} } = req.query;

      const executionResult = await query(
        `
      INSERT INTO report_executions
      (report_id, execution_type, status, started_at, created_by)
      VALUES ($1, 'manual', 'running', NOW(), 'admin')
      RETURNING *
    `,
        [reportId]
      );

      const executionId = executionResult.rows[0].id;

      const reportDataResult = await query(
        `
      SELECT generate_report_data($1, $2::DATE, $3::DATE, $4) as data
    `,
        [reportId, startDate, endDate, JSON.stringify(filters)]
      );

      const reportData = reportDataResult.rows[0].data;

      await query(
        `
      UPDATE report_executions
      SET
        status = 'completed',
        completed_at = NOW(),
        execution_time_ms = EXTRACT(MILLISECONDS FROM (NOW() - started_at))::INTEGER,
        record_count = $2
      WHERE id = $1
    `,
        [executionId, Object.keys(reportData.metrics || {}).length]
      );

      res.json({
        success: true,
        executionId,
        reportData,
        message: 'Report executed successfully'
      });
    } catch (error) {
      console.error('Error executing report:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // templates are handled in routes/admin-templates.js

  router.get('/reports/executions', async (req, res) => {
    try {
      const { reportId, status, limit = 50 } = req.query;

      let queryStr = `
      SELECT
        re.*,
        r.name as report_name,
        r.category as report_category
      FROM report_executions re
      JOIN reports r ON re.report_id = r.id
      WHERE 1=1
    `;
      const params = [];
      let paramCount = 0;

      if (reportId) {
        queryStr += ` AND re.report_id = $${++paramCount}`;
        params.push(reportId);
      }

      if (status) {
        queryStr += ` AND re.status = $${++paramCount}`;
        params.push(status);
      }

      queryStr += ` ORDER BY re.started_at DESC LIMIT $${++paramCount}`;
      params.push(limit);

      const executions = await query(queryStr, params);

      res.json(
        executions.rows.map((exec) => ({
          id: exec.id,
          reportId: exec.report_id,
          reportName: exec.report_name,
          reportCategory: exec.report_category,
          executionType: exec.execution_type,
          status: exec.status,
          startedAt: exec.started_at,
          completedAt: exec.completed_at,
          executionTimeMs: exec.execution_time_ms,
          recordCount: exec.record_count,
          errorMessage: exec.error_message,
          outputFormat: exec.output_format,
          filePath: exec.file_path,
          createdBy: exec.created_by,
          metadata: exec.metadata
        }))
      );
    } catch (error) {
      console.error('Error getting report executions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/reports/process-scheduled', async (req, res) => {
    try {
      const result = await query('SELECT execute_scheduled_reports() as processed_count');
      const processedCount = result.rows[0].processed_count;

      res.json({
        success: true,
        processedCount,
        message: `Processed ${processedCount} scheduled reports`
      });
    } catch (error) {
      console.error('Error processing scheduled reports:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/reports/analytics', async (req, res) => {
    try {
      const { clientKey, daysBack = 30 } = req.query;

      const analyticsResult = await query(
        `
      SELECT get_report_analytics($1, $2) as analytics
    `,
        [clientKey || 'default', daysBack]
      );

      const analytics = analyticsResult.rows[0].analytics;

      const detailedAnalytics = await query(
        `
      SELECT
        r.category,
        COUNT(*) as report_count,
        COUNT(CASE WHEN r.is_scheduled = true THEN 1 END) as scheduled_count,
        COUNT(re.id) as execution_count,
        COUNT(CASE WHEN re.status = 'completed' THEN 1 END) as successful_executions,
        AVG(re.execution_time_ms) as avg_execution_time
      FROM reports r
      LEFT JOIN report_executions re ON r.id = re.report_id
      WHERE r.client_key = $1
      AND re.started_at >= NOW() - INTERVAL '1 day' * $2
      GROUP BY r.category
      ORDER BY report_count DESC
    `,
        [clientKey || 'default', daysBack]
      );

      res.json({
        overview: {
          totalReports: parseInt(analytics.total_reports) || 0,
          scheduledReports: parseInt(analytics.scheduled_reports) || 0,
          publicReports: parseInt(analytics.public_reports) || 0,
          totalExecutions: parseInt(analytics.total_executions) || 0,
          successfulExecutions: parseInt(analytics.successful_executions) || 0,
          avgExecutionTime: parseFloat(analytics.avg_execution_time) || 0
        },
        categoryPerformance: detailedAnalytics.rows.map((row) => ({
          category: row.category,
          reportCount: parseInt(row.report_count) || 0,
          scheduledCount: parseInt(row.scheduled_count) || 0,
          executionCount: parseInt(row.execution_count) || 0,
          successfulExecutions: parseInt(row.successful_executions) || 0,
          avgExecutionTime: parseFloat(row.avg_execution_time) || 0
        }))
      });
    } catch (error) {
      console.error('Error getting report analytics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/reports/subscriptions', async (req, res) => {
    try {
      const { reportId } = req.query;

      let queryStr = `
      SELECT
        rs.*,
        r.name as report_name
      FROM report_subscriptions rs
      JOIN reports r ON rs.report_id = r.id
      WHERE rs.is_active = true
    `;
      const params = [];
      let paramCount = 0;

      if (reportId) {
        queryStr += ` AND rs.report_id = $${++paramCount}`;
        params.push(reportId);
      }

      queryStr += ` ORDER BY rs.created_at DESC`;

      const subscriptions = await query(queryStr, params);

      res.json(
        subscriptions.rows.map((sub) => ({
          id: sub.id,
          reportId: sub.report_id,
          reportName: sub.report_name,
          subscriberEmail: sub.subscriber_email,
          subscriberName: sub.subscriber_name,
          frequency: sub.frequency,
          deliveryTime: sub.delivery_time,
          isActive: sub.is_active,
          lastDeliveredAt: sub.last_delivered_at,
          deliveryCount: sub.delivery_count,
          createdAt: sub.created_at
        }))
      );
    } catch (error) {
      console.error('Error getting report subscriptions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/reports/subscriptions', async (req, res) => {
    try {
      const { reportId, subscriberEmail, subscriberName, frequency, deliveryTime = '09:00:00' } = req.body;

      if (!reportId || !subscriberEmail || !frequency) {
        return res.status(400).json({ error: 'Report ID, email, and frequency are required' });
      }

      const result = await query(
        `
      INSERT INTO report_subscriptions
      (report_id, subscriber_email, subscriber_name, frequency, delivery_time)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
        [reportId, subscriberEmail, subscriberName, frequency, deliveryTime]
      );

      res.json({
        success: true,
        subscription: result.rows[0],
        message: 'Report subscription created successfully'
      });
    } catch (error) {
      console.error('Error creating report subscription:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

