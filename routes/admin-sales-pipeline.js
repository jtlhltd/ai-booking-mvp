/**
 * Admin API: lead scoring (heuristic), followups, forecast, benchmarks, sales pipeline + analytics.
 * Mounted at /api/admin.
 */
import { Router } from 'express';
import { query } from '../db.js';

function calculateAverageStageTime(analytics) {
  return {
    new: '2 days',
    contacted: '5 days',
    qualified: '3 days',
    interested: '2 days',
    booked: '1 day',
    confirmed: '7 days'
  };
}

/**
 * @param {{ io: import('socket.io').Server }} opts
 */
export function createAdminSalesPipelineRouter({ io }) {
  const router = Router();

  router.get('/leads/scoring', async (req, res) => {
    try {
      const leads = await query(`
      SELECT 
        l.*,
        c.display_name as client_name,
        c.industry,
        (SELECT COUNT(*) FROM calls WHERE lead_phone = l.phone AND status = 'completed') as call_count,
        (SELECT COUNT(*) FROM appointments WHERE lead_phone = l.phone AND status = 'confirmed') as appointment_count,
        (SELECT MAX(created_at) FROM calls WHERE lead_phone = l.phone) as last_call_at
      FROM leads l
      JOIN tenants c ON l.client_key = c.client_key
      WHERE l.status != 'converted'
      ORDER BY l.created_at DESC
      LIMIT 100
    `);

      const scoredLeads = leads.rows.map((lead) => {
        let score = 0;

        const daysSinceCreation = Math.floor(
          (Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceCreation < 7) score += 20;
        else if (daysSinceCreation < 30) score += 10;

        if (lead.call_count > 0) score += 15;
        if (lead.appointment_count > 0) score += 25;

        const highValueIndustries = ['Healthcare', 'Legal', 'Real Estate', 'Finance'];
        if (highValueIndustries.includes(lead.industry)) score += 15;

        if (lead.email && lead.email.includes('.co.uk')) score += 10;

        return {
          ...lead,
          score,
          priority: score >= 50 ? 'high' : score >= 30 ? 'medium' : 'low'
        };
      });

      res.json(scoredLeads.sort((a, b) => b.score - a.score));
    } catch (error) {
      console.error('Error getting lead scores:', error);
      res.json([]);
    }
  });

  router.get('/followups/recommendations', async (req, res) => {
    try {
      const recommendations = await query(`
      SELECT 
        l.*,
        c.display_name as client_name,
        (SELECT COUNT(*) FROM calls WHERE lead_phone = l.phone AND status = 'completed') as call_count,
        (SELECT MAX(created_at) FROM calls WHERE lead_phone = l.phone) as last_call_at,
        (SELECT outcome FROM calls WHERE lead_phone = l.phone ORDER BY created_at DESC LIMIT 1) as last_outcome
      FROM leads l
      JOIN tenants c ON l.client_key = c.client_key
      WHERE l.status IN ('new', 'contacted', 'follow_up')
        AND (SELECT MAX(created_at) FROM calls WHERE lead_phone = l.phone) < NOW() - INTERVAL '3 days'
      ORDER BY l.created_at DESC
      LIMIT 50
    `);

      const followups = recommendations.rows.map((lead) => {
        const daysSinceLastCall = lead.last_call_at
          ? Math.floor(
              (Date.now() - new Date(lead.last_call_at).getTime()) / (1000 * 60 * 60 * 24)
            )
          : 999;

        let recommendation = 'Call';
        let priority = 'medium';

        if (lead.last_outcome === 'interested') {
          recommendation = 'Schedule Follow-up Call';
          priority = 'high';
        } else if (lead.last_outcome === 'callback_requested') {
          recommendation = 'Callback - High Priority';
          priority = 'high';
        } else if (lead.call_count > 2) {
          recommendation = 'Email Follow-up';
          priority = 'low';
        }

        return {
          ...lead,
          daysSinceLastCall,
          recommendation,
          priority
        };
      });

      res.json(followups);
    } catch (error) {
      console.error('Error getting follow-up recommendations:', error);
      res.json([]);
    }
  });

  router.get('/analytics/forecast', async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const daysNum = parseInt(days, 10) || 30;

      const historical = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as appointments,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_appointments,
        AVG(EXTRACT(EPOCH FROM (scheduled_for - created_at))/3600) as avg_hours_to_appointment
      FROM appointments
      WHERE created_at >= NOW() - INTERVAL '${daysNum * 2} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

      const data = historical.rows.reverse();
      if (!data.length) {
        return res.json({
          forecast: [],
          currentAvg: 0,
          conversionRate: 0,
          period: daysNum
        });
      }

      const avgDailyAppointments = data.reduce((sum, d) => sum + Number(d.appointments || 0), 0) / data.length;
      const conversionRate =
        data.reduce((sum, d) => {
          const appt = Number(d.appointments) || 0;
          const conf = Number(d.confirmed_appointments) || 0;
          return sum + (appt ? conf / appt : 0);
        }, 0) / data.length;

      const forecast = [];
      for (let i = 1; i <= daysNum; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);

        const projected = avgDailyAppointments * (1 + Math.random() * 0.2 - 0.1);
        const confirmed = projected * conversionRate;

        forecast.push({
          date: date.toISOString().split('T')[0],
          projectedAppointments: Math.round(projected),
          projectedConfirmed: Math.round(confirmed),
          projectedRevenue: Math.round(confirmed * 150),
          confidence: i < 7 ? 'high' : i < 14 ? 'medium' : 'low'
        });
      }

      res.json({
        forecast,
        currentAvg: Math.round(avgDailyAppointments),
        conversionRate: Math.round(conversionRate * 100),
        period: daysNum
      });
    } catch (error) {
      console.error('Error generating forecast:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/analytics/benchmarks', async (req, res) => {
    try {
      const benchmarks = await query(`
      SELECT 
        c.client_key,
        c.display_name,
        c.industry,
        COUNT(DISTINCT l.id) as total_leads,
        COUNT(DISTINCT a.id) as total_appointments,
        COUNT(DISTINCT CASE WHEN a.status = 'confirmed' THEN a.id END) as confirmed_appointments,
        COUNT(DISTINCT cl.id) as total_calls,
        COUNT(DISTINCT CASE WHEN cl.outcome = 'booked' THEN cl.id END) as booked_calls,
        AVG(cl.duration) as avg_call_duration,
        SUM(cl.cost) as total_cost
      FROM tenants c
      LEFT JOIN leads l ON c.client_key = l.client_key
      LEFT JOIN appointments a ON c.client_key = a.client_key
      LEFT JOIN calls cl ON c.client_key = cl.client_key
      GROUP BY c.client_key, c.display_name, c.industry
    `);

      const benchmarked = benchmarks.rows.map((client) => {
        const conversionRate =
          client.total_leads > 0
            ? ((client.total_appointments / client.total_leads) * 100).toFixed(1)
            : 0;

        const callSuccessRate =
          client.total_calls > 0 ? ((client.booked_calls / client.total_calls) * 100).toFixed(1) : 0;

        const costPerAppointment =
          client.total_appointments > 0 ? (client.total_cost / client.total_appointments).toFixed(2) : 0;

        const industryBenchmarks = {
          Healthcare: { avgConversion: 25, avgCost: 12 },
          Dental: { avgConversion: 30, avgCost: 10 },
          Legal: { avgConversion: 20, avgCost: 15 },
          'Real Estate': { avgConversion: 18, avgCost: 18 }
        };

        const industryAvg = industryBenchmarks[client.industry] || { avgConversion: 22, avgCost: 13 };

        return {
          ...client,
          conversionRate: parseFloat(conversionRate),
          callSuccessRate: parseFloat(callSuccessRate),
          costPerAppointment: parseFloat(costPerAppointment),
          industryAverage: industryAvg,
          performance: {
            vsAverage: parseFloat(conversionRate) > industryAvg.avgConversion ? 'above' : 'below',
            score: (parseFloat(conversionRate) / industryAvg.avgConversion) * 100
          }
        };
      });

      res.json(benchmarked);
    } catch (error) {
      console.error('Error getting benchmarks:', error);
      res.json([]);
    }
  });

  router.get('/pipeline', async (req, res) => {
    try {
      const { clientKey } = req.query;

      const stages = [
        { id: 'new', name: 'New Leads', color: '#94a3b8', order: 1 },
        { id: 'contacted', name: 'Contacted', color: '#60a5fa', order: 2 },
        { id: 'qualified', name: 'Qualified', color: '#a78bfa', order: 3 },
        { id: 'interested', name: 'Interested', color: '#fbbf24', order: 4 },
        { id: 'booked', name: 'Booked', color: '#34d399', order: 5 },
        { id: 'confirmed', name: 'Confirmed', color: '#10b981', order: 6 },
        { id: 'converted', name: 'Converted', color: '#059669', order: 7 }
      ];

      let sql = `
      SELECT 
        l.*,
        c.display_name as client_name,
        c.industry,
        (SELECT COUNT(*) FROM calls WHERE lead_phone = l.phone AND status = 'completed') as call_count,
        (SELECT MAX(created_at) FROM calls WHERE lead_phone = l.phone) as last_call_at,
        (SELECT outcome FROM calls WHERE lead_phone = l.phone ORDER BY created_at DESC LIMIT 1) as last_outcome,
        (SELECT status FROM appointments WHERE lead_phone = l.phone ORDER BY created_at DESC LIMIT 1) as appointment_status
      FROM leads l
      JOIN tenants c ON l.client_key = c.client_key
      WHERE 1=1
    `;

      const params = [];
      if (clientKey) {
        sql += ` AND l.client_key = $1`;
        params.push(clientKey);
      }

      sql += ` ORDER BY l.created_at DESC`;

      const leadsResult = await query(sql, params);

      const leadsByStage = {};
      stages.forEach((stage) => {
        leadsByStage[stage.id] = [];
      });

      leadsResult.rows.forEach((lead) => {
        let stage = 'new';

        if (lead.status === 'converted') {
          stage = 'converted';
        } else if (lead.appointment_status === 'confirmed') {
          stage = 'confirmed';
        } else if (lead.appointment_status === 'scheduled') {
          stage = 'booked';
        } else if (lead.last_outcome === 'interested' || lead.last_outcome === 'callback_requested') {
          stage = 'interested';
        } else if (lead.call_count > 0 && lead.last_outcome === 'not_interested') {
          stage = 'qualified';
        } else if (lead.call_count > 0) {
          stage = 'contacted';
        } else {
          stage = 'new';
        }

        let score = 0;
        const daysSinceCreation = Math.floor(
          (Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceCreation < 7) score += 20;
        if (lead.call_count > 0) score += 15;
        if (lead.appointment_status) score += 25;

        leadsByStage[stage].push({
          ...lead,
          score,
          stage
        });
      });

      const stageTotal = leadsResult.rows.length;

      const stageStats = stages.map((stage) => {
        const leadsInStage = leadsByStage[stage.id];

        return {
          ...stage,
          count: leadsInStage.length,
          totalLeads: stageTotal,
          percentage: stageTotal > 0 ? Math.round((leadsInStage.length / stageTotal) * 100) : 0,
          leads: leadsInStage,
          avgScore:
            leadsInStage.length > 0
              ? Math.round(leadsInStage.reduce((sum, l) => sum + l.score, 0) / leadsInStage.length)
              : 0
        };
      });

      res.json({
        stages: stageStats,
        totalLeads: leadsResult.rows.length,
        conversionRate:
          leadsResult.rows.length > 0
            ? Math.round((leadsByStage['converted'].length / leadsResult.rows.length) * 100)
            : 0
      });
    } catch (error) {
      console.error('Error getting pipeline:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/pipeline/lead/:leadId', async (req, res) => {
    try {
      const { leadId } = req.params;
      const { stage, notes } = req.body;

      await query(
        `
      UPDATE leads 
      SET status = $1, notes = COALESCE($2, notes), updated_at = NOW()
      WHERE id = $3
    `,
        [stage, notes, leadId]
      );

      const result = await query(
        `
      SELECT l.*, c.display_name as client_name
      FROM leads l
      JOIN tenants c ON l.client_key = c.client_key
      WHERE l.id = $1
    `,
        [leadId]
      );

      io.to('admin-hub').emit('pipeline-update', {
        type: 'lead-moved',
        lead: result.rows[0],
        from: null,
        to: stage
      });

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating lead stage:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/pipeline/bulk-move', async (req, res) => {
    try {
      const { leadIds, targetStage } = req.body;

      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ error: 'leadIds must be a non-empty array' });
      }

      const placeholders = leadIds.map((_, i) => `$${i + 2}`).join(',');
      const result = await query(
        `
      UPDATE leads 
      SET status = $1, updated_at = NOW()
      WHERE id IN (${placeholders})
      RETURNING *
    `,
        [targetStage, ...leadIds]
      );

      io.to('admin-hub').emit('pipeline-update', {
        type: 'bulk-move',
        leadIds,
        targetStage,
        count: result.rows.length
      });

      res.json({
        success: true,
        moved: result.rows.length,
        leads: result.rows
      });
    } catch (error) {
      console.error('Error bulk moving leads:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/pipeline/analytics', async (req, res) => {
    try {
      const { clientKey, days = 30 } = req.query;
      const daysNum = parseInt(days, 10) || 30;

      let sql = `
      SELECT 
        DATE(created_at) as date,
        status,
        COUNT(*) as count
      FROM leads
      WHERE created_at >= NOW() - INTERVAL '${daysNum} days'
    `;

      const params = [];
      if (clientKey) {
        sql += ` AND client_key = $1`;
        params.push(clientKey);
      }

      sql += ` GROUP BY DATE(created_at), status ORDER BY date DESC`;

      const analytics = await query(sql, params);

      const funnel = analytics.rows.reduce((acc, row) => {
        if (!acc[row.status]) {
          acc[row.status] = 0;
        }
        acc[row.status] += parseInt(row.count);
        return acc;
      }, {});

      const conversionRates = [];
      const stageOrder = [
        'new',
        'contacted',
        'qualified',
        'interested',
        'booked',
        'confirmed',
        'converted'
      ];

      for (let i = 0; i < stageOrder.length - 1; i++) {
        const currentStage = stageOrder[i];
        const nextStage = stageOrder[i + 1];
        const currentCount = funnel[currentStage] || 0;
        const nextCount = funnel[nextStage] || 0;

        conversionRates.push({
          from: currentStage,
          to: nextStage,
          count: currentCount,
          converted: nextCount,
          rate: currentCount > 0 ? Math.round((nextCount / currentCount) * 100) : 0
        });
      }

      res.json({
        analytics: analytics.rows,
        funnel,
        conversionRates,
        averageStageTime: calculateAverageStageTime(analytics.rows)
      });
    } catch (error) {
      console.error('Error getting pipeline analytics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
