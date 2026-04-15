/**
 * Aggregates for Admin Hub / Socket.IO real-time payloads (shared with server.js routes).
 */
import {
  query,
  listClientSummaries,
  getLeadsByClient,
  getCallsByTenant
} from '../db.js';

export async function getBusinessStats() {
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

  return {
    activeClients: activeClients || 0,
    monthlyRevenue: monthlyRevenue || 0,
    totalCalls: totalCalls || 0,
    totalBookings: totalBookings || 0,
    conversionRate: conversionRate || 0
  };
}

export async function getRecentActivity() {
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
  } catch (error) {
    console.error('Error getting recent activity:', error);
  }

  return activities.slice(0, 20);
}

export async function getClientsData() {
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
    }
  }

  return clientData;
}

export async function getCallsData() {
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

  return {
    liveCalls: 0,
    queueSize: parseInt(queueSize.rows[0]?.count || 0),
    successRate,
    averageDuration: `${Math.floor(averageDuration / 60)}:${(averageDuration % 60).toString().padStart(2, '0')}`,
    recentCalls: recentCalls.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10)
  };
}

export async function getAnalyticsData() {
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

  return {
    conversionFunnel: {
      leads: totalLeads,
      calls: totalCalls,
      bookings: totalBookings
    },
    peakHours: peakHours.length > 0 ? peakHours : ['9:00', '14:00', '16:00'],
    clientPerformance: []
  };
}

export async function getSystemHealthData() {
  const uptime = process.uptime();
  const uptimePercentage = uptime > 3600 ? 99.9 : 95.0;

  const recentErrors = await query(`
    SELECT * FROM quality_alerts 
    WHERE created_at >= NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC 
    LIMIT 10
  `);

  const status = recentErrors?.rows?.length > 5 ? 'warning' : 'healthy';

  return {
    status: status || 'healthy',
    uptime: uptimePercentage,
    errorCount: 0,
    responseTime: 120,
    recentErrors:
      recentErrors?.rows?.map((error) => ({
        type: error.alert_type,
        severity: error.severity,
        message: error.message,
        timestamp: error.created_at
      })) || []
  };
}
