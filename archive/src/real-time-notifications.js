// Real-Time Notifications System
// WebSocket-based real-time notifications for leads, appointments, and system events

import { EventEmitter } from 'events';
import WebSocket from 'ws';

export class NotificationManager extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map(); // WebSocket clients
    this.notificationQueue = [];
    this.isProcessing = false;
    this.setupEventHandlers();
  }

  // Setup event handlers for different notification types
  setupEventHandlers() {
    // Lead notifications
    this.on('lead_created', (data) => this.handleLeadNotification(data));
    this.on('lead_updated', (data) => this.handleLeadUpdateNotification(data));
    this.on('lead_converted', (data) => this.handleConversionNotification(data));

    // Call notifications
    this.on('call_started', (data) => this.handleCallNotification(data));
    this.on('call_completed', (data) => this.handleCallCompletionNotification(data));
    this.on('call_failed', (data) => this.handleCallFailureNotification(data));

    // Appointment notifications
    this.on('appointment_booked', (data) => this.handleAppointmentNotification(data));
    this.on('appointment_cancelled', (data) => this.handleAppointmentCancellationNotification(data));
    this.on('appointment_reminder', (data) => this.handleAppointmentReminderNotification(data));

    // System notifications
    this.on('budget_alert', (data) => this.handleBudgetAlertNotification(data));
    this.on('system_error', (data) => this.handleSystemErrorNotification(data));
    this.on('performance_alert', (data) => this.handlePerformanceAlertNotification(data));
  }

  // Add WebSocket client
  addClient(clientId, ws, clientKey) {
    this.clients.set(clientId, {
      ws,
      clientKey,
      connectedAt: new Date(),
      lastActivity: new Date()
    });

    console.log('[NOTIFICATION] Client connected', {
      clientId,
      clientKey,
      totalClients: this.clients.size
    });

    // Send welcome message
    this.sendToClient(clientId, {
      type: 'connection_established',
      message: 'Connected to real-time notifications',
      timestamp: new Date().toISOString()
    });
  }

  // Remove WebSocket client
  removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      console.log('[NOTIFICATION] Client disconnected', {
        clientId,
        clientKey: client.clientKey,
        totalClients: this.clients.size
      });
    }
  }

  // Send notification to specific client
  sendToClient(clientId, notification) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(notification));
        client.lastActivity = new Date();
        return true;
      } catch (error) {
        console.error('[NOTIFICATION] Send error', error);
        this.removeClient(clientId);
        return false;
      }
    }
    return false;
  }

  // Broadcast notification to all clients of a specific tenant
  broadcastToTenant(clientKey, notification) {
    let sentCount = 0;
    for (const [clientId, client] of this.clients.entries()) {
      if (client.clientKey === clientKey) {
        if (this.sendToClient(clientId, notification)) {
          sentCount++;
        }
      }
    }
    return sentCount;
  }

  // Broadcast notification to all clients
  broadcast(notification) {
    let sentCount = 0;
    for (const clientId of this.clients.keys()) {
      if (this.sendToClient(clientId, notification)) {
        sentCount++;
      }
    }
    return sentCount;
  }

  // Handle lead notifications
  handleLeadNotification(data) {
    const notification = {
      type: 'lead_created',
      priority: data.score > 80 ? 'high' : data.score > 60 ? 'medium' : 'low',
      title: 'New Lead Created',
      message: `New lead from ${data.phone} (Score: ${data.score})`,
      data: {
        leadId: data.id,
        phone: data.phone,
        score: data.score,
        source: data.source,
        clientKey: data.clientKey
      },
      timestamp: new Date().toISOString(),
      actions: [
        { label: 'View Lead', action: 'view_lead', data: { leadId: data.id } },
        { label: 'Call Now', action: 'call_lead', data: { phone: data.phone } }
      ]
    };

    this.broadcastToTenant(data.clientKey, notification);
    this.queueNotification(notification);
  }

  handleLeadUpdateNotification(data) {
    const notification = {
      type: 'lead_updated',
      priority: 'medium',
      title: 'Lead Updated',
      message: `Lead ${data.phone} status changed to ${data.status}`,
      data: {
        leadId: data.id,
        phone: data.phone,
        status: data.status,
        clientKey: data.clientKey
      },
      timestamp: new Date().toISOString()
    };

    this.broadcastToTenant(data.clientKey, notification);
  }

  handleConversionNotification(data) {
    const notification = {
      type: 'lead_converted',
      priority: 'high',
      title: 'Lead Converted!',
      message: `Lead ${data.phone} has been converted to appointment`,
      data: {
        leadId: data.id,
        phone: data.phone,
        conversionTime: data.conversionTime,
        clientKey: data.clientKey
      },
      timestamp: new Date().toISOString(),
      actions: [
        { label: 'View Details', action: 'view_conversion', data: { leadId: data.id } }
      ]
    };

    this.broadcastToTenant(data.clientKey, notification);
    this.queueNotification(notification);
  }

  // Handle call notifications
  handleCallNotification(data) {
    const notification = {
      type: 'call_started',
      priority: 'medium',
      title: 'Call Initiated',
      message: `Calling ${data.phone} for ${data.clientKey}`,
      data: {
        callId: data.callId,
        phone: data.phone,
        clientKey: data.clientKey,
        assistantId: data.assistantId
      },
      timestamp: new Date().toISOString()
    };

    this.broadcastToTenant(data.clientKey, notification);
  }

  handleCallCompletionNotification(data) {
    const notification = {
      type: 'call_completed',
      priority: data.outcome === 'completed' ? 'high' : 'medium',
      title: data.outcome === 'completed' ? 'Call Completed Successfully' : 'Call Completed',
      message: `Call to ${data.phone} completed (${data.duration}s) - ${data.outcome}`,
      data: {
        callId: data.callId,
        phone: data.phone,
        duration: data.duration,
        outcome: data.outcome,
        cost: data.cost,
        clientKey: data.clientKey
      },
      timestamp: new Date().toISOString()
    };

    this.broadcastToTenant(data.clientKey, notification);
  }

  handleCallFailureNotification(data) {
    const notification = {
      type: 'call_failed',
      priority: 'high',
      title: 'Call Failed',
      message: `Call to ${data.phone} failed: ${data.error}`,
      data: {
        callId: data.callId,
        phone: data.phone,
        error: data.error,
        clientKey: data.clientKey
      },
      timestamp: new Date().toISOString(),
      actions: [
        { label: 'Retry Call', action: 'retry_call', data: { callId: data.callId } }
      ]
    };

    this.broadcastToTenant(data.clientKey, notification);
  }

  // Handle appointment notifications
  handleAppointmentNotification(data) {
    const notification = {
      type: 'appointment_booked',
      priority: 'high',
      title: 'Appointment Booked',
      message: `New appointment booked for ${data.customerName} at ${data.appointmentTime}`,
      data: {
        appointmentId: data.appointmentId,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        appointmentTime: data.appointmentTime,
        service: data.service,
        clientKey: data.clientKey
      },
      timestamp: new Date().toISOString(),
      actions: [
        { label: 'View Calendar', action: 'view_calendar', data: { appointmentId: data.appointmentId } }
      ]
    };

    this.broadcastToTenant(data.clientKey, notification);
  }

  handleAppointmentCancellationNotification(data) {
    const notification = {
      type: 'appointment_cancelled',
      priority: 'medium',
      title: 'Appointment Cancelled',
      message: `Appointment cancelled for ${data.customerName}`,
      data: {
        appointmentId: data.appointmentId,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        cancellationReason: data.cancellationReason,
        clientKey: data.clientKey
      },
      timestamp: new Date().toISOString()
    };

    this.broadcastToTenant(data.clientKey, notification);
  }

  handleAppointmentReminderNotification(data) {
    const notification = {
      type: 'appointment_reminder',
      priority: 'medium',
      title: 'Appointment Reminder',
      message: `Reminder: ${data.customerName} has an appointment tomorrow at ${data.appointmentTime}`,
      data: {
        appointmentId: data.appointmentId,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        appointmentTime: data.appointmentTime,
        clientKey: data.clientKey
      },
      timestamp: new Date().toISOString()
    };

    this.broadcastToTenant(data.clientKey, notification);
  }

  // Handle system notifications
  handleBudgetAlertNotification(data) {
    const notification = {
      type: 'budget_alert',
      priority: 'high',
      title: 'Budget Alert',
      message: `${data.alertType}: ${data.message}`,
      data: {
        alertType: data.alertType,
        currentAmount: data.currentAmount,
        limit: data.limit,
        percentage: data.percentage,
        clientKey: data.clientKey
      },
      timestamp: new Date().toISOString(),
      actions: [
        { label: 'View Budget', action: 'view_budget', data: { clientKey: data.clientKey } }
      ]
    };

    this.broadcastToTenant(data.clientKey, notification);
  }

  handleSystemErrorNotification(data) {
    const notification = {
      type: 'system_error',
      priority: 'critical',
      title: 'System Error',
      message: `System error: ${data.error}`,
      data: {
        error: data.error,
        component: data.component,
        timestamp: data.timestamp
      },
      timestamp: new Date().toISOString(),
      actions: [
        { label: 'View Logs', action: 'view_logs', data: { component: data.component } }
      ]
    };

    this.broadcast(notification);
  }

  handlePerformanceAlertNotification(data) {
    const notification = {
      type: 'performance_alert',
      priority: 'medium',
      title: 'Performance Alert',
      message: `Performance issue detected: ${data.message}`,
      data: {
        metric: data.metric,
        value: data.value,
        threshold: data.threshold,
        component: data.component
      },
      timestamp: new Date().toISOString()
    };

    this.broadcast(notification);
  }

  // Queue notification for persistence
  queueNotification(notification) {
    this.notificationQueue.push(notification);
    
    // Keep only last 1000 notifications
    if (this.notificationQueue.length > 1000) {
      this.notificationQueue = this.notificationQueue.slice(-1000);
    }

    // Process queue if not already processing
    if (!this.isProcessing) {
      this.processNotificationQueue();
    }
  }

  // Process notification queue
  async processNotificationQueue() {
    if (this.isProcessing || this.notificationQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const batch = this.notificationQueue.splice(0, 50); // Process 50 at a time
      
      // Store notifications in database
      const { storeNotifications } = await import('./db.js');
      await storeNotifications(batch);

      console.log('[NOTIFICATION] Processed notification batch', {
        count: batch.length,
        remaining: this.notificationQueue.length
      });

    } catch (error) {
      console.error('[NOTIFICATION] Queue processing error', error);
    } finally {
      this.isProcessing = false;
      
      // Process remaining notifications after a delay
      if (this.notificationQueue.length > 0) {
        setTimeout(() => this.processNotificationQueue(), 1000);
      }
    }
  }

  // Get notification history
  async getNotificationHistory(clientKey, limit = 50) {
    try {
      const { getNotifications } = await import('./db.js');
      return await getNotifications(clientKey, limit);
    } catch (error) {
      console.error('[NOTIFICATION] Get history error', error);
      return [];
    }
  }

  // Get active clients count
  getActiveClientsCount() {
    return this.clients.size;
  }

  // Get clients by tenant
  getClientsByTenant(clientKey) {
    const clients = [];
    for (const [clientId, client] of this.clients.entries()) {
      if (client.clientKey === clientKey) {
        clients.push({
          clientId,
          connectedAt: client.connectedAt,
          lastActivity: client.lastActivity
        });
      }
    }
    return clients;
  }

  // Cleanup inactive clients
  cleanupInactiveClients() {
    const now = new Date();
    const inactiveThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [clientId, client] of this.clients.entries()) {
      if (now - client.lastActivity > inactiveThreshold) {
        this.removeClient(clientId);
      }
    }
  }
}

// Notification templates for different scenarios
export const NOTIFICATION_TEMPLATES = {
  lead_created: {
    high_priority: {
      title: '🔥 High-Priority Lead',
      message: 'New high-value lead requires immediate attention',
      icon: '🔥',
      color: '#ff4444'
    },
    medium_priority: {
      title: '📞 New Lead',
      message: 'New lead created and ready for follow-up',
      icon: '📞',
      color: '#ffaa00'
    },
    low_priority: {
      title: '📝 New Lead',
      message: 'New lead added to your pipeline',
      icon: '📝',
      color: '#00aa00'
    }
  },

  conversion: {
    title: '🎉 Conversion!',
    message: 'Lead successfully converted to appointment',
    icon: '🎉',
    color: '#00ff00'
  },

  budget_alert: {
    title: '💰 Budget Alert',
    message: 'Budget threshold reached - review spending',
    icon: '💰',
    color: '#ff8800'
  },

  system_error: {
    title: '⚠️ System Error',
    message: 'System error detected - immediate attention required',
    icon: '⚠️',
    color: '#ff0000'
  }
};

// WebSocket server setup
export function setupWebSocketServer(server) {
  const wss = new WebSocket.Server({ server });
  const notificationManager = new NotificationManager();

  wss.on('connection', (ws, req) => {
    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const clientKey = req.url.split('?clientKey=')[1] || 'unknown';

    notificationManager.addClient(clientId, ws, clientKey);

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        
        switch (data.type) {
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
            break;
          
          case 'subscribe':
            // Handle subscription to specific notification types
            break;
          
          default:
            console.log('[WEBSOCKET] Unknown message type', data.type);
        }
      } catch (error) {
        console.error('[WEBSOCKET] Message parsing error', error);
      }
    });

    ws.on('close', () => {
      notificationManager.removeClient(clientId);
    });

    ws.on('error', (error) => {
      console.error('[WEBSOCKET] Client error', error);
      notificationManager.removeClient(clientId);
    });
  });

  // Cleanup inactive clients every 5 minutes
  setInterval(() => {
    notificationManager.cleanupInactiveClients();
  }, 5 * 60 * 1000);

  return notificationManager;
}

export default {
  NotificationManager,
  NOTIFICATION_TEMPLATES,
  setupWebSocketServer
};
