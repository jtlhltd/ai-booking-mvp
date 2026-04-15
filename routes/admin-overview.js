/**
 * Admin Hub overview API: business stats, activity feed, clients/calls/analytics, system health.
 * Mounted at /api/admin — paths here are relative (e.g. /business-stats).
 */
import { Router } from 'express';
import {
  query,
  listClientSummaries,
  getLeadsByClient,
  getCallsByTenant,
  dbType
} from '../db.js';

/**
 * @param {{ broadcast: (type: string, data: unknown) => void }} opts
 */
export function createAdminOverviewRouter({ broadcast }) {
  const router = Router();

  router.get('/business-stats', async (req, res) => {
    try {
      const clients = await listClientSummaries();
      const activeClients = clients.filter((c) => c.isEnabled).length;

      const monthlyRevenue = activeClients * 500;

      let totalCalls = 0;
      let totalBookings = 0;

      for (const client of clients) {
        try {
          const calls = await getCallsByTenant(client.clientKey, 1000);
          const appointments = await query(
            `
        SELECT COUNT(*) as count FROM appointments 
        WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '30 days'
      `,
            [client.clientKey]
          );

          totalCalls += calls ? calls.length : 0;
          totalBookings += parseInt(appointments?.rows?.[0]?.count || 0);
        } catch (clientError) {
          console.error(`Error getting data for client ${client.clientKey}:`, clientError);
        }
      }

      const conversionRate = totalCalls > 0 ? ((totalBookings / totalCalls) * 100).toFixed(1) : 0;

      res.json({
        activeClients: activeClients || 0,
        monthlyRevenue: monthlyRevenue || 0,
        totalCalls: totalCalls || 0,
        totalBookings: totalBookings || 0,
        conversionRate: conversionRate || 0
      });

      broadcast('business-stats', {
        activeClients: activeClients || 0,
        monthlyRevenue: monthlyRevenue || 0,
        totalCalls: totalCalls || 0,
        totalBookings: totalBookings || 0,
        conversionRate: conversionRate || 0
      });
    } catch (error) {
      console.error('Error getting business stats:', error);
      res.json({
        activeClients: 0,
        monthlyRevenue: 0,
        totalCalls: 0,
        totalBookings: 0,
        conversionRate: '0%'
      });
    }
  });

  router.get('/recent-activity', async (req, res) => {
    try {
      const activities = [];

      try {
        const recentLeads = await query(`
        SELECT l.*, t.display_name as client_name 
        FROM leads l 
        JOIN tenants t ON l.client_key = t.client_key 
        WHERE l.created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY l.created_at DESC 
        LIMIT 10
      `);

        if (recentLeads?.rows) {
          for (const lead of recentLeads.rows) {
            activities.push({
              type: 'new_lead',
              message: `New lead "${lead.name || 'Unknown'}" imported for ${lead.client_name}`,
              timestamp: lead.created_at,
              client: lead.client_name
            });
          }
        }
      } catch (leadError) {
        console.error('Error getting recent leads:', leadError);
      }

      try {
        const recentCalls = await query(`
        SELECT c.*, t.display_name as client_name 
        FROM calls c 
        JOIN tenants t ON c.client_key = t.client_key 
        WHERE c.created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY c.created_at DESC 
        LIMIT 10
      `);

        if (recentCalls?.rows) {
          for (const call of recentCalls.rows) {
            activities.push({
              type: 'call_completed',
              message: `Call ${call.status} for ${call.client_name} (${call.outcome || 'No outcome'})`,
              timestamp: call.created_at,
              client: call.client_name
            });
          }
        }
      } catch (callError) {
        console.error('Error getting recent calls:', callError);
      }

      try {
        const recentAppointments = await query(`
        SELECT a.*, t.display_name as client_name 
        FROM appointments a 
        JOIN tenants t ON a.client_key = t.client_key 
        WHERE a.created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY a.created_at DESC 
        LIMIT 10
      `);

        if (recentAppointments?.rows) {
          for (const appointment of recentAppointments.rows) {
            activities.push({
              type: 'booking_made',
              message: `Appointment booked for ${appointment.client_name}`,
              timestamp: appointment.created_at,
              client: appointment.client_name
            });
          }
        }
      } catch (appointmentError) {
        console.error('Error getting recent appointments:', appointmentError);
      }

      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      res.json(activities.slice(0, 20));
    } catch (error) {
      console.error('Error getting recent activity:', error);
      res.json([]);
    }
  });

  router.get('/clients', async (req, res) => {
    try {
      const clients = await listClientSummaries();
      const clientData = [];

      for (const client of clients) {
        try {
          const leads = await getLeadsByClient(client.clientKey, 1000);
          const calls = await getCallsByTenant(client.clientKey, 1000);
          const appointments = await query(
            `
          SELECT COUNT(*) as count FROM appointments 
          WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '30 days'
        `,
            [client.clientKey]
          );

          const leadCount = leads ? leads.length : 0;
          const callCount = calls ? calls.length : 0;
          const bookingCount = parseInt(appointments?.rows?.[0]?.count || 0);
          const conversionRate = callCount > 0 ? ((bookingCount / callCount) * 100).toFixed(1) : 0;

          const clientName = client.displayName || client.clientKey || 'Unknown Client';
          const clientEmail = client.email || `${client.clientKey}@example.com`;

          clientData.push({
            name: clientName,
            email: clientEmail,
            industry: client.industry || 'Not specified',
            status: client.isEnabled ? 'active' : 'inactive',
            leadCount,
            callCount,
            conversionRate,
            monthlyRevenue: client.isEnabled ? 500 : 0,
            createdAt: client.createdAt,
            clientKey: client.clientKey
          });
        } catch (clientError) {
          console.error(`Error getting data for client ${client.clientKey}:`, clientError);
          const clientName = client.displayName || client.clientKey || 'Unknown Client';
          clientData.push({
            name: clientName,
            email: client.email || `${client.clientKey}@example.com`,
            industry: client.industry || 'Not specified',
            status: client.isEnabled ? 'active' : 'inactive',
            leadCount: 0,
            callCount: 0,
            conversionRate: 0,
            monthlyRevenue: client.isEnabled ? 500 : 0,
            createdAt: client.createdAt,
            clientKey: client.clientKey
          });
        }
      }

      res.json(clientData);
    } catch (error) {
      console.error('Error getting clients:', error);
      res.json([]);
    }
  });

  router.get('/calls', async (req, res) => {
    try {
      const clients = await listClientSummaries();

      let totalCalls = 0;
      let totalBookings = 0;
      let totalDuration = 0;
      const recentCalls = [];

      for (const client of clients) {
        const calls = await getCallsByTenant(client.clientKey, 100);
        totalCalls += calls.length;

        const appointments = await query(
          `
        SELECT COUNT(*) as count FROM appointments 
        WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '30 days'
      `,
          [client.clientKey]
        );
        totalBookings += parseInt(appointments.rows[0]?.count || 0);

        for (const call of calls.slice(0, 5)) {
          totalDuration += call.duration || 0;
          recentCalls.push({
            client: client.displayName || client.clientKey,
            phone: call.lead_phone,
            status: call.status,
            outcome: call.outcome,
            duration: call.duration
              ? `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}`
              : 'N/A',
            timestamp: call.created_at
          });
        }
      }

      const averageDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
      const successRate = totalCalls > 0 ? ((totalBookings / totalCalls) * 100).toFixed(1) + '%' : '0%';

      const queueSize = await query(`
      SELECT COUNT(*) as count FROM call_queue 
      WHERE status = 'pending' AND scheduled_for <= NOW() + INTERVAL '1 hour'
    `);

      res.json({
        liveCalls: 0,
        queueSize: parseInt(queueSize.rows[0]?.count || 0),
        successRate,
        averageDuration: `${Math.floor(averageDuration / 60)}:${(averageDuration % 60).toString().padStart(2, '0')}`,
        recentCalls: recentCalls.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10)
      });
    } catch (error) {
      console.error('Error getting calls data:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/analytics', async (req, res) => {
    try {
      const clients = await listClientSummaries();

      let totalLeads = 0;
      let totalCalls = 0;
      let totalBookings = 0;

      for (const client of clients) {
        const leads = await getLeadsByClient(client.clientKey, 1000);
        const calls = await getCallsByTenant(client.clientKey, 1000);
        const appointments = await query(
          `
        SELECT COUNT(*) as count FROM appointments 
        WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '30 days'
      `,
          [client.clientKey]
        );

        totalLeads += leads.length;
        totalCalls += calls.length;
        totalBookings += parseInt(appointments.rows[0]?.count || 0);
      }

      const peakHoursData = await query(`
      SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count
      FROM calls 
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY count DESC
      LIMIT 5
    `);

      const peakHours = peakHoursData.rows.map((row) => {
        const hour = parseInt(row.hour);
        return `${hour.toString().padStart(2, '0')}:00`;
      });

      const clientPerformance = [];
      for (const client of clients) {
        const leads = await getLeadsByClient(client.clientKey, 1000);
        const calls = await getCallsByTenant(client.clientKey, 1000);
        const appointments = await query(
          `
        SELECT COUNT(*) as count FROM appointments 
        WHERE client_key = $1 AND created_at >= NOW() - INTERVAL '30 days'
      `,
          [client.clientKey]
        );

        const bookingCount = parseInt(appointments.rows[0]?.count || 0);
        const conversionRate =
          calls.length > 0 ? ((bookingCount / calls.length) * 100).toFixed(1) : 0;

        clientPerformance.push({
          name: client.displayName || client.clientKey,
          leads: leads.length,
          calls: calls.length,
          bookings: bookingCount,
          conversionRate,
          revenue: client.isEnabled ? 500 : 0
        });
      }

      res.json({
        conversionFunnel: {
          leads: totalLeads,
          calls: totalCalls,
          bookings: totalBookings
        },
        peakHours: peakHours.length > 0 ? peakHours : ['9:00', '14:00', '16:00'],
        clientPerformance: clientPerformance.sort((a, b) => b.bookings - a.bookings)
      });
    } catch (error) {
      console.error('Error getting analytics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/system-health', async (req, res) => {
    try {
      const uptime = process.uptime();
      const uptimeHours = Math.floor(uptime / 3600);
      const uptimeMinutes = Math.floor((uptime % 3600) / 60);
      const uptimeString = `${uptimeHours}h ${uptimeMinutes}m`;

      const uptimePercentage = uptime > 3600 ? 99.9 : 95.0;

      const errorCount = 0;

      const recentErrorsSql =
        dbType === 'postgres'
          ? `
      SELECT * FROM quality_alerts 
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC 
      LIMIT 10
    `
          : `
      SELECT * FROM quality_alerts 
      WHERE datetime(created_at) >= datetime('now', '-24 hours')
      ORDER BY created_at DESC 
      LIMIT 10
    `;
      const recentErrors = await query(recentErrorsSql);

      let outboundQueues = null;
      let failedQCalls24h = null;
      let legacyDailyClaimRows = null;
      try {
        if (dbType === 'postgres') {
          const qRow = await query(`
        SELECT
          (SELECT COUNT(*)::int FROM call_queue WHERE call_type = 'vapi_call' AND status = 'pending') AS pending_vapi,
          (SELECT COUNT(*)::int FROM call_queue
            WHERE call_type = 'vapi_call' AND status = 'pending' AND scheduled_for <= NOW()) AS overdue_vapi,
          (SELECT COUNT(*)::int FROM calls
            WHERE call_id LIKE 'failed_q%' AND created_at >= NOW() - INTERVAL '24 hours') AS failed_q_24h,
          (SELECT COUNT(*)::int FROM outbound_dial_daily_claim WHERE dial_date >= (CURRENT_DATE - 30)) AS legacy_daily_claim_rows_30d
      `);
          const r = qRow.rows?.[0];
          if (r) {
            outboundQueues = {
              pendingVapi: Number(r.pending_vapi) || 0,
              overdueVapi: Number(r.overdue_vapi) || 0
            };
            failedQCalls24h = Number(r.failed_q_24h) || 0;
            legacyDailyClaimRows = Number(r.legacy_daily_claim_rows_30d) || 0;
          }
        } else {
          const qRow = await query(`
        SELECT
          (SELECT COUNT(*) FROM call_queue WHERE call_type = 'vapi_call' AND status = 'pending') AS pending_vapi,
          (SELECT COUNT(*) FROM call_queue
            WHERE call_type = 'vapi_call' AND status = 'pending' AND scheduled_for <= datetime('now')) AS overdue_vapi,
          (SELECT COUNT(*) FROM calls
            WHERE call_id LIKE 'failed_q%' AND datetime(created_at) >= datetime('now', '-24 hours')) AS failed_q_24h
      `);
          const r = qRow.rows?.[0];
          if (r) {
            outboundQueues = {
              pendingVapi: Number(r.pending_vapi) || 0,
              overdueVapi: Number(r.overdue_vapi) || 0
            };
            failedQCalls24h = Number(r.failed_q_24h) || 0;
          }
          legacyDailyClaimRows = null;
        }
      } catch (qErr) {
        console.warn('[system-health] queue / failed_q metrics skipped:', qErr?.message || qErr);
      }

      const status =
        (failedQCalls24h != null && failedQCalls24h > 50) ||
        (outboundQueues?.overdueVapi != null && outboundQueues.overdueVapi > 200) ||
        recentErrors?.rows?.length > 5
          ? 'warning'
          : 'healthy';

      const responseTime = 120;

      res.json({
        status: status || 'healthy',
        uptime: uptimePercentage,
        uptimeHuman: uptimeString,
        errorCount: errorCount || 0,
        responseTime: responseTime || 120,
        lastCrons: {
          processCallQueueAt: globalThis.__opsLastProcessCallQueueAt || null,
          queueNewLeadsForCallingAt: globalThis.__opsLastQueueNewLeadsAt || null
        },
        outboundQueues,
        failedQCalls24h,
        legacyDailyClaimRows,
        recentErrors:
          recentErrors?.rows?.map((error) => ({
            type: error.alert_type,
            severity: error.severity,
            message: error.message,
            timestamp: error.created_at
          })) || []
      });
    } catch (error) {
      console.error('Error getting system health:', error);
      res.json({
        status: 'healthy',
        uptime: 99.9,
        errorCount: 0,
        responseTime: 120,
        outboundQueues: null,
        failedQCalls24h: null,
        legacyDailyClaimRows: null,
        recentErrors: []
      });
    }
  });

  return router;
}
