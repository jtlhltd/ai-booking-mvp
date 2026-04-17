/**
 * Admin API: lead scoring automation endpoints.
 * Mounted at /api/admin — paths here are /leads/* and /leads/scoring/*.
 */
import { Router } from 'express';

/**
 * @param {{ query: (sql: string, params?: any[]) => Promise<{ rows?: any[] }> }} deps
 */
export function createAdminLeadScoringRouter(deps) {
  const { query } = deps || {};
  const router = Router();

  // POST /api/admin/leads/:leadId/score
  router.post('/leads/:leadId/score', async (req, res) => {
    try {
      const { leadId } = req.params;

      const result = await query('SELECT calculate_lead_score($1)', [leadId]);
      const newScore = result.rows[0].calculate_lead_score;

      res.json({
        success: true,
        leadId: parseInt(leadId),
        newScore,
        message: 'Lead score updated successfully'
      });
    } catch (error) {
      console.error('Error updating lead score:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/leads/scoring/update-all
  router.post('/leads/scoring/update-all', async (req, res) => {
    try {
      const result = await query('SELECT update_all_lead_scores()');
      const updatedCount = result.rows[0].update_all_lead_scores;

      res.json({
        success: true,
        updatedCount,
        message: `Updated scores for ${updatedCount} leads`
      });
    } catch (error) {
      console.error('Error updating all lead scores:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/admin/leads/scoring/rules
  router.get('/leads/scoring/rules', async (req, res) => {
    try {
      const rules = await query(`
      SELECT * FROM lead_scoring_rules
      WHERE is_active = true
      ORDER BY priority ASC, id ASC
    `);

      res.json(
        rules.rows.map((rule) => ({
          id: rule.id,
          ruleName: rule.rule_name,
          ruleType: rule.rule_type,
          conditionField: rule.condition_field,
          conditionOperator: rule.condition_operator,
          conditionValue: rule.condition_value,
          scoreAdjustment: rule.score_adjustment,
          priority: rule.priority,
          isActive: rule.is_active,
          createdAt: rule.created_at
        }))
      );
    } catch (error) {
      console.error('Error getting scoring rules:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/leads/scoring/rules
  router.post('/leads/scoring/rules', async (req, res) => {
    try {
      const {
        ruleName,
        ruleType,
        conditionField,
        conditionOperator,
        conditionValue,
        scoreAdjustment,
        priority = 0
      } = req.body;

      if (
        !ruleName ||
        !ruleType ||
        !conditionField ||
        !conditionOperator ||
        !conditionValue ||
        scoreAdjustment === undefined
      ) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const result = await query(
        `
      INSERT INTO lead_scoring_rules
      (rule_name, rule_type, condition_field, condition_operator, condition_value, score_adjustment, priority)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
        [ruleName, ruleType, conditionField, conditionOperator, conditionValue, scoreAdjustment, priority]
      );

      res.json({
        success: true,
        rule: result.rows[0],
        message: 'Scoring rule created successfully'
      });
    } catch (error) {
      console.error('Error creating scoring rule:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/admin/leads/scoring/rules/:ruleId
  router.put('/leads/scoring/rules/:ruleId', async (req, res) => {
    try {
      const { ruleId } = req.params;
      const { ruleName, ruleType, conditionField, conditionOperator, conditionValue, scoreAdjustment, priority, isActive } =
        req.body;

      const result = await query(
        `
      UPDATE lead_scoring_rules
      SET
        rule_name = COALESCE($2, rule_name),
        rule_type = COALESCE($3, rule_type),
        condition_field = COALESCE($4, condition_field),
        condition_operator = COALESCE($5, condition_operator),
        condition_value = COALESCE($6, condition_value),
        score_adjustment = COALESCE($7, score_adjustment),
        priority = COALESCE($8, priority),
        is_active = COALESCE($9, is_active),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
        [ruleId, ruleName, ruleType, conditionField, conditionOperator, conditionValue, scoreAdjustment, priority, isActive]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Scoring rule not found' });
      }

      res.json({
        success: true,
        rule: result.rows[0],
        message: 'Scoring rule updated successfully'
      });
    } catch (error) {
      console.error('Error updating scoring rule:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/admin/leads/scoring/rules/:ruleId
  router.delete('/leads/scoring/rules/:ruleId', async (req, res) => {
    try {
      const { ruleId } = req.params;

      const result = await query(
        `
      UPDATE lead_scoring_rules
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
        [ruleId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Scoring rule not found' });
      }

      res.json({
        success: true,
        message: 'Scoring rule deactivated successfully'
      });
    } catch (error) {
      console.error('Error deactivating scoring rule:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/admin/leads/scoring/history/:leadId
  router.get('/leads/scoring/history/:leadId', async (req, res) => {
    try {
      const { leadId } = req.params;
      const { limit = 20 } = req.query;

      const history = await query(
        `
      SELECT * FROM lead_scoring_history
      WHERE lead_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
        [leadId, limit]
      );

      res.json(
        history.rows.map((record) => ({
          id: record.id,
          leadId: record.lead_id,
          oldScore: record.old_score,
          newScore: record.new_score,
          scoreChange: record.score_change,
          scoringFactors: record.scoring_factors,
          triggeredRules: record.triggered_rules,
          createdAt: record.created_at
        }))
      );
    } catch (error) {
      console.error('Error getting scoring history:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/admin/leads/scoring/analytics
  router.get('/leads/scoring/analytics', async (req, res) => {
    try {
      const analytics = await query(`
      SELECT
        COUNT(*) as total_leads,
        AVG(score) as avg_score,
        AVG(engagement_score) as avg_engagement,
        AVG(conversion_probability) as avg_conversion_prob,
        COUNT(CASE WHEN score >= 80 THEN 1 END) as high_score_leads,
        COUNT(CASE WHEN score BETWEEN 50 AND 79 THEN 1 END) as medium_score_leads,
        COUNT(CASE WHEN score < 50 THEN 1 END) as low_score_leads,
        COUNT(CASE WHEN engagement_score >= 70 THEN 1 END) as high_engagement_leads
      FROM leads
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);

      const row = analytics.rows[0];
      res.json({
        totalLeads: parseInt(row.total_leads) || 0,
        avgScore: parseFloat(row.avg_score) || 0,
        avgEngagement: parseFloat(row.avg_engagement) || 0,
        avgConversionProb: parseFloat(row.avg_conversion_prob) || 0,
        highScoreLeads: parseInt(row.high_score_leads) || 0,
        mediumScoreLeads: parseInt(row.medium_score_leads) || 0,
        lowScoreLeads: parseInt(row.low_score_leads) || 0,
        highEngagementLeads: parseInt(row.high_engagement_leads) || 0,
        highScorePercentage:
          row.total_leads > 0
            ? ((parseInt(row.high_score_leads) / parseInt(row.total_leads)) * 100).toFixed(1)
            : 0
      });
    } catch (error) {
      console.error('Error getting scoring analytics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

