// lib/realtime-events.js
// Real-time event streaming for client dashboards using Server-Sent Events (SSE)

// Active SSE connections by client key
const activeConnections = new Map();

/**
 * Register SSE connection for a client
 * @param {string} clientKey - Client identifier
 * @param {Response} res - Express response object
 */
export function registerConnection(clientKey, res) {
  if (!activeConnections.has(clientKey)) {
    activeConnections.set(clientKey, []);
  }
  
  const connections = activeConnections.get(clientKey);
  connections.push(res);
  
  console.log(`[REALTIME] Client ${clientKey} connected (${connections.length} total connections)`);
  
  // Remove connection when closed
  res.on('close', () => {
    const index = connections.indexOf(res);
    if (index > -1) {
      connections.splice(index, 1);
    }
    console.log(`[REALTIME] Client ${clientKey} disconnected (${connections.length} remaining)`);
  });
}

/**
 * Broadcast event to all connections for a client
 * @param {string} clientKey - Client identifier
 * @param {Object} event - Event data
 */
export function broadcastToClient(clientKey, event) {
  const connections = activeConnections.get(clientKey);
  
  if (!connections || connections.length === 0) {
    return; // No active connections
  }
  
  const eventData = `data: ${JSON.stringify(event)}\n\n`;
  
  // Send to all active connections
  let sent = 0;
  let failed = 0;
  
  connections.forEach((res, index) => {
    try {
      res.write(eventData);
      sent++;
    } catch (error) {
      console.error(`[REALTIME] Failed to send to connection ${index}:`, error.message);
      failed++;
    }
  });
  
  if (sent > 0) {
    console.log(`[REALTIME] Broadcast ${event.type} to ${clientKey}: ${sent} sent, ${failed} failed`);
  }
}

/**
 * Broadcast event to all connected clients
 * @param {Object} event - Event data
 */
export function broadcastToAll(event) {
  let totalSent = 0;
  
  for (const [clientKey, connections] of activeConnections.entries()) {
    broadcastToClient(clientKey, event);
    totalSent += connections.length;
  }
  
  if (totalSent > 0) {
    console.log(`[REALTIME] Broadcast ${event.type} to all: ${totalSent} connections`);
  }
}

/**
 * Get connection statistics
 * @returns {Object} - Connection stats
 */
export function getConnectionStats() {
  const stats = {
    totalClients: activeConnections.size,
    totalConnections: 0,
    clientDetails: []
  };
  
  for (const [clientKey, connections] of activeConnections.entries()) {
    stats.totalConnections += connections.length;
    stats.clientDetails.push({
      clientKey,
      connections: connections.length
    });
  }
  
  return stats;
}

// Event helper functions

/**
 * Emit call started event
 */
export function emitCallStarted(clientKey, callData) {
  broadcastToClient(clientKey, {
    type: 'call_started',
    timestamp: new Date().toISOString(),
    data: {
      callId: callData.callId,
      leadPhone: callData.leadPhone,
      leadName: callData.leadName,
      status: 'in_progress'
    }
  });
}

/**
 * Emit call ended event
 */
export function emitCallEnded(clientKey, callData) {
  broadcastToClient(clientKey, {
    type: 'call_ended',
    timestamp: new Date().toISOString(),
    data: {
      callId: callData.callId,
      leadPhone: callData.leadPhone,
      outcome: callData.outcome,
      duration: callData.duration,
      appointmentBooked: callData.appointmentBooked || false
    }
  });
}

/**
 * Emit appointment booked event
 */
export function emitAppointmentBooked(clientKey, appointmentData) {
  broadcastToClient(clientKey, {
    type: 'appointment_booked',
    timestamp: new Date().toISOString(),
    data: {
      appointmentId: appointmentData.appointmentId,
      leadName: appointmentData.leadName,
      leadPhone: appointmentData.leadPhone,
      appointmentTime: appointmentData.appointmentTime,
      service: appointmentData.service
    }
  });
}

/**
 * Emit lead status changed event
 */
export function emitLeadStatusChanged(clientKey, leadData) {
  broadcastToClient(clientKey, {
    type: 'lead_status_changed',
    timestamp: new Date().toISOString(),
    data: {
      leadPhone: leadData.leadPhone,
      leadName: leadData.leadName,
      oldStatus: leadData.oldStatus,
      newStatus: leadData.newStatus
    }
  });
}

/**
 * Emit conversion metrics updated event
 */
export function emitConversionMetricsUpdated(clientKey, metrics) {
  broadcastToClient(clientKey, {
    type: 'conversion_metrics_updated',
    timestamp: new Date().toISOString(),
    data: metrics
  });
}

/**
 * Emit system alert event
 */
export function emitSystemAlert(clientKey, alert) {
  broadcastToClient(clientKey, {
    type: 'system_alert',
    timestamp: new Date().toISOString(),
    data: {
      severity: alert.severity, // info, warning, error
      message: alert.message,
      details: alert.details
    }
  });
}

/**
 * Emit leads imported event
 */
export function emitLeadsImported(clientKey, importData) {
  broadcastToClient(clientKey, {
    type: 'leads_imported',
    timestamp: new Date().toISOString(),
    data: {
      count: importData.count,
      source: importData.source,
      valid: importData.valid,
      duplicates: importData.duplicates
    }
  });
}

export default {
  registerConnection,
  broadcastToClient,
  broadcastToAll,
  getConnectionStats,
  emitCallStarted,
  emitCallEnded,
  emitAppointmentBooked,
  emitLeadStatusChanged,
  emitConversionMetricsUpdated,
  emitSystemAlert,
  emitLeadsImported
};

