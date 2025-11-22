// lib/health-monitor.js
// Comprehensive health check system

import { query } from '../db.js';
import { getPoolStatus } from './connection-pool-monitor.js';
import { getCircuitBreakerStatus } from './circuit-breaker.js';
import { getQueueStatus } from './request-queue.js';
import { fetchWithTimeout, TIMEOUTS } from './timeouts.js';

/**
 * Comprehensive health check
 */
export async function getComprehensiveHealth(clientKey = null) {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {},
    metrics: {},
    alerts: []
  };
  
  // Database health
  try {
    const startTime = Date.now();
    await query('SELECT 1');
    const dbResponseTime = Date.now() - startTime;
    
    const poolStatus = await getPoolStatus();
    
    health.services.database = {
      status: dbResponseTime < 1000 ? 'healthy' : dbResponseTime < 3000 ? 'degraded' : 'unhealthy',
      responseTime: dbResponseTime,
      pool: poolStatus
    };
    
    if (dbResponseTime > 3000) {
      health.status = 'degraded';
      health.alerts.push('Database response time is high');
    }
  } catch (error) {
    health.services.database = {
      status: 'unhealthy',
      error: error.message
    };
    health.status = 'unhealthy';
    health.alerts.push('Database is unavailable');
  }
  
  // VAPI health
  try {
    const startTime = Date.now();
    const vapiResponse = await fetchWithTimeout(
      'https://api.vapi.ai/health',
      { method: 'GET' },
      TIMEOUTS.vapi
    );
    const vapiResponseTime = Date.now() - startTime;
    
    health.services.vapi = {
      status: vapiResponse.ok ? 'healthy' : 'degraded',
      responseTime: vapiResponseTime,
      httpStatus: vapiResponse.status
    };
    
    if (!vapiResponse.ok || vapiResponseTime > 5000) {
      health.status = health.status === 'unhealthy' ? 'unhealthy' : 'degraded';
      health.alerts.push('VAPI service is degraded');
    }
  } catch (error) {
    health.services.vapi = {
      status: 'unhealthy',
      error: error.message
    };
    health.status = health.status === 'unhealthy' ? 'unhealthy' : 'degraded';
    health.alerts.push('VAPI service is unavailable');
  }
  
  // Twilio health (check account status)
  try {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const startTime = Date.now();
      const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const twilioResponse = await fetchWithTimeout(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}.json`,
        {
          headers: { 'Authorization': `Basic ${auth}` }
        },
        TIMEOUTS.twilio
      );
      const twilioResponseTime = Date.now() - startTime;
      
      health.services.twilio = {
        status: twilioResponse.ok ? 'healthy' : 'degraded',
        responseTime: twilioResponseTime,
        httpStatus: twilioResponse.status
      };
      
      if (!twilioResponse.ok) {
        health.status = health.status === 'unhealthy' ? 'unhealthy' : 'degraded';
        health.alerts.push('Twilio service is degraded');
      }
    } else {
      health.services.twilio = {
        status: 'not_configured'
      };
    }
  } catch (error) {
    health.services.twilio = {
      status: 'unhealthy',
      error: error.message
    };
    health.status = health.status === 'unhealthy' ? 'unhealthy' : 'degraded';
    health.alerts.push('Twilio service is unavailable');
  }
  
  // Google Calendar health (check API)
  try {
    if (process.env.GOOGLE_CLIENT_EMAIL) {
      health.services.googleCalendar = {
        status: 'configured',
        // Could add actual API check here
      };
    } else {
      health.services.googleCalendar = {
        status: 'not_configured'
      };
    }
  } catch (error) {
    health.services.googleCalendar = {
      status: 'error',
      error: error.message
    };
  }
  
  // Circuit breaker status
  try {
    const circuitBreakers = getCircuitBreakerStatus();
    health.services.circuitBreakers = circuitBreakers;
    
    // Check if any are open
    const openBreakers = Object.values(circuitBreakers).filter(cb => cb.state === 'open');
    if (openBreakers.length > 0) {
      health.status = health.status === 'unhealthy' ? 'unhealthy' : 'degraded';
      health.alerts.push(`${openBreakers.length} circuit breaker(s) are open`);
    }
  } catch (error) {
    console.error('[HEALTH] Failed to get circuit breaker status:', error);
  }
  
  // Queue status
  try {
    const queueStatus = await getQueueStatus(clientKey);
    health.services.queue = queueStatus;
    
    if (queueStatus.byStatus.pending && queueStatus.byStatus.pending.count > 100) {
      health.status = health.status === 'unhealthy' ? 'unhealthy' : 'degraded';
      health.alerts.push('Request queue has high backlog');
    }
  } catch (error) {
    console.error('[HEALTH] Failed to get queue status:', error);
  }
  
  // Cache status
  try {
    // Could add cache hit/miss rates here
    health.services.cache = {
      status: 'operational'
    };
  } catch (error) {
    health.services.cache = {
      status: 'error',
      error: error.message
    };
  }
  
  // Metrics
  try {
    const metrics = await getSystemMetrics();
    health.metrics = metrics;
  } catch (error) {
    console.error('[HEALTH] Failed to get metrics:', error);
  }
  
  return health;
}

/**
 * Get system metrics
 */
async function getSystemMetrics() {
  try {
    const [appointments, leads, calls, messages] = await Promise.all([
      query('SELECT COUNT(*) as count FROM appointments WHERE created_at > NOW() - INTERVAL \'24 hours\''),
      query('SELECT COUNT(*) as count FROM leads WHERE created_at > NOW() - INTERVAL \'24 hours\''),
      query('SELECT COUNT(*) as count FROM calls WHERE created_at > NOW() - INTERVAL \'24 hours\''),
      query('SELECT COUNT(*) as count FROM messages WHERE created_at > NOW() - INTERVAL \'24 hours\'')
    ]);
    
    return {
      last24Hours: {
        appointments: parseInt(appointments.rows[0]?.count || 0),
        leads: parseInt(leads.rows[0]?.count || 0),
        calls: parseInt(calls.rows[0]?.count || 0),
        messages: parseInt(messages.rows[0]?.count || 0)
      }
    };
  } catch (error) {
    return { error: error.message };
  }
}

