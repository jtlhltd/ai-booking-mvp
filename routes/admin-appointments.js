/**
 * Admin API: appointment analytics endpoints.
 * Mounted at /api/admin — paths here are /appointments/*.
 */
import { Router } from 'express';

/**
 * @param {{ query: (sql: string, params?: any[]) => Promise<{ rows?: any[] }> }} deps
 */
export function createAdminAppointmentsRouter(deps) {
  const { query } = deps || {};
  const router = Router();

  router.get('/appointments/analytics', async (req, res) => {
    try {
      const { clientKey, startDate, endDate, daysBack = 30 } = req.query;

      const start =
        startDate ||
        new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const end = endDate || new Date().toISOString().split('T')[0];

      const metricsResult = await query(
        `
      SELECT calculate_appointment_metrics($1, $2::DATE, $3::DATE) as metrics
    `,
        [clientKey || 'default', start, end]
      );
      const metrics = metricsResult.rows[0].metrics;

      const insightsResult = await query(
        `
      SELECT get_appointment_insights($1, $2) as insights
    `,
        [clientKey || 'default', daysBack]
      );
      const insights = insightsResult.rows[0].insights;

      const funnelResult = await query(
        `
      SELECT
        DATE_TRUNC('day', date) as date,
        leads_generated,
        calls_made,
        appointments_scheduled,
        appointments_confirmed,
        appointments_completed,
        appointments_no_show,
        appointments_cancelled,
        total_revenue
      FROM appointment_funnel
      WHERE client_key = $1
      AND date BETWEEN $2::DATE AND $3::DATE
      ORDER BY date DESC
    `,
        [clientKey || 'default', start, end]
      );

      const hourlyResult = await query(
        `
      SELECT
        EXTRACT(HOUR FROM appointment_time) as hour,
        COUNT(*) as total_appointments,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'no_show' THEN 1 END) as no_shows,
        AVG(revenue) as avg_revenue
      FROM appointment_analytics
      WHERE client_key = $1
      AND DATE(appointment_time) BETWEEN $2::DATE AND $3::DATE
      GROUP BY EXTRACT(HOUR FROM appointment_time)
      ORDER BY hour
    `,
        [clientKey || 'default', start, end]
      );

      const dailyResult = await query(
        `
      SELECT
        EXTRACT(DOW FROM appointment_time) as day_of_week,
        COUNT(*) as total_appointments,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'no_show' THEN 1 END) as no_shows,
        AVG(revenue) as avg_revenue
      FROM appointment_analytics
      WHERE client_key = $1
      AND DATE(appointment_time) BETWEEN $2::DATE AND $3::DATE
      GROUP BY EXTRACT(DOW FROM appointment_time)
      ORDER BY day_of_week
    `,
        [clientKey || 'default', start, end]
      );

      res.json({
        metrics: {
          totalAppointments: parseInt(metrics.total_appointments) || 0,
          completedAppointments: parseInt(metrics.completed_appointments) || 0,
          noShowCount: parseInt(metrics.no_show_count) || 0,
          cancellationCount: parseInt(metrics.cancellation_count) || 0,
          rescheduleCount: parseInt(metrics.reschedule_count) || 0,
          noShowRate: parseFloat(metrics.no_show_rate) || 0,
          completionRate: parseFloat(metrics.completion_rate) || 0,
          avgDuration: parseFloat(metrics.avg_duration) || 0,
          peakHourAppointments: parseInt(metrics.peak_hour_appointments) || 0,
          offPeakAppointments: parseInt(metrics.off_peak_appointments) || 0,
          weekendAppointments: parseInt(metrics.weekend_appointments) || 0,
          weekdayAppointments: parseInt(metrics.weekday_appointments) || 0,
          totalRevenue: parseFloat(metrics.total_revenue) || 0,
          avgRevenuePerAppointment: parseFloat(metrics.avg_revenue_per_appointment) || 0
        },
        insights: {
          bestHour: insights.best_hour,
          worstHour: insights.worst_hour,
          bestDay: insights.best_day,
          worstDay: insights.worst_day,
          avgNoShowRate: parseFloat(insights.avg_no_show_rate) || 0,
          industryBenchmark: parseFloat(insights.industry_benchmark) || 0,
          performanceVsBenchmark: parseFloat(insights.performance_vs_benchmark) || 0,
          recommendations: insights.recommendations || []
        },
        funnel: funnelResult.rows.map((row) => ({
          date: row.date,
          leadsGenerated: parseInt(row.leads_generated) || 0,
          callsMade: parseInt(row.calls_made) || 0,
          appointmentsScheduled: parseInt(row.appointments_scheduled) || 0,
          appointmentsConfirmed: parseInt(row.appointments_confirmed) || 0,
          appointmentsCompleted: parseInt(row.appointments_completed) || 0,
          appointmentsNoShow: parseInt(row.appointments_no_show) || 0,
          appointmentsCancelled: parseInt(row.appointments_cancelled) || 0,
          totalRevenue: parseFloat(row.total_revenue) || 0
        })),
        hourlyDistribution: hourlyResult.rows.map((row) => ({
          hour: parseInt(row.hour),
          totalAppointments: parseInt(row.total_appointments) || 0,
          completed: parseInt(row.completed) || 0,
          noShows: parseInt(row.no_shows) || 0,
          avgRevenue: parseFloat(row.avg_revenue) || 0,
          completionRate:
            row.total_appointments > 0
              ? ((parseInt(row.completed) / parseInt(row.total_appointments)) * 100).toFixed(1)
              : 0
        })),
        dailyDistribution: dailyResult.rows.map((row) => ({
          dayOfWeek: parseInt(row.day_of_week),
          dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
            parseInt(row.day_of_week)
          ],
          totalAppointments: parseInt(row.total_appointments) || 0,
          completed: parseInt(row.completed) || 0,
          noShows: parseInt(row.no_shows) || 0,
          avgRevenue: parseFloat(row.avg_revenue) || 0,
          completionRate:
            row.total_appointments > 0
              ? ((parseInt(row.completed) / parseInt(row.total_appointments)) * 100).toFixed(1)
              : 0
        }))
      });
    } catch (error) {
      console.error('Error getting appointment analytics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/appointments/list', async (req, res) => {
    try {
      const { clientKey, status, startDate, endDate, limit = 100 } = req.query;

      let queryStr = `
      SELECT
        aa.*,
        l.name as lead_name,
        l.phone as lead_phone,
        l.email as lead_email,
        t.display_name as client_name
      FROM appointment_analytics aa
      LEFT JOIN leads l ON aa.lead_id = l.id
      LEFT JOIN tenants t ON aa.client_key = t.client_key
      WHERE 1=1
    `;
      const params = [];
      let paramCount = 0;

      if (clientKey) {
        queryStr += ` AND aa.client_key = $${++paramCount}`;
        params.push(clientKey);
      }

      if (status) {
        queryStr += ` AND aa.status = $${++paramCount}`;
        params.push(status);
      }

      if (startDate) {
        queryStr += ` AND DATE(aa.appointment_time) >= $${++paramCount}`;
        params.push(startDate);
      }

      if (endDate) {
        queryStr += ` AND DATE(aa.appointment_time) <= $${++paramCount}`;
        params.push(endDate);
      }

      queryStr += ` ORDER BY aa.appointment_time DESC LIMIT $${++paramCount}`;
      params.push(limit);

      const appointments = await query(queryStr, params);

      res.json(
        appointments.rows.map((apt) => ({
          id: apt.id,
          appointmentId: apt.appointment_id,
          clientKey: apt.client_key,
          clientName: apt.client_name,
          leadId: apt.lead_id,
          leadName: apt.lead_name,
          leadPhone: apt.lead_phone,
          leadEmail: apt.lead_email,
          appointmentTime: apt.appointment_time,
          durationMinutes: apt.duration_minutes,
          status: apt.status,
          outcome: apt.outcome,
          revenue: parseFloat(apt.revenue) || 0,
          serviceType: apt.service_type,
          bookingSource: apt.booking_source,
          confirmationSent: apt.confirmation_sent,
          reminderSent24h: apt.reminder_sent_24h,
          reminderSent1h: apt.reminder_sent_1h,
          noShowReason: apt.no_show_reason,
          cancellationReason: apt.cancellation_reason,
          rescheduleCount: apt.reschedule_count,
          createdAt: apt.created_at,
          updatedAt: apt.updated_at
        }))
      );
    } catch (error) {
      console.error('Error getting appointments list:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/appointments/analytics/update-funnel', async (req, res) => {
    try {
      const { clientKey, date } = req.body;

      await query('SELECT update_appointment_funnel($1, $2::DATE)', [
        clientKey || 'default',
        date || new Date().toISOString().split('T')[0]
      ]);

      res.json({
        success: true,
        message: 'Appointment funnel updated successfully'
      });
    } catch (error) {
      console.error('Error updating appointment funnel:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/appointments/performance', async (req, res) => {
    try {
      const { clientKey, daysBack = 30 } = req.query;

      const performance = await query(
        `
      SELECT
        metric_date,
        total_appointments,
        completed_appointments,
        no_show_count,
        cancellation_count,
        reschedule_count,
        no_show_rate,
        completion_rate,
        avg_appointment_duration,
        peak_hour_appointments,
        off_peak_appointments,
        weekend_appointments,
        weekday_appointments,
        total_revenue,
        avg_revenue_per_appointment
      FROM appointment_performance
      WHERE client_key = $1
      AND metric_date >= CURRENT_DATE - INTERVAL '${daysBack} days'
      ORDER BY metric_date DESC
    `,
        [clientKey || 'default']
      );

      res.json(
        performance.rows.map((row) => ({
          date: row.metric_date,
          totalAppointments: parseInt(row.total_appointments) || 0,
          completedAppointments: parseInt(row.completed_appointments) || 0,
          noShowCount: parseInt(row.no_show_count) || 0,
          cancellationCount: parseInt(row.cancellation_count) || 0,
          rescheduleCount: parseInt(row.reschedule_count) || 0,
          noShowRate: parseFloat(row.no_show_rate) || 0,
          completionRate: parseFloat(row.completion_rate) || 0,
          avgDuration: parseFloat(row.avg_appointment_duration) || 0,
          peakHourAppointments: parseInt(row.peak_hour_appointments) || 0,
          offPeakAppointments: parseInt(row.off_peak_appointments) || 0,
          weekendAppointments: parseInt(row.weekend_appointments) || 0,
          weekdayAppointments: parseInt(row.weekday_appointments) || 0,
          totalRevenue: parseFloat(row.total_revenue) || 0,
          avgRevenuePerAppointment: parseFloat(row.avg_revenue_per_appointment) || 0
        }))
      );
    } catch (error) {
      console.error('Error getting appointment performance:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/appointments/insights', async (req, res) => {
    try {
      const { clientKey, daysBack = 30 } = req.query;

      const insightsResult = await query(
        `
      SELECT get_appointment_insights($1, $2) as insights
    `,
        [clientKey || 'default', daysBack]
      );

      const insights = insightsResult.rows[0].insights;

      res.json({
        bestHour: insights.best_hour,
        worstHour: insights.worst_hour,
        bestDay: insights.best_day,
        worstDay: insights.worst_day,
        avgNoShowRate: parseFloat(insights.avg_no_show_rate) || 0,
        industryBenchmark: parseFloat(insights.industry_benchmark) || 0,
        performanceVsBenchmark: parseFloat(insights.performance_vs_benchmark) || 0,
        recommendations: insights.recommendations || []
      });
    } catch (error) {
      console.error('Error getting appointment insights:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

